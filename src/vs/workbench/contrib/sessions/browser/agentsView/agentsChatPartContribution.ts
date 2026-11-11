/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAgentsViewFolderLocationService } from './agentsViewFolderLocation.js';
import { onUnexpectedError } from '../../../../../base/common/errors.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../browser/editor.js';
import { EditorExtensions, IEditorFactoryRegistry } from '../../../../common/editor.js';
import { ChangesMultiDiffSourceResolver } from '../../../sessionChanges/browser/changesMultiDiffSourceResolver.js';
import { SessionChangesEditor } from '../../../sessionChanges/browser/sessionChangesEditor.js';
import { SessionChangesEditorInput, SessionChangesEditorSerializer } from '../../../sessionChanges/browser/sessionChangesEditorInput.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { IAgentsChatPartService, restoreAgentsChatPart } from './agentsChatPart.js';
import { AgentsChatPartVisibleContext, registerAgentsChatPartActions } from './agentsChatPartActions.js';
import { IAgentsChatPartFrame } from './agentsChatPartFrame.js';
import { IChatWidgetService } from '../../../chat/browser/chat.js';
import { AgentsChatViewHostDelegate } from './agentsChatViewHostDelegate.js';
import { Lazy } from '../../../../../base/common/lazy.js';

/**
 * The chat part of an editor window with the Sessions view. Created as the window starts, before its grid, which then has a
 * place for the chat part. What the chat part shows is created once a chat opens in it, or as the window restores the
 * chat part shown, after the window restored its editors.
 */
export class AgentsChatPartContribution extends Disposable {

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@ILifecycleService lifecycleService: ILifecycleService,
		@IChatWidgetService chatWidgetService: IChatWidgetService,
		@IAgentsViewFolderLocationService folderLocationService: IAgentsViewFolderLocationService,
	) {
		super();

		// It replaces the Chat view: what would show the Chat view shows the chat part instead. The delegate, with the chat part
		// and the sessions it shows, is created as the first request comes, not as the window starts
		const delegate = new Lazy(() => instantiationService.createInstance(AgentsChatViewHostDelegate));
		this._register(chatWidgetService.setChatViewHostDelegate({
			reveal: preserveFocus => delegate.value.reveal(preserveFocus),
			openSession: (sessionResource, preserveFocus) => delegate.value.openSession(sessionResource, preserveFocus),
			toggle: () => delegate.value.toggle(),
			newSession: (sessionType, preserveFocus) => delegate.value.newSession(sessionType, preserveFocus),
		}));

		// The part, before the workbench creates its grid: reading it creates the delayed frame
		instantiationService.invokeFunction(accessor => accessor.get(IAgentsChatPartFrame).part);

		this._register(registerAgentsChatPartActions());

		// The Changes editor that the pills of the chats open in the editor area, as the Agents window registers it
		this._register(Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
			EditorPaneDescriptor.create(SessionChangesEditor, SessionChangesEditor.ID, localize('sessionChangesEditor.label', "Changes")),
			[new SyncDescriptor(SessionChangesEditorInput)]
		));
		this._register(Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(SessionChangesEditorInput.ID, SessionChangesEditorSerializer));
		// Its diffs, also of a Changes editor that the window restores
		this._register(instantiationService.createInstance(ChangesMultiDiffSourceResolver));

		const visible = AgentsChatPartVisibleContext.bindTo(contextKeyService);
		this._register(layoutService.onDidChangePartVisibility(({ partId }) => {
			if (partId === Parts.CHAT_PART) {
				visible.set(layoutService.isVisible(Parts.CHAT_PART));
			}
		}));

		void lifecycleService.when(LifecyclePhase.Restored).then(() => {
			if (this._store.isDisposed) {
				return;
			}
			const restored = restoreAgentsChatPart(layoutService, contextKeyService, () => instantiationService.invokeFunction(accessor => accessor.get(IAgentsChatPartService)));
			visible.set(layoutService.isVisible(Parts.CHAT_PART));
			// Its folder location provider, and the return from a session's location as AI features are disabled
			folderLocationService.start();
			return restored;
		}).catch(onUnexpectedError);
	}
}
