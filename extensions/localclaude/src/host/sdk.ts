// The Agent SDK's query(), or a scripted stand-in for end-to-end tests (LOCALCLAUDE_FAKE_AGENT=1).
import { query as realQuery } from '@anthropic-ai/claude-agent-sdk'
import { fakeQuery } from './fakeAgent'

export const query: typeof realQuery = process.env.LOCALCLAUDE_FAKE_AGENT ? (fakeQuery as unknown as typeof realQuery) : realQuery
