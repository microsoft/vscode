/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { Location } from '../../../../editor/common/languages.js';
import { ContextKeyExpression } from '../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProgress } from '../../../../platform/progress/common/progress.js';
import { IChatExtensionsContent, IChatTerminalToolInvocationData, IChatToolInputInvocationData } from './chatService.js';
import { PromptElementJSON, stringifyPromptElementJSON } from './tools/promptTsxTypes.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { derived, IObservable, IReader, ITransaction, ObservableSet } from '../../../../base/common/observable.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { localize } from '../../../../nls.js';

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
	alwaysDisplayInputOutput?: boolean;
}

export interface IToolProgressStep {
	readonly message: string | IMarkdownString | undefined;
	readonly increment?: number;
	readonly total?: number;
}

export type ToolProgress = IProgress<IToolProgressStep>;

export type ToolDataSource =
	| {
		type: 'extension';
		label: string;
		extensionId: ExtensionIdentifier;
	}
	| {
		type: 'mcp';
		label: string;
		collectionId: string;
		definitionId: string;
	}
	| {
		type: 'user';
		label: string;
		file: URI;
	}
	| {
		type: 'internal';
		label: string;
	};

export namespace ToolDataSource {

	export const Internal: ToolDataSource = { type: 'internal', label: 'Built-In' };

	export function toKey(source: ToolDataSource): string {
		switch (source.type) {
			case 'extension': return `extension:${source.extensionId.value}`;
			case 'mcp': return `mcp:${source.collectionId}:${source.definitionId}`;
			case 'user': return `user:${source.file.toString()}`;
			case 'internal': return 'internal';
		}
	}

	export function equals(a: ToolDataSource, b: ToolDataSource): boolean {
		return toKey(a) === toKey(b);
	}

	export function classify(source: ToolDataSource): { readonly ordinal: number; readonly label: string } {
		if (source.type === 'internal') {
			return { ordinal: 1, label: localize('builtin', 'Built-In') };
		} else if (source.type === 'mcp') {
			return { ordinal: 2, label: localize('mcp', 'MCP Server: {0}', source.label) };
		} else if (source.type === 'user') {
			return { ordinal: 0, label: localize('user', 'User Defined') };
		} else {
			return { ordinal: 3, label: localize('ext', 'Extension: {0}', source.label) };
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
	toolSpecificData?: IChatTerminalToolInvocationData | IChatToolInputInvocationData | IChatExtensionsContent;
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
	readonly output: ({
		value: string;
		/** If true, value is text. If false or not given, value is base64 */
		isText?: boolean;
		/** Mimetype of the value, optional */
		mimeType?: string;
		/** URI of the resource on the MCP server. */
		uri?: URI;
		/** If true, this part came in as a resource reference rather than direct data. */
		asResource?: boolean;
	})[];
	readonly isError?: boolean;
}

export function isToolResultInputOutputDetails(obj: any): obj is IToolResultInputOutputDetails {
	return typeof obj === 'object' && typeof obj?.input === 'string' && (typeof obj?.output === 'string' || Array.isArray(obj?.output));
}

export interface IToolResult {
	content: (IToolResultPromptTsxPart | IToolResultTextPart | IToolResultDataPart)[];
	toolResultMessage?: string | IMarkdownString;
	toolResultDetails?: Array<URI | Location> | IToolResultInputOutputDetails;
	toolResultError?: string;
}

export function toolResultHasBuffers(result: IToolResult): boolean {
	return result.content.some(part => part.kind === 'data');
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

export interface IToolResultDataPart {
	kind: 'data';
	value: {
		mimeType: string;
		data: VSBuffer;
	};
}

export interface IToolConfirmationMessages {
	title: string | IMarkdownString;
	message: string | IMarkdownString;
	disclaimer?: string | IMarkdownString;
	allowAutoConfirm?: boolean;
}

export interface IPreparedToolInvocation {
	invocationMessage?: string | IMarkdownString;
	pastTenseMessage?: string | IMarkdownString;
	originMessage?: string | IMarkdownString;
	confirmationMessages?: IToolConfirmationMessages;
	presentation?: 'hidden' | undefined;
	// When this gets extended, be sure to update `chatResponseAccessibleView.ts` to handle the new properties.
	toolSpecificData?: IChatTerminalToolInvocationData | IChatToolInputInvocationData | IChatExtensionsContent;
}

export interface IToolImpl {
	invoke(invocation: IToolInvocation, countTokens: CountTokensCallback, progress: ToolProgress, token: CancellationToken): Promise<IToolResult>;
	prepareToolInvocation?(parameters: any, token: CancellationToken): Promise<IPreparedToolInvocation | undefined>;
}

export class ToolSet {

	protected readonly _tools = new ObservableSet<IToolData>();

	protected readonly _toolSets = new ObservableSet<ToolSet>();

	/**
	 * A homogenous tool set only contains tools from the same source as the tool set itself
	 */
	readonly isHomogenous: IObservable<boolean>;

	constructor(
		readonly id: string,
		readonly referenceName: string,
		readonly icon: ThemeIcon,
		readonly source: ToolDataSource,
		readonly description?: string,
	) {

		this.isHomogenous = derived(r => {
			return !Iterable.some(this._tools.observable.read(r), tool => !ToolDataSource.equals(tool.source, this.source))
				&& !Iterable.some(this._toolSets.observable.read(r), toolSet => !ToolDataSource.equals(toolSet.source, this.source));
		});
	}

	addTool(data: IToolData, tx?: ITransaction): IDisposable {
		this._tools.add(data, tx);
		return toDisposable(() => {
			this._tools.delete(data);
		});
	}

	addToolSet(toolSet: ToolSet, tx?: ITransaction): IDisposable {
		if (toolSet === this) {
			return Disposable.None;
		}
		this._toolSets.add(toolSet, tx);
		return toDisposable(() => {
			this._toolSets.delete(toolSet);
		});
	}

	getTools(r?: IReader): Iterable<IToolData> {
		return Iterable.concat(
			this._tools.observable.read(r),
			...Iterable.map(this._toolSets.observable.read(r), toolSet => toolSet.getTools(r))
		);
	}
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
	getToolByName(name: string, includeDisabled?: boolean): IToolData | undefined;
	invokeTool(invocation: IToolInvocation, countTokens: CountTokensCallback, token: CancellationToken): Promise<IToolResult>;
	setToolAutoConfirmation(toolId: string, scope: 'workspace' | 'profile' | 'memory', autoConfirm?: boolean): void;
	resetToolAutoConfirmation(): void;
	cancelToolCallsForRequest(requestId: string): void;
	toEnablementMap(toolOrToolSetNames: Iterable<string>): Record<string, boolean>;

	readonly toolSets: IObservable<Iterable<ToolSet>>;
	getToolSetByName(name: string): ToolSet | undefined;
	createToolSet(source: ToolDataSource, id: string, referenceName: string, options?: { icon?: ThemeIcon; description?: string }): ToolSet & IDisposable;
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
