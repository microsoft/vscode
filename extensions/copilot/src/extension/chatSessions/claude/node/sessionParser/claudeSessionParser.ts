/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Claude Code Session Parser
 *
 * Parses JSONL session files for subagent transcripts. The main session
 * metadata and messages are now loaded via the `@anthropic-ai/claude-agent-sdk`
 * session APIs (see `sdkSessionAdapter.ts`).
 *
 * **Layer 2** — `parseSessionFileContent`
 * Builds a linked list from JSONL. Every UUID-bearing entry becomes a ChainNode
 * in a single map. No classification into buckets — just chain metadata + raw JSON.
 *
 * **Layer 3** — `buildSubagentSession`
 * Walks the linked list from leaf to root, validates visible entries, and
 * produces StoredMessage[] for display.
 */

import {
	AssistantMessageEntry,
	ChainNode,
	CustomTitleEntry,
	ISubagentSession,
	StoredMessage,
	SummaryEntry,
	UserMessageEntry,
	vAssistantMessageEntry,
	vChainNodeFields,
	vCustomTitleEntry,
	vSummaryEntry,
	vUserMessageEntry,
} from './claudeSessionSchema';

// #region Types

/**
 * Detailed error for failed parsing.
 */
interface ParseError {
	lineNumber: number;
	message: string;
	line: string;
	parsedType?: string;
}

/**
 * Result of parsing a session file (Layer 2 output).
 */
export interface LinkedListParseResult {
	/** All UUID-bearing entries indexed by UUID */
	readonly nodes: ReadonlyMap<string, ChainNode>;
	/** Summary entries indexed by leaf UUID */
	readonly summaries: ReadonlyMap<string, SummaryEntry>;
	/** Custom title entry from /rename command, if present */
	readonly customTitle: CustomTitleEntry | undefined;
	/** Errors encountered during parsing */
	readonly errors: readonly ParseError[];
	/** Statistics about the parse */
	readonly stats: ParseStats;
}

/**
 * Statistics from parsing a session file.
 */
interface ParseStats {
	readonly totalLines: number;
	readonly chainNodes: number;
	readonly summaries: number;
	readonly customTitles: number;
	readonly queueOperations: number;
	readonly errors: number;
	readonly skippedEmpty: number;
}

// #endregion

// #region Layer 2 — Linked List Parser

/**
 * Parse a session file's content into a linked list of chain nodes.
 *
 * This is Layer 2 of the parser architecture. Every JSONL line with a `uuid`
 * becomes a ChainNode in a single map. No classification into separate buckets.
 * The effective parent is `logicalParentUuid ?? parentUuid`, which handles
 * compact boundaries transparently.
 *
 * @param content The raw UTF-8 content of a .jsonl session file
 * @param fileIdentifier Optional identifier for error messages (e.g., file path)
 * @returns LinkedListParseResult with nodes, summaries, and errors
 */
export function parseSessionFileContent(
	content: string,
	fileIdentifier?: string
): LinkedListParseResult {
	const nodes = new Map<string, ChainNode>();
	const summaries = new Map<string, SummaryEntry>();
	const errors: ParseError[] = [];
	let customTitle: CustomTitleEntry | undefined;

	const stats = {
		totalLines: 0,
		chainNodes: 0,
		summaries: 0,
		customTitles: 0,
		queueOperations: 0,
		errors: 0,
		skippedEmpty: 0,
	};

	const lines = content.split('\n');

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		stats.totalLines++;

		if (line.length === 0) {
			stats.skippedEmpty++;
			continue;
		}

		const lineNumber = i + 1;

		// Parse JSON
		let parsed: unknown;
		try {
			parsed = JSON.parse(line);
		} catch (e) {
			stats.errors++;
			const message = e instanceof Error ? e.message : String(e);
			errors.push({
				lineNumber,
				message: fileIdentifier
					? `[${fileIdentifier}:${lineNumber}] JSON parse error: ${message}`
					: `JSON parse error: ${message}`,
				line: line.length > 100 ? line.substring(0, 100) + '...' : line,
			});
			continue;
		}

		if (typeof parsed !== 'object' || parsed === null) {
			stats.errors++;
			errors.push({
				lineNumber,
				message: fileIdentifier
					? `[${fileIdentifier}:${lineNumber}] Expected object, got ${typeof parsed}`
					: `Expected object, got ${typeof parsed}`,
				line: line.length > 100 ? line.substring(0, 100) + '...' : line,
			});
			continue;
		}

		const raw = parsed as Record<string, unknown>;

		// Try custom title entry (user-assigned session name via /rename)
		const customTitleResult = vCustomTitleEntry.validate(parsed);
		if (!customTitleResult.error) {
			stats.customTitles++;
			customTitle = customTitleResult.content;
			continue;
		}

		// Try summary entry first (has no uuid/parentUuid chain)
		const summaryResult = vSummaryEntry.validate(parsed);
		if (!summaryResult.error) {
			stats.summaries++;
			const summary = summaryResult.content.summary.toLowerCase();
			if (!summary.startsWith('api error:') && !summary.startsWith('invalid api key')) {
				summaries.set(summaryResult.content.leafUuid, summaryResult.content);
			}
			continue;
		}

		// Try extracting chain node fields (uuid + parent info)
		const chainResult = vChainNodeFields.validate(parsed);
		if (!chainResult.error) {
			stats.chainNodes++;
			const { uuid, logicalParentUuid, parentUuid } = chainResult.content;
			nodes.set(uuid, {
				uuid,
				parentUuid: logicalParentUuid ?? parentUuid ?? null,
				raw,
				lineNumber,
			});
			continue;
		}

		// No uuid — likely a queue-operation or other non-chain entry
		if ('type' in raw && raw.type === 'queue-operation') {
			stats.queueOperations++;
		} else {
			// Unknown entry — not a hard error, just skip
			stats.queueOperations++;
		}
	}

	return {
		nodes,
		summaries,
		customTitle,
		errors,
		stats,
	};
}

// #endregion

// #region Layer 3 — Session Building

/**
 * Check if a chain node represents a visible entry.
 *
 * The generalized rule: if the entry has displayable content (a `message`
 * field for user/assistant entries or a string `content` field for system
 * entries), it is visible — unless one of the hiding booleans is set.
 */
function isVisibleNode(raw: Record<string, unknown>): boolean {
	// Must have displayable content
	const hasMessage = 'message' in raw && (raw.type === 'user' || raw.type === 'assistant');
	const hasSystemContent = typeof raw.content === 'string' && (raw.content as string).length > 0 && raw.type !== 'user' && raw.type !== 'assistant';
	if (!hasMessage && !hasSystemContent) {
		return false;
	}
	// Compact summaries are synthetic and should not be rendered
	if (raw.isCompactSummary === true) {
		return false;
	}
	// Meta entries and transcript-only entries are not rendered
	if (raw.isVisibleInTranscriptOnly === true) {
		return false;
	}
	if (raw.isMeta === true) {
		return false;
	}
	return true;
}

/**
 * Validate a visible node's raw data and produce a StoredMessage.
 * Returns null if validation fails.
 */
function validateAndReviveNode(node: ChainNode): StoredMessage | null {
	const raw = node.raw;

	if (raw.type === 'user') {
		const result = vUserMessageEntry.validate(raw);
		if (result.error) {
			return null;
		}
		return reviveUserMessage(result.content);
	}

	if (raw.type === 'assistant') {
		const result = vAssistantMessageEntry.validate(raw);
		if (result.error) {
			return null;
		}
		return reviveAssistantMessage(result.content);
	}

	// System entries (e.g., compact_boundary) with string content
	if (typeof raw.content === 'string') {
		return reviveSystemMessage(node);
	}

	return null;
}

// #endregion

// #region Message Revival

/**
 * Convert a validated user message entry into a StoredMessage.
 */
function reviveUserMessage(entry: UserMessageEntry): StoredMessage {
	return {
		uuid: entry.uuid,
		sessionId: entry.sessionId,
		timestamp: new Date(entry.timestamp),
		parentUuid: entry.parentUuid ?? null,
		type: 'user',
		message: entry.message,
		isSidechain: entry.isSidechain,
		userType: entry.userType,
		cwd: entry.cwd,
		version: entry.version,
		gitBranch: entry.gitBranch,
		slug: entry.slug,
		agentId: entry.agentId,
	};
}

/**
 * Convert a validated assistant message entry into a StoredMessage.
 */
function reviveAssistantMessage(entry: AssistantMessageEntry): StoredMessage {
	return {
		uuid: entry.uuid,
		sessionId: entry.sessionId,
		timestamp: new Date(entry.timestamp),
		parentUuid: entry.parentUuid ?? null,
		type: 'assistant',
		message: entry.message,
		isSidechain: entry.isSidechain,
		userType: entry.userType,
		cwd: entry.cwd,
		version: entry.version,
		gitBranch: entry.gitBranch,
		slug: entry.slug,
		agentId: entry.agentId,
	};
}

/**
 * Convert a system chain node into a StoredMessage.
 * System entries (e.g., compact_boundary) carry a plain string `content` field.
 */
function reviveSystemMessage(node: ChainNode): StoredMessage | null {
	const raw = node.raw;
	const sessionId = typeof raw.sessionId === 'string' ? raw.sessionId : undefined;
	const timestamp = typeof raw.timestamp === 'string' ? raw.timestamp : undefined;
	const content = typeof raw.content === 'string' ? raw.content : undefined;

	if (!sessionId || !timestamp || !content) {
		return null;
	}

	return {
		uuid: node.uuid,
		sessionId,
		timestamp: new Date(timestamp),
		parentUuid: node.parentUuid,
		type: 'system',
		message: { role: 'system', content },
		version: typeof raw.version === 'string' ? raw.version : undefined,
	};
}

// #endregion

// #region Subagent Building

/**
 * Build an ISubagentSession from parsed file content.
 * Subagent files have the same JSONL format as main session files.
 */
export function buildSubagentSession(
	agentId: string,
	parseResult: LinkedListParseResult
): ISubagentSession | null {
	const { nodes } = parseResult;

	// Find leaf nodes
	const referencedAsParent = new Set<string>();
	for (const node of nodes.values()) {
		if (node.parentUuid !== null) {
			referencedAsParent.add(node.parentUuid);
		}
	}

	const leafUuids: string[] = [];
	for (const uuid of nodes.keys()) {
		if (!referencedAsParent.has(uuid)) {
			leafUuids.push(uuid);
		}
	}

	if (leafUuids.length === 0) {
		return null;
	}

	// Build chain from the leaf with the most visible messages
	let bestChain: StoredMessage[] = [];

	for (const leafUuid of leafUuids) {
		const chain: StoredMessage[] = [];
		const visited = new Set<string>();
		let currentUuid: string | null = leafUuid;

		while (currentUuid !== null) {
			if (visited.has(currentUuid)) {
				break;
			}
			visited.add(currentUuid);

			const node = nodes.get(currentUuid);
			if (node === undefined) {
				break;
			}

			if (isVisibleNode(node.raw)) {
				const storedMessage = validateAndReviveNode(node);
				if (storedMessage !== null) {
					chain.unshift(storedMessage);
				}
			}

			currentUuid = node.parentUuid;
		}

		if (chain.length > bestChain.length) {
			bestChain = chain;
		}
	}

	if (bestChain.length === 0) {
		return null;
	}

	return {
		agentId,
		messages: bestChain,
		timestamp: bestChain[bestChain.length - 1].timestamp,
	};
}

// #endregion
