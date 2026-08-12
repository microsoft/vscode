/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Turns the recorded `request:` block of a capture into an executable
 * expectation.
 *
 * `CapiReplayProxy` selects a response purely by ordinal — the Nth request to an
 * endpoint replays the Nth recorded response — so nothing ever compares what was
 * actually asked. That leaves the request body, which is the *host's* own
 * product (prompt assembly, retained history, truncation, attachment
 * marshalling, and how tool results are handed back), completely unasserted: a
 * regression in any of it still replays green, and is silently promoted to the
 * new expected value the next time somebody re-records.
 *
 * Ordinal routing stays as it is — matching on request bodies would be brittle
 * against volatile fields and would desync the agent loop. Instead the same
 * projection is applied to both the committed request and the live one, and the
 * two are compared. Because the projection is symmetric, captures keep their
 * existing shape and stay fully readable.
 *
 * What is asserted is host-authored structure: message roles and their order,
 * retained history, whether a system prompt was sent, attachment and text
 * content, tool names and inputs, and `tool_use_id` wiring.
 *
 * What is elided is environment-derived: the `tool_result` payload, any
 * identifier minted at run time, and the model id. Asserting raw tool output
 * would reintroduce exactly the platform coupling these captures were made
 * portable to avoid — command output, line endings, and listing formats all
 * differ per OS — and would need a per-tool normalizer layer to hold stable. A
 * tool result's presence and wiring is worth asserting; its text is not. The
 * model id moves with the provider's default and the model catalog rather than
 * with anything the host composes, so asserting it would break every capture on
 * an unrelated catalog bump; captures still record it for review.
 */

import type { IReadableAnthropicRequest } from './capiWireCodec.js';
import { normalizeShellToolNameForCapture } from './shellToolNames.js';

/** Stands in for an elided, environment-derived tool result payload. */
export const TOOL_RESULT_PLACEHOLDER = '${tool_result}';

/**
 * Stands in for any run-time identifier. Captures store these as ordinals
 * (`${uuid_0}`) assigned when the fixture was written, which a live run cannot
 * reproduce, so both sides collapse to one token: presence is asserted,
 * identity is not.
 */
const RUNTIME_ID_PLACEHOLDER = '${uuid}';
const RAW_UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const ORDINAL_UUID_RE = /\$\{uuid_\d+\}/g;

/** Stands in for a path, whose spelling is per-machine. */
const PATH_PLACEHOLDER = '${path}';

/**
 * A path: a recorder placeholder root (`${workdir}`, with or without a
 * trailing segment), a Windows absolute path (`C:\x\y`), or a POSIX absolute
 * path (`/x/y`). Stops at whitespace and at the punctuation that typically
 * closes a path in prose or JSON.
 */
const PATH_RE = /(?:\$\{(?:workdir|homedir)\}|(?<![A-Za-z])[A-Za-z]:|(?<![A-Za-z0-9])(?=[/\\]))(?:[/\\](?:\$\{[^}]+\}|[^\s"'`,;:*?<>|)$\]}/\\]+))*/g;

/**
 * Replaces a path with a single placeholder.
 *
 * A path has too many per-machine spellings to compare literally across
 * platforms: separator (`\` vs `/`), drive letter, 8.3 short names, `/var` vs
 * `/private/var`, whether the recorder's `${workdir}` / `${homedir}`
 * substitution matched at all, and whether the value is a file or the
 * workspace directory itself. Two rounds of Windows CI failures came from
 * exactly these differences, none of them a real regression.
 *
 * So the path is treated as environment-derived, like a `tool_result` payload:
 * its presence and position stay asserted, its spelling does not. What file
 * an operation actually touched is asserted directly against the filesystem by
 * the tests that care, which is a stronger oracle than the prompt text anyway.
 */
function elidePaths(text: string): string {
	return text.replace(PATH_RE, PATH_PLACEHOLDER);
}

/**
 * Reasoning blocks cannot survive the capture round-trip: aggregating a
 * recorded reply drops them, so the assistant turn replayed back to the agent
 * never carries one even though the live recording did. They are also model
 * output rather than host-authored structure.
 */
const REASONING_BLOCK_TYPES = new Set(['thinking', 'redacted_thinking', 'reasoning']);

function isReasoningBlock(block: unknown): boolean {
	return REASONING_BLOCK_TYPES.has((block as { type?: string })?.type ?? '');
}

export interface IProjectedMessage {
	readonly role: string;
	readonly content: unknown;
}

export interface IProjectedModelRequest {
	readonly system: string;
	readonly messages: readonly IProjectedMessage[];
}

function elideRuntimeIds(text: string): string {
	return elidePaths(text.replace(RAW_UUID_RE, RUNTIME_ID_PLACEHOLDER).replace(ORDINAL_UUID_RE, RUNTIME_ID_PLACEHOLDER));
}

function projectValue(value: unknown): unknown {
	if (typeof value === 'string') {
		return elideRuntimeIds(value);
	}
	if (Array.isArray(value)) {
		return value.map(projectValue);
	}
	if (value && typeof value === 'object') {
		const result: Record<string, unknown> = {};
		for (const [key, item] of Object.entries(value)) {
			result[key] = projectValue(item);
		}
		return result;
	}
	return value;
}

function projectContent(content: unknown): unknown {
	if (typeof content === 'string') {
		return elideRuntimeIds(content);
	}
	if (!Array.isArray(content)) {
		return projectValue(content);
	}
	return content.filter(block => !isReasoningBlock(block)).map(block => {
		const b = block as { type?: string; text?: string; name?: string; input?: unknown; tool_use_id?: string };
		switch (b.type) {
			case 'text':
				return { type: 'text', text: elideRuntimeIds(b.text ?? '') };
			case 'tool_use':
				return { type: 'tool_use', name: normalizeShellToolNameForCapture(b.name ?? ''), input: projectValue(b.input) };
			case 'tool_result':
				return { type: 'tool_result', tool_use_id: elideRuntimeIds(b.tool_use_id ?? ''), content: TOOL_RESULT_PLACEHOLDER };
			default:
				return { type: b.type };
		}
	});
}

/** Projects a readable model request down to its host-authored structure. */
export function projectModelRequest(request: IReadableAnthropicRequest): IProjectedModelRequest {
	return {
		system: request.system,
		messages: request.messages.map(message => ({ role: message.role, content: projectContent(message.content) })),
	};
}

/**
 * Serializes a projection with object keys in a stable order.
 *
 * A tool call's `input` is JSON the model produced, and its key order is not
 * guaranteed to survive a re-record or a YAML round-trip. Comparing raw
 * `JSON.stringify` output would then report two semantically identical
 * requests as a mismatch — which reads as a host regression and is
 * particularly confusing because the printed values look equivalent.
 */
function stableStringify(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(stableStringify).join(',')}]`;
	}
	if (value && typeof value === 'object') {
		const entries = Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
		return `{${entries.join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

/** Compares two projections, ignoring object key order. */
export function modelRequestsMatch(expected: IProjectedModelRequest, actual: IProjectedModelRequest): boolean {
	return stableStringify(expected) === stableStringify(actual);
}

/**
 * Describes a mismatch for the replay failure, naming the turn so it can be
 * matched against the fixture's exchange list. Both sides are printed in the
 * same canonical form that was compared, so the reported difference is always
 * the reason the comparison failed.
 */
export function formatModelRequestMismatch(turnIndex: number, expected: IProjectedModelRequest, actual: IProjectedModelRequest): string {
	return [
		`model request #${turnIndex + 1} does not match the recorded request in the fixture`,
		`  expected (recorded): ${stableStringify(expected)}`,
		`  actual (live):       ${stableStringify(actual)}`,
	].join('\n');
}
