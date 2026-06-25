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
import { NullTelemetryService } from '../../../../../../platform/telemetry/common/telemetryUtils.js';
import { IConfirmation, IConfirmationResult, IDialogService, IFileDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IHoverService } from '../../../../../../platform/hover/browser/hover.js';
import { NullHoverService } from '../../../../../../platform/hover/test/browser/nullHoverService.js';
import { IKeybindingService } from '../../../../../../platform/keybinding/common/keybinding.js';
import { IContextKeyService } from '../../../../../../platform/contextkey/common/contextkey.js';
import { MockContextKeyService } from '../../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { IListService, ListService } from '../../../../../../platform/list/browser/listService.js';
import { ILayoutService } from '../../../../../../platform/layout/browser/layoutService.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IHostService } from '../../../../../services/host/browser/host.js';
import { IWorkspaceContextService, IWorkspace, IWorkspaceFolder, IWorkspaceFoldersChangeEvent } from '../../../../../../platform/workspace/common/workspace.js';
import { AutomationsListWidget } from '../../../browser/aiCustomization/automationsListWidget.js';
import { AutomationService } from '../../../browser/automations/automationService.js';
import { IAutomation, IAutomationSchedule, AutomationRunTrigger } from '../../../common/automations/automation.js';
import { IAutomationRunner } from '../../../common/automations/automationRunner.js';
import { IAutomationService } from '../../../common/automations/automationService.js';
import { IAutomationSessionTypeProvider, PlaceholderAutomationSessionTypeProvider } from '../../../common/automations/automationSessionTypes.js';

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

	override async info(): Promise<void> { /* no-op */ }
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
		const service = teardown.add(new AutomationService(storage, log, NullTelemetryService));
		const runner = new RecordingRunner();
		const dialog = new FakeDialogService();

		const instantiation = teardown.add(new TestInstantiationService());
		instantiation.stub(IAutomationService, service);
		instantiation.stub(IAutomationRunner, runner);
		instantiation.stub(IDialogService, dialog);
		instantiation.stub(IFileDialogService, upcastPartial<IFileDialogService>({ showOpenDialog: async () => undefined }));
		instantiation.stub(IAutomationSessionTypeProvider, new PlaceholderAutomationSessionTypeProvider());
		instantiation.stub(IHoverService, NullHoverService);
		const workspace = new FakeWorkspaceContextService();
		teardown.add({ dispose: () => workspace.dispose() });
		instantiation.stub(IWorkspaceContextService, workspace);
		instantiation.stub(IKeybindingService, upcastPartial<IKeybindingService>({}));
		instantiation.stub(IContextKeyService, new MockContextKeyService());
		instantiation.stub(IListService, teardown.add(new ListService()));
		instantiation.stub(ILayoutService, upcastPartial<ILayoutService>({ activeContainer: document.createElement('div') }));
		instantiation.stub(IHostService, upcastPartial<IHostService>({}));
		instantiation.stub(ILogService, log);
		instantiation.stub(IQuickInputService, upcastPartial<IQuickInputService>({ pick: async () => undefined }));
		// Enable the Automations feature so mutation handlers don't
		// short-circuit with the "feature disabled" toast. The runtime
		// gating is exercised in a dedicated test below.
		const configService = new TestConfigurationService({ chat: { automations: { enabled: true } } });
		instantiation.stub(IConfigurationService, configService);

		const widget = teardown.add(instantiation.createInstance(AutomationsListWidget));
		return { widget, service, runner, dialog, workspace, configService };
	}

	test('renders empty state when there are no automations', () => {
		const { widget } = setup();
		const empty = widget.element.querySelector('.automations-empty-state');
		assert.ok(empty, 'expected empty-state element to be present');
		const rows = widget.element.querySelectorAll('.automations-row');
		assert.strictEqual(rows.length, 0);
	});

	// The Automations list is a virtualized WorkbenchList, which does not lay
	// out rows in a unit-test DOM (no height). Mirroring the sibling
	// aiCustomizationListWidget test, these cases assert the widget's public
	// API and view-model (via getDisplayEntriesForTest / itemCount) rather than
	// querying or clicking virtualized row elements.

	test('exposes one display entry per automation', async () => {
		const { widget, service } = setup();
		await service.createAutomation({ name: 'First', prompt: 'p1', schedule: hourly(), folderUri: FOLDER });
		await service.createAutomation({ name: 'Second', prompt: 'p2', schedule: hourly(), folderUri: FOLDER });

		assert.strictEqual(widget.itemCount, 2);

		const entries = widget.getDisplayEntriesForTest();
		assert.strictEqual(entries.length, 2);
		const names = entries.map(e => e.automation.name).sort();
		assert.deepStrictEqual(names, ['First', 'Second']);
	});

	test('disabled automations surface in the view-model as not enabled', async () => {
		const { widget, service } = setup();
		await service.createAutomation({ name: 'D', prompt: 'p', schedule: hourly(), folderUri: FOLDER, enabled: false });

		const entries = widget.getDisplayEntriesForTest();
		assert.strictEqual(entries.length, 1);
		assert.strictEqual(entries[0].automation.enabled, false, 'disabled badge is rendered from this flag');
	});

	test('runNow invokes the runner with trigger=manual', async () => {
		const { widget, service, runner } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });

		await widget.runNow(a);

		assert.strictEqual(runner.calls.length, 1);
		assert.strictEqual(runner.calls[0].automationId, a.id);
		assert.strictEqual(runner.calls[0].trigger, 'manual');
	});

	test('mutating actions short-circuit when chat.automations.enabled is off', async () => {
		const { widget, service, runner, configService, dialog } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER, enabled: true });

		// Flip the setting off, then drive each mutating action through the
		// public API. None of them should reach the service / runner.
		configService.setUserConfiguration('chat.automations.enabled', false);
		dialog.confirmResult = true;

		await widget.runNow(a);
		await widget.toggleEnabled(a);
		await widget.deleteAutomation(a);

		assert.strictEqual(runner.calls.length, 0, 'runNow must not call the runner when disabled');
		const reloaded = service.getAutomation(a.id);
		assert.ok(reloaded, 'automation must not be deleted');
		assert.strictEqual(reloaded?.enabled, true, 'toggle must not mutate enabled flag');
	});

	test('toggleEnabled flips the enabled state', async () => {
		const { widget, service } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER, enabled: true });

		await widget.toggleEnabled(a);

		const updated = service.getAutomation(a.id);
		assert.ok(updated);
		assert.strictEqual(updated.enabled, false);
	});

	test('deleteAutomation only deletes when the confirmation is accepted', async () => {
		const { widget, service, dialog } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });

		dialog.confirmResult = false;
		await widget.deleteAutomation(a);

		assert.strictEqual(dialog.confirmations.length, 1);
		assert.ok(service.getAutomation(a.id), 'expected automation to still exist after declined delete');
	});

	test('deleteAutomation removes the automation when the confirmation is accepted', async () => {
		const { widget, service, dialog } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });

		dialog.confirmResult = true;
		await widget.deleteAutomation(a);

		assert.strictEqual(service.getAutomation(a.id), undefined);
		assert.strictEqual(widget.itemCount, 0);
		assert.strictEqual(widget.getDisplayEntriesForTest().length, 0);
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

	test('history is collapsed by default and toggleExpanded flips the row expansion', async () => {
		const { widget, service } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });

		assert.strictEqual(widget.getDisplayEntriesForTest()[0].expanded, false);

		widget.toggleExpanded(a.id);
		assert.strictEqual(widget.getDisplayEntriesForTest()[0].expanded, true);

		// Collapse again.
		widget.toggleExpanded(a.id);
		assert.strictEqual(widget.getDisplayEntriesForTest()[0].expanded, false);
	});

	test('expanded row exposes no runs when there are none', async () => {
		const { widget, service } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });

		widget.toggleExpanded(a.id);

		const entry = widget.getDisplayEntriesForTest()[0];
		assert.strictEqual(entry.expanded, true);
		assert.strictEqual(entry.runs.length, 0, 'history empty-state is rendered from an empty runs list');
	});

	test('expanded row exposes runs newest-first with status and error message', async () => {
		const { widget, service } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });

		// Record three runs in different states.
		const r1 = await service.recordRunStart(a.id, 'schedule', 1);
		await service.updateRun(r1.id, { status: 'completed', completedAt: new Date().toISOString() });

		const r2 = await service.recordRunStart(a.id, 'manual', 1);
		await service.updateRun(r2.id, { status: 'failed', errorMessage: 'boom', completedAt: new Date().toISOString() });

		await service.recordRunStart(a.id, 'catch_up', 1);

		widget.toggleExpanded(a.id);

		const runs = widget.getDisplayEntriesForTest()[0].runs;
		assert.strictEqual(runs.length, 3);

		// Newest-first: catch_up pending, manual failed, schedule completed.
		const statuses = runs.map(r => r.status);
		assert.deepStrictEqual(statuses, ['pending', 'failed', 'completed']);

		const triggers = runs.map(r => r.trigger);
		assert.deepStrictEqual(triggers, ['catch_up', 'manual', 'schedule']);

		// The failed run surfaces the error message.
		const failed = runs.find(r => r.status === 'failed');
		assert.strictEqual(failed?.errorMessage, 'boom');
	});

	test('expanded row re-derives its runs when a run is added', async () => {
		const { widget, service } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), folderUri: FOLDER });

		widget.toggleExpanded(a.id);
		assert.strictEqual(widget.getDisplayEntriesForTest()[0].runs.length, 0);

		await service.recordRunStart(a.id, 'schedule', 1);
		await Promise.resolve();

		const entry = widget.getDisplayEntriesForTest()[0];
		assert.strictEqual(entry.expanded, true);
		assert.strictEqual(entry.runs.length, 1);
	});
});
