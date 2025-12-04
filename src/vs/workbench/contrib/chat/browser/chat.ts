/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IMouseWheelEvent } from '../../../../base/browser/mouseEvent.js';
import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { EditDeltaInfo } from '../../../../editor/common/textModelEditSource.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { PreferredGroup } from '../../../services/editor/common/editorService.js';
import { IChatAgentAttachmentCapabilities, IChatAgentCommand, IChatAgentData } from '../common/chatAgents.js';
import { IChatResponseModel, IChatModelInputState } from '../common/chatModel.js';
import { IChatMode } from '../common/chatModes.js';
import { IParsedChatRequest } from '../common/chatParserTypes.js';
import { CHAT_PROVIDER_ID } from '../common/chatParticipantContribTypes.js';
import { IChatElicitationRequest, IChatLocationData, IChatSendRequestOptions } from '../common/chatService.js';
import { IChatRequestViewModel, IChatResponseViewModel, IChatViewModel } from '../common/chatViewModel.js';
import { ChatAgentLocation, ChatModeKind } from '../common/constants.js';
import { ChatAttachmentModel } from './chatAttachmentModel.js';
import { IChatEditorOptions } from './chatEditor.js';
import { ChatInputPart } from './chatInputPart.js';
import { ChatWidget, IChatWidgetContrib } from './chatWidget.js';
import { ICodeBlockActionContext } from './codeBlockPart.js';

export const IChatWidgetService = createDecorator<IChatWidgetService>('chatWidgetService');

export interface IChatWidgetService {

	readonly _serviceBrand: undefined;

	/**
	 * Returns the most recently focused widget if any.
	 *
	 * ⚠️ Consider carefully if this is appropriate for your use case. If you
	 * can know what session you're interacting with, prefer {@link getWidgetBySessionResource}
	 * or similar methods to work nicely with multiple chat widgets.
	 */
	readonly lastFocusedWidget: IChatWidget | undefined;

	readonly onDidAddWidget: Event<IChatWidget>;

	/**
	 * Reveals the widget, focusing its input unless `preserveFocus` is true.
	 */
	reveal(widget: IChatWidget, preserveFocus?: boolean): Promise<boolean>;

	/**
	 * Reveals the last active widget, or creates a new chat if necessary.
	 */
	revealWidget(preserveFocus?: boolean): Promise<IChatWidget | undefined>;

	getAllWidgets(): ReadonlyArray<IChatWidget>;
	getWidgetByInputUri(uri: URI): IChatWidget | undefined;
	openSession(sessionResource: URI, target?: typeof ChatViewPaneTarget): Promise<IChatWidget | undefined>;
	openSession(sessionResource: URI, target?: PreferredGroup, options?: IChatEditorOptions): Promise<IChatWidget | undefined>;
	openSession(sessionResource: URI, target?: typeof ChatViewPaneTarget | PreferredGroup, options?: IChatEditorOptions): Promise<IChatWidget | undefined>;

	getWidgetBySessionResource(sessionResource: URI): IChatWidget | undefined;

	getWidgetsByLocations(location: ChatAgentLocation): ReadonlyArray<IChatWidget>;

	/**
	 * An IChatWidget registers itself when created.
	 */
	register(newWidget: IChatWidget): IDisposable;
}

export const ChatViewPaneTarget = Symbol('ChatViewPaneTarget');

export const IQuickChatService = createDecorator<IQuickChatService>('quickChatService');
export interface IQuickChatService {
	readonly _serviceBrand: undefined;
	readonly onDidClose: Event<void>;
	readonly enabled: boolean;
	readonly focused: boolean;
	/** Defined when quick chat is open */
	readonly sessionResource?: URI;
	toggle(options?: IQuickChatOpenOptions): void;
	focus(): void;
	open(options?: IQuickChatOpenOptions): void;
	close(): void;
	openInChatView(): void;
}

export interface IQuickChatOpenOptions {
	/**
	 * The query for quick chat.
	 */
	query: string;
	/**
	 * Whether the query is partial and will await more input from the user.
	 */
	isPartialQuery?: boolean;
	/**
	 * An optional selection range to apply to the query text box.
	 */
	selection?: Selection;
}

export const IChatAccessibilityService = createDecorator<IChatAccessibilityService>('chatAccessibilityService');
export interface IChatAccessibilityService {
	readonly _serviceBrand: undefined;
	acceptRequest(): number;
	disposeRequest(requestId: number): void;
	acceptResponse(widget: ChatWidget, container: HTMLElement, response: IChatResponseViewModel | string | undefined, requestId: number, isVoiceInput?: boolean): void;
	acceptElicitation(message: IChatElicitationRequest): void;
}

export interface IChatCodeBlockInfo {
	readonly ownerMarkdownPartId: string;
	readonly codeBlockIndex: number;
	readonly elementId: string;
	readonly uri: URI | undefined;
	readonly uriPromise: Promise<URI | undefined>;
	codemapperUri: URI | undefined;
	readonly chatSessionResource: URI | undefined;
	focus(): void;
	readonly languageId?: string | undefined;
	readonly editDeltaInfo?: EditDeltaInfo | undefined;
}

export interface IChatFileTreeInfo {
	treeDataId: string;
	treeIndex: number;
	focus(): void;
}

export type ChatTreeItem = IChatRequestViewModel | IChatResponseViewModel;

export interface IChatListItemRendererOptions {
	readonly renderStyle?: 'compact' | 'minimal';
	readonly noHeader?: boolean;
	readonly noFooter?: boolean;
	readonly editableCodeBlock?: boolean;
	readonly renderDetectedCommandsWithRequest?: boolean;
	readonly restorable?: boolean;
	readonly editable?: boolean;
	readonly renderTextEditsAsSummary?: (uri: URI) => boolean;
	readonly referencesExpandedWhenEmptyResponse?: boolean | ((mode: ChatModeKind) => boolean);
	readonly progressMessageAtBottomOfResponse?: boolean | ((mode: ChatModeKind) => boolean);
}

export interface IChatWidgetViewOptions {
	autoScroll?: boolean | ((mode: ChatModeKind) => boolean);
	renderInputOnTop?: boolean;
	renderFollowups?: boolean;
	renderStyle?: 'compact' | 'minimal';
	renderInputToolbarBelowInput?: boolean;
	supportsFileReferences?: boolean;
	filter?: (item: ChatTreeItem) => boolean;
	/** Action triggered when 'clear' is called on the widget. */
	clear?: () => Promise<void>;
	rendererOptions?: IChatListItemRendererOptions;
	menus?: {
		/**
		 * The menu that is inside the input editor, use for send, dictation
		 */
		executeToolbar?: MenuId;
		/**
		 * The menu that next to the input editor, use for close, config etc
		 */
		inputSideToolbar?: MenuId;
		/**
		 * The telemetry source for all commands of this widget
		 */
		telemetrySource?: string;
	};
	defaultElementHeight?: number;
	editorOverflowWidgetsDomNode?: HTMLElement;
	enableImplicitContext?: boolean;
	enableWorkingSet?: 'explicit' | 'implicit';
	supportsChangingModes?: boolean;
	dndContainer?: HTMLElement;
	defaultMode?: IChatMode;
}

export interface IChatViewViewContext {
	viewId: string;
}

export function isIChatViewViewContext(context: IChatWidgetViewContext): context is IChatViewViewContext {
	return typeof (context as IChatViewViewContext).viewId === 'string';
}

export interface IChatResourceViewContext {
	isQuickChat?: boolean;
	isInlineChat?: boolean;
}

export function isIChatResourceViewContext(context: IChatWidgetViewContext): context is IChatResourceViewContext {
	return !isIChatViewViewContext(context);
}

export type IChatWidgetViewContext = IChatViewViewContext | IChatResourceViewContext | {};

export interface IChatAcceptInputOptions {
	noCommandDetection?: boolean;
	isVoiceInput?: boolean;
	enableImplicitContext?: boolean; // defaults to true
}

export interface IChatWidget {
	readonly domNode: HTMLElement;
	readonly onDidChangeViewModel: Event<void>;
	readonly onDidAcceptInput: Event<void>;
	readonly onDidHide: Event<void>;
	readonly onDidShow: Event<void>;
	readonly onDidSubmitAgent: Event<{ agent: IChatAgentData; slashCommand?: IChatAgentCommand }>;
	readonly onDidChangeAgent: Event<{ agent: IChatAgentData; slashCommand?: IChatAgentCommand }>;
	readonly onDidChangeParsedInput: Event<void>;
	readonly onDidFocus: Event<void>;
	readonly location: ChatAgentLocation;
	readonly viewContext: IChatWidgetViewContext;
	readonly viewModel: IChatViewModel | undefined;
	readonly inputEditor: ICodeEditor;
	readonly supportsFileReferences: boolean;
	readonly attachmentCapabilities: IChatAgentAttachmentCapabilities;
	readonly parsedInput: IParsedChatRequest;
	readonly lockedAgentId: string | undefined;
	lastSelectedAgent: IChatAgentData | undefined;
	readonly scopedContextKeyService: IContextKeyService;
	readonly input: ChatInputPart;
	readonly attachmentModel: ChatAttachmentModel;
	readonly locationData?: IChatLocationData;
	readonly contribs: readonly IChatWidgetContrib[];

	readonly supportsChangingModes: boolean;

	getContrib<T extends IChatWidgetContrib>(id: string): T | undefined;
	reveal(item: ChatTreeItem): void;
	focus(item: ChatTreeItem): void;
	getSibling(item: ChatTreeItem, type: 'next' | 'previous'): ChatTreeItem | undefined;
	getFocus(): ChatTreeItem | undefined;
	setInput(query?: string): void;
	getInput(): string;
	refreshParsedInput(): void;
	logInputHistory(): void;
	acceptInput(query?: string, options?: IChatAcceptInputOptions): Promise<IChatResponseModel | undefined>;
	startEditing(requestId: string): void;
	finishedEditing(completedEdit?: boolean): void;
	rerunLastRequest(): Promise<void>;
	setInputPlaceholder(placeholder: string): void;
	resetInputPlaceholder(): void;
	/**
	 * Focuses the response item in the list.
	 * @param lastFocused Focuses the most recently focused response. Otherwise, focuses the last response.
	 */
	focusResponseItem(lastFocused?: boolean): void;
	focusInput(): void;
	hasInputFocus(): boolean;
	getModeRequestOptions(): Partial<IChatSendRequestOptions>;
	getCodeBlockInfoForEditor(uri: URI): IChatCodeBlockInfo | undefined;
	getCodeBlockInfosForResponse(response: IChatResponseViewModel): IChatCodeBlockInfo[];
	getFileTreeInfosForResponse(response: IChatResponseViewModel): IChatFileTreeInfo[];
	getLastFocusedFileTreeForResponse(response: IChatResponseViewModel): IChatFileTreeInfo | undefined;
	clear(): Promise<void>;
	getViewState(): IChatModelInputState | undefined;
	lockToCodingAgent(name: string, displayName: string, agentId?: string): void;
	handleDelegationExitIfNeeded(sourceAgent: Pick<IChatAgentData, 'id' | 'name'> | undefined, targetAgent: IChatAgentData | undefined): Promise<void>;

	delegateScrollFromMouseWheelEvent(event: IMouseWheelEvent): void;
}


export interface ICodeBlockActionContextProvider {
	getCodeBlockContext(editor?: ICodeEditor): ICodeBlockActionContext | undefined;
}

export const IChatCodeBlockContextProviderService = createDecorator<IChatCodeBlockContextProviderService>('chatCodeBlockContextProviderService');
export interface IChatCodeBlockContextProviderService {
	readonly _serviceBrand: undefined;
	readonly providers: ICodeBlockActionContextProvider[];
	registerProvider(provider: ICodeBlockActionContextProvider, id: string): IDisposable;
}

export const ChatViewId = `workbench.panel.chat.view.${CHAT_PROVIDER_ID}`;
export const ChatViewContainerId = 'workbench.panel.chat';
