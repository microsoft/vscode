/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IJSONSchema } from '../../../base/common/jsonSchema.js';
import { ValidatorBase, vArray, vBoolean, vEnum, vNumber, vObj, vOptionalProp, vString, vUnion, type ValidationError, type ValidatorType } from '../../../base/common/validation.js';
import type { IByokLmChatRequest, IByokLmChatResult, IByokLmContentPart, IByokLmInputItem, IByokLmModelInfo, IByokLmOutputItem, IByokLmTool } from './agentHostByokLm.js';

export const RegisterClientByokLmModelsExtensionMethod = 'vscode/registerClientByokLmModels';
export const UnregisterClientByokLmModelsExtensionMethod = 'vscode/unregisterClientByokLmModels';
export const RequestAgentHostByokLmChatExtensionMethod = 'vscode/requestByokLmChat';

class JsonObjectValidator extends ValidatorBase<Record<string, unknown>> {
	validate(content: unknown): { content: Record<string, unknown>; error: undefined } | { content: undefined; error: ValidationError } {
		if (typeof content !== 'object' || content === null || Array.isArray(content)) {
			return { content: undefined, error: { message: 'Expected object' } };
		}
		return { content: Object.fromEntries(Object.entries(content)), error: undefined };
	}

	getJSONSchema(): IJSONSchema {
		return { type: 'object' };
	}
}

const jsonObjectValidator = new JsonObjectValidator();

const byokLmContentPartValidator: ValidatorBase<IByokLmContentPart> = vUnion(
	vObj({ type: vEnum('text'), text: vString() }),
	vObj({ type: vEnum('image'), mimeType: vEnum('image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'), data: vString() }),
);

const byokLmReasoningItemValidator = vObj({
	type: vEnum('reasoning'),
	id: vOptionalProp(vString()),
	summary: vArray(vString()),
	encryptedContent: vOptionalProp(vString()),
	metadata: vOptionalProp(jsonObjectValidator),
});

const byokLmFunctionCallItemValidator = vObj({
	type: vEnum('function_call'),
	callId: vString(),
	name: vString(),
	argumentsJson: vString(),
});

const byokLmCustomToolCallItemValidator = vObj({
	type: vEnum('custom_tool_call'),
	callId: vString(),
	name: vString(),
	input: vString(),
});

const byokLmInputItemValidator: ValidatorBase<IByokLmInputItem> = vUnion(
	vObj({
		type: vEnum('message'),
		role: vEnum('system', 'developer', 'user', 'assistant'),
		content: vArray(byokLmContentPartValidator),
	}),
	byokLmReasoningItemValidator,
	byokLmFunctionCallItemValidator,
	vObj({
		type: vEnum('function_call_output'),
		callId: vString(),
		output: vString(),
		content: vOptionalProp(vArray(byokLmContentPartValidator)),
	}),
	byokLmCustomToolCallItemValidator,
	vObj({
		type: vEnum('custom_tool_call_output'),
		callId: vString(),
		output: vString(),
		content: vOptionalProp(vArray(byokLmContentPartValidator)),
	}),
);

const byokLmToolValidator: ValidatorBase<IByokLmTool> = vUnion(
	vObj({
		type: vEnum('function'),
		name: vString(),
		description: vOptionalProp(vString()),
		parametersSchema: vOptionalProp(jsonObjectValidator),
	}),
	vObj({
		type: vEnum('custom'),
		name: vString(),
		description: vOptionalProp(vString()),
	}),
);

export const byokLmModelInfoValidator: ValidatorBase<IByokLmModelInfo> = vObj({
	vendor: vString(),
	id: vString(),
	name: vOptionalProp(vString()),
	modelIdentifier: vOptionalProp(vString()),
	maxContextWindowTokens: vOptionalProp(vNumber()),
	maxPromptTokens: vOptionalProp(vNumber()),
	maxOutputTokens: vOptionalProp(vNumber()),
	supportsVision: vOptionalProp(vBoolean()),
	supportedReasoningEfforts: vOptionalProp(vArray(vString())),
	defaultReasoningEffort: vOptionalProp(vString()),
});

export const registerClientByokLmModelsParamsValidator = vObj({
	models: vArray(byokLmModelInfoValidator),
});

export const unregisterClientByokLmModelsParamsValidator = vObj({});

export const byokLmChatRequestValidator: ValidatorBase<IByokLmChatRequest> = vObj({
	vendor: vString(),
	modelId: vString(),
	instructions: vOptionalProp(vString()),
	input: vArray(byokLmInputItemValidator),
	tools: vOptionalProp(vArray(byokLmToolValidator)),
	previousResponseId: vOptionalProp(vString()),
	reasoningEffort: vOptionalProp(vString()),
	modelOptions: vOptionalProp(jsonObjectValidator),
});

const byokLmOutputMessageItemValidator = vObj({
	type: vEnum('message'),
	content: vArray(vObj({ type: vEnum('text'), text: vString() })),
});

const byokLmOutputItemValidator: ValidatorBase<IByokLmOutputItem> = vUnion(
	byokLmOutputMessageItemValidator,
	byokLmReasoningItemValidator,
	byokLmFunctionCallItemValidator,
	byokLmCustomToolCallItemValidator,
);

export const byokLmChatResultValidator: ValidatorBase<IByokLmChatResult> = vObj({
	output: vArray(byokLmOutputItemValidator),
	responseId: vOptionalProp(vString()),
	usage: vOptionalProp(vObj({
		inputTokens: vOptionalProp(vNumber()),
		outputTokens: vOptionalProp(vNumber()),
		reasoningTokens: vOptionalProp(vNumber()),
	})),
	error: vOptionalProp(vString()),
});

export type RegisterClientByokLmModelsParams = ValidatorType<typeof registerClientByokLmModelsParamsValidator>;
export type ByokLmChatRequest = ValidatorType<typeof byokLmChatRequestValidator>;
export type ByokLmChatResult = ValidatorType<typeof byokLmChatResultValidator>;
