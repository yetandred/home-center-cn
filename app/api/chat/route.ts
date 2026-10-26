import { auth } from "@/auth"
import { NextResponse } from "next/server"
import { loadLlmConfig } from "@/lib/llm/config"
import { LLM_SETTINGS_ID } from "@/lib/llm/config"
import { prisma } from "@/lib/prisma"
import { DEFAULT_TIMEOUT_SECONDS, DEFAULT_TOOL_ROUNDS, isLlmReady, parseExtraBody, parseHeaders } from "@/lib/llm/settings-schema"
import { createChatClient } from "@/lib/llm/client"
import { agentErrorMessage, LlmError } from "@/lib/llm/errors"
import { runAgent } from "@/lib/llm/agent"
import { buildSystemPrompt } from "@/lib/llm/prompt"
import { stripDraftLines } from "@/lib/llm/strip-drafts"
import { chatRequestSchema, firstIssue } from "@/lib/llm/request-schema"
import { chatTools } from "@/lib/llm/tools"
import { loadDocumentSettings } from "@/lib/documents/settings"
import { documentAccess } from "@/lib/documents/tool-helpers"
import type { AgentEvent } from "@/lib/llm/types"
import { getFormat } from "@/lib/regional-server"
import { loadFeatures } from "@/lib/features-server"

export const runtime = "nodejs"

/** Added to the system prompt when the model can't call tools, so it doesn't promise lookups. */
const CHAT_ONLY_NOTE =
  "当前模型不支持工具调用，无法查询任何记录。回答只能基于对话内容；遇到需要查数据的问题，请说明需要在设置中更换支持工具调用的模型。"

// Streams one assistant turn as NDJSON. The thread arrives from the browser on
// every request and is never stored. Logs carry tool names and timings only —
// never message content or tool results, which include health records.
export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "无效的 JSON。" }, { status: 400 })
  }
  const parsed = chatRequestSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 })

  const config = await loadLlmConfig()
  if (!isLlmReady(config) || !config.baseUrl || !config.model) {
    const error = config.keyUnreadable
      ? "已保存的 API 密钥无法解密 — 需要管理员在设置中重新输入。"
      : "AI 助手尚未配置，请管理员在设置中完成配置。"
    return NextResponse.json({ error }, { status: 503 })
  }
  const { health, rooms } = await loadFeatures()
  // With Health off, health files are out of reach whatever the assistant's own setting says.
  const docs = documentAccess(await loadDocumentSettings(), { ...config, healthDocumentsEnabled: health && config.healthDocumentsEnabled })

  // Per-question limit from Settings; each model call separately fails only after
  // a stretch with no output (see IDLE_TIMEOUT_MS in lib/llm/client.ts).
  const timeout = AbortSignal.timeout((config.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000)
  const signal = AbortSignal.any([request.signal, timeout])
  const chat = createChatClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    extraBody: parseExtraBody(config.extraBody),
    headers: parseHeaders(config.headers),
  })
  // A server that rejected `tools` in the connection test still answers
  // questions — it just can't look records up, so the tools aren't offered.
  const toolCalling = config.toolCalling !== false
  const systemPrompt = toolCalling
    ? config.systemPrompt
    : [config.systemPrompt, CHAT_ONLY_NOTE].filter(Boolean).join("\n\n")
  const model = config.model
  const maxRounds = config.maxToolRounds ?? DEFAULT_TOOL_ROUNDS
  const userId = session.user.id
  const encoder = new TextEncoder()
  const started = Date.now()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AgentEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        } catch {
          // Client went away; the abort signal stops the loop.
        }
      }
      const used: string[] = []
      let rounds = 0
      try {
        const now = new Date()
        await runAgent({
          history: health ? parsed.data.messages : stripDraftLines(parsed.data.messages),
          systemPrompt: buildSystemPrompt({ now, extra: systemPrompt, maxRounds, documents: docs.enabled && toolCalling, health, rooms, fmt: await getFormat(), today: parsed.data.today }),
          chat,
          tools: toolCalling ? chatTools(docs, health, config.healthDocumentsEnabled, rooms) : [],
          ctx: { userId, now, health, rooms, today: parsed.data.today },
          signal,
          model,
          maxRounds,
          emit: (event) => {
            if (event.type === "status") used.push(event.tool)
            if (event.type === "done") rounds = event.rounds
            send(event)
          },
        })
      } catch (error) {
        let message = agentErrorMessage(error, timeout.aborted)
        // The server rejected `tools` mid-turn: remember it, so the next
        // question runs in chat-only mode instead of failing the same way.
        if (error instanceof LlmError && error.toolsUnsupported) {
          await prisma.llmSettings.updateMany({ where: { id: LLM_SETTINGS_ID }, data: { toolCalling: false } }).catch(() => {})
          message = "该模型不支持工具调用 — 已自动切换为纯聊天模式，请重新提问。想在聊天里查询家庭数据，请在设置中换一个支持工具调用的模型。"
        }
        if (!request.signal.aborted) send({ type: "error", message })
        console.error(
          "[llm] chat failed:",
          error instanceof LlmError ? `LlmError${error.status ? ` status=${error.status}` : ""}` : error instanceof Error ? error.name : typeof error
        )
      } finally {
        console.info(`[llm] chat user=${userId} rounds=${rounds} tools=${used.join(",") || "-"} ms=${Date.now() - started}`)
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
