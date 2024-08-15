/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Selection } from 'vs/editor/common/core/selection';
import { localize } from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { ChatViewPane } from 'vs/workbench/contrib/chat/browser/chatViewPane';
import { IChatViewState, IChatWidgetContrib } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { ICodeBlockActionContext } from 'vs/workbench/contrib/chat/browser/codeBlockPart';
import { ChatAgentLocation, IChatAgentCommand, IChatAgentData } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IChatRequestVariableEntry, IChatResponseModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { IParsedChatRequest } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { CHAT_PROVIDER_ID } from 'vs/workbench/contrib/chat/common/chatParticipantContribTypes';
import { IChatRequestViewModel, IChatResponseViewModel, IChatViewModel, IChatWelcomeMessageViewModel } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { IViewsService } from 'vs/workbench/services/views/common/viewsService';

export const IChatWidgetService = createDecorator<IChatWidgetService>('chatWidgetService');

export interface IChatWidgetService {

	readonly _serviceBrand: undefined;

	/**
	 * Returns the most recently focused widget if any.
	 */
	readonly lastFocusedWidget: IChatWidget | undefined;

	getWidgetByInputUri(uri: URI): IChatWidget | undefined;
	getWidgetBySessionId(sessionId: string): IChatWidget | undefined;
}

export async function showChatView(viewsService: IViewsService): Promise<IChatWidget | undefined> {
	return (await viewsService.openView<ChatViewPane>(CHAT_VIEW_ID))?.widget;
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
	acceptResponse(response: IChatResponseViewModel | string | undefined, requestId: number): void;
}

export interface IChatCodeBlockInfo {
	codeBlockIndex: number;
	element: ChatTreeItem;
	uri: URI | undefined;
	focus(): void;
}

export interface IChatFileTreeInfo {
	treeDataId: string;
	treeIndex: number;
	focus(): void;
}

export type ChatTreeItem = IChatRequestViewModel | IChatResponseViewModel | IChatWelcomeMessageViewModel;

export interface IChatListItemRendererOptions {
	readonly renderStyle?: 'default' | 'compact' | 'minimal';
	readonly noHeader?: boolean;
	readonly noPadding?: boolean;
	readonly editableCodeBlock?: boolean;
	readonly renderTextEditsAsSummary?: (uri: URI) => boolean;
}

export interface IChatWidgetViewOptions {
	renderInputOnTop?: boolean;
	renderFollowups?: boolean;
	renderStyle?: 'default' | 'compact' | 'minimal';
	supportsFileReferences?: boolean;
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
}

export interface IChatViewViewContext {
	viewId: string;
}

export interface IChatResourceViewContext {
	isQuickChat?: boolean;
}

export type IChatWidgetViewContext = IChatViewViewContext | IChatResourceViewContext | {};

export interface IChatWidget {
	readonly onDidChangeViewModel: Event<void>;
	readonly onDidAcceptInput: Event<void>;
	readonly onDidHide: Event<void>;
	readonly onDidSubmitAgent: Event<{ agent: IChatAgentData; slashCommand?: IChatAgentCommand }>;
	readonly onDidChangeAgent: Event<{ agent: IChatAgentData; slashCommand?: IChatAgentCommand }>;
	readonly onDidChangeParsedInput: Event<void>;
	readonly onDidChangeContext: Event<{ removed?: IChatRequestVariableEntry[]; added?: IChatRequestVariableEntry[] }>;
	readonly location: ChatAgentLocation;
	readonly viewContext: IChatWidgetViewContext;
	readonly viewModel: IChatViewModel | undefined;
	readonly inputEditor: ICodeEditor;
	readonly supportsFileReferences: boolean;
	readonly parsedInput: IParsedChatRequest;
	lastSelectedAgent: IChatAgentData | undefined;
	readonly scopedContextKeyService: IContextKeyService;

	getContrib<T extends IChatWidgetContrib>(id: string): T | undefined;
	reveal(item: ChatTreeItem): void;
	focus(item: ChatTreeItem): void;
	getSibling(item: ChatTreeItem, type: 'next' | 'previous'): ChatTreeItem | undefined;
	getFocus(): ChatTreeItem | undefined;
	setInput(query?: string): void;
	getInput(): string;
	logInputHistory(): void;
	acceptInput(query?: string): Promise<IChatResponseModel | undefined>;
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
	setContext(overwrite: boolean, ...context: IChatRequestVariableEntry[]): void;
	clear(): void;
	getViewState(): IChatViewState;
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

export const GeneratingPhrase = localize('generating', "Generating");

export const CHAT_VIEW_ID = `workbench.panel.chat.view.${CHAT_PROVIDER_ID}`;
