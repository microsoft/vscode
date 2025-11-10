/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Separator } from '../../../../base/common/actions.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Event } from '../../../../base/common/event.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../base/common/iterator.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../base/common/network.js';
import { derived, IObservable, IReader, ITransaction, ObservableSet } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { Location } from '../../../../editor/common/languages.js';
import { localize } from '../../../../nls.js';
import { ContextKeyExpression } from '../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ByteSize } from '../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IProgress } from '../../../../platform/progress/common/progress.js';
import { UserSelectedTools } from './chatAgents.js';
import { IVariableReference } from './chatModes.js';
import { IChatExtensionsContent, IChatTodoListContent, IChatToolInputInvocationData, type IChatTerminalToolInvocationData } from './chatService.js';
import { ChatRequestToolReferenceEntry } from './chatVariableEntries.js';
import { LanguageModelPartAudience } from './languageModels.js';
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
	alwaysDisplayInputOutput?: boolean;
	/** True if this tool might ask for pre-approval */
	canRequestPreApproval?: boolean;
	/** True if this tool might ask for post-approval */
	canRequestPostApproval?: boolean;
}

export interface IToolProgressStep {
	readonly message: string | IMarkdownString | undefined;
	/** 0-1 progress of the tool call */
	readonly progress?: number;
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
		serverLabel: string | undefined;
		instructions: string | undefined;
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
	} | {
		type: 'external';
		label: string;
	};

export namespace ToolDataSource {

	export const Internal: ToolDataSource = { type: 'internal', label: 'Built-In' };

	/** External tools may not be contributed or invoked, but may be invoked externally and described in an IChatToolInvocationSerialized */
	export const External: ToolDataSource = { type: 'external', label: 'External' };

	export function toKey(source: ToolDataSource): string {
		switch (source.type) {
			case 'extension': return `extension:${source.extensionId.value}`;
			case 'mcp': return `mcp:${source.collectionId}:${source.definitionId}`;
			case 'user': return `user:${source.file.toString()}`;
			case 'internal': return 'internal';
			case 'external': return 'external';
		}
	}

	export function equals(a: ToolDataSource, b: ToolDataSource): boolean {
		return toKey(a) === toKey(b);
	}

	export function classify(source: ToolDataSource): { readonly ordinal: number; readonly label: string } {
		if (source.type === 'internal') {
			return { ordinal: 1, label: localize('builtin', 'Built-In') };
		} else if (source.type === 'mcp') {
			return { ordinal: 2, label: source.label };
		} else if (source.type === 'user') {
			return { ordinal: 0, label: localize('user', 'User Defined') };
		} else {
			return { ordinal: 3, label: source.label };
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
	/**
	 * Lets us add some nicer UI to toolcalls that came from a sub-agent, but in the long run, this should probably just be rendered in a similar way to thinking text + tool call groups
	 */
	fromSubAgent?: boolean;
	toolSpecificData?: IChatTerminalToolInvocationData | IChatToolInputInvocationData | IChatExtensionsContent | IChatTodoListContent;
	modelId?: string;
	userSelectedTools?: UserSelectedTools;
}

export interface IToolInvocationContext {
	sessionId: string;
}

export function isToolInvocationContext(obj: any): obj is IToolInvocationContext {
	return typeof obj === 'object' && typeof obj.sessionId === 'string';
}

export interface IToolInvocationPreparationContext {
	parameters: any;
	chatRequestId?: string;
	chatSessionId?: string;
	chatInteractionId?: string;
}

export type ToolInputOutputBase = {
	/** Mimetype of the value, optional */
	mimeType?: string;
	/** URI of the resource on the MCP server. */
	uri?: URI;
	/** If true, this part came in as a resource reference rather than direct data. */
	asResource?: boolean;
	/** Audience of the data part */
	audience?: LanguageModelPartAudience[];
};

export type ToolInputOutputEmbedded = ToolInputOutputBase & {
	type: 'embed';
	value: string;
	/** If true, value is text. If false or not given, value is base64 */
	isText?: boolean;
};

export type ToolInputOutputReference = ToolInputOutputBase & { type: 'ref'; uri: URI };

export interface IToolResultInputOutputDetails {
	readonly input: string;
	readonly output: (ToolInputOutputEmbedded | ToolInputOutputReference)[];
	readonly isError?: boolean;
}

export interface IToolResultOutputDetails {
	readonly output: { type: 'data'; mimeType: string; value: VSBuffer };
}

export function isToolResultInputOutputDetails(obj: any): obj is IToolResultInputOutputDetails {
	return typeof obj === 'object' && typeof obj?.input === 'string' && (typeof obj?.output === 'string' || Array.isArray(obj?.output));
}

export function isToolResultOutputDetails(obj: any): obj is IToolResultOutputDetails {
	return typeof obj === 'object' && typeof obj?.output === 'object' && typeof obj?.output?.mimeType === 'string' && obj?.output?.type === 'data';
}

export interface IToolResult {
	content: (IToolResultPromptTsxPart | IToolResultTextPart | IToolResultDataPart)[];
	toolResultMessage?: string | IMarkdownString;
	toolResultDetails?: Array<URI | Location> | IToolResultInputOutputDetails | IToolResultOutputDetails;
	toolResultError?: string;
	toolMetadata?: unknown;
	/** Whether to ask the user to confirm these tool results. Overrides {@link IToolConfirmationMessages.confirmResults}. */
	confirmResults?: boolean;
}

export function toolContentToA11yString(part: IToolResult['content']) {
	return part.map(p => {
		switch (p.kind) {
			case 'promptTsx':
				return stringifyPromptTsxPart(p);
			case 'text':
				return p.value;
			case 'data':
				return localize('toolResultDataPartA11y', "{0} of {1} binary data", ByteSize.formatSize(p.value.data.byteLength), p.value.mimeType || 'unknown');
		}
	}).join(', ');
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
	audience?: LanguageModelPartAudience[];
}

export interface IToolResultDataPart {
	kind: 'data';
	value: {
		mimeType: string;
		data: VSBuffer;
	};
	audience?: LanguageModelPartAudience[];
}

export interface IToolConfirmationMessages {
	/** Title for the confirmation. If set, the user will be asked to confirm execution of the tool */
	title?: string | IMarkdownString;
	/** MUST be set if `title` is also set */
	message?: string | IMarkdownString;
	disclaimer?: string | IMarkdownString;
	allowAutoConfirm?: boolean;
	terminalCustomActions?: ToolConfirmationAction[];
	/** If true, confirmation will be requested after the tool executes and before results are sent to the model */
	confirmResults?: boolean;
}

export interface IToolConfirmationAction {
	label: string;
	disabled?: boolean;
	tooltip?: string;
	data: any;
}

export type ToolConfirmationAction = IToolConfirmationAction | Separator;

export enum ToolInvocationPresentation {
	Hidden = 'hidden',
	HiddenAfterComplete = 'hiddenAfterComplete'
}

export interface IPreparedToolInvocation {
	invocationMessage?: string | IMarkdownString;
	pastTenseMessage?: string | IMarkdownString;
	originMessage?: string | IMarkdownString;
	confirmationMessages?: IToolConfirmationMessages;
	presentation?: ToolInvocationPresentation;
	toolSpecificData?: IChatTerminalToolInvocationData | IChatToolInputInvocationData | IChatExtensionsContent | IChatTodoListContent;
}

export interface IToolImpl {
	invoke(invocation: IToolInvocation, countTokens: CountTokensCallback, progress: ToolProgress, token: CancellationToken): Promise<IToolResult>;
	prepareToolInvocation?(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined>;
}

export type IToolAndToolSetEnablementMap = ReadonlyMap<IToolData | ToolSet, boolean>;

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
	readonly onDidChangeTools: Event<void>;
	readonly onDidPrepareToolCallBecomeUnresponsive: Event<{ readonly sessionId: string; readonly toolData: IToolData }>;
	registerToolData(toolData: IToolData): IDisposable;
	registerToolImplementation(id: string, tool: IToolImpl): IDisposable;
	registerTool(toolData: IToolData, tool: IToolImpl): IDisposable;
	getTools(): Iterable<Readonly<IToolData>>;
	getTool(id: string): IToolData | undefined;
	getToolByName(name: string, includeDisabled?: boolean): IToolData | undefined;
	invokeTool(invocation: IToolInvocation, countTokens: CountTokensCallback, token: CancellationToken): Promise<IToolResult>;
	cancelToolCallsForRequest(requestId: string): void;
	/** Flush any pending tool updates to the extension hosts. */
	flushToolUpdates(): void;

	readonly toolSets: IObservable<Iterable<ToolSet>>;
	getToolSet(id: string): ToolSet | undefined;
	getToolSetByName(name: string): ToolSet | undefined;
	createToolSet(source: ToolDataSource, id: string, referenceName: string, options?: { icon?: ThemeIcon; description?: string }): ToolSet & IDisposable;

	// tool names in prompt files handling ('qualified names')

	getQualifiedToolNames(): Iterable<string>;
	getToolByQualifiedName(qualifiedName: string): IToolData | ToolSet | undefined;
	getQualifiedToolName(tool: IToolData, toolSet?: ToolSet): string;
	getDeprecatedQualifiedToolNames(): Map<string, string>;
	mapGithubToolName(githubToolName: string): string;

	toToolAndToolSetEnablementMap(qualifiedToolOrToolSetNames: readonly string[], target: string | undefined): IToolAndToolSetEnablementMap;
	toQualifiedToolNames(map: IToolAndToolSetEnablementMap): string[];
	toToolReferences(variableReferences: readonly IVariableReference[]): ChatRequestToolReferenceEntry[];
}

export function createToolInputUri(toolCallId: string): URI {
	return URI.from({ scheme: Schemas.inMemory, path: `/lm/tool/${toolCallId}/tool_input.json` });
}

export function createToolSchemaUri(toolOrId: IToolData | string): URI {
	if (typeof toolOrId !== 'string') {
		toolOrId = toolOrId.id;
	}
	return URI.from({ scheme: Schemas.vscode, authority: 'schemas', path: `/lm/tool/${toolOrId}` });
}

export namespace GithubCopilotToolReference {
	export const shell = 'shell';
	export const edit = 'edit';
	export const search = 'search';
	export const customAgent = 'custom-agent';
}

export namespace VSCodeToolReference {
	export const runCommands = 'runCommands';
	export const runSubagent = 'runSubagent';
}
