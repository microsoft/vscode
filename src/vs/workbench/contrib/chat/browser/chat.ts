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
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IChatWidgetContrib } from 'vs/workbench/contrib/chat/browser/chatWidget';
import { ICodeBlockActionContext } from 'vs/workbench/contrib/chat/browser/codeBlockPart';
import { ChatAgentLocation, IChatAgentCommand, IChatAgentData } from 'vs/workbench/contrib/chat/common/chatAgents';
import { IParsedChatRequest } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { IChatRequestViewModel, IChatResponseViewModel, IChatViewModel, IChatWelcomeMessageViewModel } from 'vs/workbench/contrib/chat/common/chatViewModel';

export const IChatWidgetService = createDecorator<IChatWidgetService>('chatWidgetService');

export interface IChatWidgetService {

	readonly _serviceBrand: undefined;

	/**
	 * Returns the most recently focused widget if any.
	 */
	readonly lastFocusedWidget: IChatWidget | undefined;

	/**
	 * Returns whether a view was successfully revealed.
	 */
	revealViewForProvider(providerId: string): Promise<IChatWidget | undefined>;

	getWidgetByInputUri(uri: URI): IChatWidget | undefined;

	getWidgetBySessionId(sessionId: string): IChatWidget | undefined;
}

export const IQuickChatService = createDecorator<IQuickChatService>('quickChatService');
export interface IQuickChatService {
	readonly _serviceBrand: undefined;
	readonly onDidClose: Event<void>;
	readonly enabled: boolean;
	readonly focused: boolean;
	toggle(providerId?: string, options?: IQuickChatOpenOptions): void;
	focus(): void;
	open(providerId?: string, options?: IQuickChatOpenOptions): void;
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
	element: IChatResponseViewModel;
	focus(): void;
}

export interface IChatFileTreeInfo {
	treeDataId: string;
	treeIndex: number;
	focus(): void;
}

export type ChatTreeItem = IChatRequestViewModel | IChatResponseViewModel | IChatWelcomeMessageViewModel;

export interface IChatWidgetViewOptions {
	renderInputOnTop?: boolean;
	renderStyle?: 'default' | 'compact';
	supportsFileReferences?: boolean;
	filter?: (item: ChatTreeItem) => boolean;
	editableCodeBlocks?: boolean;
	menus?: {
		executeToolbar?: MenuId;
		inputSideToolbar?: MenuId;
		telemetrySource?: string;
	};
	defaultElementHeight?: number;
	editorOverflowWidgetsDomNode?: HTMLElement;
}

export interface IChatViewViewContext {
	viewId: string;
}

export interface IChatResourceViewContext {
	resource: boolean;
}

export type IChatWidgetViewContext = IChatViewViewContext | IChatResourceViewContext;

export interface IChatWidget {
	readonly onDidChangeViewModel: Event<void>;
	readonly onDidAcceptInput: Event<void>;
	readonly onDidSubmitAgent: Event<{ agent: IChatAgentData; slashCommand?: IChatAgentCommand }>;
	readonly onDidChangeParsedInput: Event<void>;
	readonly location: ChatAgentLocation;
	readonly viewContext: IChatWidgetViewContext;
	readonly viewModel: IChatViewModel | undefined;
	readonly inputEditor: ICodeEditor;
	readonly providerId: string;
	readonly supportsFileReferences: boolean;
	readonly parsedInput: IParsedChatRequest;
	lastSelectedAgent: IChatAgentData | undefined;

	getContrib<T extends IChatWidgetContrib>(id: string): T | undefined;
	reveal(item: ChatTreeItem): void;
	focus(item: ChatTreeItem): void;
	moveFocus(item: ChatTreeItem, type: 'next' | 'previous'): void;
	getFocus(): ChatTreeItem | undefined;
	setInput(query?: string): void;
	getInput(): string;
	acceptInput(query?: string): void;
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
}

export interface IChatViewPane {
	clear(): void;
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
