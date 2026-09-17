/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { ITextModelContentProvider, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { ActionListItemKind } from '../../../../../platform/actionWidget/browser/actionList.js';
import { IActionWidgetService } from '../../../../../platform/actionWidget/browser/actionWidget.js';
import { CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { WorkflowRun, WorkflowSchemaFormat, WorkflowSnapshot, WorkflowSource } from '../../../../../platform/workflow/common/workflow.js';
import { IChatEntitlementService } from '../../../../services/chat/common/chatEntitlementService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { WorkflowUIService } from '../../browser/workflowUIServiceImpl.js';
import { WorkflowRunEditorInput } from '../../browser/workflowEditors.js';
import { IWorkflowCatalogService, WorkflowTemplateEntry } from '../../common/workflowCatalog.js';
import { WorkflowSettingId } from '../../common/workflowConfiguration.js';
import { IWorkflowService, WorkflowSelection } from '../../common/workflowService.js';
import { getWorkflowProofDocumentUri, workflowProofDocumentScheme } from '../../common/workflowProofDocuments.js';
import { testWorkflowDefinition, testWorkflowRun, testWorkflowSnapshot } from '../common/workflowTestData.js';

class WorkflowActionWidgetService extends mock<IActionWidgetService>() {
	readonly picks: { labels: string[]; activeLabel?: string }[] = [];
	readonly descriptions: (string | undefined)[][] = [];
	readonly details: (string | undefined)[][] = [];
	readonly groups: (string | undefined)[][] = [];
	readonly whenShown = new DeferredPromise<void>();
	override isVisible = false;
	anchor?: Parameters<IActionWidgetService['show']>[4];
	accept?: () => void;
	private onHide?: () => void;
	autoAccept = true;
	cancelSelection = false;
	selectedLabel?: string;

	override show: IActionWidgetService['show'] = (_user, _supportsPreview, all, delegate, anchor) => {
		const items = all.filter(item => item.kind === ActionListItemKind.Action);
		this.groups.push(all.filter(item => item.kind === ActionListItemKind.Header).map(item => item.label));
		const active = items.find(item => item.group?.icon === Codicon.check);
		this.picks.push({ labels: items.map(item => item.label ?? ''), activeLabel: active?.label });
		this.descriptions.push(items.map(item => typeof item.description === 'string' ? item.description : undefined));
		this.details.push(items.map(item => item.detail));
		this.anchor = anchor;
		this.isVisible = true;
		this.onHide = delegate.onHide;
		this.accept = () => {
			const selected = items.find(item => item.label === this.selectedLabel) ?? (active?.label !== 'No Workflow' ? active : undefined) ?? items[1] ?? items[0];
			if (this.cancelSelection || !selected?.item) {
				this.hide();
			} else {
				delegate.onSelect(selected.item);
			}
		};
		void this.whenShown.complete();
		if (this.autoAccept) {
			this.accept();
		}
	};

	override hide(): void {
		this.isVisible = false;
		const onHide = this.onHide;
		this.onHide = undefined;
		onHide?.();
	}
}

suite('Workflow selection and session entry', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const workspace = URI.parse('workflow-test://host/project');

	function createService(snapshot = testWorkflowSnapshot(), registerStarter = true) {
		const instantiationService = store.add(new TestInstantiationService());
		const actionWidget = new WorkflowActionWidgetService();
		const configuration = new TestConfigurationService({ [WorkflowSettingId.Enabled]: true });
		store.add(configuration.onDidChangeConfigurationEmitter);
		instantiationService.stub(IConfigurationService, configuration);
		const entry: WorkflowTemplateEntry = { key: 'template-key', label: snapshot.label, definition: testWorkflowDefinition(), source: { kind: 'workspace', id: 'project' }, readOnly: false, diagnostics: [] };
		const calls = { catalog: 0, resolve: 0, watch: 0, activeWatches: 0 };
		const starts: { selection: WorkflowSelection; workspace?: URI }[] = [];
		const sentiment = { hidden: false };
		const contentProviders = new Map<string, ITextModelContentProvider>();
		instantiationService.stub(IWorkflowCatalogService, {
			getCatalog: async () => {
				calls.catalog++;
				return { workflows: [entry], checkpointTypes: [], diagnostics: [] };
			},
			resolve: async () => { calls.resolve++; return snapshot; },
			watch: () => {
				calls.watch++;
				calls.activeWatches++;
				return toDisposable(() => calls.activeWatches--);
			},
		});
		instantiationService.stub(IActionWidgetService, actionWidget);
		instantiationService.stub(IQuickInputService, {
			pick: () => assert.fail('Workflow selection must use the anchored action list'),
			input: () => assert.fail('Workflow selection must not prompt for inputs'),
		});
		instantiationService.stub(IWorkflowService, new class extends mock<IWorkflowService>() { });
		instantiationService.stub(IEditorService, {});
		instantiationService.stub(IChatEntitlementService, { sentiment });
		instantiationService.stub(ITextModelService, {
			registerTextModelContentProvider: (scheme: string, provider: ITextModelContentProvider) => {
				contentProviders.set(scheme, provider);
				return toDisposable(() => contentProviders.delete(scheme));
			}
		});
		instantiationService.stub(IModelService, {});
		instantiationService.stub(ILanguageService, {});
		const service = store.add(instantiationService.createInstance(WorkflowUIService));
		if (registerStarter) {
			store.add(service.registerSessionStarter(async (selection, workspace) => { starts.push({ selection, workspace }); }));
		}
		return { service, instantiationService, snapshot, entry, calls, starts, actionWidget, configuration, contentProviders, sentiment };
	}

	test('authoring is unavailable unless the rollout is explicitly enabled', async () => {
		for (const enabled of [undefined, false]) {
			const { service, entry, snapshot, configuration, calls, starts, actionWidget } = createService();
			await configuration.setUserConfiguration(WorkflowSettingId.Enabled, enabled);
			const selection = await service.selectWorkflow(workspace);
			const edited = await service.selectWorkflow(workspace, { snapshot, stopAfter: 'plan' });
			await service.openEditor(entry, workspace);
			await service.useInNewSession(entry, workspace);
			assert.deepStrictEqual({ selection, edited, calls, starts, picks: actionWidget.picks }, {
				selection: null,
				edited: null,
				calls: { catalog: 0, resolve: 0, watch: 0, activeWatches: 0 },
				starts: [],
				picks: [
					{ labels: ['No Workflow'], activeLabel: 'No Workflow' },
					{ labels: ['No Workflow'], activeLabel: undefined },
				],
			});
		}
	});

	test('selection stages only a template with the first stopping point and no setup prompts', async () => {
		const { service, snapshot, calls, starts, actionWidget } = createService();
		const selection = await service.selectWorkflow(workspace);
		assert.deepStrictEqual({ selection, calls, starts, templateDescriptions: actionWidget.descriptions[0], picks: actionWidget.picks.length }, {
			selection: { snapshot, stopAfter: 'plan', inputs: undefined, origin: undefined },
			calls: { catalog: 1, resolve: 1, watch: 1, activeWatches: 0 },
			starts: [],
			templateDescriptions: [undefined, undefined], picks: 1,
		});
	});

	test('selection groups workflow sources in workspace, user, builtin and extension order', async () => {
		const { service, instantiationService, actionWidget, entry } = createService();
		const sources: WorkflowSource[] = [
			{ kind: 'extension', id: 'test-extension' }, { kind: 'builtin', id: 'builtin' }, { kind: 'workspace', id: 'workspace' }, { kind: 'user', id: 'user' },
		];
		instantiationService.stub(IWorkflowCatalogService, 'getCatalog', async () => ({
			workflows: sources.map(source => ({ ...entry, source, label: source.kind })), checkpointTypes: [], diagnostics: [],
		}));
		await service.selectWorkflow(workspace);
		assert.deepStrictEqual({ groups: actionWidget.groups, labels: actionWidget.picks[0].labels }, {
			groups: [['Workspace', 'User', 'Built-in', 'Extensions']], labels: ['No Workflow', 'workspace', 'user', 'builtin', 'extension'],
		});
	});

	test('workflow descriptions use the second line without showing versions or inventing missing descriptions', async () => {
		const { service, instantiationService, actionWidget, entry } = createService();
		const description = 'Plan and implement a feature with proof at each checkpoint.';
		instantiationService.stub(IWorkflowCatalogService, 'getCatalog', async () => ({
			workflows: [
				{ ...entry, definition: { ...testWorkflowDefinition(), description, version: 12 } },
				{ ...entry, key: 'undocumented', label: 'Without Description', definition: { ...testWorkflowDefinition(), id: 'test/undocumented' } },
			],
			checkpointTypes: [], diagnostics: [],
		}));
		await service.selectWorkflow(workspace);
		assert.deepStrictEqual({
			labels: actionWidget.picks[0].labels,
			inlineDescriptions: actionWidget.descriptions[0],
			details: actionWidget.details[0],
		}, {
			labels: ['No Workflow', 'Feature delivery', 'Without Description'],
			inlineDescriptions: [undefined, undefined, undefined],
			details: [undefined, description, undefined],
		});
	});

	test('selection captures only marked client-local time inputs without prompting or recapturing a saved zone', async () => {
		const snapshot: WorkflowSnapshot = {
			...testWorkflowSnapshot(),
			inputSchema: {
				type: 'object',
				properties: {
					calendarZone: { type: 'string', format: WorkflowSchemaFormat.IanaTimeZone, minLength: 1 },
					timeZone: { type: 'string' },
				},
				required: ['calendarZone', 'timeZone'],
				additionalProperties: false,
			},
		};
		const { service, calls, starts } = createService(snapshot);
		const first = await service.selectWorkflow(workspace);
		const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
		const chosenZone = localZone === 'Pacific/Honolulu' ? 'Europe/Zurich' : 'Pacific/Honolulu';
		const existing: WorkflowSelection = { snapshot, stopAfter: 'implement', inputs: { calendarZone: chosenZone, timeZone: 'An ordinary string' } };
		const edited = await service.selectWorkflow(workspace, existing);
		assert.deepStrictEqual({
			initial: first?.inputs,
			edited,
			catalogReads: calls.catalog,
			starts,
		}, {
			initial: { calendarZone: localZone },
			edited: existing,
			catalogReads: 2,
			starts: [],
		});
	});

	test('setup rejects invalid IANA zones instead of substituting the local zone', async () => {
		const snapshot: WorkflowSnapshot = {
			...testWorkflowSnapshot(),
			inputSchema: { type: 'object', properties: { zone: { type: 'string', format: WorkflowSchemaFormat.IanaTimeZone } }, required: ['zone'] },
		};
		const { service, starts } = createService(snapshot);
		await assert.rejects(service.selectWorkflow(workspace, { snapshot, stopAfter: 'plan', inputs: { zone: 'Not/A_Zone' } }), /Expected IANA timezone name/);
		assert.deepStrictEqual(starts, []);
	});

	test('inspection watches the initial read until the editor can take ownership', async () => {
		const { service, instantiationService, configuration } = createService();
		await configuration.setUserConfiguration(WorkflowSettingId.Enabled, false);
		const run = testWorkflowRun();
		let active = 0;
		const observed: number[] = [];
		instantiationService.stub(IWorkflowService, 'watchSession', () => {
			active++;
			return toDisposable(() => active--);
		});
		instantiationService.stub(IWorkflowService, 'getSessionRun', async () => {
			observed.push(active);
			return run;
		});
		instantiationService.stub(IEditorService, 'openEditor', async (input: WorkflowRunEditorInput) => {
			store.add(input);
			observed.push(active);
		});
		await service.showWorkflow(URI.parse(run.session));
		assert.deepStrictEqual({ observed, active }, { observed: [1, 1], active: 0 });
	});

	test('failed inspection releases its initial watch', async () => {
		const { service, instantiationService } = createService();
		let active = 0;
		instantiationService.stub(IWorkflowService, 'watchSession', () => {
			active++;
			return toDisposable(() => active--);
		});
		instantiationService.stub(IWorkflowService, 'getSessionRun', async () => { throw new Error('Disconnected'); });
		await assert.rejects(service.showWorkflow(URI.parse(testWorkflowRun().session)), /Disconnected/);
		assert.strictEqual(active, 0);
	});

	test('choosing the selected template preserves its snapshot, stopping point, inputs and child lineage', async () => {
		const snapshot: WorkflowSnapshot = { ...testWorkflowSnapshot(), inputSchema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] } };
		const { service, calls, starts, actionWidget } = createService(snapshot);
		const existing: WorkflowSelection = { snapshot, stopAfter: 'implement', inputs: { message: 'Keep this value' }, origin: { runId: 'parent-run', checkpointId: 'implementation' } };
		const selection = await service.selectWorkflow(workspace, existing);
		assert.deepStrictEqual({
			selection,
			sameSnapshot: selection?.snapshot === snapshot,
			picks: actionWidget.picks,
			calls,
			starts,
		}, {
			selection: existing,
			sameSnapshot: true,
			picks: [{ labels: ['No Workflow', 'Feature delivery'], activeLabel: 'Feature delivery' }],
			calls: { catalog: 1, resolve: 0, watch: 1, activeWatches: 0 },
			starts: [],
		});
	});

	test('canceling re-edit leaves the existing selection untouched', async () => {
		const { service, snapshot, actionWidget, calls, starts } = createService();
		const existing: WorkflowSelection = { snapshot, stopAfter: 'implement', origin: { runId: 'parent-run', checkpointId: 'implementation' } };
		actionWidget.cancelSelection = true;
		const selection = await service.selectWorkflow(workspace, existing);
		assert.deepStrictEqual({ selection, existing, calls, starts }, {
			selection: undefined,
			existing: { snapshot, stopAfter: 'implement', origin: { runId: 'parent-run', checkpointId: 'implementation' } },
			calls: { catalog: 1, resolve: 0, watch: 1, activeWatches: 0 },
			starts: [],
		});
	});

	test('the action list anchors to the picker, exposes expansion and returns focus on dismissal', async () => {
		const { service, snapshot, actionWidget, calls } = createService();
		const anchor = document.body.appendChild(document.createElement('button'));
		store.add(toDisposable(() => anchor.remove()));
		actionWidget.autoAccept = false;
		const selection = service.selectWorkflow(workspace, { snapshot, stopAfter: 'plan' }, anchor);
		await actionWidget.whenShown.p;
		const open = { anchor: actionWidget.anchor === anchor, expanded: anchor.getAttribute('aria-expanded'), watches: calls.activeWatches };
		actionWidget.hide();
		assert.deepStrictEqual({
			open, selection: await selection, expanded: anchor.getAttribute('aria-expanded'),
			focused: document.activeElement === anchor, watches: calls.activeWatches,
		}, {
			open: { anchor: true, expanded: 'true', watches: 1 }, selection: undefined, expanded: 'false',
			focused: true, watches: 0,
		});
	});

	test('a detached composer does not open an orphaned picker', async () => {
		const { service, snapshot, actionWidget, calls } = createService();
		const anchor = document.createElement('button');
		const selection = await service.selectWorkflow(workspace, { snapshot, stopAfter: 'plan' }, anchor);
		assert.deepStrictEqual({ selection, picks: actionWidget.picks, watches: calls.activeWatches }, { selection: undefined, picks: [], watches: 0 });
	});

	test('AI hiding prevents discovery and does not offer selection controls', async () => {
		const { service, snapshot, actionWidget, calls, sentiment } = createService();
		sentiment.hidden = true;
		const selection = await service.selectWorkflow(workspace, { snapshot, stopAfter: 'plan' });
		assert.deepStrictEqual({ selection, picks: actionWidget.picks, calls }, {
			selection: undefined, picks: [], calls: { catalog: 0, resolve: 0, watch: 0, activeWatches: 0 },
		});
	});

	test('disabling workflows while the list is open prevents selecting a new template', async () => {
		const { service, actionWidget, configuration, calls } = createService();
		actionWidget.autoAccept = false;
		const selection = service.selectWorkflow(workspace);
		await actionWidget.whenShown.p;
		await configuration.setUserConfiguration(WorkflowSettingId.Enabled, false);
		actionWidget.accept?.();
		assert.deepStrictEqual({ selection: await selection, calls }, {
			selection: undefined, calls: { catalog: 1, resolve: 0, watch: 1, activeWatches: 0 },
		});
	});

	test('a failed action list releases its catalog watch and expanded state', async () => {
		const { service, instantiationService, calls } = createService();
		const anchor = document.body.appendChild(document.createElement('button'));
		store.add(toDisposable(() => anchor.remove()));
		instantiationService.stub(IActionWidgetService, 'show', () => { throw new Error('Picker failed'); });
		await assert.rejects(service.selectWorkflow(workspace, undefined, anchor), /Picker failed/);
		assert.deepStrictEqual({ watches: calls.activeWatches, expanded: anchor.getAttribute('aria-expanded') }, { watches: 0, expanded: 'false' });
	});

	test('No Workflow explicitly removes a selection without mutating its original lineage', async () => {
		const { service, snapshot, actionWidget } = createService();
		const existing: WorkflowSelection = { snapshot, stopAfter: 'implement', origin: { runId: 'parent-run', checkpointId: 'implementation' } };
		actionWidget.selectedLabel = 'No Workflow';
		const selection = await service.selectWorkflow(workspace, existing);
		assert.deepStrictEqual({ selection, originalStop: existing.stopAfter }, {
			selection: null,
			originalStop: 'implement',
		});
	});

	test('Use in New Session delegates the selection to the registered session owner', async () => {
		const { service, snapshot, entry, starts } = createService();
		await service.useInNewSession(entry, workspace);
		assert.deepStrictEqual(starts, [{
			selection: { snapshot, stopAfter: 'plan', inputs: undefined, origin: undefined },
			workspace,
		}]);
	});

	test('Use in New Session stages directly without opening a setup picker', async () => {
		const { service, entry, actionWidget, starts } = createService();
		actionWidget.cancelSelection = true;
		await service.useInNewSession(entry, workspace);
		assert.deepStrictEqual({ starts: starts.length, picks: actionWidget.picks }, { starts: 1, picks: [] });
	});

	test('disabling rollout while resolving a template prevents session-owner dispatch', async () => {
		const { service, entry, instantiationService, snapshot, configuration, starts } = createService();
		instantiationService.stub(IWorkflowCatalogService, 'resolve', async () => {
			await configuration.setUserConfiguration(WorkflowSettingId.Enabled, false);
			return snapshot;
		});
		await service.useInNewSession(entry, workspace);
		assert.deepStrictEqual({ starts, enabled: configuration.getValue(WorkflowSettingId.Enabled) }, { starts: [], enabled: false });
	});

	test('the session starter does not shadow commands and disposal revokes it', async () => {
		const { service, entry, snapshot, calls } = createService(testWorkflowSnapshot(), false);
		const previous = CommandsRegistry.getCommand('sessions.workflows.newSession');
		const selections: WorkflowSelection[] = [];
		const registration = store.add(service.registerSessionStarter(async selection => { selections.push(selection); }));
		const unchanged = CommandsRegistry.getCommand('sessions.workflows.newSession') === previous;
		await service.useInNewSession(entry, workspace);
		registration.dispose();
		await assert.rejects(service.useInNewSession(entry, workspace), /cannot create a session/);
		assert.deepStrictEqual({ selections, unchanged, resolveCount: calls.resolve }, {
			selections: [{ snapshot, stopAfter: 'plan', inputs: undefined, origin: undefined }],
			unchanged: true,
			resolveCount: 1,
		});
	});

	test('replacing the session owner during template resolution does not call either owner', async () => {
		const { service, entry, snapshot, instantiationService } = createService(testWorkflowSnapshot(), false);
		const starts: string[] = [];
		const registration = store.add(service.registerSessionStarter(async () => { starts.push('old'); }));
		instantiationService.stub(IWorkflowCatalogService, 'resolve', async () => {
			registration.dispose();
			store.add(service.registerSessionStarter(async () => { starts.push('new'); }));
			return snapshot;
		});
		await assert.rejects(service.useInNewSession(entry, workspace), /entry point changed/);
		assert.deepStrictEqual(starts, []);
	});

	test('proof documents expose only the accepted proof and release temporary view interest', async () => {
		const { instantiationService, contentProviders, starts } = createService();
		const proof = { summary: 'Implemented the feature', tests: ['Focused tests passed'] };
		const run: WorkflowRun = {
			...testWorkflowRun(),
			receipts: [{ id: 'receipt', checkpointId: 'plan', assignmentId: 'assignment', proof, output: proof, evidence: [], acceptedAt: 1, provenance: 'reported' }],
		};
		let watches = 0;
		const reads: number[] = [];
		instantiationService.stub(IWorkflowService, 'watchSession', () => {
			watches++;
			return toDisposable(() => watches--);
		});
		instantiationService.stub(IWorkflowService, 'getSessionRun', async () => { reads.push(watches); return run; });
		const textModel = store.add(createTextModel(''));
		instantiationService.stub(IModelService, 'getModel', () => null);
		instantiationService.stub(IModelService, 'createModel', (text: string) => { textModel.setValue(text); return textModel; });
		instantiationService.stub(ILanguageService, 'createById', (languageId: string) => ({ languageId, onDidChange: Event.None }));
		const provider = contentProviders.get(workflowProofDocumentScheme)!;
		const opened = await provider.provideTextContent(getWorkflowProofDocumentUri(run, 'plan'));
		await assert.rejects(Promise.resolve(provider.provideTextContent(getWorkflowProofDocumentUri({ ...run, id: 'different-run' }, 'plan'))), /not available/);
		assert.deepStrictEqual({ proof: JSON.parse(opened!.getValue()), watches, reads, starts }, { proof, watches: 0, reads: [1, 1], starts: [] });
	});
});
