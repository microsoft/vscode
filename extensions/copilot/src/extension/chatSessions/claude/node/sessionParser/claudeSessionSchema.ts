/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Schema Validators for Claude Code Session Files
 *
 * This module provides type-safe validators for parsing Claude Code session JSONL files.
 * It uses a composable validator pattern that ensures runtime validation matches static types.
 *
 * ## Session File Format
 * Claude Code stores sessions in JSONL format with several entry types:
 * - QueueOperationEntry: Session queue state (dequeue operations)
 * - UserMessageEntry: User messages with optional tool results
 * - AssistantMessageEntry: Assistant responses including tool use, thinking blocks
 * - SummaryEntry: Session summaries for display labels
 * - ChainNode: Generic linked list node for parent-chain resolution
 *
 * ## Validation Approach
 * - Every JSON.parse result goes through validators before use
 * - No type assertions (`as`) - all types are inferred from validators
 * - Detailed error messages for debugging schema mismatches
 *
 * @see CLAUDE.md for complete format documentation
 */

import type Anthropic from '@anthropic-ai/sdk';
import {
	IValidator,
	ValidationError,
	ValidatorType,
	vArray,
	vBoolean,
	vEnum,
	vLiteral,
	vNullable,
	vNumber,
	vObj,
	vObjAny,
	vRequired,
	vString,
	vUnchecked,
	vUndefined,
	vUnion,
	vUnknown,
} from '../../../../../platform/configuration/common/validator';

// Re-export validator utilities for convenience
export { IValidator, ValidationError, ValidatorType };

// #region Primitive Validators

/**
 * Validates ISO 8601 timestamp strings (e.g., "2026-01-31T00:34:50.025Z").
 * Does not validate that the date is semantically valid, only format.
 */
export function vIsoTimestamp(): IValidator<string> {
	return {
		validate(content: unknown) {
			if (typeof content !== 'string') {
				return { content: undefined, error: { message: `Expected ISO timestamp string, got ${typeof content}` } };
			}
			// Basic ISO 8601 format check (YYYY-MM-DDTHH:MM:SS with optional fractional seconds and Z)
			const isoPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;
			if (!isoPattern.test(content)) {
				return { content: undefined, error: { message: `Invalid ISO timestamp format: ${content}` } };
			}
			return { content, error: undefined };
		},
		toSchema() {
			return { type: 'string', format: 'date-time' };
		}
	};
}

/**
 * Validates UUID-like strings.
 * We use a lenient approach since real session data may have variations
 * like agent IDs (e.g., "a139fcf") or other identifier formats.
 *
 * Strict UUID format: "6762c0b9-ee55-42cc-8998-180da7f37462"
 * But we accept any non-empty string to handle edge cases.
 */
export function vUuid(): IValidator<string> {
	return {
		validate(content: unknown) {
			if (typeof content !== 'string') {
				return { content: undefined, error: { message: `Expected UUID string, got ${typeof content}` } };
			}
			if (content.length === 0) {
				return { content: undefined, error: { message: 'Expected non-empty UUID string' } };
			}
			return { content, error: undefined };
		},
		toSchema() {
			return { type: 'string', format: 'uuid' };
		}
	};
}

// #endregion

// #region Message Content Validators
// These validators parse session file content and output SDK-compatible types.
// Using SDK types directly ensures compile-time errors when the SDK changes.

/**
 * Compile-time assertion that validator output is assignable to SDK type.
 * If SDK changes in incompatible ways, this will fail and remind us to update the validator.
 * Direction: Validator -> SDK (validator output can be used as SDK type)
 */
function assertValidatorAssignable<_TValidator extends TSDKType, TSDKType>(): void { }

/**
 * Text content block in assistant messages.
 * Matches Anthropic.TextBlock from the SDK.
 */
export const vTextBlock = vObj({
	type: vRequired(vLiteral('text')),
	text: vRequired(vString()),
	citations: vNullable(vArray(vUnchecked<Anthropic.TextCitation>())),
});
assertValidatorAssignable<ValidatorType<typeof vTextBlock>, Anthropic.TextBlock>();
export type TextBlock = Anthropic.TextBlock;

/**
 * Thinking content block in assistant messages.
 * Matches Anthropic.ThinkingBlock from the SDK.
 */
export const vThinkingBlock = vObj({
	type: vRequired(vLiteral('thinking')),
	thinking: vRequired(vString()),
	signature: vRequired(vString()),
});
assertValidatorAssignable<ValidatorType<typeof vThinkingBlock>, Anthropic.ThinkingBlock>();
export type ThinkingBlock = Anthropic.ThinkingBlock;

/**
 * Tool use content block in assistant messages.
 * Matches Anthropic.Beta.Messages.BetaToolUseBlock from the SDK.
 */
export const vToolUseBlock = vObj({
	type: vRequired(vLiteral('tool_use')),
	id: vRequired(vString()),
	name: vRequired(vString()),
	input: vRequired(vUnknown()),
});
assertValidatorAssignable<ValidatorType<typeof vToolUseBlock>, Anthropic.Beta.Messages.BetaToolUseBlock>();
export type ToolUseBlock = Anthropic.Beta.Messages.BetaToolUseBlock;

/**
 * Tool result content block in user messages (response to tool use).
 * Matches Anthropic.ToolResultBlockParam from the SDK.
 *
 * Note: Content array elements use vUnchecked because:
 * - Data originates from Claude's API (trusted source)
 * - Full validators for each block param type would add significant maintenance cost
 * - The outer structure is validated; malformed inner content surfaces at consumption time
 */
export const vToolResultBlock = vObj({
	type: vRequired(vLiteral('tool_result')),
	tool_use_id: vRequired(vString()),
	content: vUnion(
		vString(),
		vArray(vUnchecked<Anthropic.TextBlockParam | Anthropic.ImageBlockParam | Anthropic.SearchResultBlockParam | Anthropic.DocumentBlockParam>()),
		vUndefined()
	),
	is_error: vBoolean(),
});
assertValidatorAssignable<ValidatorType<typeof vToolResultBlock>, Anthropic.ToolResultBlockParam>();
export type ToolResultBlock = Anthropic.ToolResultBlockParam;

/**
 * Base64 image source with inline data.
 * Matches Anthropic.Base64ImageSource from the SDK.
 */
const vBase64ImageSource = vObj({
	type: vRequired(vLiteral('base64')),
	media_type: vRequired(vEnum('image/jpeg', 'image/png', 'image/gif', 'image/webp')),
	data: vRequired(vString()),
});

/**
 * URL image source with a remote URL.
 * Matches Anthropic.URLImageSource from the SDK.
 */
const vURLImageSource = vObj({
	type: vRequired(vLiteral('url')),
	url: vRequired(vString()),
});

/**
 * Image content block in user messages.
 * Matches Anthropic.ImageBlockParam from the SDK.
 *
 * Source is validated as a discriminated union of base64 and url shapes,
 * ensuring required fields (type, media_type/data or url) are present.
 */
export const vImageBlock = vObj({
	type: vRequired(vLiteral('image')),
	source: vRequired(vUnion(vBase64ImageSource, vURLImageSource)),
});
assertValidatorAssignable<ValidatorType<typeof vImageBlock>, Anthropic.ImageBlockParam>();
export type ImageBlock = Anthropic.ImageBlockParam;

/**
 * Unknown content block type for forward compatibility.
 * Allows parsing of new block types the SDK may introduce.
 */
export const vUnknownContentBlock = vObj({
	type: vRequired(vString()),
});
export type UnknownContentBlock = { type: string };

/**
 * Union of all known content block types.
 * For assistant messages, use ContentBlock (excludes ToolResultBlock).
 * For user messages, content may also include ToolResultBlock.
 */
export const vContentBlock = vUnion(
	vTextBlock,
	vThinkingBlock,
	vToolUseBlock,
	vToolResultBlock,
	vImageBlock,
	vUnknownContentBlock
);
export type ContentBlock = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock | ImageBlock | UnknownContentBlock;

// #endregion

// #region Message Usage Validators

/**
 * Cache creation details for token usage.
 */
export const vCacheCreation = vObj({
	ephemeral_1h_input_tokens: vNumber(),
	ephemeral_5m_input_tokens: vNumber(),
});
export type CacheCreation = ValidatorType<typeof vCacheCreation>;

/**
 * Token usage information for API calls.
 */
export const vUsage = vObj({
	cache_creation: vNullable(vCacheCreation),
	cache_creation_input_tokens: vNumber(),
	cache_read_input_tokens: vNumber(),
	input_tokens: vNumber(),
	output_tokens: vNumber(),
});
export type Usage = ValidatorType<typeof vUsage>;

// #endregion

// #region Role-Specific Message Validators

/**
 * User message content (from Anthropic SDK MessageParam type).
 */
export const vUserMessageContent = vObj({
	role: vRequired(vLiteral('user')),
	content: vRequired(vUnion(vString(), vArray(vContentBlock))),
});
export type UserMessageContent = ValidatorType<typeof vUserMessageContent>;

/**
 * Assistant message content (from Anthropic SDK BetaMessage type).
 */
export const vAssistantMessageContent = vObj({
	role: vRequired(vLiteral('assistant')),
	content: vRequired(vArray(vContentBlock)),
	id: vString(),
	model: vString(),
	type: vString(),
	stop_reason: vNullable(vString()),
	stop_sequence: vNullable(vString()),
	usage: vUsage,
	parent_tool_use_id: vNullable(vString()),
});
export type AssistantMessageContent = ValidatorType<typeof vAssistantMessageContent>;

/**
 * System message content — a simple text entry produced by the runtime
 * (e.g., "Conversation compacted" from a compact boundary).
 */
interface SystemMessageContent {
	readonly role: 'system';
	readonly content: string;
}

/**
 * Model ID used by the SDK for synthetic messages (e.g., "No response requested." from abort).
 * These messages should be filtered out from display and processing.
 */
export const SYNTHETIC_MODEL_ID = '<synthetic>';

// #endregion

// #region Session Entry Validators

/**
 * Queue operation entry - represents session queue state changes.
 * Example: { "type": "queue-operation", "operation": "dequeue", "timestamp": "...", "sessionId": "..." }
 */
export const vQueueOperationEntry = vObj({
	type: vRequired(vLiteral('queue-operation')),
	operation: vRequired(vEnum('dequeue', 'enqueue')),
	timestamp: vRequired(vIsoTimestamp()),
	sessionId: vRequired(vUuid()),
});
export type QueueOperationEntry = ValidatorType<typeof vQueueOperationEntry>;

/**
 * Common fields shared between user and assistant message entries.
 */
const vCommonMessageFields = {
	uuid: vRequired(vUuid()),
	sessionId: vRequired(vUuid()),
	timestamp: vRequired(vIsoTimestamp()),
	parentUuid: vNullable(vUuid()),
	isSidechain: vBoolean(),
	userType: vString(),
	cwd: vString(),
	version: vString(),
	gitBranch: vString(),
	slug: vString(),
	agentId: vString(),
};

/**
 * User message entry - represents a user turn in the conversation.
 * May contain plain text or tool results.
 */
export const vUserMessageEntry = vObj({
	...vCommonMessageFields,
	type: vRequired(vLiteral('user')),
	message: vRequired(vUserMessageContent),
	toolUseResult: vUnion(vString(), vObjAny()),
	sourceToolAssistantUUID: vString(),
	isCompactSummary: vBoolean(),
});
export type UserMessageEntry = ValidatorType<typeof vUserMessageEntry>;

/**
 * Assistant message entry - represents an assistant turn in the conversation.
 * May contain text, thinking, tool use blocks.
 */
export const vAssistantMessageEntry = vObj({
	...vCommonMessageFields,
	type: vRequired(vLiteral('assistant')),
	message: vRequired(vAssistantMessageContent),
});
export type AssistantMessageEntry = ValidatorType<typeof vAssistantMessageEntry>;

/**
 * Summary entry - provides a label for the session based on conversation.
 * Example: { "type": "summary", "summary": "Implementing dark mode", "leafUuid": "..." }
 */
export const vSummaryEntry = vObj({
	type: vRequired(vLiteral('summary')),
	summary: vRequired(vString()),
	leafUuid: vRequired(vUuid()),
});
export type SummaryEntry = ValidatorType<typeof vSummaryEntry>;

/**
 * Custom title entry - user-assigned session name via /rename command.
 * Example: { "type": "custom-title", "customTitle": "omega-3", "sessionId": "..." }
 * Takes highest priority over summary and first-message labels.
 */
export const vCustomTitleEntry = vObj({
	type: vRequired(vLiteral('custom-title')),
	customTitle: vRequired(vString()),
	sessionId: vRequired(vUuid()),
});
export type CustomTitleEntry = ValidatorType<typeof vCustomTitleEntry>;

/**
 * Minimal validator for extracting chain metadata from any UUID-bearing entry.
 * Used by the linked list parser (layer 2) to build the session chain without
 * classifying entries into buckets. Every entry with a `uuid` becomes a ChainNode.
 */
export const vChainNodeFields = vObj({
	uuid: vRequired(vUuid()),
	parentUuid: vNullable(vUuid()),
	logicalParentUuid: vNullable(vUuid()),
});

// #endregion

// #region Union Validators

export const vMessageEntry = vUnion(
	vUserMessageEntry,
	vAssistantMessageEntry
);
export type MessageEntry = ValidatorType<typeof vMessageEntry>;

// #endregion

// #region Type Guards

export type ImageMediaType = Anthropic.Messages.Base64ImageSource['media_type'];

// Record ensures a compile error if the SDK adds a new media type we haven't covered.
const SUPPORTED_IMAGE_MEDIA_TYPES: Record<ImageMediaType, true> = {
	'image/jpeg': true,
	'image/png': true,
	'image/gif': true,
	'image/webp': true,
};

function isImageMediaType(value: string): value is ImageMediaType {
	return Object.hasOwn(SUPPORTED_IMAGE_MEDIA_TYPES, value);
}

/**
 * Normalizes a MIME type string to a supported Anthropic image media type.
 * Handles variations like 'image/jpg' → 'image/jpeg'.
 * Returns undefined for unsupported types.
 */
export function toAnthropicImageMediaType(mimeType: string): ImageMediaType | undefined {
	const normalized = mimeType.toLowerCase() === 'image/jpg' ? 'image/jpeg' : mimeType.toLowerCase();
	return isImageMediaType(normalized) ? normalized : undefined;
}

/**
 * Checks if a user message represents a genuine user request (not a tool result).
 * Tool results have content that is solely tool_result blocks; genuine requests
 * have string content or contain at least one non-tool_result block.
 */
export function isUserRequest(content: UserMessageContent['content']): boolean {
	if (typeof content === 'string') {
		return true;
	}
	if (!Array.isArray(content)) {
		return false;
	}
	return content.some(block => block.type !== 'tool_result');
}

// #endregion

// #region Session Output Types

/**
 * A node in the session linked list. Holds raw parsed data and chain metadata.
 * Built by layer 2 (parseSessionFileContent) and consumed by layer 3 (buildSessions).
 */
export interface ChainNode {
	readonly uuid: string;
	readonly parentUuid: string | null;
	readonly raw: Record<string, unknown>;
	readonly lineNumber: number;
}

/**
 * A stored message with revived timestamp (Date instead of string).
 */
export interface StoredMessage {
	readonly uuid: string;
	readonly sessionId: string;
	readonly timestamp: Date;
	readonly parentUuid: string | null;
	readonly type: 'user' | 'assistant' | 'system';
	readonly message: UserMessageContent | AssistantMessageContent | SystemMessageContent;
	readonly isSidechain?: boolean;
	readonly userType?: string;
	readonly cwd?: string;
	readonly version?: string;
	readonly gitBranch?: string;
	readonly slug?: string;
	readonly agentId?: string;
	/** The agentId of the subagent spawned by a Task tool_use, extracted from toolUseResult. */
	readonly toolUseResultAgentId?: string;
}

/**
 * A subagent session spawned by the main session.
 * These are parallel task executions (e.g., Task tool agents).
 */
export interface ISubagentSession {
	readonly agentId: string;
	readonly messages: readonly StoredMessage[];
	readonly timestamp: Date;
}

/**
 * A parsed Claude Code session ready for use.
 */
export interface IClaudeCodeSession extends IClaudeCodeSessionInfo {
	readonly messages: readonly StoredMessage[];
	readonly subagents: readonly ISubagentSession[];
}

/**
 * Lightweight session metadata for listing sessions.
 * Contains only the information needed for ChatSessionItem display.
 * Does not include full message content to reduce memory usage.
 *
 * Timestamps are in milliseconds elapsed since January 1, 1970 00:00:00 UTC,
 * matching the ChatSessionItem.timing API contract.
 */
export interface IClaudeCodeSessionInfo {
	readonly id: string;
	readonly label: string;
	/** Timestamp when the session was created (first message) in ms since epoch. */
	readonly created: number;
	/** Timestamp when the most recent user request started in ms since epoch. */
	readonly lastRequestStarted?: number;
	/** Timestamp when the most recent request completed (last message) in ms since epoch. */
	readonly lastRequestEnded?: number;
	/** Basename of the workspace folder this session belongs to (for badge display) */
	readonly folderName?: string;
	/** Current working directory of the session */
	readonly cwd?: string;
}

// #endregion

// #endregion
