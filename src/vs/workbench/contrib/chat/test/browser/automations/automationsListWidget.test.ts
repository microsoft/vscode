/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { setARIAContainer } from '../../../../../../base/browser/ui/aria/aria.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { derived, IObservable, observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
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
import { IAutomation, IAutomationRun, IAutomationSchedule, AutomationRunTrigger, AutomationTarget } from '../../../common/automations/automation.js';
import { IAutomationRunner, IAutomationRunOperation } from '../../../common/automations/automationRunner.js';
import { IAutomationService, ICreateAutomationOptions, IUpdateAutomationOptions, IUpdateAutomationRunOptions } from '../../../common/automations/automationService.js';
import { IAutomationDialogResult, IAutomationDialogService, IShowAutomationDialogOptions } from '../../../common/automations/automationDialogService.js';

const FOLDER = URI.parse('file:///workspace');

function hourly(): IAutomationSchedule {
	return { interval: 'hourly', scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 };
}

function workspaceTarget(): AutomationTarget {
	return { kind: 'workspace', folderUri: FOLDER, isolation: { kind: 'default' } };
}

/**
 * In-memory IAutomationService for the widget tests. Replaces the concrete
 * AutomationService, which now lives in the sessions layer. Importing it from
 * a workbench-layer test trips the `code-import-patterns` rule. The widget only
 * reads the `automations`/`runs` observables and drives create/update/delete,
 * so this fake keeps an unpersisted reactive store with just those mutations
 * plus the run-recording the tests exercise directly.
 */
class FakeAutomationService extends mock<IAutomationService>() {

	private readonly _automations = observableValue<readonly IAutomation[]>(this, []);
	private readonly _runs = observableValue<readonly IAutomationRun[]>(this, []);
	private readonly _runsForCache = new Map<string, IObservable<readonly IAutomationRun[]>>();
	createError: Error | undefined;
	updateError: Error | undefined;

	override readonly automations: IObservable<readonly IAutomation[]> = this._automations;
	override readonly runs: IObservable<readonly IAutomationRun[]> = this._runs;

	override getAutomation(id: string): IAutomation | undefined {
		return this._automations.get().find(a => a.id === id);
	}

	override runsFor(automationId: string): IObservable<readonly IAutomationRun[]> {
		let cached = this._runsForCache.get(automationId);
		if (!cached) {
			cached = derived(this, reader => this._runs.read(reader).filter(r => r.automationId === automationId));
			this._runsForCache.set(automationId, cached);
		}
		return cached;
	}

	override async createAutomation(options: ICreateAutomationOptions): Promise<IAutomation> {
		if (this.createError) {
			throw this.createError;
		}
		const now = new Date().toISOString();
		const automation: IAutomation = Object.freeze({
			id: generateUuid(),
			name: options.name,
			prompt: options.prompt,
			schedule: options.schedule,
			target: options.target,
			modelId: options.modelId,
			mode: options.mode,
			permissionLevel: options.permissionLevel,
			enabled: options.enabled ?? true,
			createdAt: now,
			updatedAt: now,
			lastRunAt: undefined,
			nextRunAt: undefined,
		});
		this._automations.set([automation, ...this._automations.get()], undefined);
		return automation;
	}

	override async updateAutomation(id: string, patch: IUpdateAutomationOptions): Promise<IAutomation> {
		if (this.updateError) {
			throw this.updateError;
		}
		const current = this.getAutomation(id);
		if (!current) {
			throw new Error(`Automation not found: ${id}`);
		}
		const updated: IAutomation = Object.freeze({
			...current,
			name: patch.name ?? current.name,
			prompt: patch.prompt ?? current.prompt,
			schedule: patch.schedule ?? current.schedule,
			target: patch.target ?? current.target,
			enabled: patch.enabled ?? current.enabled,
			updatedAt: new Date().toISOString(),
		});
		this._automations.set(this._automations.get().map(a => a.id === id ? updated : a), undefined);
		return updated;
	}

	override async deleteAutomation(id: string): Promise<void> {
		this._automations.set(this._automations.get().filter(a => a.id !== id), undefined);
		this._runsForCache.delete(id);
	}

	override async recordRunStart(automationId: string, trigger: AutomationRunTrigger, leaderWindowId: number): Promise<IAutomationRun> {
		const run: IAutomationRun = Object.freeze({
			id: generateUuid(),
			automationId,
			status: 'pending',
			trigger,
			startedAt: new Date().toISOString(),
			leaderWindowId,
		});
		this._runs.set([run, ...this._runs.get()], undefined);
		return run;
	}

	override async updateRun(runId: string, patch: IUpdateAutomationRunOptions): Promise<IAutomationRun | undefined> {
		const current = this._runs.get().find(r => r.id === runId);
		if (!current) {
			return undefined;
		}
		const merged: IAutomationRun = Object.freeze({
			...current,
			status: patch.status ?? current.status,
			sessionResource: patch.sessionResource ?? current.sessionResource,
			completedAt: patch.completedAt ?? current.completedAt,
			errorMessage: patch.errorMessage ?? current.errorMessage,
		});
		this._runs.set(this._runs.get().map(r => r.id === runId ? merged : r), undefined);
		return merged;
	}
}

class RecordingRunner extends mock<IAutomationRunner>() {
	readonly calls: { automationId: string; trigger: AutomationRunTrigger }[] = [];
	error: Error | undefined;
	whenDispatched: Promise<void> = Promise.resolve();
	whenCompleted: Promise<void> = Promise.resolve();

	override runOnce(
		automation: IAutomation,
		trigger: AutomationRunTrigger,
		_leaderWindowId: number,
		_token?: CancellationToken,
	): IAutomationRunOperation {
		this.calls.push({ automationId: automation.id, trigger });
		if (this.error) {
			const failure = Promise.reject(this.error);
			return { whenDispatched: failure, whenCompleted: failure };
		}
		return { whenDispatched: this.whenDispatched, whenCompleted: this.whenCompleted };
	}
}

class FakeDialogService extends mock<IDialogService>() {
	confirmResult = true;
	readonly confirmations: IConfirmation[] = [];
	readonly errors: { message: string; detail: string }[] = [];

	override async confirm(confirmation: IConfirmation): Promise<IConfirmationResult> {
		this.confirmations.push(confirmation);
		return { confirmed: this.confirmResult };
	}

	override async error(message: string, detail?: string): Promise<void> {
		this.errors.push({ message, detail: detail ?? '' });
	}

	override async info(): Promise<void> { /* no-op */ }
}

class FakeAutomationDialogService extends mock<IAutomationDialogService>() {
	result: IAutomationDialogResult | undefined;
	lastOptions: IShowAutomationDialogOptions | undefined;

	override async showAutomationDialog(options: IShowAutomationDialogOptions): Promise<IAutomationDialogResult | undefined> {
		this.lastOptions = options;
		return this.result;
	}
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
		const log = new NullLogService();
		const service = new FakeAutomationService();
		const runner = new RecordingRunner();
		const dialog = new FakeDialogService();
		const automationDialogService = new FakeAutomationDialogService();

		const instantiation = teardown.add(new TestInstantiationService());
		instantiation.stub(IAutomationService, service);
		instantiation.stub(IAutomationRunner, runner);
		instantiation.stub(IDialogService, dialog);
		instantiation.stub(IFileDialogService, upcastPartial<IFileDialogService>({ showOpenDialog: async () => undefined }));
		instantiation.stub(IAutomationDialogService, automationDialogService);
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
		widget.setVisible(true);
		return { widget, service, runner, dialog, workspace, configService, automationDialogService };
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
		await service.createAutomation({ name: 'First', prompt: 'p1', schedule: hourly(), target: workspaceTarget() });
		await service.createAutomation({ name: 'Second', prompt: 'p2', schedule: hourly(), target: workspaceTarget() });

		assert.strictEqual(widget.itemCount, 2);

		const entries = widget.getDisplayEntriesForTest();
		assert.strictEqual(entries.length, 2);
		const names = entries.map(e => e.automation.name).sort();
		assert.deepStrictEqual(names, ['First', 'Second']);
	});

	test('defers list updates while hidden and commits the latest entries when shown', async () => {
		const { widget, service } = setup();
		await service.createAutomation({ name: 'First', prompt: 'p1', schedule: hourly(), target: workspaceTarget() });

		widget.setVisible(false);
		await service.createAutomation({ name: 'Second', prompt: 'p2', schedule: hourly(), target: workspaceTarget() });
		const committedItemCountWhileHidden = widget.itemCount;

		widget.setVisible(true);

		assert.deepStrictEqual({
			committedItemCountWhileHidden,
			visibleItemCount: widget.itemCount,
			names: widget.getDisplayEntriesForTest().map(entry => entry.automation.name),
		}, {
			committedItemCountWhileHidden: 1,
			visibleItemCount: 2,
			names: ['Second', 'First'],
		});
	});

	test('disabled automations surface in the view-model as not enabled', async () => {
		const { widget, service } = setup();
		await service.createAutomation({ name: 'D', prompt: 'p', schedule: hourly(), target: workspaceTarget(), enabled: false });

		const entries = widget.getDisplayEntriesForTest();
		assert.strictEqual(entries.length, 1);
		assert.strictEqual(entries[0].automation.enabled, false, 'disabled badge is rendered from this flag');
	});

	test('workspace-less automations retain explicit quick-chat intent in the view-model', async () => {
		const { widget, service } = setup();
		await service.createAutomation({
			name: 'Quick',
			prompt: 'p',
			schedule: hourly(),
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
		});

		const automation = widget.getDisplayEntriesForTest()[0].automation;
		assert.deepStrictEqual(automation.target, {
			kind: 'quickChat',
			providerId: 'local-agent-host',
			sessionTypeId: 'copilotcli',
		});
	});

	test('accessible row labels include workspace-less and workspace targets', async () => {
		const { widget, service } = setup();
		const workspace = await service.createAutomation({ name: 'Workspace', prompt: 'p', schedule: hourly(), target: workspaceTarget() });
		const quickChat = await service.createAutomation({
			name: 'Quick',
			prompt: 'p',
			schedule: hourly(),
			target: { kind: 'quickChat', providerId: 'local-agent-host', sessionTypeId: 'copilotcli' },
			enabled: false,
		});

		assert.deepStrictEqual({
			workspace: widget.formatAriaLabel(workspace),
			quickChat: widget.formatAriaLabel(quickChat),
		}, {
			workspace: 'Workspace, Hourly, in folder-0',
			quickChat: 'Quick, disabled, Hourly, without a workspace',
		});
	});

	test('runNow invokes the runner with trigger=manual', async () => {
		const { widget, service, runner } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });

		await widget.runNow(a);

		assert.strictEqual(runner.calls.length, 1);
		assert.strictEqual(runner.calls[0].automationId, a.id);
		assert.strictEqual(runner.calls[0].trigger, 'manual');
	});

	test('runNow announces start after dispatch before lifecycle completion', async () => {
		const { widget, service, runner } = setup();
		const dispatched = new DeferredPromise<void>();
		const completed = new DeferredPromise<void>();
		runner.whenDispatched = dispatched.p;
		runner.whenCompleted = completed.p;
		const ariaParent = document.createElement('div');
		setARIAContainer(ariaParent);
		const automation = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });

		const runNowPromise = widget.runNow(automation);
		const run = await service.recordRunStart(automation.id, 'manual', 0);
		await service.updateRun(run.id, { status: 'running' });
		await dispatched.complete(undefined);
		await Promise.resolve();

		assert.deepStrictEqual(
			Array.from(ariaParent.querySelectorAll('.monaco-status')).map(element => element.textContent),
			['Started automation A', ''],
		);

		await completed.complete(undefined);
		await runNowPromise;
	});

	test('runNow clears inFlight when the runner fails', async () => {
		const { widget, service, runner } = setup();
		runner.error = new Error('boom');
		const automation = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });

		await widget.runNow(automation);

		assert.strictEqual(runner.calls.length, 1);
		assert.strictEqual(widget.getDisplayEntriesForTest()[0].inFlight, false);
	});

	test('mutating actions short-circuit when chat.automations.enabled is off', async () => {
		const { widget, service, runner, configService, dialog } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget(), enabled: true });

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
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget(), enabled: true });

		await widget.toggleEnabled(a);

		const updated = service.getAutomation(a.id);
		assert.ok(updated);
		assert.strictEqual(updated.enabled, false);
	});

	test('openEditDialog surfaces update errors without crashing', async () => {
		const { widget, service, dialog, automationDialogService } = setup();
		const automation = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });
		automationDialogService.result = { kind: 'update', id: automation.id, value: { name: 'Updated' } };
		service.updateError = new Error('update failed');

		await widget.openEditDialog(automation);

		assert.strictEqual(service.getAutomation(automation.id)?.name, 'A');
		assert.deepStrictEqual(dialog.errors, [{
			message: 'Failed to update automation.',
			detail: 'update failed',
		}]);
	});

	test('openCreateDialog creates an automation when the dialog returns a create result', async () => {
		const { widget, automationDialogService } = setup();
		automationDialogService.result = {
			kind: 'create',
			value: { name: 'Created', prompt: 'p', schedule: hourly(), target: workspaceTarget() }
		};

		const openCreateDialog = Reflect.get(widget, 'openCreateDialog') as (() => Promise<void>) | undefined;
		assert.ok(openCreateDialog);
		await Reflect.apply(openCreateDialog, widget, []);

		assert.strictEqual(widget.itemCount, 1);
		assert.strictEqual(widget.getDisplayEntriesForTest()[0].automation.name, 'Created');
	});

	test('openCreateDialog surfaces creation errors without crashing', async () => {
		const { widget, service, dialog, automationDialogService } = setup();
		automationDialogService.result = {
			kind: 'create',
			value: { name: 'Created', prompt: 'p', schedule: hourly(), target: workspaceTarget() }
		};
		service.createError = new Error('create failed');

		const openCreateDialog = Reflect.get(widget, 'openCreateDialog') as (() => Promise<void>) | undefined;
		assert.ok(openCreateDialog);
		await Reflect.apply(openCreateDialog, widget, []);

		assert.strictEqual(widget.itemCount, 0);
		assert.deepStrictEqual(dialog.errors, [{
			message: 'Failed to create automation.',
			detail: 'create failed',
		}]);
	});

	test('deleteAutomation only deletes when the confirmation is accepted', async () => {
		const { widget, service, dialog } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });

		dialog.confirmResult = false;
		await widget.deleteAutomation(a);

		assert.strictEqual(dialog.confirmations.length, 1);
		assert.ok(service.getAutomation(a.id), 'expected automation to still exist after declined delete');
	});

	test('deleteAutomation removes the automation when the confirmation is accepted', async () => {
		const { widget, service, dialog } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });

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

		await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });
		await service.createAutomation({ name: 'B', prompt: 'p', schedule: hourly(), target: workspaceTarget() });

		assert.ok(seen.length >= 2, `expected at least 2 emissions, got ${seen.length}`);
		assert.strictEqual(seen[seen.length - 1], 2);
	});

	test('fireItemCount reflects current service size', async () => {
		const { widget, service } = setup();
		await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });

		let captured = -1;
		teardown.add(widget.onDidChangeItemCount(c => { captured = c; }));
		widget.fireItemCount();

		assert.strictEqual(captured, 1);
	});

	test('history is collapsed by default and toggleExpanded flips the row expansion', async () => {
		const { widget, service } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });

		assert.strictEqual(widget.getDisplayEntriesForTest()[0].expanded, false);

		widget.toggleExpanded(a.id);
		assert.strictEqual(widget.getDisplayEntriesForTest()[0].expanded, true);

		// Collapse again.
		widget.toggleExpanded(a.id);
		assert.strictEqual(widget.getDisplayEntriesForTest()[0].expanded, false);
	});

	test('expanded row exposes no runs when there are none', async () => {
		const { widget, service } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });

		widget.toggleExpanded(a.id);

		const entry = widget.getDisplayEntriesForTest()[0];
		assert.strictEqual(entry.expanded, true);
		assert.strictEqual(entry.runs.length, 0, 'history empty-state is rendered from an empty runs list');
	});

	test('expanded row exposes runs newest-first with status and error message', async () => {
		const { widget, service } = setup();
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });

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
		const a = await service.createAutomation({ name: 'A', prompt: 'p', schedule: hourly(), target: workspaceTarget() });

		widget.toggleExpanded(a.id);
		assert.strictEqual(widget.getDisplayEntriesForTest()[0].runs.length, 0);

		await service.recordRunStart(a.id, 'schedule', 1);
		await Promise.resolve();

		const entry = widget.getDisplayEntriesForTest()[0];
		assert.strictEqual(entry.expanded, true);
		assert.strictEqual(entry.runs.length, 1);
	});
});
