
/**
 * 提取 JSON 字符串
 * @param raw 原始字符串
 * @returns 提取出的 JSON 字符串
 *  - 如果原始字符串被 ```json ... ``` 或 ``` ... ``` 包裹，则提取中间的内容
 *  - 否则，截取第一个
 */
export function extractJson(raw: string): string {
  const s = raw.trim()
  // 去掉 ```json ... ``` 或 ``` ... ``` 包裹
  const fence = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  if (fence) return fence[1].trim()
  // 兜底:截取第一个 { 到最后一个 }
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  return start !== -1 && end !== -1 ? s.slice(start, end + 1) : s
}
