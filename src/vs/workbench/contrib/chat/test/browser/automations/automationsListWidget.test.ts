/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { InMemoryStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IConfirmation, IConfirmationResult, IDialogService, IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../platform/hover/test/browser/nullHoverService.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { IWorkspaceContextService, IWorkspace, IWorkspaceFolder, IWorkspaceFoldersChangeEvent } from '../../../../../../platform/workspace/common/workspace.js';
import { AutomationsListWidget } from '../../../browser/aiCustomization/automationsListWidget.js';
import { AutomationService } from '../../../browser/automations/automationService.js';
import { IAutomation, IAutomationSchedule, AutomationRunTrigger } from '../../../common/automations/automation.js';
import { IAutomationRunner } from '../../../common/automations/automationRunner.js';
import { IAutomationService } from '../../../common/automations/automationService.js';

const FOLDER = URI.parse('file:///workspace');

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

	private readonly _onDidChangeWorkspaceFolders = new Emitter<IWorkspaceFoldersChangeEvent>();
	override readonly onDidChangeWorkspaceFolders: Event<IWorkspaceFoldersChangeEvent> = this._onDidChangeWorkspaceFolders.event;

	private _folders: IWorkspaceFolder[];

	constructor(folders: readonly URI[] = [FOLDER]) {
		super();
		this._folders = folders.map((uri, i) => upcastPartial<IWorkspaceFolder>({ uri, name: `folder-${i}`, index: i }));
	}

	override getWorkspace(): IWorkspace {
		return upcastPartial<IWorkspace>({ folders: this._folders });
	}

	setFolders(uris: readonly URI[]): void {
		this._folders = uris.map((uri, i) => upcastPartial<IWorkspaceFolder>({ uri, name: `folder-${i}`, index: i }));
		this._onDidChangeWorkspaceFolders.fire({ added: [], removed: [], changed: [] });
	}

	dispose(): void {
		this._onDidChangeWorkspaceFolders.dispose();
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
		instantiation.stub(IFileDialogService, upcastPartial<IFileDialogService>({ showOpenDialog: async () => undefined }));
		instantiation.stub(IHoverService, NullHoverService);
		const workspace = new FakeWorkspaceContextService();
		teardown.add({ dispose: () => workspace.dispose() });
		instantiation.stub(IWorkspaceContextService, workspace);
		instantiation.stub(IKeybindingService, upcastPartial<IKeybindingService>({}));
		instantiation.stub(ILayoutService, upcastPartial<ILayoutService>({ activeContainer: document.createElement('div') }));
		instantiation.stub(IHostService, upcastPartial<IHostService>({}));
		instantiation.stub(ILogService, log);

		const widget = teardown.add(instantiation.createInstance(AutomationsListWidget));
		return { widget, service, runner, dialog, workspace };
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
		await service.createAutomation({ name: 'First', prompt: 'p1', schedule: hourly(), folderUri: FOLDER });
		await service.createAutomation({ name: 'Second', prompt: 'p2', schedule: hourly(), folderUri: FOLDER });

		const rows = widget.element.querySelectorAll('.automations-row');
		assert.strictEqual(rows.length, 2);

		const names = Array.from(widget.element.querySelectorAll('.automations-row-name'))
			.map(el => el.textContent?.replace(/Disabled$/, '').trim())
			.sort();
		assert.deepStrictEqual(names, ['First', 'Second']);
	});

	test('shows a "Disabled" badge on disabled rows', async () => {
		const { widget, service } = setup();
		await service.createAutomation({ name: 'D', prompt: 'p', schedule: hourly(), folderUri: FOLDER, enabled: false });

		const badge = widget.element.querySelector('.automations-row-disabled-badge');
		assert.ok(badge, 'expected disabled badge');
		assert.match(badge.textContent ?? '', /Disabled/);
	});

	test('Run now button invokes the runner with trigger=manual', async () => {
		const { widget, service, runner } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });

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
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER, enabled: true });

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
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });

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
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });

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

		await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });
		await service.createAutomation({ name: 'B', prompt: 'p', schedule: hourly(), folderUri: FOLDER });

		assert.ok(seen.length >= 2, `expected at least 2 emissions, got ${seen.length}`);
		assert.strictEqual(seen[seen.length - 1], 2);
	});

	test('fireItemCount reflects current service size', async () => {
		const { widget, service } = setup();
		await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });

		let captured = -1;
		teardown.add(widget.onDidChangeItemCount(c => { captured = c; }));
		widget.fireItemCount();

		assert.strictEqual(captured, 1);
	});

	test('history panel is hidden by default and toggled by the history button', async () => {
		const { widget, service } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });

		assert.strictEqual(widget.element.querySelectorAll('.automations-row-history').length, 0);

		// Buttons: Run, Toggle, Edit, Delete, History (5th).
		const buttons = widget.element.querySelectorAll('.automations-row .automations-row-action-button');
		const historyButton = buttons[4] as HTMLButtonElement;
		assert.strictEqual(historyButton.getAttribute('aria-expanded'), 'false');

		historyButton.click();
		await Promise.resolve();
		await Promise.resolve();

		const panels = widget.element.querySelectorAll('.automations-row-history');
		assert.strictEqual(panels.length, 1);
		assert.strictEqual(panels[0].getAttribute('id'), `automation-history-${a.id}`);

		// Re-collect buttons after re-render.
		const buttonsAfter = widget.element.querySelectorAll('.automations-row .automations-row-action-button');
		assert.strictEqual((buttonsAfter[4] as HTMLButtonElement).getAttribute('aria-expanded'), 'true');

		// Collapse again.
		(buttonsAfter[4] as HTMLButtonElement).click();
		await Promise.resolve();
		await Promise.resolve();
		assert.strictEqual(widget.element.querySelectorAll('.automations-row-history').length, 0);
	});

	test('history panel renders empty-state when there are no runs', async () => {
		const { widget, service } = setup();
		await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });

		const historyButton = widget.element.querySelectorAll('.automations-row .automations-row-action-button')[4] as HTMLButtonElement;
		historyButton.click();
		await Promise.resolve();
		await Promise.resolve();

		const empty = widget.element.querySelector('.automations-history-empty');
		assert.ok(empty, 'expected history empty-state');
		assert.match(empty.textContent ?? '', /No runs yet/);
	});

	test('history panel renders run rows with status and trigger', async () => {
		const { widget, service } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });

		// Record three runs in different states.
		const r1 = await service.recordRunStart(a.id, 'schedule', 1);
		await service.updateRun(r1.id, { status: 'completed', completedAt: new Date().toISOString() });

		const r2 = await service.recordRunStart(a.id, 'manual', 1);
		await service.updateRun(r2.id, { status: 'failed', errorMessage: 'boom', completedAt: new Date().toISOString() });

		await service.recordRunStart(a.id, 'catch_up', 1);

		const historyButton = widget.element.querySelectorAll('.automations-row .automations-row-action-button')[4] as HTMLButtonElement;
		historyButton.click();
		await Promise.resolve();
		await Promise.resolve();

		const rows = widget.element.querySelectorAll('.automations-history-row');
		assert.strictEqual(rows.length, 3);

		// Newest-first: catch_up pending, manual failed, schedule completed.
		const statuses = Array.from(rows).map(r => r.getAttribute('data-run-status'));
		assert.deepStrictEqual(statuses, ['pending', 'failed', 'completed']);

		// The failed row surfaces the error message.
		const err = widget.element.querySelector('.automations-history-row-error');
		assert.ok(err, 'expected error message in failed-run row');
		assert.strictEqual(err.textContent, 'boom');
	});

	test('history panel re-renders when run state changes after a run is added', async () => {
		const { widget, service } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });

		const historyButton = widget.element.querySelectorAll('.automations-row .automations-row-action-button')[4] as HTMLButtonElement;
		historyButton.click();
		await Promise.resolve();
		await Promise.resolve();
		assert.strictEqual(widget.element.querySelectorAll('.automations-history-row').length, 0);

		await service.recordRunStart(a.id, 'schedule', 1);
		await Promise.resolve();
		await Promise.resolve();

		assert.strictEqual(widget.element.querySelectorAll('.automations-history-row').length, 1);
	});
});

// Placeholder reference to avoid unused-import lint on Emitter if our
// fakes evolve away from it.
void Emitter;
