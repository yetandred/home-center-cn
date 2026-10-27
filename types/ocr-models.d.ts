// @gutenye/ocr-models 只发布了一个 `./node` 入口，没有类型声明。
// 它返回的是模型文件的绝对路径（包内 assets 目录）。
declare module "@gutenye/ocr-models/node" {
  const models: {
    detectionPath: string
    recognitionPath: string
    dictionaryPath: string
  }
  export default models
}
