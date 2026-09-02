/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { Emitter, Event, ValueWithChangeEvent } from '../../../../../base/common/event.js';
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
import { SessionChangesEditor } from '../../browser/sessionChangesEditor.js';
import { SessionChangesEditorInput } from '../../browser/sessionChangesEditorInput.js';
import { ISessionChangesService } from '../../browser/sessionChangesService.js';
import { IChangesViewService } from '../../common/changesViewService.js';

suite('SessionChangesEditorInput', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('releases resolved multi-diff models without disposing restorable input state', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		instantiationService.stub(IWorkbenchLayoutService, new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = Event.None;
			override isVisible(): boolean {
				return true;
			}
		});
		const viewModel = disposables.add(new MultiDiffEditorViewModel({
			documents: ValueWithChangeEvent.const([]),
		}, instantiationService));

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
		instantiationService.stub(IChangesViewService, {});
		instantiationService.stub(IAgentWorkbenchLayoutService, {});
		instantiationService.stub(ISessionChangesService, {});
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
		instantiationService.stub(IChangesViewService, {});
		instantiationService.stub(IAgentWorkbenchLayoutService, {});
		instantiationService.stub(ISessionChangesService, {});
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

	test('updates managed Changes editor capabilities with editor area visibility', () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		let editorVisible = false;
		const onDidChangePartVisibility = disposables.add(new Emitter<IPartVisibilityChangeEvent>());
		const layoutService = new class extends mock<IWorkbenchLayoutService>() {
			override readonly onDidChangePartVisibility = onDidChangePartVisibility.event;
			override isVisible(part: Parts): boolean {
				return part === Parts.EDITOR_PART && editorVisible;
			}
		};
		const input = disposables.add(new SessionChangesEditorInput(URI.parse('test-changes:session'), instantiationService, layoutService));
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
});
