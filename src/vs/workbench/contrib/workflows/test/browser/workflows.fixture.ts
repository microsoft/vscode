/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, Dimension, getActiveElement, isHTMLElement } from '../../../../../base/browser/dom.js';
import '../../../../../base/browser/ui/codicons/codiconStyles.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { IModelService } from '../../../../../editor/common/services/model.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ContextMenuService } from '../../../../../platform/contextview/browser/contextMenuService.js';
import { IContextMenuService, IContextViewService } from '../../../../../platform/contextview/browser/contextView.js';
import { ContextViewService } from '../../../../../platform/contextview/browser/contextViewService.js';
import { IListService, ListService } from '../../../../../platform/list/browser/listService.js';
import { ILayoutService } from '../../../../../platform/layout/browser/layoutService.js';
import { QuickInputService } from '../../../../../platform/quickinput/browser/quickInputService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { WorkflowEvidence, WorkflowReceipt, WorkflowRun, WorkflowSource } from '../../../../../platform/workflow/common/workflow.js';
import { builtinWorkflowCheckpointTypes, builtinWorkflowDefinitions } from '../../../../../platform/workflow/common/builtinWorkflows.js';
import { IDecorationsService } from '../../../../services/decorations/common/decorations.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { INotebookDocumentService } from '../../../../services/notebook/common/notebookDocumentService.js';
import { IResolvedTextFileEditorModel, ITextFileEditorModel, ITextFileEditorModelManager, ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { IUntitledTextEditorModelManager } from '../../../../services/untitled/common/untitledTextEditorService.js';
import { ComponentFixtureContext, createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from '../../../../test/browser/componentFixtures/fixtureUtils.js';
import { TestDecorationsService } from '../../../../test/browser/workbenchTestServices.js';
import { IAICustomizationWorkspaceService } from '../../../chat/common/aiCustomizationWorkspaceService.js';
import { ICustomizationHarnessService, IHarnessDescriptor } from '../../../chat/common/customizationHarnessService.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { IWorkflowAccessibilityService, WorkflowAccessibilityService } from '../../browser/workflowAccessibility.js';
import { WorkflowDraftWidget } from '../../browser/workflowDraftWidget.js';
import { WorkflowRunWidget } from '../../browser/workflowRunWidget.js';
import { IWorkflowUIService } from '../../browser/workflowUIService.js';
import { IWorkflowCatalogService, WorkflowCatalog } from '../../common/workflowCatalog.js';
import { WorkflowSettingId } from '../../common/workflowConfiguration.js';
import { WorkflowRunViewModel } from '../../common/workflowRunViewModel.js';
import { IWorkflowService, WorkflowService } from '../../common/workflowService.js';
import { testCheckpointType, testWorkflowRun, testWorkflowRunWithMissingInputs, testWorkflowRunWithStartCondition } from '../common/workflowTestData.js';

function services(ctx: ComponentFixtureContext, catalog: WorkflowCatalog) {
	let textModel: ITextModel | undefined;
	let fileModel: ITextFileEditorModel | undefined;
	let savedContent = '';
	const dirtyChanges = ctx.disposableStore.add(new Emitter<ITextFileEditorModel>());
	let pickerReturnFocus: HTMLElement | undefined;
	ctx.container.style.position = 'relative';
	const layoutService = new class extends mock<ILayoutService>() {
		override readonly activeContainer = ctx.container;
		override readonly mainContainer = ctx.container;
		override get activeContainerDimension() { return new Dimension(ctx.container.clientWidth, ctx.container.clientHeight); }
		override get mainContainerDimension() { return this.activeContainerDimension; }
		override readonly activeContainerOffset = { top: 0, quickPickTop: 20 };
		override readonly mainContainerOffset = this.activeContainerOffset;
		override readonly containers = [ctx.container];
		override readonly onDidLayoutMainContainer = Event.None;
		override readonly onDidLayoutContainer = Event.None;
		override readonly onDidLayoutActiveContainer = Event.None;
		override readonly onDidAddContainer = Event.None;
		override readonly onDidChangeActiveContainer = Event.None;
		override getContainer(): HTMLElement { return ctx.container; }
		override whenContainerStylesLoaded() { return undefined; }
		override focus(): void { pickerReturnFocus?.focus(); }
	};
	const configuration = new TestConfigurationService({ [WorkflowSettingId.Enabled]: true });
	ctx.disposableStore.add(configuration.onDidChangeConfigurationEmitter);
	const textFiles = new class extends mock<ITextFileService>() {
		override readonly untitled = new class extends mock<IUntitledTextEditorModelManager>() {
			override readonly onDidChangeLabel = Event.None;
			override get() { return undefined; }
		};
		override readonly files = new class extends mock<ITextFileEditorModelManager>() {
			override readonly onDidChangeDirty = dirtyChanges.event;
			override readonly onDidChangeReadonly = Event.None;
			override readonly onDidChangeEncoding = Event.None;
			override get(resource: URI) { return isEqual(fileModel?.resource, resource) ? fileModel : undefined; }
		};
		override isDirty(): boolean { return !!textModel && textModel.getValue() !== savedContent; }
		override async save(resource: URI): Promise<URI> {
			savedContent = textModel?.getValue() ?? '';
			if (fileModel) {
				dirtyChanges.fire(fileModel);
			}
			return resource;
		}
		override async revert(): Promise<void> { textModel?.setValue(savedContent); }
	};
	const instantiationService = createEditorServices(ctx.disposableStore, {
		colorTheme: ctx.theme,
		fileIconTheme: ctx.fileIconTheme,
		additionalServices: reg => {
			registerWorkbenchServices(reg);
			reg.defineInstance(IConfigurationService, configuration);
			reg.define(IListService, ListService);
			reg.defineInstance(ILayoutService, layoutService);
			reg.define(IContextViewService, ContextViewService);
			reg.define(IContextMenuService, ContextMenuService);
			reg.defineInstance(IEditorService, new class extends mock<IEditorService>() { });
			reg.define(IQuickInputService, QuickInputService);
			reg.defineInstance(IDecorationsService, new TestDecorationsService());
			reg.defineInstance(INotebookDocumentService, new class extends mock<INotebookDocumentService>() { });
			reg.defineInstance(ITextFileService, textFiles);
			reg.defineInstance(ITextModelService, new class extends mock<ITextModelService>() {
				override async createModelReference() {
					const model = textModel!;
					return {
						object: new class extends mock<IResolvedTextEditorModel>() {
							override readonly textEditorModel = model;
							override isReadonly(): boolean { return false; }
						}, dispose: () => { }
					};
				}
			});
			reg.define(IWorkflowService, WorkflowService);
			reg.define(IWorkflowAccessibilityService, WorkflowAccessibilityService);
			reg.defineInstance(IWorkflowUIService, new class extends mock<IWorkflowUIService>() {
				override getGroups() { return [{ id: 'review', label: 'Ready for review' }]; }
			});
			reg.defineInstance(IWorkflowCatalogService, new class extends mock<IWorkflowCatalogService>() {
				override readonly onDidChange = Event.None;
				override async getCatalog(): Promise<WorkflowCatalog> { return catalog; }
				override watch() { return { dispose: () => { } }; }
			});
			reg.defineInstance(IAICustomizationWorkspaceService, new class extends mock<IAICustomizationWorkspaceService>() {
				override readonly activeProjectRoot = constObservable(URI.from({ scheme: Schemas.file, path: '/workspace' }));
			});
			reg.defineInstance(ICustomizationHarnessService, new class extends mock<ICustomizationHarnessService>() {
				override readonly activeHarness = observableValue(this, 'fixture');
				override readonly availableHarnesses = constObservable([this.getActiveDescriptor()]);
				override getActiveDescriptor(): IHarnessDescriptor { return { id: 'fixture', label: 'Fixture', icon: Codicon.symbolMethod }; }
			});
		},
	});
	const quickInputService = instantiationService.get(IQuickInputService);
	ctx.disposableStore.add(quickInputService.onShow(() => {
		const element = getActiveElement();
		pickerReturnFocus = isHTMLElement(element) ? element : undefined;
	}));
	// Fixtures do not install the workbench's quick-input keybinding dispatcher.
	ctx.disposableStore.add(addDisposableListener(ctx.container, 'keydown', (event: KeyboardEvent) => {
		if (!quickInputService.currentQuickInput || !isHTMLElement(event.target) || !event.target.closest('.quick-input-widget') || event.isComposing) {
			return;
		}
		if (event.key === 'Enter' || event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			void (event.key === 'Enter' ? quickInputService.accept() : quickInputService.cancel());
		} else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
			event.preventDefault();
			event.stopPropagation();
			quickInputService.navigate(event.key === 'ArrowDown');
		}
	}));
	return {
		instantiationService,
		setDocument(content: string, resource: URI): void {
			savedContent = content;
			textModel = ctx.disposableStore.add(instantiationService.get(IModelService).createModel(content, null, resource));
			fileModel = new class extends mock<ITextFileEditorModel>() {
				override readonly resource = resource;
				override get textEditorModel() { return textModel ?? null; }
				override isDirty(): this is IResolvedTextFileEditorModel { return !!textModel && textModel.getValue() !== savedContent; }
				override isReadonly(): boolean { return false; }
				override getEncoding(): string { return 'utf8'; }
			};
		},
	};
}

function catalogData(readOnly = false): WorkflowCatalog {
	const source: WorkflowSource = readOnly ? { kind: 'builtin', id: 'test/builtin', label: 'Built-in' } : { kind: 'workspace', id: 'project', label: 'Workspace' };
	const workflow = builtinWorkflowDefinitions[0];
	return {
		workflows: [{ key: 'workflow', definition: { ...workflow, source }, label: workflow.label, source, readOnly, diagnostics: [], resource: readOnly ? undefined : URI.from({ scheme: Schemas.file, path: '/workspace/.vscode/workflows/feature.workflow.jsonc' }) }],
		checkpointTypes: builtinWorkflowCheckpointTypes.map(type => ({
			key: `${type.id}@${type.version}`, definition: type, label: type.label,
			source: type.source!, readOnly: true, diagnostics: [],
		})),
		diagnostics: [],
	};
}

function renderRun(ctx: ComponentFixtureContext, narrow: boolean, proposal: boolean, status: WorkflowRun['status']): void {
	const width = narrow ? 360 : 620;
	ctx.container.style.width = `${width}px`;
	ctx.container.style.height = '600px';
	const { instantiationService } = services(ctx, catalogData());
	const base = testWorkflowRun();
	const run: WorkflowRun = {
		...base,
		status, checkpointIndex: 1, stopAfter: status === 'stopped' ? 'plan' : 'implement',
		receipts: [{
			id: 'plan-receipt', checkpointId: 'plan', assignmentId: 'plan-assignment',
			proof: { summary: 'Plan saved with keyboard navigation and regression coverage.' },
			output: { summary: 'Plan saved with keyboard navigation and regression coverage.' },
			provenance: 'reported', acceptedAt: 1,
			evidence: [
				{ kind: 'file', uri: 'file:///workspace/docs/keyboard-navigation-plan.md', label: 'Implementation plan' },
				{ kind: 'pullRequest', uri: 'https://github.com/example/project/pull/42', label: 'Preserve keyboard focus while updating progress' },
			],
		}],
	};
	const model = ctx.disposableStore.add(instantiationService.createInstance(WorkflowRunViewModel, URI.parse(run.session), run));
	model.expandedCheckpoints.set(new Set(['plan']), undefined);
	if (proposal) {
		model.proposeStop(status === 'stopped' ? 'implement' : 'plan');
	}
	const widget = ctx.disposableStore.add(instantiationService.createInstance(WorkflowRunWidget, ctx.container, model, { revealTurn: () => { }, createLinkedWorkflow: () => { } }));
	widget.layout(new Dimension(width, 600));
}

function renderRunWithStartCondition(ctx: ComponentFixtureContext, narrow: boolean): void {
	const width = narrow ? 360 : 620;
	ctx.container.style.width = `${width}px`;
	ctx.container.style.height = '600px';
	const { instantiationService } = services(ctx, catalogData());
	const run = testWorkflowRunWithStartCondition();
	const model = ctx.disposableStore.add(instantiationService.createInstance(WorkflowRunViewModel, URI.parse(run.session), run));
	const widget = ctx.disposableStore.add(instantiationService.createInstance(WorkflowRunWidget, ctx.container, model, { revealTurn: () => { } }));
	widget.layout(new Dimension(width, 600));
}

function renderPrototypeRail(ctx: ComponentFixtureContext, narrow: boolean, status: 'waiting' | 'stopped' | 'paused'): void {
	const history = status === 'stopped';
	const width = narrow ? 320 : 400;
	ctx.container.style.width = `${width}px`;
	ctx.container.style.height = '640px';
	const { instantiationService } = services(ctx, catalogData());
	const checkpoints = [
		['plan', 'Plan'], ['implementation', 'Implementation'], ['draft-pr', 'Draft PR'], ['draft-pr-ready', 'Draft PR Ready'],
		['pr-open', 'Open PR'], ['pr-merged', 'Merged PR'], ['test-plan-item', 'Test Plan Item'],
		['release-notes', 'Write Release Notes'],
		['experiment-setup', 'Experiment Set Up'], ['experiment-started', 'Experiment Started'], ['experiment-analysis', 'Experiment Analysed'],
	];
	const pr = 'https://github.com/example/project/pull/42';
	const evidence: readonly (readonly WorkflowEvidence[])[] = [
		[{ kind: 'file', uri: 'file:///workspace/docs/keyboard-navigation-plan.md', label: 'Saved plan' }],
		[],
		[{ kind: 'pullRequest', uri: pr, label: 'Improve keyboard navigation', state: 'draft' }],
		[{ kind: 'pullRequest', uri: pr, label: 'Improve keyboard navigation', state: 'draft' }],
		[{ kind: 'pullRequest', uri: pr, label: 'Improve keyboard navigation', state: 'open' }],
		[{ kind: 'pullRequest', uri: pr, label: 'Improve keyboard navigation', state: 'merged' }],
		[{ kind: 'issue', uri: 'https://github.com/example/project/issues/43', label: 'Test keyboard navigation', state: 'open' }],
	];
	const completed = history ? 7 : 3;
	const receipts = checkpoints.slice(0, completed).map<WorkflowReceipt>(([id], index) => ({
		id: `receipt-${id}`, checkpointId: id, assignmentId: `assignment-${id}`, turnId: `turn-${id}`,
		proof: {
			summary: index === 1 ? 'Keyboard navigation implemented.' : `${checkpoints[index][1]} completed`,
			tests: index === 1 ? ['Focus and shortcut regressions passed.'] : [],
		},
		output: {}, evidence: evidence[index], provenance: index === 1 ? 'reported' : 'checked', acceptedAt: index + 1,
	}));
	const run: WorkflowRun = {
		...testWorkflowRun(),
		snapshot: {
			id: 'fixture/feature', version: 1, label: 'Feature with Experiment',
			checkpoints: checkpoints.map(([id, label]) => ({ id, label, instructions: 'Fixture assignment only; no external work is performed.', inputs: {}, type: { ...testCheckpointType(), proofSchema: { type: 'object' } } })),
		},
		status, checkpointIndex: completed, stopAfter: history ? 'test-plan-item' : 'draft-pr-ready',
		reason: status === 'waiting' ? 'Waiting for required CI checks' : undefined,
		receipts,
		firstTurns: Object.fromEntries(checkpoints.slice(0, history ? completed : completed + 1).map(([id]) => [id, `turn-${id}`])),
	};
	let currentRun = run;
	const service = instantiationService.get(IWorkflowService);
	ctx.disposableStore.add(service.registerRuntime({
		id: 'fixture-rail', supportsSession: () => true,
		runtime: {
			onDidChangeRun: Event.None, getSessionRun: async () => currentRun,
			start: async () => { throw new Error('Fixtures do not start workflows'); },
			control: async control => {
				const stopAfter = control.kind === 'setStopAfter' ? control.checkpointId : currentRun.stopAfter;
				const outsideBoundary = currentRun.checkpointIndex > currentRun.snapshot.checkpoints.findIndex(checkpoint => checkpoint.id === stopAfter);
				let status = currentRun.status;
				switch (control.kind) {
					case 'pause': status = 'paused'; break;
					case 'cancel': status = 'cancelled'; break;
					case 'resume': status = outsideBoundary ? 'stopped' : 'running'; break;
					case 'setStopAfter':
						if (status === 'running' || status === 'waiting' || status === 'stopped') {
							status = outsideBoundary ? 'stopped' : status === 'stopped' ? 'running' : status;
						}
						break;
				}
				currentRun = { ...currentRun, revision: control.revision + 1, stopAfter, status, reason: undefined };
				return currentRun;
			},
		},
	}));
	const model = ctx.disposableStore.add(instantiationService.createInstance(WorkflowRunViewModel, URI.parse(run.session), run));
	model.expandedCheckpoints.set(new Set(history ? ['draft-pr', 'pr-merged', 'test-plan-item'] : ['plan', 'draft-pr']), undefined);
	const widget = ctx.disposableStore.add(instantiationService.createInstance(WorkflowRunWidget, ctx.container, model, { revealTurn: () => { } }));
	widget.layout(new Dimension(width, 640));
}

async function renderEditor(ctx: ComponentFixtureContext, narrow: boolean, readOnly: boolean, settings = false): Promise<void> {
	const { WorkflowEditorModel } = await import('../../browser/workflowEditorModel.js');
	const { WorkflowEditorWidget } = await import('../../browser/workflowEditorWidget.js');
	const width = narrow ? 460 : 900;
	ctx.container.style.width = `${width}px`;
	ctx.container.style.height = '640px';
	const catalog = catalogData(readOnly);
	const { instantiationService, setDocument } = services(ctx, catalog);
	const entry = catalog.workflows[0];
	if (entry.resource) {
		setDocument(JSON.stringify(entry.definition, null, '\t'), entry.resource);
	}
	const model = ctx.disposableStore.add(instantiationService.createInstance(WorkflowEditorModel, entry, undefined));
	await model.load();
	const widget = ctx.disposableStore.add(instantiationService.createInstance(WorkflowEditorWidget, ctx.container, model));
	widget.layout(new Dimension(width, 640));
	if (!settings) {
		widget.revealCheckpoint('plan');
	}
}

async function renderCatalog(ctx: ComponentFixtureContext, narrow: boolean): Promise<void> {
	const { WorkflowCatalogWidget } = await import('../../browser/workflowCatalogWidget.js');
	const width = narrow ? 460 : 900;
	ctx.container.style.width = `${width}px`;
	ctx.container.style.height = '560px';
	const { instantiationService } = services(ctx, catalogData());
	const widget = ctx.disposableStore.add(instantiationService.createInstance(WorkflowCatalogWidget, ctx.container));
	await widget.refresh();
	widget.layout(new Dimension(width, 560));
}

async function renderSourceEditor(ctx: ComponentFixtureContext, narrow: boolean, readOnly: boolean): Promise<void> {
	await renderEditor(ctx, narrow, readOnly);
	const button = [...ctx.container.getElementsByTagName('a')].find(button => button.textContent === 'View JSONC');
	button?.click();
	const error = ctx.container.querySelector('.workflow-editor-diagnostics')?.textContent;
	if (!ctx.container.querySelector('.workflow-source-editor .monaco-editor') || error) {
		throw new Error(error || 'The workflow document editor did not open successfully.');
	}
}

function renderDraft(ctx: ComponentFixtureContext, narrow: boolean, empty = false): void {
	ctx.container.style.width = narrow ? '360px' : '700px';
	ctx.container.style.backgroundColor = 'var(--vscode-editor-background)';
	const { instantiationService } = services(ctx, catalogData());
	const selection = { snapshot: testWorkflowRun().snapshot, stopAfter: 'plan' };
	const widget = ctx.disposableStore.add(instantiationService.createInstance(WorkflowDraftWidget, ctx.container, empty ? undefined : selection, {
		onPick: () => widget.update(selection),
	}));
}

function renderMissingInputs(ctx: ComponentFixtureContext, narrow: boolean): void {
	const width = narrow ? 320 : 540;
	ctx.container.style.width = `${width}px`;
	ctx.container.style.height = '480px';
	const { instantiationService } = services(ctx, catalogData());
	let run = testWorkflowRunWithMissingInputs();
	ctx.disposableStore.add(instantiationService.get(IWorkflowService).registerRuntime({
		id: 'fixture-inputs', supportsSession: () => true,
		runtime: {
			onDidChangeRun: Event.None, getSessionRun: async () => run,
			start: async () => { throw new Error('Fixtures do not start workflows'); },
			control: async control => {
				if (control.kind !== 'provideInputs') {
					throw new Error('This fixture only demonstrates checkpoint input submission');
				}
				run = { ...run, revision: run.revision + 1, inputs: { ...run.inputs, ...control.inputs }, inputRequest: undefined, reason: undefined, status: 'running' };
				return run;
			},
		},
	}));
	const model = ctx.disposableStore.add(instantiationService.createInstance(WorkflowRunViewModel, URI.parse(run.session), run));
	const widget = ctx.disposableStore.add(instantiationService.createInstance(WorkflowRunWidget, ctx.container, model, {}));
	widget.layout(new Dimension(width, 480));
}

const additionalThemes = ['darkHighContrast', 'lightHighContrast'] as const;

export default defineThemedFixtureGroup({ path: 'workflows/' }, {
	MissingInputs: defineComponentFixture({ additionalThemes, render: ctx => renderMissingInputs(ctx, false) }),
	MissingInputsNarrow: defineComponentFixture({ additionalThemes, render: ctx => renderMissingInputs(ctx, true) }),
	DraftEmpty: defineComponentFixture({ additionalThemes, render: ctx => renderDraft(ctx, false, true) }),
	PrototypeRail: defineComponentFixture({ additionalThemes, render: ctx => renderPrototypeRail(ctx, false, 'waiting') }),
	PrototypeRailNarrow: defineComponentFixture({ additionalThemes, render: ctx => renderPrototypeRail(ctx, true, 'waiting') }),
	PullRequestHistory: defineComponentFixture({ additionalThemes, render: ctx => renderPrototypeRail(ctx, false, 'stopped') }),
	Interrupted: defineComponentFixture({ additionalThemes, render: ctx => renderPrototypeRail(ctx, false, 'paused') }),
	InterruptedNarrow: defineComponentFixture({ additionalThemes, render: ctx => renderPrototypeRail(ctx, true, 'paused') }),
	Run: defineComponentFixture({ additionalThemes, render: ctx => renderRun(ctx, false, false, 'running') }),
	Stopped: defineComponentFixture({ additionalThemes, render: ctx => renderRun(ctx, false, false, 'stopped') }),
	StopProposal: defineComponentFixture({ additionalThemes, render: ctx => renderRun(ctx, false, true, 'stopped') }),
	RunNarrow: defineComponentFixture({ additionalThemes, render: ctx => renderRun(ctx, true, false, 'running') }),
	CheckedStart: defineComponentFixture({ additionalThemes, render: ctx => renderRunWithStartCondition(ctx, false) }),
	CheckedStartNarrow: defineComponentFixture({ additionalThemes, render: ctx => renderRunWithStartCondition(ctx, true) }),
	Draft: defineComponentFixture({ additionalThemes, render: ctx => renderDraft(ctx, false) }),
	DraftNarrow: defineComponentFixture({ additionalThemes, render: ctx => renderDraft(ctx, true) }),
	Editor: defineComponentFixture({ additionalThemes, render: ctx => renderEditor(ctx, false, false) }),
	EditorSettings: defineComponentFixture({ additionalThemes, render: ctx => renderEditor(ctx, false, false, true) }),
	ReadOnlyEditor: defineComponentFixture({ additionalThemes, render: ctx => renderEditor(ctx, false, true) }),
	EditorNarrow: defineComponentFixture({ additionalThemes, render: ctx => renderEditor(ctx, true, false) }),
	EditorOutlineNarrow: defineComponentFixture({ additionalThemes, render: ctx => renderEditor(ctx, true, false, true) }),
	EditorSource: defineComponentFixture({ additionalThemes, render: ctx => renderSourceEditor(ctx, false, false) }),
	EditorSourceNarrow: defineComponentFixture({ additionalThemes, render: ctx => renderSourceEditor(ctx, true, false) }),
	ReadOnlyEditorSource: defineComponentFixture({ additionalThemes, render: ctx => renderSourceEditor(ctx, false, true) }),
	Catalog: defineComponentFixture({ additionalThemes, render: ctx => renderCatalog(ctx, false) }),
	CatalogNarrow: defineComponentFixture({ additionalThemes, render: ctx => renderCatalog(ctx, true) }),
});
