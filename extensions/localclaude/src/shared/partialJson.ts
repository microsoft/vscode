// Reads the fields of a tool call's JSON input while it's still streaming in, e.g.
// {"id":"shop","title":"Shop","content":"<html><body><h1>Hel   →   { id, title, content: '<html><body><h1>Hel' }

export interface StreamingField {
  value: string
  /** the string's closing quote has arrived */
  done: boolean
}

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' }

/** The top-level string and number fields of a (possibly cut-off) JSON object; other values are skipped. */
export function streamingFields(json: string): Record<string, StreamingField> {
  const out: Record<string, StreamingField> = {}
  let i = json.indexOf('{')
  if (i < 0) return out
  i++
  const n = json.length
  const ws = (): void => {
    while (i < n && /[\s,]/.test(json[i])) i++
  }
  /** a string starting at the opening quote at json[i] */
  const str = (): StreamingField => {
    i++
    let value = ''
    let start = i
    while (i < n) {
      const c = json.charCodeAt(i)
      if (c === 34 /* " */) {
        value += json.slice(start, i)
        i++
        return { value, done: true }
      }
      if (c === 92 /* \ */) {
        value += json.slice(start, i)
        const e = json[i + 1]
        if (e === undefined) return { value, done: false }
        if (e === 'u') {
          const hex = json.slice(i + 2, i + 6)
          if (hex.length < 4) return { value, done: false }
          value += String.fromCharCode(parseInt(hex, 16))
          i += 6
        } else {
          value += ESCAPES[e] ?? e
          i += 2
        }
        start = i
        continue
      }
      i++
    }
    return { value: value + json.slice(start, i), done: false }
  }
  while (i < n) {
    ws()
    if (i >= n || json[i] === '}' || json[i] !== '"') break
    const key = str()
    if (!key.done) break
    while (i < n && json[i] !== ':') i++
    i++
    while (i < n && /\s/.test(json[i])) i++
    if (i >= n) break
    if (json[i] === '"') {
      out[key.value] = str()
      continue
    }
    // a number, as its text (e.g. a frame's width); done once something follows it
    const num = /^-?[\d.eE+-]+/.exec(json.slice(i, i + 32))
    if (num) {
      i += num[0].length
      out[key.value] = { value: num[0], done: i < n }
      continue
    }
    // a boolean, null, object or array: skip it (nested strings and brackets included)
    let depth = 0
    while (i < n) {
      const c = json[i]
      if (c === '"') {
        str()
        continue
      }
      if (c === '{' || c === '[') depth++
      else if (c === '}' || c === ']') {
        if (depth === 0) break
        depth--
      } else if (c === ',' && depth === 0) break
      i++
    }
  }
  return out
}
