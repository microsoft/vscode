/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { GitRefType } from '../../../../../../workbench/contrib/git/common/gitService.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession, ISessionsManagementService } from '../../../../../services/sessions/common/sessionsManagement.js';
import { CopilotChatSessionsProvider } from '../../browser/copilotChatSessionsProvider.js';
import { IsolationMode, IsolationPicker } from '../../browser/isolationPicker.js';

function getCheckbox(container: HTMLElement): HTMLElement {
	const checkbox = container.querySelector<HTMLElement>('.monaco-checkbox');
	assert.ok(checkbox, 'expected a worktree checkbox to be rendered');
	return checkbox;
}

function createPicker(
	disposables: DisposableStore,
	mode: IsolationMode,
	setModeCalls: IsolationMode[],
): IsolationPicker {
	const instantiationService = disposables.add(new TestInstantiationService());
	const activeSession = {
		providerId: 'default-copilot',
		sessionId: 'session-id',
		loading: observableValue('loading', false),
	} as unknown as IActiveSession;
	const isolationMode = observableValue<IsolationMode | undefined>('isolationMode', mode);
	const gitState = observableValue('gitState', {
		HEAD: { type: GitRefType.Head, name: 'main', commit: 'abc123' },
		remotes: [],
		mergeChanges: [],
		indexChanges: [],
		workingTreeChanges: [],
		untrackedChanges: [],
	});
	const provider = Object.assign(Object.create(CopilotChatSessionsProvider.prototype), {
		getSession: () => ({
			gitRepository: { state: gitState },
			isolationMode,
			setIsolationMode: (next: IsolationMode) => {
				setModeCalls.push(next);
				isolationMode.set(next, undefined);
			},
		}),
	});

	instantiationService.stub(IConfigurationService, new TestConfigurationService());
	const sessionObs = observableValue<IActiveSession | undefined>('activeSession', activeSession);
	instantiationService.stub(ISessionsManagementService, {
		activeSession: sessionObs,
	} as unknown as ISessionsManagementService);
	instantiationService.stub(ISessionsProvidersService, {
		onDidChangeProviders: Event.None,
		getProviders: () => [],
		getProvider: () => provider,
	} as unknown as ISessionsProvidersService);
	instantiationService.stub(ITelemetryService, NullTelemetryService);
	instantiationService.stub(IContextKeyService, new MockContextKeyService());

	return disposables.add(instantiationService.createInstance(IsolationPicker, sessionObs));
}

suite('IsolationPicker', () => {
	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('checkbox unchecked when workspace isolation is selected', () => {
		const picker = createPicker(disposables, 'workspace', []);
		const container = document.createElement('div');
		picker.render(container);

		assert.strictEqual(getCheckbox(container).getAttribute('aria-checked'), 'false');
	});

	test('checkbox checked when worktree isolation is selected', () => {
		const picker = createPicker(disposables, 'worktree', []);
		const container = document.createElement('div');
		picker.render(container);

		assert.strictEqual(getCheckbox(container).getAttribute('aria-checked'), 'true');
	});

	test('toggling the checkbox updates the session isolation mode', () => {
		const setModeCalls: IsolationMode[] = [];
		const picker = createPicker(disposables, 'worktree', setModeCalls);
		const container = document.createElement('div');
		picker.render(container);

		getCheckbox(container).click();

		assert.deepStrictEqual(setModeCalls, ['workspace']);
		assert.strictEqual(getCheckbox(container).getAttribute('aria-checked'), 'false');
	});

	test('keeps the same checkbox element across toggles', () => {
		const picker = createPicker(disposables, 'worktree', []);
		const container = document.createElement('div');
		picker.render(container);

		const before = getCheckbox(container);
		before.click();

		assert.strictEqual(getCheckbox(container), before, 'checkbox element should be reused so focus is preserved');
	});
});
