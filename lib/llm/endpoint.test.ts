import { describe, expect, it } from "vitest"
import { buildEndpoints, isAzureOpenAi } from "./endpoint"

describe("buildEndpoints", () => {
  it("keeps a versioned base URL as the only candidate", () => {
    expect(buildEndpoints("http://localhost:11434/v1", "m")).toEqual([
      { url: "http://localhost:11434/v1/chat/completions", auth: "bearer" },
    ])
  })

  it("adds a /v1 candidate when the base URL has no version", () => {
    expect(buildEndpoints("http://localhost:11434", "m").map((e) => e.url)).toEqual([
      "http://localhost:11434/chat/completions",
      "http://localhost:11434/v1/chat/completions",
    ])
  })

  it("trims trailing slashes and whitespace", () => {
    expect(buildEndpoints("  https://api.openai.com/v1///  ", "m")[0].url).toBe("https://api.openai.com/v1/chat/completions")
  })

  it("keeps a query string on non-Azure base URLs", () => {
    expect(buildEndpoints("https://gw.example/openai?tenant=a", "m").map((e) => e.url)).toEqual([
      "https://gw.example/openai/chat/completions?tenant=a",
      "https://gw.example/openai/v1/chat/completions?tenant=a",
    ])
  })

  it("builds Azure deployment URLs with an api-version and api-key auth", () => {
    expect(buildEndpoints("https://res.openai.azure.com", "gpt-4o")).toEqual([
      { url: "https://res.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-10-21", auth: "api-key" },
    ])
  })

  it("lets Azure overrides come from the query string", () => {
    expect(buildEndpoints("https://res.openai.azure.com?deployment=prod&api-version=2025-01-01", "m")[0].url).toBe(
      "https://res.openai.azure.com/openai/deployments/prod/chat/completions?api-version=2025-01-01"
    )
  })

  it("detects Azure hosts only", () => {
    expect(isAzureOpenAi("https://x.openai.azure.com")).toBe(true)
    expect(isAzureOpenAi("https://api.openai.com/v1")).toBe(false)
    expect(isAzureOpenAi("not a url")).toBe(false)
  })
})
