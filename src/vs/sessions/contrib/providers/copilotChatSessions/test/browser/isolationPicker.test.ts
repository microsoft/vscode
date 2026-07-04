/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IActionWidgetService } from '../../../../../../platform/actionWidget/browser/actionWidget.js';
import { IActionListDelegate, IActionListItem } from '../../../../../../platform/actionWidget/browser/actionList.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { GitRefType } from '../../../../../../workbench/contrib/git/common/gitService.js';
import { ICommandService } from '../../../../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { IActiveSession, ISessionsManagementService } from '../../../../../services/sessions/common/sessionsManagement.js';
import { CopilotChatSessionsProvider } from '../../browser/copilotChatSessionsProvider.js';
import { IsolationMode, IsolationPicker } from '../../browser/isolationPicker.js';

interface IIsolationActionItem {
	readonly mode: IsolationMode;
	readonly checked?: boolean;
}

function showPicker(container: HTMLElement): void {
	const trigger = container.querySelector<HTMLElement>('a.action-label');
	assert.ok(trigger);
	trigger.click();
}

function createPicker(
	disposables: DisposableStore,
	mode: IsolationMode,
	actionWidgetItems: IActionListItem<IIsolationActionItem>[],
	hasGitRepo = true,
	spies?: { dialogCalls: unknown[]; commandCalls: unknown[]; delegate?: IActionListDelegate<IIsolationActionItem> }
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
			gitRepository: hasGitRepo ? { state: gitState } : undefined,
			isolationMode,
			setIsolationMode: (mode: IsolationMode) => {
				isolationMode.set(mode, undefined);
			},
		}),
	});

	instantiationService.stub(IActionWidgetService, {
		isVisible: false,
		hide: () => { },
		show: <T>(_id: string, _supportsPreview: boolean, items: IActionListItem<T>[], delegate?: IActionListDelegate<T>) => {
			actionWidgetItems.splice(0, actionWidgetItems.length, ...(items as IActionListItem<IIsolationActionItem>[]));
			if (spies) {
				spies.delegate = delegate as unknown as IActionListDelegate<IIsolationActionItem>;
			}
		},
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

	instantiationService.stub(IDialogService, {
		confirm: async (args: unknown) => {
			spies?.dialogCalls.push(args);
			return { confirmed: true };
		},
	} as unknown as IDialogService);
	instantiationService.stub(ICommandService, {
		executeCommand: async (id: string, ...args: unknown[]) => {
			spies?.commandCalls.push({ id, args });
		},
	} as unknown as ICommandService);

	return disposables.add(instantiationService.createInstance(IsolationPicker, sessionObs));
}

suite('IsolationPicker', () => {
	const disposables = new DisposableStore();

	teardown(() => {
		disposables.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('marks folder as checked when workspace isolation is selected', () => {
		const actionWidgetItems: IActionListItem<IIsolationActionItem>[] = [];
		const picker = createPicker(disposables, 'workspace', actionWidgetItems);
		const container = document.createElement('div');
		picker.render(container);
		showPicker(container);

		assert.deepStrictEqual(
			actionWidgetItems.map(item => ({ label: item.label, checked: item.item?.checked })),
			[
				{ label: 'Worktree', checked: undefined },
				{ label: 'Folder', checked: true },
			],
		);
	});

	test('marks worktree as checked when worktree isolation is selected', () => {
		const actionWidgetItems: IActionListItem<IIsolationActionItem>[] = [];
		const picker = createPicker(disposables, 'worktree', actionWidgetItems);
		const container = document.createElement('div');
		picker.render(container);
		showPicker(container);

		assert.deepStrictEqual(
			actionWidgetItems.map(item => ({ label: item.label, checked: item.item?.checked })),
			[
				{ label: 'Worktree', checked: true },
				{ label: 'Folder', checked: undefined },
			],
		);
	});

	test('shows both options when there is no Git repository, with detail text on Worktree', () => {
		const actionWidgetItems: IActionListItem<IIsolationActionItem>[] = [];
		const picker = createPicker(disposables, 'workspace', actionWidgetItems, false);
		const container = document.createElement('div');
		picker.render(container);
		showPicker(container);

		assert.deepStrictEqual(
			actionWidgetItems.map(item => ({ label: item.label, checked: item.item?.checked, detail: item.detail })),
			[
				{ label: 'Worktree', checked: undefined, detail: 'Requires an initialized Git repository. Select to initialize Git.' },
				{ label: 'Folder', checked: true, detail: undefined },
			],
		);
	});

	test('selecting Worktree when there is no Git repository prompts to initialize Git', async () => {
		const actionWidgetItems: IActionListItem<IIsolationActionItem>[] = [];
		const spies = { dialogCalls: [] as unknown[], commandCalls: [] as unknown[], delegate: undefined as IActionListDelegate<IIsolationActionItem> | undefined };
		const picker = createPicker(disposables, 'workspace', actionWidgetItems, false, spies);
		const container = document.createElement('div');
		picker.render(container);
		showPicker(container);

		assert.ok(spies.delegate);
		await spies.delegate.onSelect({ mode: 'worktree' });

		assert.strictEqual(spies.dialogCalls.length, 1);
		const dialogCall = spies.dialogCalls[0] as { message?: string };
		assert.strictEqual(dialogCall?.message, 'Git Repository Required');
		assert.strictEqual(spies.commandCalls.length, 1);
		const commandCall = spies.commandCalls[0] as { id?: string };
		assert.strictEqual(commandCall?.id, 'git.init');
	});
});
