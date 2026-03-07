/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Session entry validators -- the single source of truth for in-memory
 * session state.
 *
 * Validators define both runtime validation and the TypeScript types (via
 * {@link ValidatorType}). Used by {@link LocalSession} at runtime. These
 * types intentionally do NOT carry a version field; the storage layer
 * ({@link SessionStorage}) extends them with `v` when persisting to JSONL.
 */

import {
	ValidatorType,
	vArray,
	vBoolean,
	vEnum,
	vLiteral,
	vObj,
	vOptionalProp,
	vString,
	vUnchecked,
	vUnion,
} from '../../../base/common/validation.js';

// -- Content part validators --------------------------------------------------

export const vTextPart = vObj({
	type: vLiteral('text'),
	text: vString(),
});

export const vToolCallPart = vObj({
	type: vLiteral('tool-call'),
	toolCallId: vString(),
	toolName: vString(),
	arguments: vUnchecked<Record<string, unknown>>(),
});

export const vThinkingPart = vObj({
	type: vLiteral('thinking'),
	text: vString(),
	signature: vOptionalProp(vString()),
});

export const vRedactedThinkingPart = vObj({
	type: vLiteral('redacted-thinking'),
	data: vString(),
});

export const vAssistantContentPart = vUnion(
	vTextPart,
	vToolCallPart,
	vThinkingPart,
	vRedactedThinkingPart,
);

// -- Model identity validator -------------------------------------------------

export const vModelIdentity = vObj({
	provider: vString(),
	modelId: vString(),
});

// -- Session entry validators -------------------------------------------------

export const vSessionUserMessage = vObj({
	type: vLiteral('user-message'),
	id: vString(),
	content: vString(),
});
export type ISessionUserMessage = ValidatorType<typeof vSessionUserMessage>;

export const vSessionAssistantMessage = vObj({
	type: vLiteral('assistant-message'),
	id: vString(),
	parts: vArray(vAssistantContentPart),
	modelIdentity: vModelIdentity,
	providerMetadata: vOptionalProp(vUnchecked<Record<string, unknown>>()),
});
export type ISessionAssistantMessage = ValidatorType<typeof vSessionAssistantMessage>;

export const vSessionToolStart = vObj({
	type: vLiteral('tool-start'),
	toolCallId: vString(),
	toolName: vString(),
	displayName: vString(),
	invocationMessage: vString(),
	toolInput: vOptionalProp(vString()),
	toolKind: vOptionalProp(vEnum('terminal')),
	language: vOptionalProp(vString()),
});
export type ISessionToolStart = ValidatorType<typeof vSessionToolStart>;

export const vSessionToolComplete = vObj({
	type: vLiteral('tool-complete'),
	toolCallId: vString(),
	toolName: vString(),
	success: vBoolean(),
	pastTenseMessage: vString(),
	toolOutput: vString(),
});
export type ISessionToolComplete = ValidatorType<typeof vSessionToolComplete>;

export const vSessionEntry = vUnion(
	vSessionUserMessage,
	vSessionAssistantMessage,
	vSessionToolStart,
	vSessionToolComplete,
);
export type SessionEntry = ValidatorType<typeof vSessionEntry>;
