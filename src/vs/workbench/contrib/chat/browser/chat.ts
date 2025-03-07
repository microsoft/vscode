/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IViewDescriptorService, ViewContainerLocation } from '../../../common/views.js';
import { IWorkbenchLayoutService, Parts } from '../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../services/views/common/viewsService.js';
import { ChatAgentLocation, IChatAgentCommand, IChatAgentData } from '../common/chatAgents.js';
import { IChatResponseModel } from '../common/chatModel.js';
import { IParsedChatRequest } from '../common/chatParserTypes.js';
import { CHAT_PROVIDER_ID } from '../common/chatParticipantContribTypes.js';
import { IChatRequestViewModel, IChatResponseViewModel, IChatViewModel } from '../common/chatViewModel.js';
import { ChatAttachmentModel } from './chatAttachmentModel.js';
import { ChatInputPart } from './chatInputPart.js';
import { ChatViewPane } from './chatViewPane.js';
import { IChatViewState, IChatWidgetContrib } from './chatWidget.js';
import { ICodeBlockActionContext } from './codeBlockPart.js';

export const IChatWidgetService = createDecorator<IChatWidgetService>('chatWidgetService');

export interface IChatWidgetService {

	readonly _serviceBrand: undefined;

	/**
	 * Returns the most recently focused widget if any.
	 */
	readonly lastFocusedWidget: IChatWidget | undefined;

	readonly onDidAddWidget: Event<IChatWidget>;


	getWidgetByInputUri(uri: URI): IChatWidget | undefined;
	getWidgetBySessionId(sessionId: string): IChatWidget | undefined;
	getWidgetsByLocations(location: ChatAgentLocation): ReadonlyArray<IChatWidget>;
}

export async function showChatView(viewsService: IViewsService): Promise<IChatWidget | undefined> {
	return (await viewsService.openView<ChatViewPane>(ChatViewId))?.widget;
}

export async function showEditsView(viewsService: IViewsService): Promise<IChatWidget | undefined> {
	return (await viewsService.openView<ChatViewPane>(EditsViewId))?.widget;
}

export function preferCopilotEditsView(viewsService: IViewsService): boolean {
	if (viewsService.getFocusedView()?.id === ChatViewId || !!viewsService.getActiveViewWithId(ChatViewId)) {
		return false;
	}

	return !!viewsService.getActiveViewWithId(EditsViewId);
}

export function showCopilotView(viewsService: IViewsService, layoutService: IWorkbenchLayoutService): Promise<IChatWidget | undefined> {

	// Ensure main window is in front
	if (layoutService.activeContainer !== layoutService.mainContainer) {
		layoutService.mainContainer.focus();
	}

	// Bring up the correct view
	if (preferCopilotEditsView(viewsService)) {
		return showEditsView(viewsService);
	} else {
		return showChatView(viewsService);
	}
}

export function ensureSideBarChatViewSize(viewDescriptorService: IViewDescriptorService, layoutService: IWorkbenchLayoutService, viewsService: IViewsService): void {
	const viewId = preferCopilotEditsView(viewsService) ? EditsViewId : ChatViewId;

	const location = viewDescriptorService.getViewLocationById(viewId);
	if (location === ViewContainerLocation.Panel) {
		return; // panel is typically very wide
	}

	const viewPart = location === ViewContainerLocation.Sidebar ? Parts.SIDEBAR_PART : Parts.AUXILIARYBAR_PART;
	const partSize = layoutService.getSize(viewPart);

	let adjustedChatWidth: number | undefined;
	if (partSize.width < 400 && layoutService.mainContainerDimension.width > 1200) {
		adjustedChatWidth = 400; // up to 400px if window bounds permit
	} else if (partSize.width < 300) {
		adjustedChatWidth = 300; // at minimum 300px
	}

	if (typeof adjustedChatWidth === 'number') {
		layoutService.setSize(viewPart, { width: adjustedChatWidth, height: partSize.height });
	}
}

export const IQuickChatService = createDecorator<IQuickChatService>('quickChatService');
export interface IQuickChatService {
	readonly _serviceBrand: undefined;
	readonly onDidClose: Event<void>;
	readonly enabled: boolean;
	readonly focused: boolean;
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
	acceptResponse(response: IChatResponseViewModel | string | undefined, requestId: number, isVoiceInput?: boolean): void;
}

export interface IChatCodeBlockInfo {
	readonly ownerMarkdownPartId: string;
	readonly codeBlockIndex: number;
	readonly elementId: string;
	readonly uri: URI | undefined;
	readonly uriPromise: Promise<URI | undefined>;
	codemapperUri: URI | undefined;
	readonly isStreaming: boolean;
	focus(): void;
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
	readonly noPadding?: boolean;
	readonly editableCodeBlock?: boolean;
	readonly renderCodeBlockPills?: boolean;
	readonly renderDetectedCommandsWithRequest?: boolean;
	readonly renderTextEditsAsSummary?: (uri: URI) => boolean;
	readonly referencesExpandedWhenEmptyResponse?: boolean;
	readonly progressMessageAtBottomOfResponse?: boolean;
}

export interface IChatWidgetViewOptions {
	autoScroll?: boolean;
	renderInputOnTop?: boolean;
	renderFollowups?: boolean;
	renderStyle?: 'compact' | 'minimal';
	supportsFileReferences?: boolean;
	supportsAdditionalParticipants?: boolean;
	filter?: (item: ChatTreeItem) => boolean;
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
}

export interface IChatViewViewContext {
	viewId: string;
}

export interface IChatResourceViewContext {
	isQuickChat?: boolean;
}

export type IChatWidgetViewContext = IChatViewViewContext | IChatResourceViewContext | {};

export interface IChatAcceptInputOptions {
	noCommandDetection?: boolean;
	isVoiceInput?: boolean;
}

export interface IChatWidget {
	readonly onDidChangeViewModel: Event<void>;
	readonly onDidAcceptInput: Event<void>;
	readonly onDidHide: Event<void>;
	readonly onDidSubmitAgent: Event<{ agent: IChatAgentData; slashCommand?: IChatAgentCommand }>;
	readonly onDidChangeAgent: Event<{ agent: IChatAgentData; slashCommand?: IChatAgentCommand }>;
	readonly onDidChangeParsedInput: Event<void>;
	readonly location: ChatAgentLocation;
	readonly viewContext: IChatWidgetViewContext;
	readonly viewModel: IChatViewModel | undefined;
	readonly inputEditor: ICodeEditor;
	readonly supportsFileReferences: boolean;
	readonly parsedInput: IParsedChatRequest;
	lastSelectedAgent: IChatAgentData | undefined;
	readonly scopedContextKeyService: IContextKeyService;
	readonly input: ChatInputPart;
	readonly attachmentModel: ChatAttachmentModel;

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
	rerunLastRequest(): Promise<void>;
	acceptInputWithPrefix(prefix: string): void;
	setInputPlaceholder(placeholder: string): void;
	resetInputPlaceholder(): void;
	focusLastMessage(): void;
	focusInput(): void;
	hasInputFocus(): boolean;
	getCodeBlockInfoForEditor(uri: URI): IChatCodeBlockInfo | undefined;
	getCodeBlockInfosForResponse(response: IChatResponseViewModel): IChatCodeBlockInfo[];
	getFileTreeInfosForResponse(response: IChatResponseViewModel): IChatFileTreeInfo[];
	getLastFocusedFileTreeForResponse(response: IChatResponseViewModel): IChatFileTreeInfo | undefined;
	clear(): void;
	getViewState(): IChatViewState;
	togglePaused(): void;
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

export const EditsViewId = 'workbench.panel.chat.view.edits';
