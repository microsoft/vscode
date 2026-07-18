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
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { IActiveSession } from '../../../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { BranchPicker } from '../../browser/branchPicker.js';
import { CopilotChatSessionsProvider, ICopilotChatSession } from '../../browser/copilotChatSessionsProvider.js';

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

	test('adapts the active Copilot session to the shared branch picker', () => {
		const branch = observableValue<string | undefined>('branch', 'main');
		const branches = observableValue<readonly string[]>('branches', ['feature/shared', 'main']);
		const isolationMode = observableValue<'workspace' | 'worktree' | undefined>('isolationMode', 'worktree');
		const providerSession = upcastPartial<ICopilotChatSession>({
			loading: observableValue('loading', false),
			branch,
			branches,
			isolationMode,
			setBranch: value => branch.set(value, undefined),
		});
		const provider = Object.assign(Object.create(CopilotChatSessionsProvider.prototype), {
			getSession: () => providerSession,
		});
		const actionWidgetService = new RecordingActionWidgetService();
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IActionWidgetService, actionWidgetService);
		instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService(provider));
		instantiationService.stub(ITelemetryService, NullTelemetryService);
		const activeSession = observableValue<IActiveSession | undefined>('activeSession', upcastPartial<IActiveSession>({
			providerId: 'default-copilot',
			sessionId: 'session',
		}));
		const picker = disposables.add(instantiationService.createInstance(BranchPicker, activeSession));
		const container = document.createElement('div');
		picker.render(container);
		const trigger = container.querySelector<HTMLElement>('.sessions-chat-picker-slot .action-label');
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
});
