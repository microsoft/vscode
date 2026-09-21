/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { mainWindow } from '../../../../../base/browser/window.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { INativeCliProxyModel } from '../../../../../platform/agentHost/common/nativeCliProxy.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { ISessionTerminalAuthentication, ISessionTerminalService, SessionTerminalService } from '../../../../services/terminal/browser/sessionTerminalService.js';
import { TerminalSessionAuthenticationWidget } from '../../browser/terminalSessionAuthenticationWidget.js';

suite('TerminalSessionAuthenticationWidget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('both account sources can start without a separate model selection', () => {
		let modelDiscoveries = 0;
		const source = observableValue<'native' | 'copilot'>('source', 'native');
		const model = observableValue<INativeCliProxyModel | undefined>('model', undefined);
		const authentication: ISessionTerminalAuthentication = {
			nativeLabel: 'Claude Account',
			source, model,
			setSource: value => source.set(value, undefined),
			setModel: value => model.set(value, undefined),
			getCopilotModels: async () => { modelDiscoveries++; return []; },
		};
		const registry = new SessionTerminalService();
		store.add(registry.registerSessionTerminal('test', {
			authentication,
			ensureAuthentication: () => authentication,
			instance: constObservable(undefined),
			isRunning: constObservable(false),
			isStarting: constObservable(false),
			error: constObservable(undefined),
			start: async () => { },
		}));
		const session = new class extends mock<ISession>() { override readonly sessionId = 'test'; }();
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(ISessionTerminalService, registry);
		instantiation.stub(INotificationService, new class extends mock<INotificationService>() { }());
		const widget = store.add(instantiation.createInstance(TerminalSessionAuthenticationWidget, constObservable(session)));
		mainWindow.document.body.appendChild(widget.element);
		store.add(toDisposable(() => widget.element.remove()));
		const radios = widget.element.querySelectorAll<HTMLElement>('[role="radio"]');
		const nativeReady = widget.ready.get();
		const initialSelection = [...radios].map(radio => radio.getAttribute('aria-checked'));
		radios[0].click();
		const copilot = { source: source.get(), ready: widget.ready.get() };
		radios[1].click();
		const nativeAfterSwitch = { source: source.get(), ready: widget.ready.get() };
		authentication.setSource('copilot');
		assert.deepStrictEqual({
			labels: [...radios].map(radio => radio.textContent),
			initialSelection,
			nativeReady, copilot, nativeAfterSwitch,
			ready: widget.ready.get(),
			radioChecked: radios[0].getAttribute('aria-checked'),
			billing: widget.element.textContent?.includes('usage limits'),
			nativeModelSelection: widget.element.textContent?.includes('/model'),
			model: model.get(), modelDiscoveries,
		}, {
			labels: ['GitHub Copilot', 'Claude Account'], initialSelection: ['false', 'true'],
			nativeReady: true, copilot: { source: 'copilot', ready: true }, nativeAfterSwitch: { source: 'native', ready: true },
			ready: true, radioChecked: 'true', billing: true, nativeModelSelection: true, model: undefined, modelDiscoveries: 0,
		});
	});
});
