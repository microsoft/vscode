/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { INotificationService, NotificationsFilter, Severity } from '../../../../../../platform/notification/common/notification.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../../common/contributions.js';
import { ICodexContinuationService } from '../../../../../services/agentHost/browser/codexContinuationService.js';
import { IWorkbenchEnvironmentService } from '../../../../../services/environment/common/environmentService.js';
import { IChatWidgetService } from '../../chat.js';
import { CODEX_CONTINUATION_DISABLE_LABEL, CODEX_CONTINUATION_LABEL, CODEX_CONTINUATION_MESSAGE, CodexContinuationGuide } from './codexContinuationGuide.js';
import { CodexContinuationPresenter } from './codexContinuationPresenter.js';

class CodexContinuationContribution extends Disposable {
	static readonly ID = 'workbench.contrib.codexContinuation';
	constructor(
		@IWorkbenchEnvironmentService environment: IWorkbenchEnvironmentService,
		@IInstantiationService instantiation: IInstantiationService,
		@INotificationService notifications: INotificationService,
		@IChatWidgetService widgets: IChatWidgetService,
		@ICodexContinuationService nudge: ICodexContinuationService,
	) {
		super();
		if (environment.isSessionsWindow) { return; }
		const guide = this._register(instantiation.createInstance(CodexContinuationGuide));
		const active = () => nudge.setActiveSession(widgets.lastFocusedWidget?.viewModel?.sessionResource);
		this._register(widgets.onDidChangeFocusedSession(active));
		active();
		this._register(instantiation.createInstance(CodexContinuationPresenter, {
			surface: 'editorWindow',
			onDidChangePresentability: notifications.onDidChangeFilter,
			isPresentable: () => notifications.getFilter() === NotificationsFilter.OFF,
			show: (candidate, visible, close) => {
				const store = new DisposableStore();
				let programmaticClose = false;
				let actionTaken = false;
				let closed = false;
				const closeOnce = (reason: 'action' | 'dismissed') => {
					if (!closed) {
						closed = true;
						close(reason);
					}
				};
				const runAction = <T>(action: () => T): T => {
					actionTaken = true;
					closeOnce('action');
					return action();
				};
				const handle = notifications.prompt(Severity.Info, CODEX_CONTINUATION_MESSAGE, [
					{ label: CODEX_CONTINUATION_LABEL, run: () => runAction(() => guide.run(candidate, 'editorWindow', resource => widgets.openSession(resource))) },
					{ label: CODEX_CONTINUATION_DISABLE_LABEL, run: () => runAction(() => nudge.disable('editorWindow')) },
				]);
				store.add(handle.onDidChangeVisibility(shown => { if (shown) { visible(); } }));
				store.add(handle.onDidClose(() => {
					if (!programmaticClose) { closeOnce(actionTaken ? 'action' : 'dismissed'); }
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
