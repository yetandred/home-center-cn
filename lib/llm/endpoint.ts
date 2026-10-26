// Where a chat request actually goes. Providers disagree about the path: most
// OpenAI-compatible servers answer on `<base>/chat/completions` only when the
// base already ends in `/v1` (Ollama, vLLM, LM Studio), plain OpenAI needs
// `/v1`, and Azure uses a deployments path plus an `api-version` query and an
// `api-key` header instead of a bearer token.
//
// Rather than make people guess, the client tries these in order and keeps the
// first that answers (see createChatClient). A wrong guess costs one 404.

export type EndpointAuth = "bearer" | "api-key"

export type Endpoint = {
  url: string
  /** "api-key" is Azure's header; everything else uses `Authorization: Bearer`. */
  auth: EndpointAuth
}

const AZURE_SUFFIX = ".openai.azure.com"
/** Stable, widely available Azure OpenAI API version. Override with ?api-version=… */
const DEFAULT_AZURE_API_VERSION = "2024-10-21"

export function isAzureOpenAi(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname.toLowerCase().endsWith(AZURE_SUFFIX)
  } catch {
    return false
  }
}

/** Appends a path segment to a URL, keeping any query string and hash. */
function joinPath(u: URL, suffix: string): string {
  const url = new URL(u.toString())
  url.pathname = `${url.pathname.replace(/\/+$/, "")}${suffix}`
  return url.toString()
}

/**
 * Candidate endpoints for a base URL, most likely first. The client retries a
 * 404 against the next one, so `/v1` needn't be typed by hand.
 */
export function buildEndpoints(baseUrl: string, model: string): Endpoint[] {
  const trimmed = baseUrl.trim().replace(/\s+/g, "").replace(/\/+$/, "")
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    // Settings validation rejects this already; keep the client dumb rather than throw.
    return [{ url: `${trimmed}/chat/completions`, auth: "bearer" }]
  }

  if (isAzureOpenAi(trimmed)) {
    const apiVersion = url.searchParams.get("api-version") || DEFAULT_AZURE_API_VERSION
    const deployment = url.searchParams.get("deployment") || url.searchParams.get("model") || model
    return [
      {
        url: `${url.origin}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`,
        auth: "api-key",
      },
    ]
  }

  const path = url.pathname.replace(/\/+$/, "")
  const candidates = [joinPath(url, "/chat/completions")]
  // Already versioned (`/v1`, `/v1beta`, `/api/v1`)? Then the first candidate is the answer.
  if (!/\/v\d+[a-z]*$/i.test(path)) candidates.push(joinPath(url, "/v1/chat/completions"))
  return [...new Set(candidates)].map((u) => ({ url: u, auth: "bearer" as const }))
}
