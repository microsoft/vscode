/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableFromEvent } from '../../../../../base/common/observable.js';
import { IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IViewletViewOptions } from '../../../../browser/parts/views/viewsViewlet.js';
import { IWorkbenchLayoutService, Parts } from '../../../../services/layout/browser/layoutService.js';
import { ILifecycleService, LifecyclePhase } from '../../../../services/lifecycle/common/lifecycle.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';
import { registerSessionsListConfiguration } from '../sessionsConfiguration.js';
import { SessionsGrouping } from '../views/sessionsList.js';
import { registerSessionsListActions, registerSessionsListReadStateMenus, SessionsArchiveActionsContribution } from '../views/sessionsListActions.js';
import { EditorWindowSessionsContext, ISessionsViewOptions, SessionsView } from '../views/sessionsView.js';

/** The editor window's Sessions view groups only by time, environment or worktree, by time until one is chosen. */
export const EDITOR_WINDOW_SESSIONS_GROUPINGS = { offered: [SessionsGrouping.Date, SessionsGrouping.Environment, SessionsGrouping.Worktree], default: SessionsGrouping.Date };

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
 * The sessions list of an editor window, which the Chat view shows: the window marked as showing it
 * ({@link EditorWindowSessionsContext}), the settings of the list, and, once the view of `viewId` or the chat part first shows,
 * the actions of the list and of the sessions it shows, and `registerMore` of the caller, such as the actions of the chat part,
 * which this does not know. `viewId` is the view whose first show registers them: the Sessions view, or the view that embeds
 * it, such as the Chat view. All is undone with this.
 */
export class EditorWindowSessionsList extends Disposable {

	constructor(
		registerMore: () => IDisposable,
		viewId: string,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IViewsService private readonly viewsService: IViewsService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@ILifecycleService private readonly lifecycleService: ILifecycleService,
	) {
		super();
		EditorWindowSessionsContext.bindTo(this.contextKeyService).set(true);
		this._register(toDisposable(() => EditorWindowSessionsContext.bindTo(this.contextKeyService).reset()));
		this._register(registerSessionsListConfiguration());
		this._register(this.registerOnFirstShown(viewId, () => {
			this._register(registerSessionsListActions());
			this._register(registerSessionsListReadStateMenus());
			this._register(this.instantiationService.createInstance(SessionsArchiveActionsContribution));
			this._register(registerMore());
		}));
	}

	/** Runs `register` once, as the view of `viewId` or the chat part, which shows sessions too, first shows. */
	private registerOnFirstShown(viewId: string, register: () => void): IDisposable {
		const firstShown = new DisposableStore();
		const shown = () => {
			if (!firstShown.isDisposed) {
				firstShown.dispose();
				register();
			}
		};
		firstShown.add(this.viewsService.onDidChangeViewVisibility(e => {
			if (e.id === viewId && e.visible) {
				shown();
			}
		}));
		firstShown.add(this.layoutService.onDidChangePartVisibility(e => {
			if (e.partId === Parts.CHAT_PART && e.visible) {
				shown();
			}
		}));
		// Either restores shown with the window, without a change of its visibility
		void this.lifecycleService.when(LifecyclePhase.Restored).then(() => {
			if (this.viewsService.isViewVisible(viewId) || this.layoutService.isVisible(Parts.CHAT_PART)) {
				shown();
			}
		});
		return firstShown;
	}
}
