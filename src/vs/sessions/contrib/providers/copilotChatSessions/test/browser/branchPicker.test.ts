/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
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
import { GitRefType, IGitRepository } from '../../../../../../workbench/contrib/git/common/gitService.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { BranchPicker } from '../../browser/branchPicker.js';
import { CopilotChatSessionsProvider, ICopilotChatSession, IsolationMode } from '../../browser/copilotChatSessionsProvider.js';

class RecordingActionWidgetService extends mock<IActionWidgetService>() {
	override isVisible = false;
	labels: readonly string[] = [];
	private selectItem: ((label: string) => void) | undefined;
	private hideWidget: (() => void) | undefined;

	override show<T>(_user: string, _supportsPreview: boolean, items: readonly IActionListItem<T>[], delegate: IActionListDelegate<T>): void {
		this.isVisible = true;
		this.labels = items.map(item => item.label ?? '');
		this.selectItem = label => {
			const item = items.find(candidate => candidate.label === label)?.item;
			if (item) {
				delegate.onSelect(item);
			}
		};
		this.hideWidget = delegate.onHide;
	}

	override updateItems<T>(items: readonly IActionListItem<T>[]): void {
		this.labels = items.map(item => item.label ?? '');
	}

	override focusItemById(): void { }

	override hide(): void {
		if (!this.isVisible) {
			return;
		}
		this.isVisible = false;
		const onHide = this.hideWidget;
		this.hideWidget = undefined;
		onHide?.();
	}

	select(label: string): void {
		this.selectItem?.(label);
	}
}

class TestSessionsProvidersService extends mock<ISessionsProvidersService>() {
	override readonly onDidChangeProviders = Event.None;

	constructor(private readonly provider: ISessionsProvider) {
		super();
	}

	override getProvider<T extends ISessionsProvider>(): T | undefined {
		return this.provider as T;
	}
}

suite('Copilot BranchPicker', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createPicker(options: {
		branches?: readonly string[];
		branch?: string;
		isolationMode?: IsolationMode;
		gitRepository?: IGitRepository | undefined;
		setModeCalls?: IsolationMode[];
	} = {}) {
		const branch = observableValue<string | undefined>('branch', options.branch ?? 'main');
		const branches = observableValue<readonly string[]>('branches', options.branches ?? ['main']);
		const isolationMode = observableValue<IsolationMode | undefined>('isolationMode', options.isolationMode ?? 'worktree');
		const setModeCalls = options.setModeCalls ?? [];
		const gitState = observableValue('gitState', {
			HEAD: { type: GitRefType.Head, name: 'main', commit: 'abc123' },
			remotes: [],
			mergeChanges: [],
			indexChanges: [],
			workingTreeChanges: [],
			untrackedChanges: [],
		});
		const providerSession = upcastPartial<ICopilotChatSession>({
			loading: observableValue('loading', false),
			branch,
			branches,
			isolationMode,
			gitRepository: options.gitRepository !== undefined ? options.gitRepository : upcastPartial<IGitRepository>({ state: gitState }),
			setBranch: (value: string) => branch.set(value, undefined),
			setIsolationMode: (mode: IsolationMode) => {
				setModeCalls.push(mode);
				isolationMode.set(mode, undefined);
			},
		});
		const provider = Object.assign(Object.create(CopilotChatSessionsProvider.prototype), {
			getSession: () => providerSession,
		});
		const actionWidgetService = new RecordingActionWidgetService();
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IActionWidgetService, actionWidgetService);
		instantiationService.stub(IConfigurationService, new TestConfigurationService());
		instantiationService.stub(IContextKeyService, new MockContextKeyService());
		instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService(provider));
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', upcastPartial<IActiveSession>({
			providerId: 'default-copilot',
			sessionId: 'session',
			loading: observableValue('loading', false),
		}));
		const picker = disposables.add(instantiationService.createInstance(BranchPicker, activeSession));
		const container = document.createElement('div');
		picker.render(container);
		return { picker, container, actionWidgetService, branch, isolationMode, setModeCalls };
	}

	test('adapts the active Copilot session to the shared branch picker', () => {
		const { container, actionWidgetService, branch } = createPicker({
			branches: ['feature/shared', 'main'],
		});
		const trigger = container.querySelector<HTMLElement>('a.action-label');
		assert.ok(trigger);

		trigger.click();
		actionWidgetService.select('feature/shared');

		assert.deepStrictEqual({
			labels: actionWidgetService.labels,
			selectedBranch: branch.get(),
			triggerLabel: trigger.querySelector('.sessions-chat-dropdown-label')?.textContent,
			expanded: trigger.getAttribute('aria-expanded'),
		}, {
			labels: ['feature/shared', 'main'],
			selectedBranch: 'feature/shared',
			triggerLabel: 'feature/shared',
			expanded: 'false',
		});
	});

	test('isolation checkbox is checked when worktree mode is active', () => {
		const { container } = createPicker({ isolationMode: 'worktree' });
		const checkbox = container.querySelector<HTMLElement>('.sessions-chat-isolation-checkbox .monaco-checkbox');
		assert.ok(checkbox);
		assert.strictEqual(checkbox.getAttribute('aria-checked'), 'true');
	});

	test('isolation checkbox is unchecked when workspace mode is active', () => {
		const { container } = createPicker({ isolationMode: 'workspace' });
		const checkbox = container.querySelector<HTMLElement>('.sessions-chat-isolation-checkbox .monaco-checkbox');
		assert.ok(checkbox);
		assert.strictEqual(checkbox.getAttribute('aria-checked'), 'false');
	});

	test('toggling the checkbox updates the session isolation mode', () => {
		const { container, setModeCalls } = createPicker({ isolationMode: 'worktree' });
		const checkbox = container.querySelector<HTMLElement>('.sessions-chat-isolation-checkbox .monaco-checkbox');
		assert.ok(checkbox);

		checkbox.click();

		assert.deepStrictEqual(setModeCalls, ['workspace']);
	});

	test('checkbox element is stable across toggles (focus preserved)', () => {
		const { container } = createPicker({ isolationMode: 'worktree' });
		const before = container.querySelector<HTMLElement>('.sessions-chat-isolation-checkbox .monaco-checkbox');
		assert.ok(before);

		before.click();

		const after = container.querySelector<HTMLElement>('.sessions-chat-isolation-checkbox .monaco-checkbox');
		assert.strictEqual(after, before);
	});
});
