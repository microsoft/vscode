/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { Location } from '../../../../editor/common/languages.js';
import { ContextKeyExpression } from '../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProgress } from '../../../../platform/progress/common/progress.js';
import { IChatTerminalToolInvocationData, IChatToolInputInvocationData } from './chatService.js';
import { PromptElementJSON, stringifyPromptElementJSON } from './tools/promptTsxTypes.js';

export interface IToolData {
	id: string;
	source: ToolDataSource;
	toolReferenceName?: string;
	icon?: { dark: URI; light?: URI } | ThemeIcon;
	when?: ContextKeyExpression;
	tags?: string[];
	displayName: string;
	userDescription?: string;
	modelDescription: string;
	inputSchema?: IJSONSchema;
	canBeReferencedInPrompt?: boolean;
	/**
	 * True if the tool runs in the (possibly remote) workspace, false if it runs
	 * on the host, undefined if known.
	 */
	runsInWorkspace?: boolean;
	requiresConfirmation?: boolean;
	alwaysDisplayInputOutput?: boolean;
	supportsToolPicker?: boolean;
}

export interface IToolProgressStep {
	readonly message: string | IMarkdownString | undefined;
	readonly increment: number | undefined;
	readonly total: number | undefined;
}

export type ToolProgress = IProgress<IToolProgressStep>;

export type ToolDataSource =
	| {
		type: 'extension';
		label: string;
		extensionId: ExtensionIdentifier;
		/**
		 * True for tools contributed through extension API from third-party extensions, so they can be disabled by policy.
		 * False for built-in tools, MCP tools are handled differently.
		 */
		isExternalTool: boolean;
	}
	| {
		type: 'mcp';
		label: string;
		collectionId: string;
		definitionId: string;
	}
	| { type: 'internal' };

export namespace ToolDataSource {
	export function toKey(source: ToolDataSource): string {
		switch (source.type) {
			case 'extension': return `extension:${source.extensionId.value}`;
			case 'mcp': return `mcp:${source.collectionId}:${source.definitionId}`;
			case 'internal': return 'internal';
		}
	}
}

export interface IToolInvocation {
	callId: string;
	toolId: string;
	parameters: Object;
	tokenBudget?: number;
	context: IToolInvocationContext | undefined;
	chatRequestId?: string;
	chatInteractionId?: string;
	toolSpecificData?: IChatTerminalToolInvocationData | IChatToolInputInvocationData;
	modelId?: string;
}

export interface IToolInvocationContext {
	sessionId: string;
}

export function isToolInvocationContext(obj: any): obj is IToolInvocationContext {
	return typeof obj === 'object' && typeof obj.sessionId === 'string';
}

export interface IToolResultInputOutputDetails {
	readonly input: string;
	readonly output: string;
}

export function isToolResultInputOutputDetails(obj: any): obj is IToolResultInputOutputDetails {
	return typeof obj === 'object' && typeof obj?.input === 'string' && typeof obj?.output === 'string';
}

export interface IToolResult {
	content: (IToolResultPromptTsxPart | IToolResultTextPart)[];
	toolResultMessage?: string | IMarkdownString;
	toolResultDetails?: Array<URI | Location> | IToolResultInputOutputDetails;
}

export interface IToolResultPromptTsxPart {
	kind: 'promptTsx';
	value: unknown;
}

export function stringifyPromptTsxPart(part: IToolResultPromptTsxPart): string {
	return stringifyPromptElementJSON(part.value as PromptElementJSON);
}

export interface IToolResultTextPart {
	kind: 'text';
	value: string;
}

export interface IToolConfirmationMessages {
	title: string;
	message: string | IMarkdownString;
	allowAutoConfirm?: boolean;
}

export interface IPreparedToolInvocation {
	invocationMessage?: string | IMarkdownString;
	pastTenseMessage?: string | IMarkdownString;
	confirmationMessages?: IToolConfirmationMessages;
	presentation?: 'hidden' | undefined;
	// When this gets extended, be sure to update `chatResponseAccessibleView.ts` to handle the new properties.
	toolSpecificData?: IChatTerminalToolInvocationData | IChatToolInputInvocationData;
}

export interface IToolImpl {
	invoke(invocation: IToolInvocation, countTokens: CountTokensCallback, progress: ToolProgress, token: CancellationToken): Promise<IToolResult>;
	prepareToolInvocation?(parameters: any, token: CancellationToken): Promise<IPreparedToolInvocation | undefined>;
}

export const ILanguageModelToolsService = createDecorator<ILanguageModelToolsService>('ILanguageModelToolsService');

export type CountTokensCallback = (input: string, token: CancellationToken) => Promise<number>;

export interface ILanguageModelToolsService {
	_serviceBrand: undefined;
	onDidChangeTools: Event<void>;
	registerToolData(toolData: IToolData): IDisposable;
	registerToolImplementation(id: string, tool: IToolImpl): IDisposable;
	getTools(): Iterable<Readonly<IToolData>>;
	getTool(id: string): IToolData | undefined;
	getToolByName(name: string): IToolData | undefined;
	invokeTool(invocation: IToolInvocation, countTokens: CountTokensCallback, token: CancellationToken): Promise<IToolResult>;
	setToolAutoConfirmation(toolId: string, scope: 'workspace' | 'profile' | 'memory', autoConfirm?: boolean): void;
	resetToolAutoConfirmation(): void;
	cancelToolCallsForRequest(requestId: string): void;
}

export function createToolInputUri(toolOrId: IToolData | string): URI {
	if (typeof toolOrId !== 'string') {
		toolOrId = toolOrId.id;
	}
	return URI.from({ scheme: Schemas.inMemory, path: `/lm/tool/${toolOrId}/tool_input.json` });
}

export function createToolSchemaUri(toolOrId: IToolData | string): URI {
	if (typeof toolOrId !== 'string') {
		toolOrId = toolOrId.id;
	}
	return URI.from({ scheme: Schemas.vscode, authority: 'schemas', path: `/lm/tool/${toolOrId}` });
}
