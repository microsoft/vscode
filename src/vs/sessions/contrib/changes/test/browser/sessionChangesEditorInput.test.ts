/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event, ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { toDisposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, derived, observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MultiDiffEditorViewModel } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { EditorInputCapabilities } from '../../../../../workbench/common/editor.js';
import { MultiDiffEditorInput } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { ISessionFileChange } from '../../../../services/sessions/common/session.js';
import { SessionChangesEditor } from '../../browser/sessionChangesEditor.js';
import { SessionChangesEditorInput } from '../../browser/sessionChangesEditorInput.js';
import { ISessionChangesService } from '../../browser/sessionChangesService.js';
import { IChangesViewService } from '../../common/changesViewService.js';
import { ISessionChangesModelService } from '../../browser/sessionChangesModelService.js';

suite('SessionChangesEditorInput', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const emptyChangesViewService = new class extends mock<IChangesViewService>() {
		override readonly activeSessionChangesObs = constObservable<readonly ISessionFileChange[]>([]);
	};
	const emptySessionChangesService = new class extends mock<ISessionChangesService>() {
		override readonly activeSessionUncommittedChangesCountObs = constObservable(0);
	};
	const emptyModelService = new class extends mock<ISessionChangesModelService>() { };

	test('releases the model lease without disposing restorable input state', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = Event.None;
			override isVisible(): boolean {
				return true;
			}
		});
		instantiationService.stub(IChangesViewService, emptyChangesViewService);
		instantiationService.stub(ISessionChangesService, emptySessionChangesService);
		const viewModel = disposables.add(new MultiDiffEditorViewModel({
			documents: ValueWithChangeEvent.const([]),
		}, instantiationService));
		instantiationService.stub(ISessionChangesModelService, new class extends mock<ISessionChangesModelService>() {
			override acquire(resource: URI) {
				const input = MultiDiffEditorInput.fromResourceMultiDiffEditorInput({ multiDiffSource: resource }, instantiationService);
				return Object.assign(toDisposable(() => input.dispose()), { object: input });
			}
		});

		let firstModelReferenceDisposed = false;
		instantiationService.stubInstance(MultiDiffEditorInput, {
			getViewModel: async () => viewModel,
			dispose: () => firstModelReferenceDisposed = true,
		});

		const input = disposables.add(instantiationService.createInstance(
			SessionChangesEditorInput,
			URI.parse('changes-multi-diff-source:?{"sessionResource":"agent-host-copilotcli:/session"}'),
		));
		await input.getViewModel();
		input.clear();

		let secondModelResolved = false;
		instantiationService.stubInstance(MultiDiffEditorInput, {
			getViewModel: async () => {
				secondModelResolved = true;
				return viewModel;
			},
			dispose: () => { },
		});
		await input.getViewModel();

		assert.deepStrictEqual({
			firstModelReferenceDisposed,
			outerInputDisposed: input.isDisposed(),
			secondModelResolved,
		}, {
			firstModelReferenceDisposed: true,
			outerInputDisposed: false,
			secondModelResolved: true,
		});
	});

	test('clearing the editor pane releases the resolved multi-diff model', () => {
		class TestSessionChangesEditor extends SessionChangesEditor {
			setCurrentInput(input: SessionChangesEditorInput): void {
				this._input = input;
			}
		}

		class TestSessionChangesEditorInput extends SessionChangesEditorInput {
			released = false;

			override clear(): void {
				this.released = true;
				super.clear();
			}
		}

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(ISessionChangesModelService, emptyModelService);
		instantiationService.stub(IChangesViewService, emptyChangesViewService);
		instantiationService.stub(IAgentWorkbenchLayoutService, {});
		instantiationService.stub(ISessionChangesService, emptySessionChangesService);
		instantiationService.stub(IWorkbenchLayoutService, {
			onDidChangePartVisibility: Event.None,
			isVisible: () => true,
		});

		const editor = disposables.add(instantiationService.createInstance(TestSessionChangesEditor, new TestEditorGroupView(1)));
		const input = disposables.add(instantiationService.createInstance(
			TestSessionChangesEditorInput,
			URI.parse('changes-multi-diff-source:?{"sessionResource":"agent-host-copilotcli:/session"}'),
		));
		editor.setCurrentInput(input);

		editor.clearInput();

		assert.deepStrictEqual({
			inputReleased: input.released,
			editorInput: editor.input,
		}, {
			inputReleased: true,
			editorInput: undefined,
		});
	});

	test('does not resolve a canceled editor input', async () => {
		class TestSessionChangesEditorInput extends SessionChangesEditorInput {
			viewModelRequested = false;

			override async getViewModel(): Promise<MultiDiffEditorViewModel> {
				this.viewModelRequested = true;
				throw new Error('Canceled input must not be resolved');
			}
		}

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(ISessionChangesModelService, emptyModelService);
		instantiationService.stub(IChangesViewService, emptyChangesViewService);
		instantiationService.stub(IAgentWorkbenchLayoutService, {});
		instantiationService.stub(ISessionChangesService, emptySessionChangesService);
		instantiationService.stub(IWorkbenchLayoutService, {
			onDidChangePartVisibility: Event.None,
			isVisible: () => true,
		});

		const editor = disposables.add(instantiationService.createInstance(SessionChangesEditor, new TestEditorGroupView(1)));
		const input = disposables.add(instantiationService.createInstance(
			TestSessionChangesEditorInput,
			URI.parse('changes-multi-diff-source:?{"sessionResource":"agent-host-copilotcli:/session"}'),
		));
		const operation = disposables.add(new CancellationTokenSource());
		operation.cancel();

		await editor.setInput(input, undefined, {}, operation.token);

		assert.deepStrictEqual(input.viewModelRequested, false);
	});

	test('cancels a pending model wait without cancelling another input lease', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const result = new DeferredPromise<MultiDiffEditorViewModel>();
		let leasesReleased = 0;
		const model = new class extends mock<MultiDiffEditorInput>() {
			override getViewModel() {
				return result.p;
			}
		};
		const modelService = new class extends mock<ISessionChangesModelService>() {
			override acquire() {
				return Object.assign(toDisposable(() => leasesReleased++), { object: model });
			}
		};
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = Event.None;
		};
		const first = disposables.add(new SessionChangesEditorInput(URI.parse('test-changes:session'), modelService, emptySessionChangesService, layoutService));
		const second = disposables.add(new SessionChangesEditorInput(first.resource, modelService, emptySessionChangesService, layoutService));
		const cancellation = disposables.add(new CancellationTokenSource());
		const pending = first.getViewModel(cancellation.token);
		const other = second.getViewModel();
		cancellation.cancel();
		await assert.rejects(pending, CancellationError);
		first.clear();
		const viewModel = disposables.add(new MultiDiffEditorViewModel({ documents: ValueWithChangeEvent.const([]) }, instantiationService));
		await result.complete(viewModel);
		assert.deepStrictEqual({ otherResolved: await other === viewModel, leasesReleased }, { otherResolved: true, leasesReleased: 1 });
	});

	test('clearing cancels every pending resolution while keeping the input restorable', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const result = new DeferredPromise<MultiDiffEditorViewModel>();
		const model = new class extends mock<MultiDiffEditorInput>() {
			override getViewModel() { return result.p; }
		};
		let acquired = 0;
		let released = 0;
		const modelService = new class extends mock<ISessionChangesModelService>() {
			override acquire() {
				acquired++;
				return Object.assign(toDisposable(() => released++), { object: model });
			}
		};
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = Event.None;
		};
		const input = disposables.add(new SessionChangesEditorInput(URI.parse('test-changes:session'), modelService, emptySessionChangesService, layoutService));
		const pending = Promise.allSettled([input.getViewModel(), input.getViewModel()]);
		input.clear();
		const cancelled = (await pending).filter(result => result.status === 'rejected' && result.reason instanceof CancellationError).length;
		const viewModel = disposables.add(new MultiDiffEditorViewModel({ documents: ValueWithChangeEvent.const([]) }, instantiationService));
		await result.complete(viewModel);
		const restored = await input.getViewModel();
		assert.deepStrictEqual({ cancelled, acquired, released, inputDisposed: input.isDisposed(), restored: restored === viewModel }, {
			cancelled: 2, acquired: 2, released: 1, inputDisposed: false, restored: true,
		});
	});

	test('opener cancellation prevents a late resolve without poisoning a later restore', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const viewModel = disposables.add(new MultiDiffEditorViewModel({ documents: ValueWithChangeEvent.const([]) }, instantiationService));
		let acquired = 0;
		const model = new class extends mock<MultiDiffEditorInput>() {
			override async getViewModel() { return viewModel; }
		};
		const modelService = new class extends mock<ISessionChangesModelService>() {
			override acquire() {
				acquired++;
				return Object.assign(toDisposable(() => { }), { object: model });
			}
		};
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = Event.None;
		};
		const input = disposables.add(new SessionChangesEditorInput(URI.parse('test-changes:session'), modelService, emptySessionChangesService, layoutService));
		const first = disposables.add(new CancellationTokenSource());
		const latest = disposables.add(new CancellationTokenSource());
		const firstScope = disposables.add(input.bindCancellationToken(first.token));
		const latestScope = disposables.add(input.bindCancellationToken(latest.token));
		firstScope.dispose();
		latest.cancel();
		await assert.rejects(input.getViewModel(), CancellationError);
		const acquiredWhileCancelled = acquired;
		latestScope.dispose();
		assert.deepStrictEqual({ acquiredWhileCancelled, restored: await input.getViewModel() === viewModel, acquired }, {
			acquiredWhileCancelled: 0, restored: true, acquired: 1,
		});
	});

	test('updates managed Changes editor capabilities with editor area visibility', () => {
		let editorVisible = false;
		const onDidChangePartVisibility = disposables.add(new Emitter<IPartVisibilityChangeEvent>());
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = onDidChangePartVisibility.event;
			override isVisible(part: Parts): boolean {
				return part === Parts.EDITOR_PART && editorVisible;
			}
		};
		const input = disposables.add(new SessionChangesEditorInput(
			URI.parse('test-changes:session'),
			emptyModelService,
			emptySessionChangesService,
			layoutService,
		));
		let capabilitiesChanges = 0;
		disposables.add(input.onDidChangeCapabilities(() => capabilitiesChanges++));

		const hiddenCapabilities = input.capabilities;
		editorVisible = true;
		onDidChangePartVisibility.fire({ partId: Parts.EDITOR_PART, visible: true });

		assert.deepStrictEqual({
			hiddenCapabilities,
			visibleCapabilities: input.capabilities,
			capabilitiesChanges
		}, {
			hiddenCapabilities: EditorInputCapabilities.ExcludeFromEditorLimit |
				EditorInputCapabilities.Singleton |
				EditorInputCapabilities.Readonly |
				EditorInputCapabilities.CannotClose,
			visibleCapabilities: EditorInputCapabilities.ExcludeFromEditorLimit |
				EditorInputCapabilities.Singleton |
				EditorInputCapabilities.Readonly,
			capabilitiesChanges: 1
		});
	});

	test('updates the tab badge class and accessible label with the changed file count', () => {
		const changes = observableValue<readonly ISessionFileChange[]>('changes', []);
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = Event.None;
			override isVisible(): boolean {
				return true;
			}
		};
		const resource = URI.parse('test-changes:session');
		const sessionChangesService = new class extends mock<ISessionChangesService>() {
			override readonly activeSessionUncommittedChangesCountObs = derived(reader => changes.read(reader).length);
		};
		const input = disposables.add(new SessionChangesEditorInput(
			resource,
			emptyModelService,
			sessionChangesService,
			layoutService,
		));
		let labelChanges = 0;
		disposables.add(input.onDidChangeLabel(() => labelChanges++));

		changes.set([createFileChange(1)], undefined);
		const oneChangeAriaLabel = input.getAriaLabel();
		changes.set(Array.from({ length: 10 }, (_, index) => createFileChange(index)), undefined);

		assert.deepStrictEqual({
			oneChangeAriaLabel,
			tenChangesAriaLabel: input.getAriaLabel(),
			labelExtraClasses: input.getLabelExtraClasses(),
			labelChanges,
		}, {
			oneChangeAriaLabel: 'Changes, 1 file',
			tenChangesAriaLabel: 'Changes, 10 files',
			labelExtraClasses: ['session-changes-editor-label'],
			labelChanges: 2,
		});
	});
});

function createFileChange(index: number): ISessionFileChange {
	const uri = URI.file(`/workspace/file${index}.ts`);
	return {
		uri,
		originalUri: uri.with({ scheme: 'git', query: 'ref=base' }),
		modifiedUri: uri.with({ scheme: 'git', query: 'ref=head' }),
		insertions: 1,
		deletions: 0,
	};
}
