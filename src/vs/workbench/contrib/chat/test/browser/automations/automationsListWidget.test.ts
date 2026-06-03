/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IConfirmation, IConfirmationResult, IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../platform/hover/test/browser/nullHoverService.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { IWorkspaceContextService, IWorkspace } from '../../../../../../platform/workspace/common/workspace.js';
import { AutomationsListWidget } from '../../../browser/aiCustomization/automationsListWidget.js';
import { AutomationService } from '../../../browser/automations/automationService.js';
import { IAutomation, IAutomationSchedule, AutomationRunTrigger } from '../../../common/automations/automation.js';
import { IAutomationRunner } from '../../../common/automations/automationRunner.js';
import { IAutomationService } from '../../../common/automations/automationService.js';

function hourly(): IAutomationSchedule {
	return { interval: 'hourly', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
}

class RecordingRunner extends mock<IAutomationRunner>() {
	readonly calls: { automationId: string; trigger: AutomationRunTrigger }[] = [];

	override async runOnce(
		automation: IAutomation,
		trigger: AutomationRunTrigger,
		_leaderWindowId: number,
		_token?: CancellationToken,
	): Promise<void> {
		this.calls.push({ automationId: automation.id, trigger });
	}
}

class FakeDialogService extends mock<IDialogService>() {
	confirmResult = true;
	readonly confirmations: IConfirmation[] = [];

	override async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
		this.confirmations.push(confirmation);
		return { confirmed: this.confirmResult };
	}

	override async error(): Promise<void> { /* no-op */ }
}

class FakeWorkspaceContextService extends mock<IWorkspaceContextService>() {
	override getWorkspace(): IWorkspace {
		return upcastPartial<IWorkspace>({ folders: [] });
	}
}

suite('AutomationsListWidget', () => {

	const teardown = ensureNoDisposablesAreLeakedInTestSuite();

	function setup() {
		const storage = teardown.add(new InMemoryStorageService());
		const log = new NullLogService();
		const service = teardown.add(new AutomationService(storage, log));
		const runner = new RecordingRunner();
		const dialog = new FakeDialogService();

		const instantiation = teardown.add(new TestInstantiationService());
		instantiation.stub(IAutomationService, service);
		instantiation.stub(IAutomationRunner, runner);
		instantiation.stub(IDialogService, dialog);
		instantiation.stub(IHoverService, NullHoverService);
		instantiation.stub(IWorkspaceContextService, new FakeWorkspaceContextService());
		instantiation.stub(IKeybindingService, upcastPartial<IKeybindingService>({}));
		instantiation.stub(ILayoutService, upcastPartial<ILayoutService>({ activeContainer: document.createElement('div') }));
		instantiation.stub(IHostService, upcastPartial<IHostService>({}));
		instantiation.stub(ILogService, log);

		const widget = teardown.add(instantiation.createInstance(AutomationsListWidget));
		return { widget, service, runner, dialog };
	}

	test('renders empty state when there are no automations', () => {
		const { widget } = setup();
		const empty = widget.element.querySelector('.automations-empty-state');
		assert.ok(empty, 'expected empty-state element to be present');
		const rows = widget.element.querySelectorAll('.automations-row');
		assert.strictEqual(rows.length, 0);
	});

	test('renders one row per automation', async () => {
		const { widget, service } = setup();
		await service.createAutomation({ name: 'First', prompt: 'p1', schedule: hourly() });
		await service.createAutomation({ name: 'Second', prompt: 'p2', schedule: hourly() });

		const rows = widget.element.querySelectorAll('.automations-row');
		assert.strictEqual(rows.length, 2);

		const names = Array.from(widget.element.querySelectorAll('.automations-row-name'))
			.map(el => el.textContent?.replace(/Disabled$/, '').trim())
			.sort();
		assert.deepStrictEqual(names, ['First', 'Second']);
	});

	test('shows a "Disabled" badge on disabled rows', async () => {
		const { widget, service } = setup();
		await service.createAutomation({ name: 'D', prompt: 'p', schedule: hourly(), enabled: false });

		const badge = widget.element.querySelector('.automations-row-disabled-badge');
		assert.ok(badge, 'expected disabled badge');
		assert.match(badge.textContent ?? '', /Disabled/);
	});

	test('Run now button invokes the runner with trigger=manual', async () => {
		const { widget, service, runner } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly() });

		const button = widget.element.querySelector('.automations-row .automations-row-action-button') as HTMLButtonElement;
		button.click();
		// Let the microtask queue drain.
		await Promise.resolve();
		await Promise.resolve();

		assert.strictEqual(runner.calls.length, 1);
		assert.strictEqual(runner.calls[0].automationId, a.id);
		assert.strictEqual(runner.calls[0].trigger, 'manual');
	});

	test('toggle button flips enabled state', async () => {
		const { widget, service } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), enabled: true });

		// Buttons are ordered: Run Now, Toggle, Edit, Delete.
		const buttons = widget.element.querySelectorAll('.automations-row .automations-row-action-button');
		const toggleButton = buttons[1] as HTMLButtonElement;
		toggleButton.click();
		await Promise.resolve();
		await Promise.resolve();

		const updated = service.getAutomation(a.id);
		assert.ok(updated);
		assert.strictEqual(updated.enabled, false);
	});

	test('delete button only deletes when confirmation is confirmed', async () => {
		const { widget, service, dialog } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly() });

		dialog.confirmResult = false;
		const deleteButton = widget.element.querySelectorAll('.automations-row .automations-row-action-button')[3] as HTMLButtonElement;
		deleteButton.click();
		await Promise.resolve();
		await Promise.resolve();

		assert.strictEqual(dialog.confirmations.length, 1);
		assert.ok(service.getAutomation(a.id), 'expected automation to still exist after declined delete');
	});

	test('delete button removes the automation when confirmation is accepted', async () => {
		const { widget, service, dialog } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly() });

		dialog.confirmResult = true;
		const deleteButton = widget.element.querySelectorAll('.automations-row .automations-row-action-button')[3] as HTMLButtonElement;
		deleteButton.click();
		await Promise.resolve();
		await Promise.resolve();
		// Wait for the async updateAutomations propagation.
		await new Promise(r => setTimeout(r, 0));

		assert.strictEqual(service.getAutomation(a.id), undefined);
		const rows = widget.element.querySelectorAll('.automations-row');
		assert.strictEqual(rows.length, 0);
	});

	test('fires onDidChangeItemCount when automations change', async () => {
		const { widget, service } = setup();
		const seen: number[] = [];
		teardown.add(widget.onDidChangeItemCount(c => seen.push(c)));

		await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly() });
		await service.createAutomation({ name: 'B', prompt: 'p', schedule: hourly() });

		assert.ok(seen.length >= 2, `expected at least 2 emissions, got ${seen.length}`);
		assert.strictEqual(seen[seen.length - 1], 2);
	});

	test('fireItemCount reflects current service size', async () => {
		const { widget, service } = setup();
		await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly() });

		let captured = -1;
		teardown.add(widget.onDidChangeItemCount(c => { captured = c; }));
		widget.fireItemCount();

		assert.strictEqual(captured, 1);
	});
});

// Placeholder reference to avoid unused-import lint on Emitter if our
// fakes evolve away from it.
void Emitter;
