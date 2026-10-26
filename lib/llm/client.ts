import { buildEndpoints, type Endpoint } from "./endpoint"
import { createDeltaAccumulator, createSseParser } from "./sse"
import { explainHttpError, explainNetworkError, LlmError } from "./errors"
import type { ChatFn, ChatResult } from "./types"

// A thin OpenAI-compatible Chat Completions client. Plain fetch rather than an
// SDK: the surface used is one endpoint, and it has to work against OpenAI,
// Ollama, LM Studio, OpenRouter, vLLM, Azure and whatever else speaks the shape.
//
// Providers differ in small ways that used to turn into hard failures. Each is
// handled by one retry, and the retried shape sticks for the rest of the turn:
//   - path: `/chat/completions` vs `/v1/chat/completions` vs Azure deployments (404 → next candidate)
//   - token cap field: `max_tokens` vs `max_completion_tokens` (newer OpenAI models)
//   - `tool_choice`: some servers reject the field outright
//   - `stream`: some servers don't implement SSE and reject the request

export type ClientConfig = {
  baseUrl: string
  apiKey: string | null
  model: string
  temperature: number | null
  maxTokens: number | null
  /** Provider-specific request fields, e.g. llama.cpp's chat_template_kwargs. Never overrides the core fields. */
  extraBody?: Record<string, unknown> | null
  /** Extra request headers, e.g. `HTTP-Referer` for OpenRouter or a gateway's own auth header. */
  headers?: Record<string, string> | null
  /** Fail when the server sends nothing for this long; default IDLE_TIMEOUT_MS. */
  idleTimeoutMs?: number
}

/**
 * Once a reply has started streaming, it fails only if the server then goes
 * quiet this long — not after a fixed total — so a slow local model that keeps
 * streaming (answer or reasoning) is never cut off mid-answer. Waiting for the
 * first byte counts only against the per-question limit in the route.
 */
export const IDLE_TIMEOUT_MS = 60_000

function hostOf(baseUrl: string) {
  try {
    return new URL(baseUrl).host
  } catch {
    return baseUrl
  }
}

type JsonCompletion = {
  choices?: {
    finish_reason?: string | null
    message?: {
      content?: string | null
      reasoning_content?: string | null
      reasoning?: string | null
      tool_calls?: { id?: string; function: { name: string; arguments?: string } }[]
    }
  }[]
}

type TokenField = "max_tokens" | "max_completion_tokens"

/** Set once an endpoint has answered, so later turns skip the 404 probe. */
type Resolved = { endpoint: Endpoint; tokenField: TokenField; toolChoice: boolean; stream: boolean }

export function createChatClient(config: ClientConfig, fetchImpl: typeof fetch = fetch): ChatFn {
  const host = hostOf(config.baseUrl)
  const endpoints = buildEndpoints(config.baseUrl, config.model)
  let resolved: Resolved | null = null

  const idleMs = config.idleTimeoutMs ?? IDLE_TIMEOUT_MS
  const stalled = () => new LlmError(`The LLM server stopped responding for ${Math.round(idleMs / 1000)} seconds — it may be busy. Try again.`)

  function authHeaders(auth: Endpoint["auth"]): Record<string, string> {
    if (!config.apiKey) return {}
    return auth === "api-key" ? { "api-key": config.apiKey } : { Authorization: `Bearer ${config.apiKey}` }
  }

  return async (req, onText, signal) => {
    const idle = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const touch = () => {
      clearTimeout(timer)
      timer = setTimeout(() => idle.abort(new DOMException("No output from the server", "TimeoutError")), idleMs)
    }
    // Armed by the first streamed chunk, not here: before the server starts
    // answering (prompt processing, a cold model load) only the caller's
    // per-question limit applies.
    try {
      return await send(req, onText, signal, idle.signal, touch)
    } catch (error) {
      if (!signal.aborted && idle.signal.aborted) throw stalled()
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  async function send(
    req: Parameters<ChatFn>[0],
    onText: Parameters<ChatFn>[1],
    signal: AbortSignal,
    idleSignal: AbortSignal,
    touch: () => void
  ): Promise<ChatResult> {
    // The known-good endpoint first; otherwise every candidate until one answers.
    const order = resolved ? [resolved.endpoint, ...endpoints.filter((e) => e.url !== resolved!.endpoint.url)] : endpoints
    let lastError: { status: number; body: string } | null = null

    for (const endpoint of order) {
      let tokenField: TokenField = resolved?.tokenField ?? "max_tokens"
      let toolChoice = resolved?.toolChoice ?? true
      let stream = resolved?.stream ?? true
      let retries = 0

      for (;;) {
        const body: Record<string, unknown> = {
          ...config.extraBody,
          model: config.model,
          messages: req.messages,
          stream,
          ...(req.tools?.length ? { tools: req.tools, ...(toolChoice ? { tool_choice: req.toolChoice ?? "auto" } : {}) } : {}),
          ...(config.temperature != null ? { temperature: config.temperature } : {}),
          ...(config.maxTokens != null ? { [tokenField]: config.maxTokens } : {}),
        }

        let res: Response
        try {
          res = await fetchImpl(endpoint.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": stream ? "text/event-stream, application/json" : "application/json",
              ...config.headers,
              ...authHeaders(endpoint.auth),
            },
            body: JSON.stringify(body),
            signal: AbortSignal.any([signal, idleSignal]),
          })
        } catch (error) {
          if (signal.aborted || idleSignal.aborted) throw error
          throw new LlmError(explainNetworkError(error, host))
        }

        if (res.ok) {
          resolved = { endpoint, tokenField, toolChoice, stream }
          return await parse(res, endpoint, onText, signal, idleSignal, touch)
        }

        const text = await res.text().catch(() => "")
        lastError = { status: res.status, body: text }

        // A 404 usually means the other path shape; try the next candidate.
        if (res.status === 404) break

        // One corrective retry per dialect, only when the server says why.
        if (retries < 3 && (res.status === 400 || res.status === 422)) {
          const said = text.toLowerCase()
          const rejected = /not support|unsupport|unrecognized|unknown|invalid|unexpected|must use|use .* instead/.test(said)
          if (tokenField === "max_tokens" && config.maxTokens != null && /max_tokens/.test(said) && rejected) {
            tokenField = "max_completion_tokens"
            retries++
            continue
          }
          if (toolChoice && /tool_choice/.test(said) && rejected) {
            toolChoice = false
            retries++
            continue
          }
          if (stream && /\bstream\b/.test(said) && rejected) {
            stream = false
            retries++
            continue
          }
        }

        if (/tool|function/.test(text) && /not support|unsupport/.test(text.toLowerCase())) {
          throw new LlmError(explainHttpError(res.status, text), res.status, { toolsUnsupported: true })
        }
        throw new LlmError(explainHttpError(res.status, text), res.status)
      }
    }

    throw new LlmError(lastError ? explainHttpError(lastError.status, lastError.body) : "The LLM server sent an empty response.", lastError?.status)
  }

  async function parse(
    res: Response,
    endpoint: Endpoint,
    onText: Parameters<ChatFn>[1],
    signal: AbortSignal,
    idleSignal: AbortSignal,
    touch: () => void
  ): Promise<ChatResult> {
    // Some servers ignore stream:true and answer with one JSON body.
    if ((res.headers.get("content-type") ?? "").includes("application/json")) {
      const data = (await res.json()) as JsonCompletion
      const message = data.choices?.[0]?.message
      const content = message?.content ?? ""
      if (content) onText(content)
      const result: ChatResult = {
        content,
        toolCalls: (message?.tool_calls ?? []).map((c, i) => ({
          id: c.id || `call_${i}`,
          name: c.function.name,
          arguments: c.function.arguments ?? "",
        })),
        ...(message?.reasoning_content || message?.reasoning ? { reasoning: message.reasoning_content ?? message.reasoning ?? "" } : {}),
        ...(data.choices?.[0]?.finish_reason ? { finishReason: data.choices[0].finish_reason } : {}),
        endpoint: endpoint.url,
      }
      return result
    }

    if (!res.body) throw new LlmError("The LLM server sent an empty response.")

    const acc = createDeltaAccumulator(onText)
    const parser = createSseParser((data) => {
      acc.push(data)
    })
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    // Don't rely on the fetch signal reaching the body: stop reading ourselves.
    const stop = () => void reader.cancel().catch(() => {})
    idleSignal.addEventListener("abort", stop, { once: true })
    signal.addEventListener("abort", stop, { once: true })
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        touch()
        parser.feed(value)
      }
      if (signal.aborted) throw signal.reason
      if (idleSignal.aborted) throw idleSignal.reason
      parser.flush()
    } catch (error) {
      if (signal.aborted || idleSignal.aborted || error instanceof LlmError) throw error
      throw new LlmError(explainNetworkError(error, host))
    } finally {
      idleSignal.removeEventListener("abort", stop)
      signal.removeEventListener("abort", stop)
    }
    return { ...acc.result(), endpoint: endpoint.url }
  }
}
