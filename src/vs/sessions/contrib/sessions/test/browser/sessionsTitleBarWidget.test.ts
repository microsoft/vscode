/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { constObservable, IObservable } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { SubmenuItemAction } from '../../../../../platform/actions/common/actions.js';
import { ISessionWorkspace } from '../../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsService } from '../../../../services/sessions/browser/sessionsService.js';
import { SessionsTitleBarWidget } from '../../browser/sessionsTitleBarWidget.js';

suite('SessionsTitleBarWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('renders passive session identity', () => {
		const workspace = new class extends mock<ISessionWorkspace>() {
			override readonly label = 'vscode';
		}();
		const session = new class extends mock<IActiveSession>() {
			override readonly icon = Codicon.copilot;
			override readonly title = constObservable('Fix authentication redirect loop');
			override readonly workspace: IObservable<ISessionWorkspace | undefined> = constObservable(workspace);
			override readonly isQuickChat = constObservable(false);
			override readonly isCreated = constObservable(true);
		}();
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession: IObservable<IActiveSession | undefined> = constObservable(session);
		}();
		const action = new class extends mock<SubmenuItemAction>() {
			override readonly id = 'workbench.agentSessions.titlebar';
			override readonly label = 'Agent Sessions';
			override readonly tooltip = '';
			override readonly enabled = true;
			override async run(): Promise<void> { }
		}();
		const container = document.createElement('div');
		const widget = store.add(new SessionsTitleBarWidget(action, undefined, sessionsService));
		widget.render(container);

		assert.deepStrictEqual({
			title: container.querySelector('.agent-sessions-titlebar-title')?.textContent,
			workspace: container.querySelector('.agent-sessions-titlebar-workspace')?.textContent,
			role: container.getAttribute('role'),
			ariaLabel: container.getAttribute('aria-label'),
			tabIndex: container.tabIndex,
		}, {
			title: 'Fix authentication redirect loop',
			workspace: 'vscode',
			role: null,
			ariaLabel: null,
			tabIndex: -1,
		});
	});

	test('renders new session identity for a draft', () => {
		const session = new class extends mock<IActiveSession>() {
			override readonly icon = Codicon.copilot;
			override readonly title = constObservable('');
			override readonly workspace: IObservable<ISessionWorkspace | undefined> = constObservable(undefined);
			override readonly isQuickChat = constObservable(false);
			override readonly isCreated = constObservable(false);
		}();
		const sessionsService = new class extends mock<ISessionsService>() {
			override readonly activeSession: IObservable<IActiveSession | undefined> = constObservable(session);
		}();
		const action = new class extends mock<SubmenuItemAction>() {
			override readonly id = 'workbench.agentSessions.titlebar';
			override readonly label = 'Agent Sessions';
			override readonly tooltip = '';
			override readonly enabled = true;
			override async run(): Promise<void> { }
		}();
		const container = document.createElement('div');
		const widget = store.add(new SessionsTitleBarWidget(action, undefined, sessionsService));
		widget.render(container);

		assert.strictEqual(container.querySelector('.agent-sessions-titlebar-title')?.textContent, 'New session');
	});
});
