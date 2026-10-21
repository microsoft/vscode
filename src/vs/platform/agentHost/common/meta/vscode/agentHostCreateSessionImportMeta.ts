/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vArray, ValidatorBase, vBoolean, vEnum, vLiteral, vNumber, vObj, vOptionalProp, vString, vUnion, type ValidationError, type ValidatorType } from '../../../../../base/common/validation.js';
import type { IJSONSchema } from '../../../../../base/common/jsonSchema.js';
import type { IAgentCreateSessionConfig } from '../../agent.js';
import type { InitializeResult } from '../../state/protocol/common/commands.js';
import {
	ChatInputAnswerState,
	ChatInputAnswerValueKind,
	ChatInputQuestionKind,
	ChatInputResponseKind,
	ConfirmationOptionKind,
	McpAuthRequiredReason,
	MessageAttachmentKind,
	MessageKind,
	ResponsePartKind,
	ToolCallCancellationReason,
	ToolCallConfirmationReason,
	ToolCallContributorKind,
	ToolCallRiskAssessmentKind,
	ToolCallRiskAssessmentStatus,
	ToolCallStatus,
	ToolResultContentType,
	TurnState,
	type JsonPrimitive,
	type ModelSelection,
	type ResponsePart,
	type Turn,
} from '../../state/protocol/state.js';

/** Initialize capability: the host honors an imported conversation on `createSession` (see {@link AgentHostCreateSessionImportMetaKey}). */
export const AgentHostCreateSessionImportCapabilityMetaKey = 'vscode.createSessionImport';

/** `createSession` request `_meta` key carrying a conversation to import into the new session. */
export const AgentHostCreateSessionImportMetaKey = 'vscode.importConversation';

/**
 * Maximum UTF-16 code units per serialized conversation import chunk (1 MiB of characters, ~1-2 MiB UTF-8),
 * keeping each wire frame well below the 100 MiB WebSocket message limit.
 */
export const AGENT_HOST_CREATE_SESSION_IMPORT_CHUNK_CHARS = 1024 * 1024;

/** Maximum total UTF-16 code units a single client may stage concurrently before `createSession` consumes them. */
export const AGENT_HOST_CREATE_SESSION_IMPORT_MAX_STAGED_CHARS = 256 * 1024 * 1024;

export const StageCreateSessionImportChunkExtensionMethod = 'vscode/stageCreateSessionImportChunk';

export const stageCreateSessionImportChunkParamsValidator = vObj({
	transferId: vString(),
	chunk: vString(),
});

const stagedCreateSessionImportRefValidator = vObj({
	transferId: vString(),
});

export type IAgentCreateSessionImportConversation = NonNullable<IAgentCreateSessionConfig['importConversation']>;

/** Whether the host supports seeding an imported conversation on `createSession`. */
export function supportsAgentHostCreateSessionImport(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostCreateSessionImportCapabilityMetaKey] === true;
}

class RecordValidator<T> extends ValidatorBase<Record<string, T>> {
	constructor(private readonly _valueValidator: ValidatorBase<T>) {
		super();
	}

	validate(content: unknown): { content: Record<string, T>; error: undefined } | { content: undefined; error: ValidationError } {
		if (typeof content !== 'object' || content === null || Array.isArray(content)) {
			return { content: undefined, error: { message: 'Expected object' } };
		}
		const result: Record<string, T> = {};
		for (const [key, raw] of Object.entries(content)) {
			if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
				return { content: undefined, error: { message: `Disallowed property '${key}'` } };
			}
			const validated = this._valueValidator.validate(raw);
			if (validated.error) {
				return { content: undefined, error: { message: `Error in property '${key}': ${validated.error.message}` } };
			}
			Object.defineProperty(result, key, {
				value: validated.content,
				enumerable: true,
				configurable: true,
				writable: true,
			});
		}
		return { content: result, error: undefined };
	}

	getJSONSchema(): IJSONSchema {
		return { type: 'object', additionalProperties: this._valueValidator.getJSONSchema() };
	}
}

class NullLiteralValidator extends ValidatorBase<null> {
	validate(content: unknown): { content: null; error: undefined } | { content: undefined; error: ValidationError } {
		return content === null
			? { content: null, error: undefined }
			: { content: undefined, error: { message: `Expected null, but got ${typeof content}` } };
	}

	getJSONSchema(): IJSONSchema {
		return { type: 'null' };
	}
}

const vNull = new NullLiteralValidator();
const jsonPrimitiveValidator: ValidatorBase<JsonPrimitive> = vUnion(vString(), vNumber(), vBoolean(), vNull);
const openMetaValidator = new RecordValidator(new class extends ValidatorBase<unknown> {
	validate(content: unknown): { content: unknown; error: undefined } {
		return { content, error: undefined };
	}
	getJSONSchema(): IJSONSchema {
		return {};
	}
}());

const stringOrMarkdownValidator = vUnion(vString(), vObj({ markdown: vString() }));

const textPositionValidator = vObj({
	line: vNumber(),
	character: vNumber(),
});

const textRangeValidator = vObj({
	start: textPositionValidator,
	end: textPositionValidator,
});

const textSelectionValidator = vObj({
	range: textRangeValidator,
});

const contentRefFields = {
	uri: vString(),
	sizeHint: vOptionalProp(vNumber()),
	contentType: vOptionalProp(vString()),
	nonce: vOptionalProp(vString()),
};

export const modelSelectionValidator: ValidatorBase<ModelSelection> = vObj({
	id: vString(),
	config: vOptionalProp(new RecordValidator(jsonPrimitiveValidator)),
});

const agentSelectionValidator = vObj({
	uri: vString(),
});

const messageAttachmentBaseFields = {
	label: vString(),
	range: vOptionalProp(textRangeValidator),
	displayKind: vOptionalProp(vString()),
	_meta: vOptionalProp(openMetaValidator),
};

const messageAttachmentValidator = vUnion(
	vObj({
		...messageAttachmentBaseFields,
		type: vLiteral(MessageAttachmentKind.Simple),
		modelRepresentation: vOptionalProp(vString()),
	}),
	vObj({
		...messageAttachmentBaseFields,
		type: vLiteral(MessageAttachmentKind.EmbeddedResource),
		data: vString(),
		contentType: vString(),
		selection: vOptionalProp(textSelectionValidator),
	}),
	vObj({
		...messageAttachmentBaseFields,
		...contentRefFields,
		type: vLiteral(MessageAttachmentKind.Resource),
		selection: vOptionalProp(textSelectionValidator),
	}),
	vObj({
		...messageAttachmentBaseFields,
		type: vLiteral(MessageAttachmentKind.Annotations),
		resource: vString(),
		annotationIds: vOptionalProp(vArray(vString())),
	}),
	vObj({
		...messageAttachmentBaseFields,
		type: vLiteral(MessageAttachmentKind.Chat),
		resource: vString(),
		endTurn: vOptionalProp(vString()),
	}),
);

const messageOriginValidator = vObj({
	kind: vEnum(
		MessageKind.User,
		MessageKind.Agent,
		MessageKind.Tool,
		MessageKind.Automation,
		MessageKind.SystemNotification,
	),
});

const messageValidator = vObj({
	text: vString(),
	origin: messageOriginValidator,
	attachments: vOptionalProp(vArray(messageAttachmentValidator)),
	model: vOptionalProp(modelSelectionValidator),
	agent: vOptionalProp(agentSelectionValidator),
	_meta: vOptionalProp(openMetaValidator),
});

const errorInfoValidator = vObj({
	errorType: vString(),
	message: vString(),
	stack: vOptionalProp(vString()),
	_meta: vOptionalProp(openMetaValidator),
});

const usageInfoValidator = vObj({
	inputTokens: vOptionalProp(vNumber()),
	outputTokens: vOptionalProp(vNumber()),
	model: vOptionalProp(vString()),
	cacheReadTokens: vOptionalProp(vNumber()),
	_meta: vOptionalProp(openMetaValidator),
});

const fileEditSideValidator = vObj({
	uri: vString(),
	content: vObj(contentRefFields),
});

const fileEditDiffStatsValidator = vObj({
	added: vOptionalProp(vNumber()),
	removed: vOptionalProp(vNumber()),
});

const fileEditFields = {
	before: vOptionalProp(fileEditSideValidator),
	after: vOptionalProp(fileEditSideValidator),
	diff: vOptionalProp(fileEditDiffStatsValidator),
};

const fileEditValidator = vObj(fileEditFields);

const toolResultContentValidator = vUnion(
	vObj({
		type: vLiteral(ToolResultContentType.Text),
		text: vString(),
	}),
	vObj({
		type: vLiteral(ToolResultContentType.EmbeddedResource),
		data: vString(),
		contentType: vString(),
	}),
	vObj({
		...contentRefFields,
		type: vLiteral(ToolResultContentType.Resource),
	}),
	vObj({
		...fileEditFields,
		type: vLiteral(ToolResultContentType.FileEdit),
	}),
	vObj({
		type: vLiteral(ToolResultContentType.Terminal),
		resource: vString(),
		title: vString(),
		isPty: vOptionalProp(vBoolean()),
		result: vOptionalProp(vObj({
			exitCode: vOptionalProp(vNumber()),
			preview: vOptionalProp(vString()),
			truncated: vOptionalProp(vBoolean()),
		})),
	}),
	vObj({
		type: vLiteral(ToolResultContentType.Subagent),
		resource: vString(),
		title: vString(),
		agentName: vOptionalProp(vString()),
		description: vOptionalProp(vString()),
	}),
);

const confirmationOptionValidator = vObj({
	id: vString(),
	label: vString(),
	kind: vEnum(ConfirmationOptionKind.Approve, ConfirmationOptionKind.Deny),
	group: vOptionalProp(vNumber()),
});

const toolCallMcpContributorValidator = vObj({
	kind: vLiteral(ToolCallContributorKind.MCP),
	customizationId: vString(),
});

const toolCallContributorValidator = vUnion(
	vObj({
		kind: vLiteral(ToolCallContributorKind.Client),
		clientId: vString(),
	}),
	toolCallMcpContributorValidator,
);

const toolInputValidator = vUnion(
	vString(),
	vObj(contentRefFields),
);

const toolCallBaseFields = {
	toolCallId: vString(),
	toolName: vString(),
	displayName: vString(),
	intention: vOptionalProp(vString()),
	contributor: vOptionalProp(toolCallContributorValidator),
	requiresResultConfirmation: vOptionalProp(vBoolean()),
	_meta: vOptionalProp(openMetaValidator),
};

const toolCallParameterFields = {
	...toolCallBaseFields,
	invocationMessage: stringOrMarkdownValidator,
	toolInput: vOptionalProp(toolInputValidator),
};

const toolCallPostConfirmationFields = {
	...toolCallParameterFields,
	confirmed: vEnum(
		ToolCallConfirmationReason.NotNeeded,
		ToolCallConfirmationReason.UserAction,
		ToolCallConfirmationReason.Setting,
	),
	selectedOption: vOptionalProp(confirmationOptionValidator),
};

const toolCallResultFields = {
	success: vBoolean(),
	pastTenseMessage: stringOrMarkdownValidator,
	content: vOptionalProp(vArray(toolResultContentValidator)),
	structuredContent: vOptionalProp(openMetaValidator),
	error: vOptionalProp(vObj({
		message: vString(),
		code: vOptionalProp(vString()),
	})),
};

const toolCallRiskAssessmentValidator = vUnion(
	vObj({
		kind: vLiteral(ToolCallRiskAssessmentKind.Judge),
		status: vLiteral(ToolCallRiskAssessmentStatus.Loading),
	}),
	vObj({
		kind: vLiteral(ToolCallRiskAssessmentKind.Judge),
		status: vLiteral(ToolCallRiskAssessmentStatus.Complete),
		reason: stringOrMarkdownValidator,
		safety: vNumber(),
	}),
);

const protectedResourceMetadataValidator = vObj({
	resource: vString(),
	resource_name: vOptionalProp(vString()),
	authorization_servers: vOptionalProp(vArray(vString())),
	scopes_supported: vOptionalProp(vArray(vString())),
	bearer_methods_supported: vOptionalProp(vArray(vString())),
	resource_documentation: vOptionalProp(vString()),
});

const mcpOAuthClientValidator = vObj({
	clientId: vString(),
	clientSecret: vOptionalProp(vString()),
});

const mcpAuthRequirementValidator = vObj({
	reason: vEnum(McpAuthRequiredReason.Required, McpAuthRequiredReason.Expired, McpAuthRequiredReason.InsufficientScope),
	oauthClient: vOptionalProp(mcpOAuthClientValidator),
	resource: protectedResourceMetadataValidator,
	requiredScopes: vOptionalProp(vArray(vString())),
	description: vOptionalProp(vString()),
});

const toolCallStateValidator = vUnion(
	vObj({
		...toolCallBaseFields,
		status: vLiteral(ToolCallStatus.Streaming),
		partialInput: vOptionalProp(vString()),
		invocationMessage: vOptionalProp(stringOrMarkdownValidator),
	}),
	vObj({
		...toolCallParameterFields,
		status: vLiteral(ToolCallStatus.PendingConfirmation),
		confirmationTitle: vOptionalProp(stringOrMarkdownValidator),
		riskAssessment: vOptionalProp(toolCallRiskAssessmentValidator),
		edits: vOptionalProp(vObj({
			items: vArray(fileEditValidator),
		})),
		editable: vOptionalProp(vBoolean()),
		options: vOptionalProp(vArray(confirmationOptionValidator)),
	}),
	vObj({
		...toolCallPostConfirmationFields,
		status: vLiteral(ToolCallStatus.Running),
		content: vOptionalProp(vArray(toolResultContentValidator)),
	}),
	vObj({
		...toolCallPostConfirmationFields,
		status: vLiteral(ToolCallStatus.AuthRequired),
		contributor: toolCallMcpContributorValidator,
		auth: mcpAuthRequirementValidator,
		content: vOptionalProp(vArray(toolResultContentValidator)),
	}),
	vObj({
		...toolCallPostConfirmationFields,
		...toolCallResultFields,
		status: vLiteral(ToolCallStatus.PendingResultConfirmation),
	}),
	vObj({
		...toolCallPostConfirmationFields,
		...toolCallResultFields,
		status: vLiteral(ToolCallStatus.Completed),
	}),
	vObj({
		...toolCallParameterFields,
		status: vLiteral(ToolCallStatus.Cancelled),
		reason: vEnum(
			ToolCallCancellationReason.Denied,
			ToolCallCancellationReason.Skipped,
			ToolCallCancellationReason.ResultDenied,
		),
		reasonMessage: vOptionalProp(stringOrMarkdownValidator),
		userSuggestion: vOptionalProp(messageValidator),
		selectedOption: vOptionalProp(confirmationOptionValidator),
	}),
);

const chatInputOptionValidator = vObj({
	id: vString(),
	label: vString(),
	description: vOptionalProp(vString()),
	recommended: vOptionalProp(vBoolean()),
});

const chatInputQuestionBaseFields = {
	id: vString(),
	title: vOptionalProp(vString()),
	message: vString(),
	required: vOptionalProp(vBoolean()),
};

const chatInputQuestionValidator = vUnion(
	vObj({
		...chatInputQuestionBaseFields,
		kind: vLiteral(ChatInputQuestionKind.Text),
		format: vOptionalProp(vString()),
		min: vOptionalProp(vNumber()),
		max: vOptionalProp(vNumber()),
		defaultValue: vOptionalProp(vString()),
	}),
	vObj({
		...chatInputQuestionBaseFields,
		kind: vEnum(ChatInputQuestionKind.Number, ChatInputQuestionKind.Integer),
		min: vOptionalProp(vNumber()),
		max: vOptionalProp(vNumber()),
		defaultValue: vOptionalProp(vNumber()),
	}),
	vObj({
		...chatInputQuestionBaseFields,
		kind: vLiteral(ChatInputQuestionKind.Boolean),
		defaultValue: vOptionalProp(vBoolean()),
	}),
	vObj({
		...chatInputQuestionBaseFields,
		kind: vLiteral(ChatInputQuestionKind.SingleSelect),
		options: vArray(chatInputOptionValidator),
		allowFreeformInput: vOptionalProp(vBoolean()),
	}),
	vObj({
		...chatInputQuestionBaseFields,
		kind: vLiteral(ChatInputQuestionKind.MultiSelect),
		options: vArray(chatInputOptionValidator),
		allowFreeformInput: vOptionalProp(vBoolean()),
		min: vOptionalProp(vNumber()),
		max: vOptionalProp(vNumber()),
	}),
);

const chatInputAnswerValueValidator = vUnion(
	vObj({
		kind: vLiteral(ChatInputAnswerValueKind.Text),
		value: vString(),
	}),
	vObj({
		kind: vLiteral(ChatInputAnswerValueKind.Number),
		value: vNumber(),
	}),
	vObj({
		kind: vLiteral(ChatInputAnswerValueKind.Boolean),
		value: vBoolean(),
	}),
	vObj({
		kind: vLiteral(ChatInputAnswerValueKind.Selected),
		value: vString(),
		freeformValues: vOptionalProp(vArray(vString())),
	}),
	vObj({
		kind: vLiteral(ChatInputAnswerValueKind.SelectedMany),
		value: vArray(vString()),
		freeformValues: vOptionalProp(vArray(vString())),
	}),
);

const chatInputAnswerValidator = vUnion(
	vObj({
		state: vEnum(ChatInputAnswerState.Draft, ChatInputAnswerState.Submitted),
		value: chatInputAnswerValueValidator,
	}),
	vObj({
		state: vLiteral(ChatInputAnswerState.Skipped),
		freeformValues: vOptionalProp(vArray(vString())),
	}),
);

const chatInputRequestValidator = vObj({
	id: vString(),
	message: vOptionalProp(vString()),
	url: vOptionalProp(vString()),
	questions: vOptionalProp(vArray(chatInputQuestionValidator)),
	answers: vOptionalProp(new RecordValidator(chatInputAnswerValidator)),
});

const responsePartValidator: ValidatorBase<ResponsePart> = vUnion(
	vObj({
		kind: vLiteral(ResponsePartKind.Markdown),
		id: vString(),
		content: vString(),
	}),
	vObj({
		...contentRefFields,
		kind: vLiteral(ResponsePartKind.ContentRef),
	}),
	vObj({
		kind: vLiteral(ResponsePartKind.ToolCall),
		toolCall: toolCallStateValidator,
	}),
	vObj({
		kind: vLiteral(ResponsePartKind.Reasoning),
		id: vString(),
		content: vString(),
	}),
	vObj({
		kind: vLiteral(ResponsePartKind.SystemNotification),
		content: stringOrMarkdownValidator,
		_meta: vOptionalProp(openMetaValidator),
	}),
	vObj({
		kind: vLiteral(ResponsePartKind.InputRequest),
		request: chatInputRequestValidator,
		response: vOptionalProp(vEnum(ChatInputResponseKind.Accept, ChatInputResponseKind.Decline, ChatInputResponseKind.Cancel)),
	}),
	vObj({
		kind: vLiteral(ResponsePartKind.Error),
		error: errorInfoValidator,
		resumable: vOptionalProp(vBoolean()),
	}),
);

export const turnValidator = vObj({
	id: vString(),
	startedAt: vOptionalProp(vString()),
	duration: vOptionalProp(vNumber()),
	message: messageValidator,
	responseParts: vArray(responsePartValidator),
	usage: vOptionalProp(usageInfoValidator),
	state: vEnum(TurnState.Complete, TurnState.Cancelled, TurnState.Error),
});

export const createSessionImportValueValidator = vObj({
	turns: vArray(turnValidator),
	model: vOptionalProp(modelSelectionValidator),
	title: vOptionalProp(vString()),
});

/**
 * Reads the conversation import requested on `createSession`: `undefined` when the request carries none,
 * `'invalid'` when the value is present but malformed (or references an unknown/corrupt staged transfer).
 */
export function readCreateSessionImportMeta(
	meta: Readonly<Record<string, unknown>> | undefined,
	resolveStaged?: (transferId: string) => string | undefined,
): IAgentCreateSessionImportConversation | undefined | 'invalid' {
	const value = meta?.[AgentHostCreateSessionImportMetaKey];
	if (value === undefined) {
		return undefined;
	}
	if (typeof value === 'object' && value !== null && !Array.isArray(value) && !Object.hasOwn(value, 'turns') && Object.hasOwn(value, 'transferId')) {
		const stagedRef = stagedCreateSessionImportRefValidator.validate(value);
		if (stagedRef.error || !stagedRef.content.transferId.trim() || !resolveStaged) {
			return 'invalid';
		}
		const raw = resolveStaged(stagedRef.content.transferId);
		if (raw === undefined) {
			return 'invalid';
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			return 'invalid';
		}
		return readCreateSessionImportValue(parsed);
	}
	return readCreateSessionImportValue(value);
}

/**
 * Splits a serialized JSON conversation payload into UTF-16 surrogate-safe chunks of at most `maxChunkChars` code units.
 */
export function splitCreateSessionImportChunks(serialized: string, maxChunkChars = AGENT_HOST_CREATE_SESSION_IMPORT_CHUNK_CHARS): string[] {
	if (maxChunkChars < 2) {
		throw new Error('maxChunkChars must be at least 2');
	}
	if (serialized.length <= maxChunkChars) {
		return [serialized];
	}
	const chunks: string[] = [];
	let offset = 0;
	while (offset < serialized.length) {
		let end = Math.min(offset + maxChunkChars, serialized.length);
		if (end < serialized.length) {
			const lastCode = serialized.charCodeAt(end - 1);
			if (lastCode >= 0xD800 && lastCode <= 0xDBFF && end > offset + 1) {
				end--;
			}
		}
		chunks.push(serialized.slice(offset, end));
		offset = end;
	}
	return chunks;
}

/**
 * Reads a serialized conversation import value, returning `'invalid'` when it is malformed.
 */
export function readCreateSessionImportValue(value: unknown): IAgentCreateSessionImportConversation | 'invalid' {
	const { content, error } = createSessionImportValueValidator.validate(value);
	if (error) {
		return 'invalid';
	}
	if (content.model !== undefined && !content.model.id.trim()) {
		return 'invalid';
	}
	const turns: Turn[] = content.turns.map(turn => ({
		...turn,
		usage: turn.usage,
	}));
	return {
		turns,
		...(content.model !== undefined ? { model: content.model } : {}),
		...(content.title !== undefined ? { title: content.title } : {}),
	};
}

/** Serializes a conversation import into the wire shape read by {@link readCreateSessionImportValue}. */
export function serializeCreateSessionImport(importConversation: IAgentCreateSessionImportConversation): ValidatorType<typeof createSessionImportValueValidator> {
	return {
		turns: importConversation.turns.map(({ usage, ...turn }) => ({
			...turn,
			...(usage !== undefined ? { usage } : {}),
		})),
		...(importConversation.model !== undefined ? { model: importConversation.model } : {}),
		...(importConversation.title !== undefined ? { title: importConversation.title } : {}),
	};
}

/** Return `meta` without `AgentHostCreateSessionImportMetaKey` so the bulky imported transcript is not retained on `_meta` after it has been extracted. */
export function withoutCreateSessionImportMeta(meta: Readonly<Record<string, unknown>> | undefined): Record<string, unknown> | undefined {
	if (!meta || !Object.hasOwn(meta, AgentHostCreateSessionImportMetaKey)) {
		return meta;
	}
	const next = { ...meta };
	delete next[AgentHostCreateSessionImportMetaKey];
	return Object.keys(next).length > 0 ? next : undefined;
}

/** Returns request metadata carrying the conversation import for `createSession`, preserving unrelated keys. */
export function withCreateSessionImportMeta(meta: Readonly<Record<string, unknown>> | undefined, importConversation: IAgentCreateSessionImportConversation): Record<string, unknown> {
	return { ...meta, [AgentHostCreateSessionImportMetaKey]: serializeCreateSessionImport(importConversation) };
}

/** Returns request metadata referencing a previously staged chunked conversation import for `createSession`. */
export function withStagedCreateSessionImportMeta(meta: Readonly<Record<string, unknown>> | undefined, transferId: string): Record<string, unknown> {
	return { ...meta, [AgentHostCreateSessionImportMetaKey]: { transferId } };
}

