/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, NotificationsFilter, Severity } from '../../../../../../platform/notification/common/notification.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { ICodexContinuationService } from '../../../../../services/agentHost/browser/codexContinuationService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IWorkbenchLayoutService, Parts } from '../../../../../services/layout/browser/layoutService.js';
import { IViewsService } from '../../../../../services/views/common/viewsService.js';
import { ChatViewId, IChatWidgetService } from '../../chat.js';
import { ChatViewPane } from '../../widgetHosts/viewPane/chatViewPane.js';
import { CODEX_CONTINUATION_DISABLE_LABEL, CODEX_CONTINUATION_LABEL, CODEX_CONTINUATION_MESSAGE, CodexContinuationGuide, ICodexContinuationNavigation } from './codexContinuationGuide.js';
import { CodexContinuationPresenter } from './codexContinuationPresenter.js';

class CodexContinuationContribution extends Disposable {
	static readonly ID = 'workbench.contrib.codexContinuation';
	constructor(
		@IWorkbenchEnvironmentService environment: IWorkbenchEnvironmentService,
		@IInstantiationService instantiation: IInstantiationService,
		@INotificationService notifications: INotificationService,
		@IChatWidgetService widgets: IChatWidgetService,
		@ICodexContinuationService nudge: ICodexContinuationService,
		@IViewsService views: IViewsService,
	) {
		super();
		if (environment.isSessionsWindow) { return; }
		const guide = this._register(instantiation.createInstance(CodexContinuationGuide));
		const navigation: ICodexContinuationNavigation = {
			getActiveWidget: () => widgets.lastFocusedWidget,
			revealSession: async (resource, token) => {
				if (token.isCancellationRequested) { return undefined; }
				const view = await views.openView<ChatViewPane>(ChatViewId, true);
				if (!view?.agentSessionsControl || token.isCancellationRequested) { return undefined; }
				const list = view.agentSessionsControl;
				const revealStore = new DisposableStore();
				revealStore.add(view.revealSessionsList());
				try {
					const reveal = await list.revealSession(resource, token);
					if (!reveal) { revealStore.dispose(); return undefined; }
					revealStore.add(reveal);
					if (token.isCancellationRequested) { revealStore.dispose(); return undefined; }
					return {
						onDidOpen: list.onDidOpenSession,
						getElement: () => list.getSessionElement(resource),
						open: async token => !token.isCancellationRequested && !!await widgets.openSession(resource),
						focus: () => list.focus(),
						dispose: () => revealStore.dispose(),
					};
				} catch (error) { revealStore.dispose(); throw error; }
			},
		};
		const active = () => nudge.setActiveSession(widgets.lastFocusedWidget?.viewModel?.sessionResource);
		this._register(widgets.onDidChangeFocusedSession(active));
		active();
		this._register(instantiation.createInstance(CodexContinuationPresenter, {
			surface: 'editorWindow',
			onDidChangePresentability: notifications.onDidChangeFilter,
			isPresentable: () => notifications.getFilter() === NotificationsFilter.OFF,
			show: (candidate, visible, close, runAction) => {
				const store = new DisposableStore();
				let programmaticClose = false;
				const handle = notifications.prompt(Severity.Info, CODEX_CONTINUATION_MESSAGE, [
					{ label: CODEX_CONTINUATION_LABEL, keepOpen: true, run: () => runAction(() => guide.run(candidate, 'editorWindow', navigation)) },
					{ label: CODEX_CONTINUATION_DISABLE_LABEL, keepOpen: true, run: () => runAction(() => nudge.disable('editorWindow')) },
				]);
				store.add(handle.onDidChangeVisibility(shown => { if (shown) { visible(); } }));
				store.add(handle.onDidClose(() => {
					if (!programmaticClose) { close('dismissed'); }
				}));
				store.add(toDisposable(() => {
					programmaticClose = true;
					handle.close();
				}));
				if (handle.visible) { visible(); }
				return store;
			},
		}));
	}
}
registerWorkbenchContribution2(CodexContinuationContribution.ID, CodexContinuationContribution, WorkbenchPhase.AfterRestored);

// Private commands are manually bindable, but are not offered in the Command
// Palette or the Keyboard Shortcuts editor's unbound-command list.
CommandsRegistry.registerCommand('_chat.showCodexContinuation', async accessor => {
	const nudge = accessor.get(ICodexContinuationService);
	const notifications = accessor.get(INotificationService);
	if (accessor.get(IWorkbenchEnvironmentService).isSessionsWindow) {
		accessor.get(IWorkbenchLayoutService).setPartHidden(false, Parts.SIDEBAR_PART);
	}
	if (!await nudge.showPreview()) {
		notifications.info(localize('codexContinuation.previewUnavailable', "To preview the suggestion, open a Codex conversation that uses ChatGPT and has a matching model available through GitHub Copilot."));
	}
});
