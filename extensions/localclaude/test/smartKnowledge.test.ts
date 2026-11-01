// Claude-powered knowledge search: reranking, passage contexts and the search tool, with a scripted Claude.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import assert from 'node:assert/strict'
import { KnowledgeIndex, KnowledgeService, createKnowledgeServer, passages, type KnowledgeDoc } from '../src/host/knowledge'
import { ContextWriter, contextKey, parseContexts, parseIdList, rerankHits, researchAgent, type Ask, type ContextCache } from '../src/host/smartKnowledge'

const manual: KnowledgeDoc = {
  name: 'RM0090.pdf',
  source: 'project files',
  text: [
    '[Page 1]\nReference manual. This document covers the microcontroller memory and peripherals.',
    '[Page 2]\nThe converter samples up to 16 channels. Set ADON to wake it up from power down.',
    '[Page 3]\nSQR1 holds the length of the regular sequence in bits L[3:0] and the 13th to 16th conversions.',
    '[Page 4]\nDMA requests are generated after each regular conversion when the DMA bit is set in CR2.',
    '[Page 5]\nThe watchdog compares the converted value to the high and low thresholds.'
  ].join('\n\n')
}

const idx0 = (): KnowledgeIndex => new KnowledgeIndex([manual])

async function main(): Promise<void> {
  // --- parsing Claude's replies
  assert.deepEqual(parseIdList('Here you go: [3, 1]'), [3, 1])
  assert.deepEqual(parseIdList('[]'), [])
  assert.equal(parseIdList('I could not decide'), null)
  assert.equal(parseIdList(null), null)
  assert.deepEqual(parseContexts('```json\n{"1": "ADC  overview", "2": 5}\n```'), { '1': 'ADC overview' })
  assert.equal(parseContexts('no json'), null)

  // when Claude picks, it gets more than three passages of one long document to choose from
  assert.equal(idx0().search('page', 10).length, 3)
  assert.equal(idx0().search('page', 10, 10).length, 5)

  // --- reranking: Claude's order, unknown or repeated numbers dropped, at most `limit`
  const idx = new KnowledgeIndex([manual])
  const found = idx.search('regular conversion sequence', 10, 10)
  assert.ok(found.length >= 2)
  const prompts: string[] = []
  const pick =
    (reply: string | null): Ask =>
    async (prompt) => {
      prompts.push(prompt)
      return reply
    }
  const order = found.map((h) => manual.text.slice(h.passage.start, h.passage.end))
  const picked = await rerankHits(pick('[2, 2, 99, 1]'), 'how long is the regular sequence?', found, 5)
  assert.deepEqual(picked?.map((h) => manual.text.slice(h.passage.start, h.passage.end)), [order[1], order[0]])
  assert.match(prompts[0], /<question>\nhow long is the regular sequence\?\n<\/question>/)
  assert.match(prompts[0], /<passage n="1" from="RM0090\.pdf › \[Page \d\]">/, 'Claude sees where each passage is from')
  assert.equal((await rerankHits(pick('[3, 1, 2]'), 'q', found, 1))?.length, 1, 'never more than the limit')
  assert.equal(await rerankHits(pick('no idea'), 'q', found, 5), null, "an answer that isn't a list keeps the keyword order")
  assert.deepEqual(await rerankHits(pick('[]'), 'q', found, 5), [], 'Claude can say none of them help')

  // --- the search tool with reranking
  const svc = new KnowledgeService()
  const rerankCalls: string[] = []
  const srv: any = createKnowledgeServer({
    indexes: async () => [svc.project('p', 1, [{ id: 'f', name: 'RM0090.pdf' }], () => ({ f: manual.text }))],
    describe: 'test knowledge',
    rerank: async (question, candidates, limit) => {
      rerankCalls.push(question)
      return [...candidates].reverse().slice(0, limit)
    },
    researcher: 'knowledge-researcher'
  })
  const [a, b] = InMemoryTransport.createLinkedPair()
  await srv.instance.connect(a)
  const client = new Client({ name: 't', version: '1' })
  await client.connect(b)
  const text = (r: any) => r.content[0].text as string
  const search = async (args: any) => text(await client.callTool({ name: 'search_knowledge', arguments: args }))
  const tool = (await client.listTools()).tools.find((t) => t.name === 'search_knowledge')!
  assert.ok((tool.inputSchema.properties as any).question, 'the tool takes the full question')
  assert.match(tool.description ?? '', /pass the full question/)
  assert.match((client.getInstructions() ?? ''), /knowledge-researcher agent/)
  const r = await search({ query: 'regular conversion', question: 'Which bits hold the sequence length?', limit: 2 })
  assert.deepEqual(rerankCalls, ['Which bits hold the sequence length?'])
  assert.equal((r.match(/^\[\d\] /gm) ?? []).length, 2)
  await search({ query: 'regular sequence' })
  assert.equal(rerankCalls[1], 'regular sequence', 'without a question, the words are the question')
  await search({ query: 'watchdog thresholds' })
  assert.equal(rerankCalls.length, 2, 'one match: nothing to choose, Claude is not asked')

  // Claude finds nothing relevant: the closest by wording come back, with a note
  const none: any = createKnowledgeServer({ indexes: async () => [idx], describe: 'k', rerank: async () => [] })
  const [c, d] = InMemoryTransport.createLinkedPair()
  await none.instance.connect(c)
  const client2 = new Client({ name: 't2', version: '1' })
  await client2.connect(d)
  assert.match(text(await client2.callTool({ name: 'search_knowledge', arguments: { query: 'conversion' } })), /^None of the \d+ passages .* closest by wording/)
  console.log('✓ reranking: Claude picks from the keyword search, keeps its order, falls back when it can’t answer')

  // --- passage context: written once per document in batches, stored, and found by its words
  const stored = new Map<string, string[]>()
  const cache: ContextCache = {
    loadKnowledgeContext: (k) => stored.get(k) ?? null,
    saveKnowledgeContext: (k, v) => void stored.set(k, v)
  }
  const n = passages(manual.text).length
  const asks: string[] = []
  const contextAsk: Ask = async (prompt) => {
    asks.push(prompt)
    const count = (prompt.match(/<passage n=/g) ?? []).length
    return JSON.stringify(Object.fromEntries(Array.from({ length: count }, (_, i) => [String(i + 1), i === 2 ? 'Analog converter: regular sequence length register' : `Converter topic ${i + 1}`])))
  }
  let ready = 0
  // like the extension: new contexts rebuild the indexes
  const writer = new ContextWriter(cache, contextAsk, () => {
    ready++
    svc.invalidateAll()
  })
  svc.setContextSource(writer)
  const before = svc.project('ctx', 1, [{ id: 'f', name: 'RM0090.pdf' }], () => ({ f: manual.text }))
  assert.equal(before.search('analog').length, 0, 'no passage says analog')
  for (let i = 0; i < 50 && !ready; i++) await new Promise((r) => setTimeout(r, 10))
  assert.equal(ready, 1)
  assert.equal(asks.length, Math.ceil(n / 20))
  assert.match(asks[0], /<outline>\n/, 'Claude gets the outline to place each passage')
  assert.equal(stored.get(contextKey(manual))?.length, n)
  const after = svc.project('ctx', 1, [{ id: 'f', name: 'RM0090.pdf' }], () => ({ f: manual.text }))
  const hit = after.search('analog')[0]
  assert.ok(hit, 'found by its context after the index is rebuilt')
  assert.match(manual.text.slice(hit.passage.start, hit.passage.end), /SQR1 holds the length/)
  assert.equal(hit.context, 'Analog converter: regular sequence length register')
  // written once: indexing again doesn't ask again
  svc.invalidateAll()
  svc.project('ctx', 1, [{ id: 'f', name: 'RM0090.pdf' }], () => ({ f: manual.text }))
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(asks.length, Math.ceil(n / 20))

  // a failed request: the document is searched without contexts, reported, and not retried right away
  const changed = { ...manual, name: 'RM0090-rev2.pdf' }
  let failures = 0
  const failing = new ContextWriter(cache, async () => (failures++, 'sorry'), () => {})
  failing.want([changed])
  for (let i = 0; i < 50 && failing.status().running; i++) await new Promise((r) => setTimeout(r, 10))
  assert.equal(failures, 1)
  assert.match(failing.status().lastError ?? '', /searched without them/)
  failing.want([changed])
  await new Promise((r) => setTimeout(r, 20))
  assert.equal(failures, 1, 'not asked again straight away')
  // switched off: indexes are plain keyword indexes again
  svc.setContextSource(null)
  assert.equal(svc.project('ctx', 1, [{ id: 'f', name: 'RM0090.pdf' }], () => ({ f: manual.text })).search('analog').length, 0)
  console.log('✓ passage context: batches with the outline, stored per document, found by its words, failures and switching off')

  // --- the research helper's definition
  const agent = researchAgent(['mcp__knowledge__search_knowledge'])
  assert.deepEqual(agent.tools, ['mcp__knowledge__search_knowledge'])
  assert.match(agent.prompt, /Copy exact values as written/)
  assert.match(agent.description, /where each came from/)
  console.log('✓ research helper: knowledge tools only, reports facts with their sources')
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e)
    process.exit(1)
  }
)
