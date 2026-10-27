import type { NextConfig } from "next";
import { securityHeaderRules } from "./lib/security-headers";

const nextConfig: NextConfig = {
  output: "standalone",
  // No "X-Powered-By: Next.js" — it only helps someone pick an exploit.
  poweredByHeader: false,
  // The capture inbox is shown as "Intake" now; old links and bookmarks still work.
  async redirects() {
    return [{ source: "/inbox", destination: "/intake", permanent: true }];
  },
  async headers() {
    return securityHeaderRules(process.env.NODE_ENV === "development");
  },
  // Native addons and packages that spawn their own workers or read data files
  // from their package folder break when bundled; load them from node_modules.
  serverExternalPackages: [
    "officeparser",
    "unpdf",
    "word-extractor",
    "tesseract.js",
    "@tesseract.js-data/eng",
    "@napi-rs/canvas",
    "@huggingface/transformers",
    "onnxruntime-node",
    // PP-OCR 推理运行时与模型包：都从 node_modules 直接读文件，不能被 webpack 打包。
    "paddleocr",
    "@gutenye/ocr-models",
  ],
  // PP-OCR 的模型权重在 node_modules 里按路径读取；保证 standalone 产物也带上。
  outputFileTracingIncludes: {
    "/**": ["./node_modules/@gutenye/ocr-models/assets/**", "./node_modules/onnxruntime-node/bin/**"],
  },
  experimental: {
    globalNotFound: true,
  },
};

export default nextConfig;
