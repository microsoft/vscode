/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionListItem } from '../../../../../platform/actionWidget/browser/actionList.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession, ISessionsManagementService } from '../../../../services/sessions/common/sessionsManagement.js';
import { CopilotChatSessionsProvider, ICopilotChatSession } from '../../browser/copilotChatSessionsProvider.js';
import { ClaudePermissionModePicker } from '../../browser/claudePermissionModePicker.js';

interface IPermissionModeItem {
	readonly id: string;
	readonly label: string;
}

function showPicker(container: HTMLElement): void {
	const trigger = container.querySelector<HTMLElement>('a.action-label');
	assert.ok(trigger);
	trigger.click();
}

function createPicker(
	disposables: DisposableStore,
	opts?: {
		setOptionSpy?: (optionId: string, value: { id: string; name: string }) => void;
		hasActiveSession?: boolean;
	},
): { picker: ClaudePermissionModePicker; actionWidgetItems: IActionListItem<IPermissionModeItem>[]; onSelect: (item: IPermissionModeItem) => void } {
	const instantiationService = disposables.add(new TestInstantiationService());
	const actionWidgetItems: IActionListItem<IPermissionModeItem>[] = [];
	let capturedOnSelect: ((item: IPermissionModeItem) => void) | undefined;

	const setOptionSpy = opts?.setOptionSpy ?? (() => { });
	const hasActiveSession = opts?.hasActiveSession ?? true;

	const activeSession = hasActiveSession ? {
		providerId: 'default-copilot',
		sessionId: 'session-id',
		loading: observableValue('loading', false),
	} as unknown as IActiveSession : undefined;

	const mockSession: Partial<ICopilotChatSession> = {
		setOption: setOptionSpy as ICopilotChatSession['setOption'],
	};

	const provider = Object.assign(Object.create(CopilotChatSessionsProvider.prototype), {
		getSession: () => mockSession,
	});

	instantiationService.stub(IActionWidgetService, {
		isVisible: false,
		hide: () => { },
		show: <T>(_id: string, _supportsPreview: boolean, items: IActionListItem<T>[], delegate: { onSelect: (item: T) => void }) => {
			actionWidgetItems.splice(0, actionWidgetItems.length, ...(items as IActionListItem<IPermissionModeItem>[]));
			capturedOnSelect = delegate.onSelect as (item: IPermissionModeItem) => void;
		},
	});
	instantiationService.stub(ISessionsManagementService, {
		activeSession: observableValue<IActiveSession | undefined>('activeSession', activeSession),
	} as unknown as ISessionsManagementService);
	instantiationService.stub(ISessionsProvidersService, {
		onDidChangeProviders: Event.None,
		getProviders: () => [],
		getProvider: () => provider,
	} as unknown as ISessionsProvidersService);

	const picker = disposables.add(instantiationService.createInstance(ClaudePermissionModePicker));

	return {
		picker,
		actionWidgetItems,
		get onSelect() { return capturedOnSelect!; },
	};
}

suite('ClaudePermissionModePicker', () => {
	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('shows all three permission modes', () => {
		const { picker, actionWidgetItems } = createPicker(disposables);
		const container = document.createElement('div');
		picker.render(container);
		showPicker(container);

		assert.deepStrictEqual(
			actionWidgetItems.map(item => ({ id: item.item?.id, label: item.label })),
			[
				{ id: 'default', label: 'Ask Before Edits' },
				{ id: 'acceptEdits', label: 'Edit Automatically' },
				{ id: 'plan', label: 'Plan Mode' },
			],
		);
	});

	test('selecting a mode updates the trigger label', () => {
		const result = createPicker(disposables);
		const container = document.createElement('div');
		result.picker.render(container);
		showPicker(container);

		result.onSelect({ id: 'plan', label: 'Plan Mode' } as IPermissionModeItem);

		const labelSpan = container.querySelector<HTMLElement>('span.sessions-chat-dropdown-label');
		assert.ok(labelSpan);
		assert.strictEqual(labelSpan.textContent, 'Plan Mode');
	});

	test('selecting a mode calls setOption on the session', () => {
		const calls: { optionId: string; value: { id: string; name: string } }[] = [];
		const result = createPicker(disposables, {
			setOptionSpy: (optionId, value) => calls.push({ optionId, value }),
		});
		const container = document.createElement('div');
		result.picker.render(container);
		showPicker(container);

		result.onSelect({ id: 'default', label: 'Ask Before Edits' } as IPermissionModeItem);

		assert.deepStrictEqual(calls, [{
			optionId: 'permissionMode',
			value: { id: 'default', name: 'Ask Before Edits' },
		}]);
	});

	test('selecting a mode does not throw when no active session', () => {
		const result = createPicker(disposables, { hasActiveSession: false });
		const container = document.createElement('div');
		result.picker.render(container);
		showPicker(container);

		assert.doesNotThrow(() => result.onSelect({ id: 'plan', label: 'Plan Mode' } as IPermissionModeItem));
	});

	test('trigger has correct aria label', () => {
		const { picker } = createPicker(disposables);
		const container = document.createElement('div');
		picker.render(container);

		const trigger = container.querySelector<HTMLElement>('a.action-label');
		assert.ok(trigger);
		// Default mode is 'acceptEdits' → "Edit Automatically"
		assert.ok(trigger.ariaLabel?.includes('Edit Automatically'));
	});
});
