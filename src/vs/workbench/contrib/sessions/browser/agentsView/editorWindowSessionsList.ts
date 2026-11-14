/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler } from '../../../../../base/common/async.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableFromEvent } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { SyncDescriptor } from '../../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { Extensions as ViewExtensions, IViewContainerDescriptor, IViewDescriptor, IViewsRegistry, ViewContainerLocation, WindowEnablement } from '../../../../common/views.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { IPaneCompositePartService } from '../../../../services/panecomposite/browser/panecomposite.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { CHAT_OPEN_ACTION_ID } from '../../../chat/browser/actions/chatActions.js';
import { ChatViewOpenKeybindings } from '../../../chat/browser/chat.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { registerSessionsListConfiguration } from '../sessionsConfiguration.js';
import { SessionsGrouping } from '../views/sessionsList.js';
import { registerSessionsListActions, registerSessionsListReadStateMenus, SessionsArchiveActionsContribution } from '../views/sessionsListActions.js';
import { EditorWindowSessionsContext, ISessionsViewOptions, SessionsView, SessionsViewId } from '../views/sessionsView.js';
import { AGENTS_VIEW_SETUP_VIEW_ID, AgentsViewAvailable, AgentsViewNeedsSetup, AgentsViewWhen } from './agentsView.js';
import { AgentsViewSetupPane } from './agentsViewSetupPane.js';

/** The editor window's Sessions view groups only by time, environment or worktree, by time until one is chosen. */
export const EDITOR_WINDOW_SESSIONS_GROUPINGS = { offered: [SessionsGrouping.Date, SessionsGrouping.Environment, SessionsGrouping.Worktree], default: SessionsGrouping.Date };

const SESSIONS_VIEW_TITLE = localize('editorWindowSessionsList.title', "Sessions");

/** The services of the Sessions view, which its constructor takes after its options. */
type SessionsViewServices = ConstructorParameters<typeof SessionsView> extends [ISessionsViewOptions, ...infer Services] ? Services : never;

/**
 * Where the Sessions view shows its header, with Refresh, Find, Filter and the other actions: in the title of the view
 * (`title`, as the Agents view does), or as a "Sessions" section header inside the view (`section`, as the Chat view does).
 */
export type EditorWindowSessionsHeader = 'title' | 'section';

/**
 * The options of the Sessions view in an editor window, wherever it shows: the actions of its header in its title or in its
 * section header (`header`), without the customizations, listing the sessions of the window's folders only while it has some (`scoped`), and grouped as
 * {@link EDITOR_WINDOW_SESSIONS_GROUPINGS} says, with the "Chats" section also under time grouping.
 */
export function createEditorWindowSessionsViewOptions(options: IViewletViewOptions, scoped: IObservable<boolean>, header: EditorWindowSessionsHeader = 'title'): IViewletViewOptions & ISessionsViewOptions {
	return { ...options, headerInTitle: header === 'title', showCustomizations: false, scoped, groupings: EDITOR_WINDOW_SESSIONS_GROUPINGS, quickChatsInTimeGrouping: true };
}

/** The Sessions view of an editor window, with {@link createEditorWindowSessionsViewOptions}. */
export function createEditorWindowSessionsView(scoped: IObservable<boolean>, header: EditorWindowSessionsHeader = 'title'): typeof SessionsView {
	return class EditorWindowSessionsView extends SessionsView {
		constructor(options: IViewletViewOptions, ...services: SessionsViewServices) {
			super(createEditorWindowSessionsViewOptions(options, scoped, header), ...services);
		}
	};
}

/** Whether the window has folders, whose sessions the providers then list only; not in an empty window. */
export function createEditorWindowSessionsScope(owner: object, workspaceContextService: IWorkspaceContextService): IObservable<boolean> {
	return observableFromEvent(owner, workspaceContextService.onDidChangeWorkspaceFolders, () => workspaceContextService.getWorkspace().folders.length > 0);
}

/**
 * Registers the Sessions view in `container`, and beside it the view that shows how to sign in or set up chat while it needs
 * that, which the Chat view offered before the Sessions view replaced it.
 */
export function registerEditorWindowSessionsViews(container: IViewContainerDescriptor, scoped: IObservable<boolean>, header: EditorWindowSessionsHeader = 'title'): IDisposable {
	const store = new DisposableStore();
	const viewsRegistry = Registry.as<IViewsRegistry>(ViewExtensions.ViewsRegistry);
	const common = {
		name: container.title,
		containerIcon: container.icon,
		containerTitle: container.title.value,
		singleViewPaneContainerTitle: SESSIONS_VIEW_TITLE,
		canToggleVisibility: false,
		canMoveView: false,
		windowEnablement: WindowEnablement.Editor,
	};
	const views: IViewDescriptor[] = [
		{ ...common, id: SessionsViewId, ctorDescriptor: new SyncDescriptor(createEditorWindowSessionsView(scoped, header)), when: AgentsViewWhen },
		{ ...common, id: AGENTS_VIEW_SETUP_VIEW_ID, ctorDescriptor: new SyncDescriptor(AgentsViewSetupPane), when: ContextKeyExpr.and(AgentsViewAvailable, AgentsViewNeedsSetup) },
	];
	viewsRegistry.registerViews(views, container);
	store.add(toDisposable(() => viewsRegistry.deregisterViews(views, container)));
	store.add(viewsRegistry.registerViewWelcomeContent(AGENTS_VIEW_SETUP_VIEW_ID, {
		content: localize('editorWindowSessionsList.setup', "Sign in to see your agent sessions and start new ones.\n[Sign In](command:workbench.action.chat.triggerSetup)"),
	}));
	return store;
}

/**
 * Registers the settings of the sessions list, marks the window as showing it ({@link EditorWindowSessionsContext}), and registers its actions and those of the sessions it shows once the Sessions view or the
 * chat part first shows. `registerMore` registers the actions of the chat part, which this does not know.
 * `viewId` is the view whose first show registers them: the Sessions view, or the view that embeds it, such as the Chat view.
 */
export function registerEditorWindowSessionsList(instantiationService: IInstantiationService, registerMore: () => IDisposable, viewId: string = SessionsViewId): IDisposable {
	const store = new DisposableStore();
	const contextKeyService = instantiationService.invokeFunction(accessor => accessor.get(IContextKeyService));
	EditorWindowSessionsContext.bindTo(contextKeyService).set(true);
	store.add(toDisposable(() => EditorWindowSessionsContext.bindTo(contextKeyService).reset()));
	store.add(registerSessionsListConfiguration());
	store.add(registerOnFirstShown(instantiationService, viewId, () => {
		store.add(registerSessionsListActions());
		store.add(registerSessionsListReadStateMenus());
		store.add(registerMore());
		store.add(instantiationService.createInstance(SessionsArchiveActionsContribution));
	}));
	return store;
}

/** Runs `register` once, as the view of `viewId` or the chat part, which shows sessions too, first shows. */
function registerOnFirstShown(instantiationService: IInstantiationService, viewId: string, register: () => void): IDisposable {
	const { viewsService, layoutService, lifecycleService } = instantiationService.invokeFunction(accessor => ({
		viewsService: accessor.get(IViewsService),
		layoutService: accessor.get(IWorkbenchLayoutService),
		lifecycleService: accessor.get(ILifecycleService),
	}));
	const firstShown = new DisposableStore();
	const shown = () => {
		if (!firstShown.isDisposed) {
			firstShown.dispose();
			register();
		}
	};
	firstShown.add(viewsService.onDidChangeViewVisibility(e => {
		if (e.id === viewId && e.visible) {
			shown();
		}
	}));
	firstShown.add(layoutService.onDidChangePartVisibility(e => {
		if (e.partId === Parts.CHAT_PART && e.visible) {
			shown();
		}
	}));
	// Either restores shown with the window, without a change of its visibility
	void lifecycleService.when(LifecyclePhase.Restored).then(() => {
		if (viewsService.isViewVisible(viewId) || layoutService.isVisible(Parts.CHAT_PART)) {
			shown();
		}
	});
	return firstShown;
}

/**
 * The chat part replaces the Chat view: the Chat view does not show (`ChatContextKeys.agentsViewActive`) where the Sessions
 * view or its sign-in view can show ({@link AgentsViewAvailable}), so that no state hides it without a replacement; the keys
 * that open it open the chat part; and the Secondary Side Bar, which shows the Chat view by default, does not show empty.
 */
export function registerEditorWindowChatViewReplacement(instantiationService: IInstantiationService): IDisposable {
	const store = new DisposableStore();
	const { contextKeyService, layoutService, paneCompositeService, lifecycleService, extensionService } = instantiationService.invokeFunction(accessor => ({
		contextKeyService: accessor.get(IContextKeyService),
		layoutService: accessor.get(IWorkbenchLayoutService),
		paneCompositeService: accessor.get(IPaneCompositePartService),
		lifecycleService: accessor.get(ILifecycleService),
		extensionService: accessor.get(IExtensionService),
	}));

	const active = ChatContextKeys.agentsViewActive.bindTo(contextKeyService);
	const keys = new Set(AgentsViewAvailable.keys());
	const update = () => active.set(contextKeyService.contextMatchesRules(AgentsViewAvailable));
	update();
	store.add(contextKeyService.onDidChangeContext(e => {
		if (e.affectsSome(keys)) {
			update();
		}
	}));
	store.add(toDisposable(() => active.reset()));

	store.add(KeybindingsRegistry.registerKeybindingRule({
		...ChatViewOpenKeybindings,
		id: CHAT_OPEN_ACTION_ID,
		// Over the Chat view's own; not while chat is hidden or disabled, such as with AI features off
		weight: KeybindingWeight.WorkbenchContrib + 1,
		when: ContextKeyExpr.and(ChatContextKeys.agentsViewActive, AgentsViewAvailable),
	}));

	// The Secondary Side Bar shows the Chat view by default: without it, it can have nothing to show, then it does not show,
	// also as it shows again, such as by its toggle. Its view containers are known once extensions registered theirs, which
	// the bar of its containers waits for to hide the empty ones, as the Chat view's: it checks once the bar did.
	const hideEmptyAuxiliaryBar = store.add(new RunOnceScheduler(() => {
		if (layoutService.isVisible(Parts.AUXILIARYBAR_PART) && !paneCompositeService.getVisiblePaneCompositeIds(ViewContainerLocation.AuxiliaryBar).length) {
			layoutService.setPartHidden(true, Parts.AUXILIARYBAR_PART);
		}
	}, 0));
	void Promise.all([lifecycleService.when(LifecyclePhase.Restored), extensionService.whenInstalledExtensionsRegistered()]).then(() => {
		if (store.isDisposed) {
			return;
		}
		hideEmptyAuxiliaryBar.schedule();
		store.add(layoutService.onDidChangePartVisibility(e => {
			if (e.partId === Parts.AUXILIARYBAR_PART && e.visible) {
				hideEmptyAuxiliaryBar.schedule();
			}
		}));
		store.add(paneCompositeService.onDidPaneCompositeClose(e => {
			if (e.viewContainerLocation === ViewContainerLocation.AuxiliaryBar) {
				hideEmptyAuxiliaryBar.schedule();
			}
		}));
	});
	return store;
}
