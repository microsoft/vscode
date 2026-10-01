/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWindow, runAtThisOrScheduleAtNextAnimationFrame } from '../../../../../base/browser/dom.js';
import { Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun } from '../../../../../base/common/observable.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IChatWidgetService } from '../../../../../workbench/contrib/chat/browser/chat.js';
import { CODEX_CONTINUATION_DISABLE_LABEL, CODEX_CONTINUATION_LABEL, CODEX_CONTINUATION_MESSAGE, CodexContinuationGuide, ICodexContinuationNavigation } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/codexContinuationGuide.js';
import { CodexContinuationPresenter } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/codexContinuationPresenter.js';
import { findOnboardingTarget } from '../../../../../workbench/contrib/onboarding/browser/spotlight/onboardingTarget.js';
import { ICodexContinuationService } from '../../../../../workbench/services/agentHost/browser/codexContinuationService.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { ISessionsListNoticeHost, registerSessionsListNotice, SessionsListNotice } from '../../../sessions/browser/views/sessionsListNotice.js';

class CodexContinuationNotice extends Disposable {
	constructor(
		host: ISessionsListNoticeHost,
		@IInstantiationService instantiation: IInstantiationService,
		@ICodexContinuationService nudge: ICodexContinuationService,
		@ISessionsService sessions: ISessionsService,
		@IChatWidgetService widgets: IChatWidgetService,
	) {
		super();
		const guide = this._register(instantiation.createInstance(CodexContinuationGuide));
		const navigation: ICodexContinuationNavigation = {
			getActiveWidget: () => {
				const active = sessions.activeSession.get();
				return active && active.activeChat.get()?.resource.toString() === active.resource.toString()
					? widgets.getWidgetBySessionResource(active.resource) : undefined;
			},
			revealSession: async (resource, token) => {
				if (token.isCancellationRequested || !host.isVisible()) { return undefined; }
				const reveal = host.revealSession(resource);
				return {
					onDidOpen: host.onDidOpenSession,
					getElement: () => findOnboardingTarget(getWindow(host.container), reveal.targetId),
					open: token => reveal.open(token),
					focus: host.focusSessionsList,
					dispose: () => reveal.dispose(),
				};
			},
		};
		this._register(autorun(reader => nudge.setActiveSession(sessions.activeSession.read(reader)?.resource)));
		this._register(instantiation.createInstance(CodexContinuationPresenter, {
			surface: 'agentsWindow',
			onDidChangePresentability: Event.map(host.onDidChangeVisibility, () => undefined),
			isPresentable: () => host.isVisible() && host.container.isConnected && host.container.getClientRects().length > 0,
			show: (candidate, visible, close) => {
				const store = new DisposableStore();
				const notice = store.add(instantiation.createInstance(SessionsListNotice, {
					description: CODEX_CONTINUATION_MESSAGE, label: CODEX_CONTINUATION_LABEL, disableLabel: CODEX_CONTINUATION_DISABLE_LABEL,
					focusSessionsList: host.focusSessionsList,
					dismiss: () => close('dismissed'),
					disable: () => {
						close('action');
						void nudge.disable('agentsWindow');
					},
					run: () => {
						close('action');
						void guide.run(candidate, 'agentsWindow', navigation);
					},
				}));
				host.container.appendChild(notice.domNode);
				store.add(toDisposable(() => notice.domNode.remove()));
				store.add(runAtThisOrScheduleAtNextAnimationFrame(notice.domNode.ownerDocument.defaultView!, async () => {
					if (host.isVisible() && notice.domNode.getClientRects().length > 0) {
						if (await visible() && !store.isDisposed) { host.announce(CODEX_CONTINUATION_MESSAGE); }
					}
				}));
				return store;
			},
		}));
	}
}
registerSessionsListNotice((instantiation, host) => instantiation.createInstance(CodexContinuationNotice, host));
