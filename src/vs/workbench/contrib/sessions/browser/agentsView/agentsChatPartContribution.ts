/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable, DisposableStore, IDisposable, MutableDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { createDecorator, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../browser/editor.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../common/editor.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { IChatViewHostService } from '../../../chat/browser/chatViewHost.js';
import { ChangesMultiDiffSourceResolver } from '../../../sessionChanges/browser/changesMultiDiffSourceResolver.js';
import { SessionChangesEditor } from '../../../sessionChanges/browser/sessionChangesEditor.js';
import { SessionChangesEditorInput, SessionChangesEditorSerializer } from '../../../sessionChanges/browser/sessionChangesEditorInput.js';
import { IEditorWindowSessionsPresenter, IEditorWindowSessionsPresenterService } from '../editorWindow/editorWindowSessionsPresenter.js';
import { IEditorWindowSessionsRuntime } from '../editorWindow/editorWindowSessionsRuntime.js';
import { IAgentsChatPartService, restoreAgentsChatPart } from './agentsChatPart.js';
import { registerSessionsListConfiguration } from '../sessionsConfiguration.js';
import { AgentsChatPartVisibleContext, registerAgentsChatPartActions } from './agentsChatPartActions.js';
import { IAgentsChatPartFrame } from './agentsChatPartFrame.js';
import { AgentsChatViewHost } from './agentsChatViewHost.js';
import { AgentsChatPartChangesEditorHeader } from './agentsChatPartChangesEditorHeader.js';

/** How a feature shows chats in the chat part of an editor window (see {@link IEditorWindowChatPartService.enable}). */
export interface IEditorWindowChatPartOptions {
	/** The view the chat part docks beside, such as the view that lists the sessions whose chats it shows. */
	readonly anchorViewId: string;
	/** Of the features that enable the chat part, the anchor of the one with the highest priority applies. */
	readonly anchorPriority: number;
	/**
	 * Whether chats open in the chat part now. While they do, what would show the Chat view's chats shows them in the chat
	 * part, and the chat part restores the chats it showed as the window last closed. While they do not, the Chat view keeps
	 * its chats, and the chat part does not restore and hides, as the window gets ready and as this turns false.
	 */
	readonly enabled: IObservable<boolean>;
	/**
	 * Whether New Chat of the Chat view opens a new-session composer in the chat part while chats open in it; otherwise the
	 * Chat view keeps its own New Chat. True by default. While several features enable the chat part, it does while one of
	 * those that have it enabled says so.
	 */
	readonly ownsNewChat?: boolean;
}

export const IEditorWindowChatPartService = createDecorator<IEditorWindowChatPartService>('editorWindowChatPartService');

/**
 * The chat part of an editor window: it shows chats of sessions, each in a tab, beside the editor area (see
 * `IAgentsChatPartService`). It does nothing until a feature enables it.
 */
export interface IEditorWindowChatPartService {
	readonly _serviceBrand: undefined;

	/** Whether chats open in the chat part now: while one of the features that enabled it has it enabled. */
	readonly enabled: IObservable<boolean>;

	/**
	 * Has the window show chats in the chat part, as `options` say, until the returned disposable is disposed. Call it as
	 * the window starts, such as from a contribution of `WorkbenchPhase.BlockStartup`: the chat part has to exist before the
	 * workbench creates its grid. Features that enable it together share the one chat part.
	 */
	enable(options: IEditorWindowChatPartOptions): IDisposable;
}

export class EditorWindowChatPartService extends Disposable implements IEditorWindowChatPartService {

	declare readonly _serviceBrand: undefined;

	/** One per call of {@link enable}, also of the same options: each is removed by its own disposal only. */
	private readonly _owners = observableValue<readonly { readonly options: IEditorWindowChatPartOptions }[]>(this, []);
	readonly enabled: IObservable<boolean> = derived(this, reader => this._owners.read(reader).some(owner => owner.options.enabled.read(reader)));
	private readonly _ownsNewChat: IObservable<boolean> = derived(this, reader => this._owners.read(reader).some(owner => owner.options.enabled.read(reader) && owner.options.ownsNewChat !== false));

	/** What the chat part does while a feature enabled it. */
	private readonly _active = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IWorkbenchLayoutService private readonly _layoutService: IWorkbenchLayoutService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@IChatViewHostService private readonly _chatViewHostService: IChatViewHostService,
		@IEditorWindowSessionsPresenterService private readonly _presenterService: IEditorWindowSessionsPresenterService,
		@IEditorWindowSessionsRuntime private readonly _sessionsRuntime: IEditorWindowSessionsRuntime,
		@IAgentsChatPartFrame private readonly _frame: IAgentsChatPartFrame,
	) {
		super();
	}

	enable(options: IEditorWindowChatPartOptions): IDisposable {
		const owner = { options };
		this._owners.set([...this._owners.get(), owner], undefined);
		this._active.value ??= this._activate();
		this._updateAnchor();
		return toDisposable(() => {
			this._owners.set(this._owners.get().filter(candidate => candidate !== owner), undefined);
			if (!this._owners.get().length) {
				this._active.clear();
			} else {
				this._updateAnchor();
			}
		});
	}

	private _updateAnchor(): void {
		const anchor = this._owners.get().map(owner => owner.options).sort((a, b) => b.anchorPriority - a.anchorPriority).at(0);
		this._layoutService.setChatPartAnchor(anchor && { viewId: anchor.anchorViewId });
	}

	private _activate(): DisposableStore {
		const store = new DisposableStore();
		store.add(toDisposable(() => this._layoutService.setChatPartAnchor(undefined)));

		// The part, before the workbench creates its grid: reading it creates the delayed frame
		void this._frame.part;

		// The Changes editor that the pills of the chats open in the editor area, as the Agents window registers it
		store.add(Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
			EditorPaneDescriptor.create(SessionChangesEditor, SessionChangesEditor.ID, localize('sessionChangesEditor.label', "Changes")),
			[new SyncDescriptor(SessionChangesEditorInput)]
		));
		store.add(Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(SessionChangesEditorInput.ID, SessionChangesEditorSerializer));
		// Its diffs, also of a Changes editor that the window restores
		store.add(this._instantiationService.createInstance(ChangesMultiDiffSourceResolver));

		const visible = AgentsChatPartVisibleContext.bindTo(this._contextKeyService);
		store.add(this._layoutService.onDidChangePartVisibility(({ partId }) => {
			if (partId === Parts.CHAT_PART) {
				visible.set(this._layoutService.isVisible(Parts.CHAT_PART));
			}
		}));
		store.add(toDisposable(() => visible.reset()));

		// The sessions of its chats are known while it shows, and while its composers hold drafts, also while chats no longer
		// open in it
		store.add(this._sessionsRuntime.enable({ viewIds: [] }));
		const existing = () => this._frame.contentCreated.get() ? this._frame.content.get() : undefined;
		store.add(this._presenterService.registerComposerHolder({
			hasComposer: () => !!existing()?.hasComposer(),
			closeIdleComposers: async () => existing()?.closeIdleComposers(),
		}));

		// The picker of its changesets, in the header row it shows itself in an editor window
		store.add(this._instantiationService.createInstance(AgentsChatPartChangesEditorHeader));

		// While chats open in it, it replaces the Chat view, and shows the chats of the window's sessions. The host and the
		// chat part's content are created as the first request comes, not as the window starts.
		store.add(autorun(reader => {
			if (!this.enabled.read(reader)) {
				return;
			}
			// Its actions, such as to close it, and the setting that its header sets, only while chats open in it
			reader.store.add(registerSessionsListConfiguration());
			reader.store.add(registerAgentsChatPartActions());
			const host = this._instantiationService.createInstance(AgentsChatViewHost, this._ownsNewChat);
			reader.store.add(this._chatViewHostService.registerHost(host));
			// Unregistered, what the host is still doing does not open the chat part
			reader.store.add(toDisposable(() => host.deactivate()));
			reader.store.add(this._presenterService.registerPresenter(this._createPresenter()));
		}));

		// While chats do not open in it, it does not show, also not as the window restored it shown
		void this._lifecycleService.when(LifecyclePhase.Ready).then(() => {
			if (store.isDisposed) {
				return;
			}
			store.add(autorun(reader => {
				if (!this.enabled.read(reader) && this._layoutService.isVisible(Parts.CHAT_PART)) {
					this._layoutService.setPartHidden(true, Parts.CHAT_PART);
				}
			}));
		});

		void this._lifecycleService.when(LifecyclePhase.Restored).then(() => {
			if (store.isDisposed) {
				return;
			}
			const restored = this.enabled.get() ? restoreAgentsChatPart(this._layoutService, this._contextKeyService, () => this._chatPart()) : undefined;
			visible.set(this._layoutService.isVisible(Parts.CHAT_PART));
			return restored;
		}).catch(onUnexpectedError);

		return store;
	}

	private _chatPart(): IAgentsChatPartService {
		return this._instantiationService.invokeFunction(accessor => accessor.get(IAgentsChatPartService));
	}

	/** The chat part as the presenter of the window's sessions; what reads it without needing it does not create it. */
	private _createPresenter(): IEditorWindowSessionsPresenter {
		// Of the frame: reading it as the chat part is being created does not create it again
		const { content, contentCreated: created } = this._frame;
		const existing = () => created.get() ? content.get() : undefined;
		return {
			activeChat: derived(reader => created.read(reader) ? content.read(reader)?.activeChat.read(reader) : undefined),
			openChat: (session, chatResource, options) => this._chatPart().openChat(session, chatResource, options),
			openComposer: (target, options) => this._chatPart().openComposer(target, options),
			closeChat: async chatResource => existing()?.closeChat(chatResource),
			isShowing: chatResource => !!existing()?.isShowing(chatResource),
			focus: () => this._chatPart().focus(),
		};
	}
}
