/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IListStyles } from '../../../../../base/browser/ui/list/listWidget.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { URI } from '../../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IStyleOverride } from '../../../../../platform/theme/browser/defaultStyles.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { IAgentSession } from '../../../chat/browser/agentSessions/agentSessionsModel.js';
import { IChatViewSessionsComposer, IChatViewSessionsList, IChatViewSessionsListControl, IChatViewSessionsListProvider } from '../../../chat/browser/widgetHosts/viewPane/chatViewSessionsList.js';
import './media/chatViewSessionsList.css';
import { DisposableResizeObserver, getWindow } from '../../../../../base/browser/dom.js';
import { combinedDisposable, Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../../base/common/lifecycle.js';
import { INewSessionTarget } from '../parts/chatView.js';
import { autorun, constObservable, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IChatService } from '../../../chat/common/chatService/chatService.js';
import { ChatWindowLayoutMode } from '../../../chatWindow/common/chatWindowLayout.js';
import { ChatEditorView, IChatEditorWindow } from '../chatEditor/chatEditor.js';
import { ChatWindowComposerModel, ChatWindowComposers, createChatWindowComposerResource } from '../chatEditor/chatWindowComposer.js';
import { SessionChatEditorEntry, waitForSessionChat } from '../chatEditor/sessionChatEditorHost.js';
import { ISessionsListModelService } from '../sessionsListModelService.js';
import { ISessionsProvidersService } from '../sessionsProvidersService.js';
import { IEditorWindowComposerFoldersService } from '../editorWindow/editorWindowComposerFolders.js';
import { getEditorWindowComposerTarget, IEditorWindowComposerHolder, IEditorWindowSessionsPresenterService } from '../editorWindow/editorWindowSessionsPresenter.js';
import { ISessionsManagementService } from '../../common/sessionsManagement.js';
import { SessionsView } from '../views/sessionsView.js';
import { createEditorWindowSessionsScope, createEditorWindowSessionsView } from './editorWindowSessionsList.js';
import { ChatViewId } from '../../../chat/browser/chat.js';
import { localize } from '../../../../../nls.js';

/** The shared sessions list of an editor window, embedded in the Chat view, as the Chat view acts on it. */
class ChatViewSessionsListControl implements IChatViewSessionsListControl {

	constructor(private readonly _view: SessionsView) { }

	setVisible(visible: boolean): void { this._view.setVisible(visible); }
	layout(height: number, width: number): void {
		this._view.orthogonalSize = width;
		this._view.layout(height);
	}
	focus(): void { this._view.focus(); }
	scrollToTop(): void { this._view.focus(); }
	refresh(): void { this._view.sessionsControl?.refresh(); }
	async update(): Promise<boolean> {
		this._view.sessionsControl?.update();
		return true;
	}
	reveal(sessionResource: URI): boolean { return this._view.sessionsControl?.reveal(sessionResource) ?? false; }
	clearFocus(): void { this._view.sessionsControl?.clearFocus(); }
	hasFocusOrSelection(): boolean { return this._view.sessionsControl?.hasFocusOrSelection() ?? false; }
	/** The sessions of the Chat view's own list that have focus: none of those here. */
	getFocus(): IAgentSession[] { return []; }
	dispose(): void { this._view.dispose(); }
}

const SESSION_TIMEOUT = 30_000;

/** The space below the content of the composer, see chatViewSessionsList.css. */
const COMPOSER_PADDING = 8;

/** A new-session composer of the Chat view, until a request it sends starts its session, which then opens elsewhere. */
class ChatViewComposerEntry extends SessionChatEditorEntry {

	readonly active = constObservable(true);

	constructor(
		chatResource: URI,
		composer: ChatWindowComposerModel,
		readonly window: IObservable<IChatEditorWindow | undefined>,
		@ISessionsManagementService sessionsManagementService: ISessionsManagementService,
		@IChatService chatService: IChatService,
		@ISessionsListModelService sessionsListModelService: ISessionsListModelService,
		@ISessionsProvidersService sessionsProvidersService: ISessionsProvidersService,
		@IConfigurationService configurationService: IConfigurationService,
	) {
		super(chatResource, sessionsManagementService, chatService, sessionsListModelService, sessionsProvidersService, configurationService);
		this.start(composer, 'ChatViewSessions#composer');
	}

	protected closeShown(): void { }
}

/**
 * The composer of the Chat view as a holder of the window's sessions providers (see `IEditorWindowComposerHolder`): it has a
 * composer while it shows one, and closes it, with `close`, once nothing is typed or attached and no send is under way.
 */
export function createChatViewComposerHolder(model: () => Pick<ChatWindowComposerModel, 'isPristine'> | undefined, close: () => void): IEditorWindowComposerHolder {
	return {
		hasComposer: () => !!model(),
		closeIdleComposers: async () => {
			if (model()?.isPristine()) {
				close();
			}
		},
	};
}

/**
 * Creates the model of a composer of the Chat view, aimed at `target`, with the folders the window's composers offer, such
 * as the worktrees of its folder: the window's folders unless a feature offers others. Until `folders` is disposed, it
 * follows the window's folder as it moves, as the chat part's composers do.
 */
export function createChatViewComposerModel(
	composers: Pick<ChatWindowComposers, 'create'>,
	composerFolders: IEditorWindowComposerFoldersService,
	resource: URI,
	target: INewSessionTarget | undefined,
	openStartedSession: (session: ISession) => Promise<void>,
): { readonly composer: ChatWindowComposerModel; readonly folders: IDisposable } {
	const composer = composers.create(resource, { target, ...composerFolders.getComposerFolderOptions() }, openStartedSession);
	return { composer, folders: composerFolders.registerComposer(composer) };
}

/**
 * The session composer of the Agents window as the Chat view's composer of new chats: with its workspace, worktree and other
 * pickers, of the folders the chat part's composers offer. The session a request starts opens with `open`, and a new composer
 * takes its place.
 */
class ChatViewSessionsComposer extends Disposable implements IChatViewSessionsComposer {

	private readonly _height = observableValue(this, 0);
	readonly height: IObservable<number> = this._height;

	private readonly _composers: ChatWindowComposers;
	private readonly _view = this._register(new MutableDisposable<ChatEditorView>());
	private readonly _entry = this._register(new MutableDisposable<ChatViewComposerEntry>());
	private readonly _entryStore = this._register(new MutableDisposable<DisposableStore>());
	private readonly _window: IChatEditorWindow;
	/** The model of the composer it shows, while it shows one. */
	private _model: ChatWindowComposerModel | undefined;

	constructor(
		private readonly _container: HTMLElement,
		private readonly _open: (session: ISession, chatResource: URI | undefined, preserveFocus: boolean) => Promise<void>,
		@IEditorWindowComposerFoldersService private readonly _composerFolders: IEditorWindowComposerFoldersService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ISessionsManagementService private readonly _sessionsManagementService: ISessionsManagementService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IEditorService private readonly _editorService: IEditorService,
		@IEditorGroupsService editorGroupsService: IEditorGroupsService,
		@IEditorWindowSessionsPresenterService presenterService: IEditorWindowSessionsPresenterService,
	) {
		super();
		_container.classList.add('chat-view-sessions-composer');
		// Its draft holds the window's sessions providers while it lives; one with nothing typed goes as they are released
		this._register(presenterService.registerComposerHolder(createChatViewComposerHolder(() => this._model, () => this._closeComposer())));
		this._composers = this._register(_instantiationService.createInstance(ChatWindowComposers, async (resource: URI) => (await waitForSessionChat(this._sessionsManagementService, resource, SESSION_TIMEOUT))?.session));
		// It shows beside the editor area, whose editors its Session Activity Bar reads
		this._window = {
			layoutMode: constObservable(ChatWindowLayoutMode.SideBySide),
			inputOnly: constObservable(false),
			resizing: constObservable(false),
			mainPart: editorGroupsService.mainPart,
			toggleConversation: () => { },
		};
		this._createComposer();
	}

	private _createComposer(): void {
		const resource = createChatWindowComposerResource();
		this._model = undefined;
		const { composer, folders } = createChatViewComposerModel(this._composers, this._composerFolders, resource, getEditorWindowComposerTarget(this._workspaceContextService, this._editorService), session => this._open(session, undefined, false));
		const entry = this._instantiationService.createInstance(ChatViewComposerEntry, resource, composer, constObservable(this._window));
		this._view.clear();
		this._entry.value = entry;
		const view = this._view.value = this._instantiationService.createInstance(ChatEditorView, entry);
		view.setProvidedTitleVisible(false);
		this._container.replaceChildren(view.element);
		this._composers.didOpen([entry.chat.get()]);

		const store = this._entryStore.value = new DisposableStore();
		store.add(folders);
		this._model = composer;
		// Its content, at the bottom of its view, gives the composer its height
		const observer = store.add(new MutableDisposable());
		store.add(autorun(reader => {
			const content = view.sessionView.composerView.read(reader)?.inputContentElement;
			observer.clear();
			if (!content) {
				return;
			}
			const resizeObserver = new DisposableResizeObserver('ChatViewSessionsComposer.content', () => this._height.set(content.offsetHeight + COMPOSER_PADDING, undefined), getWindow(content));
			observer.value = combinedDisposable(resizeObserver, resizeObserver.observe(content));
		}));
		// The session its request starts opens where the chats of the sessions open; a new composer takes its place
		store.add(autorun(reader => {
			const shown = entry.shown.read(reader);
			if (shown) {
				this._open(shown.session, shown.chat.resource, false).catch(onUnexpectedError);
				queueMicrotask(() => {
					if (!this._store.isDisposed && this._entry.value === entry) {
						this._createComposer();
					}
				});
			}
		}));
	}

	layout(width: number, height: number): void {
		this._ensureComposer();
		this._view.value?.layout(width, height, 0, 0);
	}

	focus(): void {
		this._ensureComposer();
		this._view.value?.focus();
	}

	/** A composer closed while idle shows again as the Chat view shows it. */
	private _ensureComposer(): void {
		if (!this._entry.value) {
			this._createComposer();
		}
	}

	private _closeComposer(): void {
		this._model = undefined;
		this._entryStore.clear();
		this._view.clear();
		this._entry.clear();
		this._container.replaceChildren();
	}

	newChat(): void {
		this._createComposer();
	}
}

/**
 * Gives the Chat view the sessions of the Agents window as its sessions list. A session opens with `open`: in the Chat view,
 * or in the chat part while `sessionsOnly`, when the Chat view shows only the sessions.
 */
export class ChatViewSessionsListProvider implements IChatViewSessionsListProvider {

	constructor(
		private readonly _sessionsOnly: IObservable<boolean>,
		private readonly _open: (session: ISession, chatResource: URI | undefined, preserveFocus: boolean) => Promise<void>,
	) { }

	create(container: HTMLElement, instantiationService: IInstantiationService, _options: { readonly overrideStyles: IStyleOverride<IListStyles> }): IChatViewSessionsList {
		const workspaceContextService = instantiationService.invokeFunction(accessor => accessor.get(IWorkspaceContextService));
		// The Sessions view of an editor window, as the Agents viewlet shows it, with its header as a section of the Chat view:
		// embedded in the Chat view, whose id it takes, and found by the actions of the list through the locator it registers with
		const view = instantiationService.createInstance(createEditorWindowSessionsView(createEditorWindowSessionsScope(this, workspaceContextService), 'section'), {
			id: ChatViewId,
			title: localize('chatViewSessions.title', "Sessions"),
			expanded: true,
		});
		view.headerVisible = false;
		view.render();
		container.appendChild(view.element);
		view.setVisible(true);
		const list = view;
		return {
			control: new ChatViewSessionsListControl(list),
			hasHeader: true,
			sessionsOnly: this._sessionsOnly,
			createComposer: composerContainer => instantiationService.createInstance(ChatViewSessionsComposer, composerContainer, this._open),
		};
	}
}
