/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { IObservable, observableFromEvent } from '../../../../../base/common/observable.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ViewPaneContainer } from '../../../../browser/parts/views/viewPaneContainer.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { Extensions as ViewExtensions, IViewContainersRegistry, ViewContainerLocation, WindowEnablement } from '../../../../common/views.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IEditorWindowChatPartService } from './agentsChatPartContribution.js';
import { IEditorWindowSessionsRuntime } from '../editorWindow/editorWindowSessionsRuntime.js';
import { registerSessionsListAccessibilityHelp } from '../views/sessionsListActions.js';
import { SessionsViewAccessibilityHelp } from './sessionsViewAccessibilityHelp.js';
import { AccessibleViewRegistry } from '../../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ChatConfiguration } from '../../../chat/common/constants.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { AgentsViewAvailable } from './agentsChatPartContext.js';
import { registerAgentsViewNewSessionActions } from './agentsChatPartActions.js';
import { AGENTS_VIEW_CONTAINER_ID } from './agentsView.js';
import { SessionsViewId } from '../views/sessionsView.js';
import { createEditorWindowSessionsScope, registerEditorWindowChatViewReplacement, registerEditorWindowSessionsList, registerEditorWindowSessionsViews } from './editorWindowSessionsList.js';

const AGENTS_VIEW_TITLE = localize2('agentsView.title', "Sessions");

/**
 * Shows the Sessions view of the Agents window in an editor window while {@link ChatConfiguration.SessionsViewEnabled} is on.
 * The setting is read once, as the window starts: with it off, this registers nothing and creates no service.
 */
export class AgentsViewGate extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.agentsViewGate';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		if (configurationService.getValue<boolean>(ChatConfiguration.SessionsViewEnabled) !== true) {
			return;
		}

		// Accessibility help, as the window starts: help registered once the view shows would not be installed anymore
		this._register(registerSessionsListAccessibilityHelp());
		this._register(AccessibleViewRegistry.register(new SessionsViewAccessibilityHelp()));
		const scoped = instantiationService.invokeFunction(accessor => createEditorWindowSessionsScope(this, accessor.get(IWorkspaceContextService)));
		this.registerView(scoped);
		this._register(registerEditorWindowSessionsList(instantiationService, registerAgentsViewNewSessionActions));

		instantiationService.invokeFunction(accessor => {
			// The sessions it lists are known while it or the chat part shows
			this._register(accessor.get(IEditorWindowSessionsRuntime).enable({ viewIds: [SessionsViewId] }));
			// The chat part, where sessions open: not in remote windows, where the Sessions view does not show
			if (!accessor.get(IWorkbenchEnvironmentService).remoteAuthority) {
				// The chat part docks beside the Sessions view, wherever the user puts it, over a dock of other features. Its chats
				// open in it while chat shows, as the Sessions view does: not with AI features off, which closes it until they are on
				this._register(accessor.get(IEditorWindowChatPartService).enable({ anchorViewId: SessionsViewId, anchorPriority: 2, enabled: this.whileChatShows(accessor.get(IContextKeyService)) }));
				this._register(registerEditorWindowChatViewReplacement(instantiationService));
			}
		});
	}

	/** Whether chat shows in the window, as the Sessions view does (`AgentsViewAvailable`): with AI features on, as they change. */
	private whileChatShows(contextKeyService: IContextKeyService): IObservable<boolean> {
		const shows = ContextKeyExpr.and(ChatContextKeys.enabled, AgentsViewAvailable)!;
		const keys = new Set(shows.keys());
		return observableFromEvent(this, Event.filter(contextKeyService.onDidChangeContext, e => e.affectsSome(keys)), () => contextKeyService.contextMatchesRules(shows));
	}

	private registerView(scoped: IObservable<boolean>): void {
		const viewContainersRegistry = Registry.as<IViewContainersRegistry>(ViewExtensions.ViewContainersRegistry);
		const container = viewContainersRegistry.registerViewContainer({
			id: AGENTS_VIEW_CONTAINER_ID,
			title: AGENTS_VIEW_TITLE,
			icon: Codicon.agent,
			// Before the Explorer, until the user moves it: the activity bar keeps where it is from then on
			order: -1,
			// Its title shows the actions of the sessions header
			ctorDescriptor: new SyncDescriptor(ViewPaneContainer, [AGENTS_VIEW_CONTAINER_ID, { mergeViewWithContainerWhenSingleView: true }]),
			storageId: AGENTS_VIEW_CONTAINER_ID,
			hideIfEmpty: true,
			windowEnablement: WindowEnablement.Editor,
		}, ViewContainerLocation.Sidebar);
		this._register(registerEditorWindowSessionsViews(container, scoped));
		// Last, as its views go first: the container is gone before they deregister otherwise, which then skips their cleanup
		this._register(toDisposable(() => viewContainersRegistry.deregisterViewContainer(container)));
	}
}
