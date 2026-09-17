/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as dom from '../../../../../base/browser/dom.js';
import { mainWindow } from '../../../../../base/browser/window.js';
import { DeferredPromise, timeout } from '../../../../../base/common/async.js';
import { IAction } from '../../../../../base/common/actions.js';
import { Event as LifecycleEvent } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IHoverService } from '../../../../../platform/hover/browser/hover.js';
import { IContextMenuService } from '../../../../../platform/contextview/browser/contextView.js';
import { WorkflowControl, WorkflowRun } from '../../../../../platform/workflow/common/workflow.js';
import { validateWorkflowRun } from '../../../../../platform/workflow/common/workflowValidation.js';
import { INotebookDocumentService } from '../../../../services/notebook/common/notebookDocumentService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IResourceEditorInput } from '../../../../../platform/editor/common/editor.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { IWorkflowAccessibilityService, WorkflowAccessibilityService } from '../../browser/workflowAccessibility.js';
import { WorkflowRunWidget, WorkflowRunWidgetOptions } from '../../browser/workflowRunWidget.js';
import { WorkflowRunViewModel } from '../../common/workflowRunViewModel.js';
import { IWorkflowService } from '../../common/workflowService.js';
import { workflowProofDocumentScheme } from '../../common/workflowProofDocuments.js';
import { testWorkflowRun, testWorkflowRunWithMissingInputs, testWorkflowRunWithStartCondition } from '../common/workflowTestData.js';

suite('Workflow run widget', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createWidget(options: WorkflowRunWidgetOptions = {}, initialRun?: WorkflowRun) {
		const container = dom.append(mainWindow.document.body, dom.$('div'));
		store.add(toDisposable(() => container.remove()));
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(INotebookDocumentService, new class extends mock<INotebookDocumentService>() { });
		instantiationService.stub(IWorkflowAccessibilityService, instantiationService.createInstance(WorkflowAccessibilityService));
		const mouseHoverTargets = new Set<HTMLElement>();
		instantiationService.stub(IHoverService, 'setupDelayedHoverAtMouse', (target: HTMLElement) => {
			mouseHoverTargets.add(target);
			return toDisposable(() => mouseHoverTargets.delete(target));
		});
		const controls: WorkflowControl[] = [];
		let menuActions: readonly IAction[] = [];
		const opened: URI[] = [];
		instantiationService.stub(IContextMenuService, 'showContextMenu', (delegate: Parameters<IContextMenuService['showContextMenu']>[0]) => {
			assert.ok(delegate.getActions);
			menuActions = delegate.getActions();
		});
		instantiationService.stub(IEditorService, 'openEditor', async (input: IResourceEditorInput) => { opened.push(input.resource); return undefined; });
		const run: WorkflowRun = initialRun ?? {
			...testWorkflowRun(),
			receipts: [{ id: 'receipt', checkpointId: 'plan', assignmentId: 'assignment', acceptedAt: 1, provenance: 'reported', proof: { summary: 'Plan ready' }, output: { summary: 'Plan ready' }, evidence: [{ kind: 'file', label: 'Plan', uri: 'file:///workspace/plan.md' }] }],
		};
		instantiationService.stub(IWorkflowService, new class extends mock<IWorkflowService>() {
			override readonly onDidChangeRun = LifecycleEvent.None;
			override watchSession() { return toDisposable(() => { }); }
			override async control(_session: URI, control: WorkflowControl): Promise<WorkflowRun> {
				controls.push(control);
				const current = model.run.get();
				return {
					...current, revision: current.revision + 1,
					stopAfter: control.kind === 'setStopAfter' ? control.checkpointId : current.stopAfter,
					status: control.kind === 'pause' ? 'paused' : control.kind === 'resume' || control.kind === 'provideInputs' ? 'running' : current.status,
					...(control.kind === 'provideInputs' ? { inputs: { ...current.inputs, ...control.inputs }, inputRequest: undefined, reason: undefined } : {}),
				};
			}
		});
		const model = store.add(instantiationService.createInstance(WorkflowRunViewModel, URI.parse(run.session), run));
		const revealed: string[] = [];
		const widget = store.add(instantiationService.createInstance(WorkflowRunWidget, container, model, { revealTurn: turn => { revealed.push(turn); }, ...options }));
		widget.layout(new dom.Dimension(600, 600));
		const action = (key: string): HTMLElement => {
			const element = [...widget.domNode.querySelectorAll<HTMLElement>('[data-workflow-focus], [role="button"][aria-label]')].find(candidate => candidate.dataset.workflowFocus === key || candidate.getAttribute('aria-label') === key);
			assert.ok(element, `Missing action ${key}`);
			return element;
		};
		return { widget, model, controls, revealed, action, mouseHoverTargets, opened, menuActions: () => menuActions };
	}

	test('only the current checkpoint requests missing inputs, with no generic resume action', () => {
		const run = testWorkflowRunWithMissingInputs();
		validateWorkflowRun(run);
		const { widget, model } = createWidget({}, run);
		assert.deepStrictEqual({
			fields: [...widget.domNode.querySelectorAll('.workflow-input-field label')].map(label => label.textContent),
			separateSelectContainer: !!widget.domNode.querySelector('.workflow-input-field > .workflow-input-select > select'),
			checkpoint: widget.domNode.querySelector('.workflow-checkpoint-inputs')?.closest<HTMLElement>('[data-checkpoint-id]')?.dataset.checkpointId,
			canContinue: model.canContinue,
			submit: widget.domNode.querySelector('[data-workflow-focus="submit-inputs"]')?.textContent,
			accessible: widget.getAccessibleContent().includes('Inputs needed: Repository, Release channel'),
		}, { fields: ['Repository', 'Release channel'], separateSelectContainer: true, checkpoint: 'implement', canContinue: false, submit: 'Continue', accessible: true });
	});

	test('input drafts and caret survive run updates, then submit only the requested values', async () => {
		const { widget, model, controls, action } = createWidget({}, testWorkflowRunWithMissingInputs());
		const input = widget.domNode.querySelector<HTMLInputElement>('.workflow-checkpoint-inputs input')!;
		input.value = 'https://github.com/example/project';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		input.focus();
		input.setSelectionRange(8, 14);
		const run = model.run.get();
		model.run.set({ ...run, revision: run.revision + 1 }, undefined);
		const restored = widget.domNode.querySelector<HTMLInputElement>('.workflow-checkpoint-inputs input')!;
		assert.deepStrictEqual({ value: restored.value, focused: dom.getActiveElement() === restored, start: restored.selectionStart, end: restored.selectionEnd }, {
			value: input.value, focused: true, start: 8, end: 14,
		});
		model.setInputValue('channel', 'stable');
		action('submit-inputs').click();
		await timeout(0);
		assert.deepStrictEqual({ controls, form: !!widget.domNode.querySelector('.workflow-checkpoint-inputs'), error: model.error.get() }, {
			controls: [{ kind: 'provideInputs', runId: run.id, revision: run.revision + 1, inputs: { repository: input.value, channel: 'stable' } }],
			form: false, error: undefined,
		});
	});

	test('invalid checkpoint values remain editable and never send a control request', async () => {
		const { widget, model, controls } = createWidget({}, testWorkflowRunWithMissingInputs());
		model.setInputValue('repository', 'not a URI');
		model.setInputValue('channel', 'stable');
		await model.provideInputs();
		assert.deepStrictEqual({
			controls, hasError: model.error.get()?.includes('absolute URI'), retained: model.inputDrafts.get(),
			message: widget.domNode.querySelector('.workflow-message')?.textContent === model.error.get(),
		}, { controls: [], hasError: true, retained: { repository: 'not a URI', channel: 'stable' }, message: true });
	});

	test('stopped input forms cannot submit or grant continuation', async () => {
		const { model, controls, action } = createWidget({}, testWorkflowRunWithMissingInputs());
		await model.stopWorkflow();
		await model.provideInputs();
		assert.deepStrictEqual({
			controls: controls.map(control => control.kind), canContinue: model.canContinue,
			disabled: action('submit-inputs').getAttribute('aria-disabled'),
		}, { controls: ['pause'], canContinue: true, disabled: 'true' });
	});

	test('evidence rows show only their resource name or title with pointer hovers', () => {
		const { widget, model, mouseHoverTargets, action } = createWidget();
		const run = model.run.get();
		model.run.set({
			...run,
			receipts: [{
				...run.receipts[0],
				evidence: [
					{ kind: 'file', label: 'Saved plan (existence checked)', uri: 'file:///workspace/plan.md' },
					{ kind: 'pullRequest', label: 'Feature pull request', uri: 'https://github.com/microsoft/vscode/pull/42' },
					{ kind: 'issue', label: 'Test plan item', uri: 'https://github.com/microsoft/vscode/issues/43' },
					{ kind: 'link', label: 'Experiment results', uri: 'https://example.test/results' },
				],
			}],
		}, undefined);
		action('checkpoint-plan').click();
		const rows = [...widget.domNode.querySelectorAll<HTMLElement>('.workflow-evidence')];
		assert.deepStrictEqual(rows.map(row => ({
			text: row.textContent,
			label: row.getAttribute('aria-label'),
			description: row.querySelector('.label-description')?.textContent ?? '',
			mouseHover: mouseHoverTargets.has(row),
		})), ['plan.md', 'Feature pull request', 'Test plan item', 'Experiment results'].map(label => ({
			text: label, label, description: '', mouseHover: true,
		})));
	});

	test('cancel is local and applying a stop proposal makes one explicit request', async () => {
		const { model, controls, action } = createWidget();
		model.proposeStop('plan');
		action('Cancel').click();
		const cancelled = { requests: controls.length, proposal: model.proposedStopAfter.get() };
		model.proposeStop('plan');
		action('Apply').click();
		await timeout(0);
		assert.deepStrictEqual({ cancelled, requests: controls.map(control => control.kind), stop: model.run.get().stopAfter }, { cancelled: { requests: 0, proposal: undefined }, requests: ['setStopAfter'], stop: 'plan' });
	});

	test('first-turn navigation and checkpoint arrow keys preserve focus through updates', () => {
		const { model, action, revealed } = createWidget();
		action('chat-plan').click();
		action('checkpoint-plan').focus();
		action('checkpoint-plan').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
		const arrowFocus = dom.getActiveElement() === action('checkpoint-implement');
		action('checkpoint-implement').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
		action('checkpoint-plan').click();
		const updateFocus = dom.getActiveElement() === action('checkpoint-plan');
		assert.deepStrictEqual({ revealed, arrowFocus, updateFocus, expanded: [...model.expandedCheckpoints.get()] }, { revealed: ['first-turn'], arrowFocus: true, updateFocus: true, expanded: ['plan'] });
	});

	test('expanded proof and its focus survive a progress update', () => {
		const { widget, model, action } = createWidget();
		action('checkpoint-plan').click();
		const key = 'evidence-completion-plan-file:///workspace/plan.md';
		action(key).focus();
		model.run.set({ ...model.run.get(), revision: 2, status: 'paused' }, undefined);
		assert.deepStrictEqual({
			open: action('checkpoint-plan').getAttribute('aria-expanded'),
			focused: dom.getActiveElement() === action(key),
			proof: widget.domNode.querySelector('.workflow-checkpoint-proof-list')?.textContent,
			instructions: widget.domNode.querySelector('.workflow-instructions'),
			details: widget.domNode.querySelector('details'),
		}, { open: 'true', focused: true, proof: 'plan.md', instructions: null, details: null });
	});

	test('shared progress text updates the run summary and checkpoint accessibility together', () => {
		const { widget, model, action } = createWidget();
		const cases: { status: WorkflowRun['status']; reason?: string; checkpointIndex: number; checkpointId: string }[] = [
			{ status: 'running', checkpointIndex: 1, checkpointId: 'implement' },
			{ status: 'waiting', reason: 'CI pending', checkpointIndex: 1, checkpointId: 'implement' },
			{ status: 'blocked', reason: 'Proof needs work', checkpointIndex: 1, checkpointId: 'implement' },
			{ status: 'stopped', checkpointIndex: 1, checkpointId: 'plan' },
		];
		const presentations = cases.map(({ status, reason, checkpointIndex, checkpointId }) => {
			model.run.set({ ...model.run.get(), status, reason, checkpointIndex, revision: model.run.get().revision + 1 }, undefined);
			const checkpoint = action(`checkpoint-${checkpointId}`);
			return {
				state: widget.domNode.querySelector('.workflow-run-header .workflow-secondary')?.textContent,
				message: widget.domNode.querySelector('.workflow-message:not([hidden])')?.textContent,
				accessibleSummary: widget.getAccessibleContent().split('\n\n').slice(0, 3),
				checkpointLabel: checkpoint.getAttribute('aria-label'),
				checkpointDescription: checkpoint.getAttribute('aria-description'),
				otherDescriptions: [...widget.domNode.querySelectorAll('[aria-description]')].filter(element => element !== checkpoint).length,
			};
		});
		assert.deepStrictEqual(presentations, [
			{
				state: 'Implementation: In progress', message: undefined,
				accessibleSummary: ['Feature delivery', 'Implementation: In progress', '1 of 2 checkpoints completed'],
				checkpointLabel: 'Implementation, In progress', checkpointDescription: '1 of 2 checkpoints completed', otherDescriptions: 0,
			},
			{
				state: 'Implementation: Waiting', message: 'CI pending (1 of 2 checkpoints completed)',
				accessibleSummary: ['Feature delivery', 'Implementation: Waiting', 'CI pending (1 of 2 checkpoints completed)'],
				checkpointLabel: 'Implementation, Waiting', checkpointDescription: 'CI pending (1 of 2 checkpoints completed)', otherDescriptions: 0,
			},
			{
				state: 'Implementation: Blocked', message: 'Proof needs work (1 of 2 checkpoints completed)',
				accessibleSummary: ['Feature delivery', 'Implementation: Blocked', 'Proof needs work (1 of 2 checkpoints completed)'],
				checkpointLabel: 'Implementation, Blocked', checkpointDescription: 'Proof needs work (1 of 2 checkpoints completed)', otherDescriptions: 0,
			},
			{
				state: 'Plan: Stopping point reached', message: undefined,
				accessibleSummary: ['Feature delivery', 'Plan: Stopping point reached', '1 of 2 checkpoints completed'],
				checkpointLabel: 'Plan, Completed', checkpointDescription: '1 of 2 checkpoints completed', otherDescriptions: 0,
			},
		]);
	});

	test('explicit control errors remain visible above the shared progress description', () => {
		const { widget, model } = createWidget();
		model.run.set({ ...model.run.get(), status: 'blocked', reason: 'Proof needs work', revision: 2 }, undefined);
		model.error.set('Could not reach the workflow host', undefined);
		assert.strictEqual(widget.domNode.querySelector('.workflow-message')?.textContent, 'Could not reach the workflow host');
	});

	test('runs without historical start evidence do not render a before-start group', () => {
		const { widget } = createWidget();
		assert.strictEqual(widget.domNode.querySelector('.workflow-start-condition-evidence'), null);
	});

	test('checked start evidence is historical and never completes an unfinished checkpoint', () => {
		const run: WorkflowRun = { ...testWorkflowRunWithStartCondition(), status: 'running', checkpointIndex: 0, receipts: [] };
		validateWorkflowRun(run);
		const { widget, controls } = createWidget({}, run);
		assert.deepStrictEqual({
			historical: widget.getAccessibleContent().includes('Historical evidence only. Conditions are checked again before work starts.'),
			completed: widget.domNode.querySelectorAll('.workflow-checkpoint.completed').length,
			completionProof: widget.domNode.querySelector('[data-workflow-focus="proof-completion-experiment-started"]'),
			summary: widget.getAccessibleContent().split('\n\n').slice(0, 3),
			controls,
		}, {
			historical: true, completed: 0, completionProof: null,
			summary: ['Experiment rollout', 'Experiment started: In progress', '0 of 1 checkpoint completed'],
			controls: [],
		});
	});

	test('completed cards contain only completion proof while Accessible View retains start observations', () => {
		const base = testWorkflowRunWithStartCondition();
		const run: WorkflowRun = base;
		validateWorkflowRun(run);
		const { widget, model, action } = createWidget({}, run);
		action('checkpoint-experiment-started').click();
		const evidenceKey = `evidence-completion-experiment-started-${run.receipts[0].evidence[0].uri}`;
		action(evidenceKey).focus();
		model.run.set({ ...run, revision: run.revision + 1 }, undefined);
		const content = widget.getAccessibleContent();
		assert.deepStrictEqual({
			focused: dom.getActiveElement() === action(evidenceKey),
			evidenceKeys: [...widget.domNode.querySelectorAll('.workflow-evidence')].map(element => element.getAttribute('data-workflow-focus')),
			detailText: widget.domNode.querySelector('.workflow-checkpoint-proof-list')?.textContent,
			inlineMetadata: widget.domNode.querySelectorAll('.workflow-checkpoint-enclosure p, .workflow-checkpoint-enclosure details').length,
			checkedCompletion: content.includes('Checked completion'),
			reportedCompletion: content.includes('Agent-reported completion'),
			checkOutput: content.includes('"releaseId": 42'),
			reportedProof: content.includes('"summary": "Experiment A started."'),
			completed: widget.domNode.querySelectorAll('.workflow-checkpoint.completed').length,
		}, {
			focused: true,
			evidenceKeys: [evidenceKey],
			detailText: 'Experiment A',
			inlineMetadata: 0,
			checkedCompletion: false, reportedCompletion: true, checkOutput: true, reportedProof: true, completed: 1,
		});
	});

	test('linked workflow entry is absent unless the caller provides it', () => {
		const { widget } = createWidget();
		assert.strictEqual(widget.domNode.querySelector('[data-workflow-focus="more-plan"]'), null);
	});

	test('linked workflow entry delegates once without applying a stop proposal', async () => {
		const pending = new DeferredPromise<void>();
		const checkpoints: string[] = [];
		const { widget, model, controls, action, menuActions } = createWidget({ createLinkedWorkflow: async checkpointId => {
			checkpoints.push(checkpointId);
			await pending.p;
		} });
		model.proposeStop('plan');
		action('more-plan').click();
		const first = menuActions()[0].run();
		const disabled = action('more-plan').getAttribute('aria-disabled');
		const second = menuActions()[0].run();
		await pending.complete();
		await Promise.all([first, second]);
		assert.deepStrictEqual({
			checkpoints, controls, disabled,
			stopAfter: model.run.get().stopAfter,
			proposal: model.proposedStopAfter.get(),
			accessible: widget.getAccessibleContent().includes('does not inherit'),
		}, { checkpoints: ['plan'], controls: [], disabled: 'true', stopAfter: 'implement', proposal: 'plan', accessible: true });
	});

	test('completing a linked entry does not rebuild a disposed overlay', async () => {
		const pending = new DeferredPromise<void>();
		const { widget, action, menuActions } = createWidget({ createLinkedWorkflow: () => pending.p });
		action('more-plan').click();
		const operation = menuActions()[0].run();
		widget.dispose();
		widget.domNode.replaceChildren();
		await pending.complete();
		await operation;
		assert.strictEqual(widget.domNode.childElementCount, 0);
	});

	test('first-turn action sits immediately before the expansion chevron in the row header', () => {
		const { widget } = createWidget();
		const header = widget.domNode.querySelector('.workflow-checkpoint-header');
		assert.deepStrictEqual([...header!.querySelectorAll('.workflow-checkpoint-actions [data-workflow-focus]')].map(element => element.getAttribute('data-workflow-focus')), ['chat-plan', 'expand-plan']);
	});

	test('structured proof opens one read-only proof document entry instead of inline JSON', async () => {
		const { widget, model, action, opened } = createWidget();
		const run = model.run.get();
		model.run.set({ ...run, receipts: [{ ...run.receipts[0], evidence: [] }] }, undefined);
		action('checkpoint-plan').click();
		const proof = widget.domNode.querySelector<HTMLElement>('.workflow-evidence');
		proof!.click();
		await timeout(0);
		assert.deepStrictEqual({ text: proof?.textContent, entries: opened.map(resource => resource.scheme), inlineJson: widget.domNode.querySelector('pre, details') }, {
			text: 'View Proof', entries: [workflowProofDocumentScheme], inlineJson: null,
		});
	});

	test('the same PR keeps distinct draft and merged proof icons in independently expanded checkpoints', () => {
		const { widget, model, action } = createWidget();
		const run = model.run.get();
		const uri = 'https://github.com/microsoft/vscode/pull/42';
		model.run.set({
			...run, checkpointIndex: 2, status: 'completed',
			receipts: [
				{ ...run.receipts[0], evidence: [{ kind: 'pullRequest', uri, label: 'Feature', state: 'draft' }] },
				{ ...run.receipts[0], id: 'merged', checkpointId: 'implement', evidence: [{ kind: 'pullRequest', uri, label: 'Feature', state: 'merged' }] },
			],
		}, undefined);
		action('checkpoint-plan').click();
		action('checkpoint-implement').click();
		assert.deepStrictEqual([...widget.domNode.querySelectorAll<HTMLElement>('.workflow-evidence')].map(element => ({
			label: element.textContent,
			icon: [...element.querySelector('.monaco-icon-label')!.classList].find(value => value.startsWith('codicon-git-pull-request')),
			color: element.style.getPropertyValue('--vscode-icon-foreground'),
		})), [
			{ label: 'Feature', icon: 'codicon-git-pull-request-draft', color: 'var(--vscode-descriptionForeground)' },
			{ label: 'Feature', icon: 'codicon-git-pull-request-done', color: 'var(--vscode-charts-purple)' },
		]);
	});

	test('stopping-line keyboard movement protects completed checkpoints and requires Apply', async () => {
		const { widget, model, action, controls } = createWidget();
		const run = model.run.get();
		model.run.set({
			...run, checkpointIndex: 2, stopAfter: 'verify',
			snapshot: { ...run.snapshot, checkpoints: [...run.snapshot.checkpoints, { ...run.snapshot.checkpoints[1], id: 'verify', label: 'Verification' }] },
			receipts: [run.receipts[0], { ...run.receipts[0], id: 'second', checkpointId: 'implement' }],
		}, undefined);
		action('stop').focus();
		action('stop').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
		action('stop').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
		const proposed = { id: model.proposedStopAfter.get(), requests: controls.length, min: action('stop').getAttribute('aria-valuemin'), upDisabled: action('Move Stopping Point Up').getAttribute('aria-disabled') };
		action('stop').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
		await timeout(0);
		assert.deepStrictEqual({
			proposed, stop: model.run.get().stopAfter, requests: controls.map(control => control.kind),
			position: widget.domNode.querySelector('.workflow-stop-line')?.previousElementSibling?.getAttribute('data-checkpoint-id'),
		}, { proposed: { id: 'implement', requests: 0, min: '2', upDisabled: 'true' }, stop: 'implement', requests: ['setStopAfter'], position: 'implement' });
	});

	test('stopping controls use standard toolbars without a visible Pause or Resume pair', () => {
		const { widget } = createWidget();
		const line = widget.domNode.querySelector('.workflow-stop-line')!;
		assert.deepStrictEqual({
			toolbars: line.querySelectorAll('.monaco-toolbar').length,
			movement: [...line.querySelectorAll('.workflow-stop-movement [role="button"]')].map(element => element.getAttribute('aria-label')),
			customButtons: line.querySelector('.monaco-button'),
			pauseOrResume: line.querySelector('[aria-label="Pause"], [aria-label="Resume"]'),
		}, { toolbars: 2, movement: ['Move Stopping Point Up', 'Move Stopping Point Down'], customButtons: null, pauseOrResume: null });
	});

	for (const runStatus of ['running', 'waiting'] as const) {
		test(`Stop Workflow is contextual while ${runStatus} and preserves proof and the stopping point`, async () => {
			const { widget, model, controls, action, menuActions } = createWidget();
			model.run.set({ ...model.run.get(), status: runStatus, checkpointIndex: 1 }, undefined);
			const run = model.run.get();
			const contextMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
			action('stop').dispatchEvent(contextMenu);
			const menu = { prevented: contextMenu.defaultPrevented, labels: menuActions().map(action => action.label), enabled: menuActions()[0].enabled, requests: controls.length };
			await menuActions()[0].run();
			assert.deepStrictEqual({
				menu,
				requests: controls.map(control => control.kind),
				status: model.run.get().status,
				stop: model.run.get().stopAfter,
				receipts: model.run.get().receipts,
				firstTurns: model.run.get().firstTurns,
				confirmationHidden: widget.domNode.querySelector<HTMLElement>('.workflow-stop-confirmation')!.hidden,
				confirmation: action('Continue').textContent,
				focused: dom.getActiveElement() === action('stop'),
			}, {
				menu: { prevented: true, labels: ['Stop Workflow'], enabled: true, requests: 0 },
				requests: ['pause'], status: 'paused', stop: run.stopAfter, receipts: run.receipts, firstTurns: run.firstTurns,
				confirmationHidden: false, confirmation: 'Continue', focused: true,
			});
		});
	}

	test('the stopping-line context menu is keyboard accessible even before the first checkpoint starts', async () => {
		const { model, action, controls, menuActions } = createWidget({}, { ...testWorkflowRun(), status: 'waiting' });
		action('stop').focus();
		action('stop').dispatchEvent(new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }));
		await menuActions()[0].run();
		assert.deepStrictEqual({
			menu: menuActions().map(action => action.label), requests: controls.map(control => control.kind),
			status: model.run.get().status, stop: model.run.get().stopAfter, receipts: model.run.get().receipts,
		}, { menu: ['Stop Workflow'], requests: ['pause'], status: 'paused', stop: 'implement', receipts: [] });
	});

	test('Continue appears only for interrupted work within the confirmed stopping point', () => {
		const { widget, model, action, controls, menuActions } = createWidget();
		const states = (['running', 'waiting', 'paused', 'blocked', 'stopped', 'cancelled'] as const).map(runStatus => {
			model.run.set({ ...model.run.get(), checkpointIndex: 1, status: runStatus, stopAfter: runStatus === 'stopped' ? 'plan' : 'implement' }, undefined);
			action('stop').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
			return {
				status: runStatus,
				canContinue: !widget.domNode.querySelector<HTMLElement>('.workflow-stop-confirmation')!.hidden,
				canStop: menuActions()[0].enabled,
			};
		});
		model.run.set({ ...model.run.get(), status: 'paused', stopAfter: 'plan' }, undefined);
		const outsideBoundary = widget.domNode.querySelector<HTMLElement>('.workflow-stop-confirmation')!.hidden;
		model.run.set(testWorkflowRunWithStartCondition(), undefined);
		action('stop').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
		assert.deepStrictEqual({
			states, outsideBoundary,
			completed: { hidden: widget.domNode.querySelector<HTMLElement>('.workflow-stop-confirmation')!.hidden, canStop: menuActions()[0].enabled },
			requests: controls.length,
		}, {
			states: [
				{ status: 'running', canContinue: false, canStop: true },
				{ status: 'waiting', canContinue: false, canStop: true },
				{ status: 'paused', canContinue: true, canStop: false },
				{ status: 'blocked', canContinue: true, canStop: false },
				{ status: 'stopped', canContinue: false, canStop: false },
				{ status: 'cancelled', canContinue: false, canStop: false },
			],
			outsideBoundary: true, completed: { hidden: true, canStop: false }, requests: 0,
		});
	});

	test('editing an interrupted workflow does not restart it until Continue is explicitly invoked', async () => {
		const { widget, model, action, controls } = createWidget({}, { ...testWorkflowRun(), status: 'paused' });
		action('stop').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
		const proposed = { requests: controls.length, status: model.run.get().status };
		action('Apply').click();
		await timeout(0);
		const applied = { requests: controls.map(control => control.kind), status: model.run.get().status, stop: model.run.get().stopAfter };
		action('Continue').focus();
		action('Continue').click();
		await timeout(0);
		assert.deepStrictEqual({
			proposed, applied,
			continued: { requests: controls.map(control => control.kind), status: model.run.get().status, stop: model.run.get().stopAfter },
			hidden: widget.domNode.querySelector<HTMLElement>('.workflow-stop-confirmation')!.hidden,
			focused: dom.getActiveElement() === action('stop'),
		}, {
			proposed: { requests: 0, status: 'paused' },
			applied: { requests: ['setStopAfter'], status: 'paused', stop: 'plan' },
			continued: { requests: ['setStopAfter', 'resume'], status: 'running', stop: 'plan' },
			hidden: true, focused: true,
		});
	});

	test('Escape cancels a proposal from the confirmation toolbar and restores slider focus', () => {
		const { model, action, controls } = createWidget();
		model.proposeStop('plan');
		action('Cancel').focus();
		action('Cancel').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		assert.deepStrictEqual({
			proposal: model.proposedStopAfter.get(), requests: controls.length, focused: dom.getActiveElement() === action('stop'),
		}, { proposal: undefined, requests: 0, focused: true });
	});

	test('pointer dragging previews the stopping line, drop does not apply, and Escape cancels', () => {
		const { widget, model, action, controls } = createWidget();
		widget.domNode.style.width = '400px';
		for (const row of widget.domNode.querySelectorAll<HTMLElement>('.workflow-checkpoint')) {
			row.style.height = '40px';
		}
		const boundary = widget.domNode.querySelector<HTMLElement>('.workflow-stop-line')!;
		boundary.style.height = '32px';
		const target = widget.domNode.querySelector<HTMLElement>('.workflow-checkpoint')!;
		const start = boundary.getBoundingClientRect();
		action('stop').dispatchEvent(new PointerEvent('pointerdown', { pointerId: 17, buttons: 1, button: 0, clientY: start.top + start.height / 2, bubbles: true }));
		mainWindow.dispatchEvent(new PointerEvent('pointermove', { pointerId: 17, buttons: 1, clientY: target.getBoundingClientRect().bottom }));
		mainWindow.dispatchEvent(new PointerEvent('pointerup', { pointerId: 17 }));
		const dropped = { proposal: model.proposedStopAfter.get(), moving: boundary.classList.contains('dragging'), transform: boundary.style.transform, requests: controls.length };
		action('stop').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		assert.deepStrictEqual({ dropped, cancelled: model.proposedStopAfter.get(), stop: model.run.get().stopAfter, requests: controls.length }, {
			dropped: { proposal: 'plan', moving: false, transform: '', requests: 0 }, cancelled: undefined, stop: 'implement', requests: 0,
		});
	});
});
