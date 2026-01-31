/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Separator } from '../../../../../base/common/actions.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Event } from '../../../../../base/common/event.js';
import { IMarkdownString } from '../../../../../base/common/htmlContent.js';
import { Iterable } from '../../../../../base/common/iterator.js';
import { IJSONSchema } from '../../../../../base/common/jsonSchema.js';
import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { derived, IObservable, IReader, ITransaction, ObservableSet } from '../../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { URI } from '../../../../../base/common/uri.js';
import { Location } from '../../../../../editor/common/languages.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpression, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';
import { ByteSize } from '../../../../../platform/files/common/files.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IProgress } from '../../../../../platform/progress/common/progress.js';
import { ChatRequestToolReferenceEntry } from '../attachments/chatVariableEntries.js';
import { IVariableReference } from '../chatModes.js';
import { IChatExtensionsContent, IChatSubagentToolInvocationData, IChatTodoListContent, IChatToolInputInvocationData, IChatToolInvocation, type IChatTerminalToolInvocationData } from '../chatService/chatService.js';
import { ILanguageModelChatMetadata, LanguageModelPartAudience } from '../languageModels.js';
import { UserSelectedTools } from '../participants/chatAgents.js';
import { PromptElementJSON, stringifyPromptElementJSON } from './promptTsxTypes.js';

/**
 * Selector for matching language models by vendor, family, version, or id.
 * Used to filter tools to specific models or model families.
 */
export interface ILanguageModelChatSelector {
	readonly vendor?: string;
	readonly family?: string;
	readonly version?: string;
	readonly id?: string;
}

export interface IToolData {
	readonly id: string;
	readonly source: ToolDataSource;
	readonly toolReferenceName?: string;
	readonly legacyToolReferenceFullNames?: readonly string[];
	readonly icon?: { dark: URI; light?: URI } | ThemeIcon;
	readonly when?: ContextKeyExpression;
	readonly tags?: readonly string[];
	readonly displayName: string;
	readonly userDescription?: string;
	readonly modelDescription: string;
	readonly inputSchema?: IJSONSchema;
	readonly canBeReferencedInPrompt?: boolean;
	/**
	 * True if the tool runs in the (possibly remote) workspace, false if it runs
	 * on the host, undefined if known.
	 */
	readonly runsInWorkspace?: boolean;
	readonly alwaysDisplayInputOutput?: boolean;
	/** True if this tool might ask for pre-approval */
	readonly canRequestPreApproval?: boolean;
	/** True if this tool might ask for post-approval */
	readonly canRequestPostApproval?: boolean;
	/**
	 * Model selectors that this tool is available for.
	 * If defined, the tool is only available when the selected model matches one of the selectors.
	 */
	readonly models?: readonly ILanguageModelChatSelector[];
}

/**
 * Check if a tool matches the given model metadata based on the tool's `models` selectors.
 * If the tool has no `models` defined, it matches all models.
 * If model is undefined, model-specific filtering is skipped (tool is included).
 */
export function toolMatchesModel(toolData: IToolData, model: ILanguageModelChatMetadata | undefined): boolean {
	// If no model selectors are defined, the tool is available for all models
	if (!toolData.models || toolData.models.length === 0) {
		return true;
	}
	// If model is undefined, skip model-specific filtering
	if (!model) {
		return true;
	}
	// Check if any selector matches the model (OR logic)
	return toolData.models.some(selector =>
		(!selector.id || selector.id === model.id) &&
		(!selector.vendor || selector.vendor === model.vendor) &&
		(!selector.family || selector.family === model.family) &&
		(!selector.version || selector.version === model.version)
	);
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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	parameters: Record<string, any>;
	tokenBudget?: number;
	context: IToolInvocationContext | undefined;
	chatRequestId?: string;
	chatInteractionId?: string;
	/**
	 * Optional tool call ID from the chat stream, used to correlate with pending streaming tool calls.
	 */
	chatStreamToolCallId?: string;
	/**
	 * Lets us add some nicer UI to toolcalls that came from a sub-agent, but in the long run, this should probably just be rendered in a similar way to thinking text + tool call groups
	 */
	subAgentInvocationId?: string;
	toolSpecificData?: IChatTerminalToolInvocationData | IChatToolInputInvocationData | IChatExtensionsContent | IChatTodoListContent | IChatSubagentToolInvocationData;
	modelId?: string;
	userSelectedTools?: UserSelectedTools;
}

export interface IToolInvocationContext {
	/** @deprecated Use {@link sessionResource} instead */
	readonly sessionId: string;
	readonly sessionResource: URI;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isToolInvocationContext(obj: any): obj is IToolInvocationContext {
	return typeof obj === 'object' && typeof obj.sessionId === 'string' && URI.isUri(obj.sessionResource);
}

export interface IToolInvocationPreparationContext {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	parameters: any;
	chatRequestId?: string;
	/** @deprecated Use {@link chatSessionResource} instead */
	chatSessionId?: string;
	chatSessionResource: URI | undefined;
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
	/** Raw MCP tool result for MCP App UI rendering */
	readonly mcpOutput?: unknown;
}

export interface IToolResultOutputDetails {
	readonly output: { type: 'data'; mimeType: string; value: VSBuffer };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isToolResultInputOutputDetails(obj: any): obj is IToolResultInputOutputDetails {
	return typeof obj === 'object' && typeof obj?.input === 'string' && (typeof obj?.output === 'string' || Array.isArray(obj?.output));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
	title?: string;
}

export interface IToolResultDataPart {
	kind: 'data';
	value: {
		mimeType: string;
		data: VSBuffer;
	};
	audience?: LanguageModelPartAudience[];
	title?: string;
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
	/** If title is not set (no confirmation needed), this reason will be shown to explain why confirmation was not needed */
	confirmationNotNeededReason?: string | IMarkdownString;
}

export interface IToolConfirmationAction {
	label: string;
	disabled?: boolean;
	tooltip?: string;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	data: any;
}

export type ToolConfirmationAction = IToolConfirmationAction | Separator;

export enum ToolInvocationPresentation {
	Hidden = 'hidden',
	HiddenAfterComplete = 'hiddenAfterComplete'
}

export interface IToolInvocationStreamContext {
	toolCallId: string;
	rawInput: unknown;
	chatRequestId?: string;
	/** @deprecated Use {@link chatSessionResource} instead */
	chatSessionId?: string;
	chatSessionResource?: URI;
	chatInteractionId?: string;
}

export interface IStreamedToolInvocation {
	invocationMessage?: string | IMarkdownString;
}

export interface IPreparedToolInvocation {
	invocationMessage?: string | IMarkdownString;
	pastTenseMessage?: string | IMarkdownString;
	originMessage?: string | IMarkdownString;
	confirmationMessages?: IToolConfirmationMessages;
	presentation?: ToolInvocationPresentation;
	toolSpecificData?: IChatTerminalToolInvocationData | IChatToolInputInvocationData | IChatExtensionsContent | IChatTodoListContent | IChatSubagentToolInvocationData;
}

export interface IToolImpl {
	invoke(invocation: IToolInvocation, countTokens: CountTokensCallback, progress: ToolProgress, token: CancellationToken): Promise<IToolResult>;
	prepareToolInvocation?(context: IToolInvocationPreparationContext, token: CancellationToken): Promise<IPreparedToolInvocation | undefined>;
	handleToolStream?(context: IToolInvocationStreamContext, token: CancellationToken): Promise<IStreamedToolInvocation | undefined>;
}

export interface IToolSet {
	readonly id: string;
	readonly referenceName: string;
	readonly icon: ThemeIcon;
	readonly source: ToolDataSource;
	readonly description?: string;
	readonly legacyFullNames?: string[];

	getTools(r?: IReader): Iterable<IToolData>;
}

export type IToolAndToolSetEnablementMap = ReadonlyMap<IToolData | IToolSet, boolean>;

export function isToolSet(obj: IToolData | IToolSet | undefined): obj is IToolSet {
	return !!obj && (obj as IToolSet).getTools !== undefined;
}

export class ToolSet implements IToolSet {

	protected readonly _tools = new ObservableSet<IToolData>();

	protected readonly _toolSets = new ObservableSet<IToolSet>();

	/**
	 * A homogenous tool set only contains tools from the same source as the tool set itself
	 */
	readonly isHomogenous: IObservable<boolean>;

	constructor(
		readonly id: string,
		readonly referenceName: string,
		readonly icon: ThemeIcon,
		readonly source: ToolDataSource,
		readonly description: string | undefined,
		readonly legacyFullNames: string[] | undefined,
		private readonly _contextKeyService: IContextKeyService,
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

	addToolSet(toolSet: IToolSet, tx?: ITransaction): IDisposable {
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
			Iterable.filter(this._tools.observable.read(r), toolData => this._contextKeyService.contextMatchesRules(toolData.when)),
			...Iterable.map(this._toolSets.observable.read(r), toolSet => toolSet.getTools(r))
		);
	}
}

export class ToolSetForModel {
	public get id() {
		return this._toolSet.id;
	}

	public get referenceName() {
		return this._toolSet.referenceName;
	}

	public get icon() {
		return this._toolSet.icon;
	}

	public get source() {
		return this._toolSet.source;
	}

	public get description() {
		return this._toolSet.description;
	}

	public get legacyFullNames() {
		return this._toolSet.legacyFullNames;
	}

	constructor(
		private readonly _toolSet: IToolSet,
		private readonly model: ILanguageModelChatMetadata | undefined,
	) { }

	public getTools(r?: IReader): Iterable<IToolData> {
		return Iterable.filter(this._toolSet.getTools(r), toolData => toolMatchesModel(toolData, this.model));
	}
}


export interface IBeginToolCallOptions {
	toolCallId: string;
	toolId: string;
	chatRequestId?: string;
	sessionResource?: URI;
	subagentInvocationId?: string;
}

export interface IToolInvokedEvent {
	readonly toolId: string;
	readonly sessionResource: URI | undefined;
	readonly requestId: string | undefined;
	readonly subagentInvocationId: string | undefined;
}

export const ILanguageModelToolsService = createDecorator<ILanguageModelToolsService>('ILanguageModelToolsService');

export type CountTokensCallback = (input: string, token: CancellationToken) => Promise<number>;

export interface ILanguageModelToolsService {
	_serviceBrand: undefined;
	readonly vscodeToolSet: ToolSet;
	readonly executeToolSet: ToolSet;
	readonly readToolSet: ToolSet;
	readonly agentToolSet: ToolSet;
	readonly onDidChangeTools: Event<void>;
	readonly onDidPrepareToolCallBecomeUnresponsive: Event<{ readonly sessionResource: URI; readonly toolData: IToolData }>;
	readonly onDidInvokeTool: Event<IToolInvokedEvent>;
	registerToolData(toolData: IToolData): IDisposable;
	registerToolImplementation(id: string, tool: IToolImpl): IDisposable;
	registerTool(toolData: IToolData, tool: IToolImpl): IDisposable;

	/**
	 * Get all tools currently enabled (matching `when` clauses and model).
	 * @param model The language model metadata to filter tools by. If undefined, model-specific filtering is skipped.
	 */
	getTools(model: ILanguageModelChatMetadata | undefined): Iterable<IToolData>;

	/**
	 * Creats an observable of enabled tools in the context. Note the observable
	 * should be created and reused, not created per reader, for example:
	 *
	 * ```
	 * const toolsObs = toolsService.observeTools(model);
	 * autorun(reader => {
	 *  const tools = toolsObs.read(reader);
	 *  ...
	 * });
	 * ```
	 * @param model The language model metadata to filter tools by. If undefined, model-specific filtering is skipped.
	 */
	observeTools(model: ILanguageModelChatMetadata | undefined): IObservable<readonly IToolData[]>;

	/**
	 * Get all registered tools regardless of enablement state.
	 * Use this for configuration UIs, completions, etc. where all tools should be visible.
	 */
	getAllToolsIncludingDisabled(): Iterable<IToolData>;

	/**
	 * Get a tool by its ID. Does not check when clauses.
	 */
	getTool(id: string): IToolData | undefined;

	/**
	 * Get a tool by its reference name. Does not check when clauses.
	 */
	getToolByName(name: string): IToolData | undefined;

	/**
	 * Begin a tool call in the streaming phase.
	 * Creates a ChatToolInvocation in the Streaming state and appends it to the chat.
	 * Returns the invocation so it can be looked up later when invokeTool is called.
	 */
	beginToolCall(options: IBeginToolCallOptions): IChatToolInvocation | undefined;

	/**
	 * Update the streaming state of a pending tool call.
	 * Calls the tool's handleToolStream method to get a custom invocation message.
	 */
	updateToolStream(toolCallId: string, partialInput: unknown, token: CancellationToken): Promise<void>;

	invokeTool(invocation: IToolInvocation, countTokens: CountTokensCallback, token: CancellationToken): Promise<IToolResult>;
	cancelToolCallsForRequest(requestId: string): void;
	/** Flush any pending tool updates to the extension hosts. */
	flushToolUpdates(): void;

	readonly toolSets: IObservable<Iterable<IToolSet>>;
	getToolSetsForModel(model: ILanguageModelChatMetadata | undefined, reader?: IReader): Iterable<IToolSet>;
	getToolSet(id: string): IToolSet | undefined;
	getToolSetByName(name: string): IToolSet | undefined;
	createToolSet(source: ToolDataSource, id: string, referenceName: string, options?: { icon?: ThemeIcon; description?: string; legacyFullNames?: string[] }): ToolSet & IDisposable;

	// tool names in prompt and agent files ('full reference names')
	getFullReferenceNames(): Iterable<string>;
	getFullReferenceName(tool: IToolData, toolSet?: IToolSet): string;
	getToolByFullReferenceName(fullReferenceName: string): IToolData | IToolSet | undefined;
	getDeprecatedFullReferenceNames(): Map<string, Set<string>>;

	/**
	 * Gets the enablement maps based on the given set of references.
	 * @param fullReferenceNames The full reference names of the tools and tool sets to enable.
	 * @param target Optional target to filter tools by.
	 * @param model Optional language model metadata to filter tools by.
	 * If undefined is passed, all tools will be returned, even if normally disabled.
	 */
	toToolAndToolSetEnablementMap(
		fullReferenceNames: readonly string[],
		target: string | undefined,
		model: ILanguageModelChatMetadata | undefined,
	): IToolAndToolSetEnablementMap;

	toFullReferenceNames(map: IToolAndToolSetEnablementMap): string[];
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

export namespace SpecedToolAliases {
	export const execute = 'execute';
	export const edit = 'edit';
	export const search = 'search';
	export const agent = 'agent';
	export const read = 'read';
	export const web = 'web';
	export const todo = 'todo';
}

export namespace VSCodeToolReference {
	export const runSubagent = 'runSubagent';
	export const vscode = 'vscode';

}
