/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IActiveSession, ISessionsManagementService } from '../../../sessions/browser/sessionsManagementService.js';
import { ISessionType } from '../../../sessions/browser/sessionsProvider.js';
import { SessionStatus } from '../../../sessions/common/sessionData.js';
import { SessionTypePicker } from '../../browser/sessionTypePicker.js';

function createActiveSession(sessionType: string): IActiveSession {
	const chat = {
		resource: URI.parse(`test:///chat/${sessionType}`),
		createdAt: new Date(),
		title: constObservable('Chat'),
		updatedAt: constObservable(new Date()),
		status: constObservable(SessionStatus.Untitled),
		changes: constObservable([]),
		modelId: constObservable(undefined),
		mode: constObservable(undefined),
		isArchived: constObservable(false),
		isRead: constObservable(true),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
	};

	return {
		sessionId: `provider:${sessionType}`,
		resource: URI.parse(`test:///session/${sessionType}`),
		providerId: 'provider',
		sessionType,
		icon: Codicon.copilot,
		createdAt: new Date(),
		workspace: constObservable(undefined),
		title: constObservable('Session'),
		updatedAt: constObservable(new Date()),
		status: constObservable(SessionStatus.Untitled),
		changes: constObservable([]),
		modelId: constObservable(undefined),
		mode: constObservable(undefined),
		loading: constObservable(false),
		isArchived: constObservable(false),
		isRead: constObservable(true),
		description: constObservable(undefined),
		lastTurnEnd: constObservable(undefined),
		gitHubInfo: constObservable(undefined),
		chats: constObservable([chat]),
		mainChat: chat,
		activeChat: constObservable(chat),
	};
}

suite('SessionTypePicker', () => {

	const disposables = new DisposableStore();
	let sessionTypes: ISessionType[];
	let activeSession: ReturnType<typeof observableValue<IActiveSession | undefined>>;
	let instantiationService: TestInstantiationService;

	setup(() => {
		sessionTypes = [];
		activeSession = observableValue('activeSession', undefined);
		instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IActionWidgetService, { isVisible: false, hide: () => { }, show: () => { } });
		instantiationService.stub(ISessionsManagementService, {
			activeSession,
			getSessionTypes: () => sessionTypes,
			setSessionType: () => {
				throw new Error('Not implemented');
			},
		});
	});

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('hides the picker when only one session type is available', () => {
		sessionTypes = [{ id: 'copilotcli', label: 'Copilot CLI', icon: Codicon.copilot }];
		activeSession.set(createActiveSession('copilotcli'), undefined);

		const picker = disposables.add(instantiationService.createInstance(SessionTypePicker));
		const container = document.createElement('div');
		picker.render(container);

		const slot = container.querySelector<HTMLElement>('.sessions-chat-picker-slot');
		assert.ok(slot);
		assert.strictEqual(slot.style.display, 'none');
	});

	test('shows the picker when multiple session types are available', () => {
		sessionTypes = [
			{ id: 'copilotcli', label: 'Copilot CLI', icon: Codicon.copilot },
			{ id: 'copilot-cloud-agent', label: 'Cloud', icon: Codicon.cloud },
		];
		activeSession.set(createActiveSession('copilotcli'), undefined);

		const picker = disposables.add(instantiationService.createInstance(SessionTypePicker));
		const container = document.createElement('div');
		picker.render(container);

		const slot = container.querySelector<HTMLElement>('.sessions-chat-picker-slot');
		assert.ok(slot);
		assert.strictEqual(slot.style.display, '');
	});
});
