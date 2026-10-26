import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { loadLlmConfig } from "@/lib/llm/config"
import { DEFAULT_TIMEOUT_SECONDS, DEFAULT_TOOL_ROUNDS, parseExtraBody, parseHeaders } from "@/lib/llm/settings-schema"
import { createChatClient } from "@/lib/llm/client"
import { LlmError } from "@/lib/llm/errors"
import { buildSystemPrompt } from "@/lib/llm/prompt"
import { MODEL_TEST_TOOLS } from "@/lib/llm/tools"
import { MODEL_TEST_CASES } from "@/lib/llm/model-test/cases"
import { parseModelTestRequest } from "@/lib/llm/model-test/request"
import { runSuite } from "@/lib/llm/model-test/runner"
import { MODEL_TEST_TODAY, type ModelTestEvent } from "@/lib/llm/model-test/types"

export const runtime = "nodejs"

// Admin-only model test: runs the simulated question suite against the saved
// server (optionally with a different model, temperature or extra JSON) and
// streams each result as NDJSON. No database data is read — every lookup is
// answered from made-up fixtures.
export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 })
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "仅管理员可用。" }, { status: 403 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "无效的 JSON。" }, { status: 400 })
  }

  const config = await loadLlmConfig()
  if (!config.baseUrl) return NextResponse.json({ error: "请先在设置中配置服务器地址。" }, { status: 400 })
  if (config.keyUnreadable) {
    return NextResponse.json({ error: "已保存的 API 密钥无法解密 — 请在设置中重新输入。" }, { status: 400 })
  }
  const parsed = parseModelTestRequest(body, config, MODEL_TEST_CASES.map((c) => c.id))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const settings = parsed.value

  const cases = settings.caseIds ? MODEL_TEST_CASES.filter((c) => settings.caseIds!.includes(c.id)) : MODEL_TEST_CASES
  const chat = createChatClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: settings.model,
    temperature: settings.temperature,
    maxTokens: config.maxTokens,
    extraBody: parseExtraBody(settings.extraBody),
    headers: parseHeaders(config.headers),
  })
  const maxRounds = settings.maxToolRounds ?? DEFAULT_TOOL_ROUNDS
  const systemPrompt = buildSystemPrompt({ now: new Date(`${MODEL_TEST_TODAY}T12:00:00`), extra: config.systemPrompt, maxRounds })
  const caseTimeoutMs = (config.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000
  const encoder = new TextEncoder()
  const started = Date.now()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ModelTestEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          // Page went away; request.signal stops the run.
        }
      }
      let summary = { passed: 0, failed: 0 }
      try {
        send({
          type: "start",
          total: cases.length * settings.repeat,
          model: settings.model,
          temperature: settings.temperature,
          extraBody: settings.extraBody,
          maxToolRounds: maxRounds,
          today: MODEL_TEST_TODAY,
        })

        // A sleeping local model can take a while to load; that shouldn't count
        // against the first test. Not timed against the per-test limit.
        const warmStart = Date.now()
        try {
          await chat({ messages: [{ role: "user", content: "Reply with the word ready." }] }, () => {}, request.signal)
          send({ type: "warmup", ms: Date.now() - warmStart, ok: true })
        } catch (error) {
          if (request.signal.aborted) return
          send({
            type: "warmup",
            ms: Date.now() - warmStart,
            ok: false,
            error: error instanceof LlmError ? error.message : "模型没有响应。",
          })
        }

        summary = await runSuite({
          chat,
          tools: MODEL_TEST_TOOLS,
          systemPrompt,
          maxRounds,
          signal: request.signal,
          cases,
          reps: settings.repeat,
          caseTimeoutMs,
          emit: send,
        })
        if (!request.signal.aborted) send({ type: "done", ...summary, ms: Date.now() - started })
      } catch (error) {
        if (!request.signal.aborted) send({ type: "error", message: error instanceof LlmError ? error.message : "测试运行失败。" })
        console.error("[llm] model test failed:", error instanceof Error ? error.name : typeof error)
      } finally {
        console.info(
          `[llm] model test user=${session.user.id} model=${settings.model} cases=${cases.length}x${settings.repeat} ` +
            `passed=${summary.passed} failed=${summary.failed} ms=${Date.now() - started}${request.signal.aborted ? " stopped" : ""}`
        )
        try {
          controller.close()
        } catch {
          // already closed
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  })
}
