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

	/** Whether it shows a new-session composer that has not sent its session yet, whose draft is a provider's. */
	hasComposer(): boolean;

	/** Closes the new-session composers with nothing typed or attached, and no send under way. */
	closeIdleComposers(): Promise<void>;

	/** Moves focus into what shows the active chat. */
	focus(): void;
}

export const IEditorWindowSessionsPresenterService = createDecorator<IEditorWindowSessionsPresenterService>('editorWindowSessionsPresenterService');

/** The presenter of an editor window's sessions: the one registered last, or else the Chat view. */
export interface IEditorWindowSessionsPresenterService {
	readonly _serviceBrand: undefined;

	readonly presenter: IObservable<IEditorWindowSessionsPresenter>;

	/** Shows the chats of sessions with `presenter` until the returned disposable is disposed; the one before shows them then. */
	registerPresenter(presenter: IEditorWindowSessionsPresenter): IDisposable;
}

/** The Chat view, whose host shows one chat at a time, as presenter of the sessions of an editor window. */
class ChatViewSessionsPresenter implements IEditorWindowSessionsPresenter {

	readonly activeChat: IObservable<IEditorWindowPresentedChat | undefined> = constObservable(undefined);

	constructor(private readonly _chatViewHostService: IChatViewHostService) { }

	async openChat(session: ISession, chatResource: URI | undefined, options?: IEditorWindowPresenterOpenOptions): Promise<void> {
		await this._chatViewHostService.openSession(chatResource ?? session.mainChat.get().resource, { preserveFocus: options?.preserveFocus });
	}

	async openComposer(_target: INewSessionTarget | undefined, options?: IEditorWindowPresenterOpenOptions): Promise<void> {
		await this._chatViewHostService.reveal(options?.preserveFocus);
	}

	async closeChat(): Promise<void> { }

	isShowing(): boolean {
		return false;
	}

	hasComposer(): boolean {
		return false;
	}

	async closeIdleComposers(): Promise<void> { }

	focus(): void {
		void this._chatViewHostService.reveal(false);
	}
}

export class EditorWindowSessionsPresenterService extends Disposable implements IEditorWindowSessionsPresenterService {

	declare readonly _serviceBrand: undefined;

	private readonly _registered = observableValue<readonly IEditorWindowSessionsPresenter[]>(this, []);
	readonly presenter: IObservable<IEditorWindowSessionsPresenter>;

	constructor(@IChatViewHostService chatViewHostService: IChatViewHostService) {
		super();
		const chatView = new ChatViewSessionsPresenter(chatViewHostService);
		this.presenter = derived(this, reader => this._registered.read(reader).at(-1) ?? chatView);
	}

	registerPresenter(presenter: IEditorWindowSessionsPresenter): IDisposable {
		this._registered.set([...this._registered.get(), presenter], undefined);
		return toDisposable(() => this._registered.set(this._registered.get().filter(candidate => candidate !== presenter), undefined));
	}
}

/** Where a new-session composer of an editor window aims: the folder of the active editor, or else the window's first folder. */
export function getEditorWindowComposerTarget(workspaceContextService: IWorkspaceContextService, editorService: IEditorService): INewSessionTarget | undefined {
	const activeResource = EditorResourceAccessor.getOriginalUri(editorService.activeEditor, { supportSideBySide: SideBySideEditor.PRIMARY });
	const folder = (activeResource && workspaceContextService.getWorkspaceFolder(activeResource)) ?? workspaceContextService.getWorkspace().folders.at(0);
	return folder ? { folderUri: folder.uri } : undefined;
}
