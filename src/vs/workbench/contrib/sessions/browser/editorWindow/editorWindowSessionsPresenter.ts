/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';
import { IChatViewHostService } from '../../../chat/browser/chatViewHost.js';
import { INewSessionTarget } from '../parts/chatView.js';

/** A chat that a presenter shows, with its session. */
export interface IEditorWindowPresentedChat {
	readonly session: ISession;
	readonly chat: IChat;
}

export interface IEditorWindowPresenterOpenOptions {
	readonly preserveFocus?: boolean;
	/** Opens beside the active chat, in a group of its own. */
	readonly sideBySide?: boolean;
	/** Opens a new composer, also while the active one has not sent its session yet. */
	readonly newComposer?: boolean;
}

/**
 * What shows the chats of sessions in an editor window, for the sessions services that the Agents window's UI injects there
 * (see `EditorWindowSessionsService`): the chat part, while a feature shows the chats there, or else the Chat view.
 */
export interface IEditorWindowSessionsPresenter {
	/** The chat it shows as the window's active chat, with its session. */
	readonly activeChat: IObservable<IEditorWindowPresentedChat | undefined>;

	/** Shows `chatResource` of `session`, or its main chat. */
	openChat(session: ISession, chatResource: URI | undefined, options?: IEditorWindowPresenterOpenOptions): Promise<void>;

	/** Opens a new-session composer aimed at `target`. */
	openComposer(target: INewSessionTarget | undefined, options?: IEditorWindowPresenterOpenOptions): Promise<void>;

	/** Stops showing `chatResource`, where it shows it. */
	closeChat(chatResource: URI): Promise<void>;

	/** Whether it shows `chatResource`. */
	isShowing(chatResource: URI): boolean;

	/** Moves focus into what shows the active chat. */
	focus(): void;
}

/**
 * What holds new-session composers, whose drafts are sessions of the window's providers, such as the chat part: also while
 * it no longer presents the window's sessions, as long as its composers live.
 */
export interface IEditorWindowComposerHolder {
	/** Whether it has a new-session composer that has not sent its session yet. */
	hasComposer(): boolean;

	/** Closes its new-session composers with nothing typed or attached, and no send under way. */
	closeIdleComposers(): Promise<void>;
}

export const IEditorWindowSessionsPresenterService = createDecorator<IEditorWindowSessionsPresenterService>('editorWindowSessionsPresenterService');

/** The presenter of an editor window's sessions: the one registered last, or else the Chat view. */
export interface IEditorWindowSessionsPresenterService {
	readonly _serviceBrand: undefined;

	readonly presenter: IObservable<IEditorWindowSessionsPresenter>;

	/** Shows the chats of sessions with `presenter` until the returned disposable is disposed; the one before shows them then. */
	registerPresenter(presenter: IEditorWindowSessionsPresenter): IDisposable;

	/** Counts the composers of `holder` until the returned disposable is disposed (see {@link hasComposer}). */
	registerComposerHolder(holder: IEditorWindowComposerHolder): IDisposable;

	/** Whether a registered holder has a new-session composer that has not sent its session yet. */
	hasComposer(): boolean;

	/** Closes the idle new-session composers of every registered holder. */
	closeIdleComposers(): Promise<void>;
}

/** The Chat view, whose host shows one chat at a time, as presenter of the sessions of an editor window. */
class ChatViewSessionsPresenter implements IEditorWindowSessionsPresenter {

	readonly activeChat: IObservable<IEditorWindowPresentedChat | undefined> = constObservable(undefined);

	constructor(
		private readonly _chatViewHostService: IChatViewHostService,
	) { }

	async openChat(session: ISession, chatResource: URI | undefined, options?: IEditorWindowPresenterOpenOptions): Promise<void> {
		await this._chatViewHostService.openSession(chatResource ?? session.mainChat.get().resource, { preserveFocus: options?.preserveFocus });
	}

	/**
	 * A new chat in the Chat view, in place of the chat it shows, also one still loading: the next request does not go to that
	 * chat. Not New Chat of the chat widget that has focus, which may be another. The composer that the Chat view then shows,
	 * such as the one of its sessions list, is aimed at `target`.
	 */
	async openComposer(target: INewSessionTarget | undefined, options?: IEditorWindowPresenterOpenOptions): Promise<void> {
		const aimed = target && { folder: target.folderUri, providerId: target.providerId, sessionType: target.sessionTypeId, modelId: target.modelId, modeId: target.modeId, requireDevContainer: target.requireDevContainer };
		await this._chatViewHostService.newChat(aimed, { ownChat: true, preserveFocus: options?.preserveFocus });
	}

	async closeChat(): Promise<void> { }

	isShowing(): boolean {
		return false;
	}

	focus(): void {
		void this._chatViewHostService.reveal(false);
	}
}

export class EditorWindowSessionsPresenterService extends Disposable implements IEditorWindowSessionsPresenterService {

	declare readonly _serviceBrand: undefined;

	/** One per registration, also of the same presenter or holder: each is removed by its own disposal only. */
	private readonly _registered = observableValue<readonly { readonly presenter: IEditorWindowSessionsPresenter }[]>(this, []);
	readonly presenter: IObservable<IEditorWindowSessionsPresenter>;
	private readonly _composerHolders = new Set<{ readonly holder: IEditorWindowComposerHolder }>();

	constructor(
		@IChatViewHostService chatViewHostService: IChatViewHostService,
	) {
		super();
		const chatView = new ChatViewSessionsPresenter(chatViewHostService);
		this.presenter = derived(this, reader => this._registered.read(reader).at(-1)?.presenter ?? chatView);
	}

	registerPresenter(presenter: IEditorWindowSessionsPresenter): IDisposable {
		const registration = { presenter };
		this._registered.set([...this._registered.get(), registration], undefined);
		return toDisposable(() => this._registered.set(this._registered.get().filter(candidate => candidate !== registration), undefined));
	}

	registerComposerHolder(holder: IEditorWindowComposerHolder): IDisposable {
		const registration = { holder };
		this._composerHolders.add(registration);
		return toDisposable(() => this._composerHolders.delete(registration));
	}

	hasComposer(): boolean {
		return [...this._composerHolders].some(({ holder }) => holder.hasComposer());
	}

	async closeIdleComposers(): Promise<void> {
		await Promise.all([...this._composerHolders].map(({ holder }) => holder.closeIdleComposers()));
	}
}

/** Where a new-session composer of an editor window aims: the folder of the active editor, or else the window's first folder. */
export function getEditorWindowComposerTarget(workspaceContextService: IWorkspaceContextService, editorService: IEditorService): INewSessionTarget | undefined {
	const activeResource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
	const folder = (activeResource && workspaceContextService.getWorkspaceFolder(activeResource)) ?? workspaceContextService.getWorkspace().folders.at(0);
	return folder ? { folderUri: folder.uri } : undefined;
}
