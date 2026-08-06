/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ValueWithChangeEvent } from '../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { URI } from '../../../../../base/common/uri.js';
import { MultiDiffEditorViewModel } from '../../../../../editor/browser/widget/multiDiffEditor/multiDiffEditorViewModel.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IChangesViewService } from '../../common/changesViewService.js';
import { ISessionChangesService } from '../../browser/sessionChangesService.js';
import { IAgentWorkbenchLayoutService } from '../../../../browser/workbench.js';
import { TestEditorGroupView, workbenchInstantiationService } from '../../../../../workbench/test/browser/workbenchTestServices.js';
import { MultiDiffEditorInput } from '../../../../../workbench/contrib/multiDiffEditor/browser/multiDiffEditorInput.js';
import { SessionChangesEditor } from '../../browser/sessionChangesEditor.js';
import { SessionChangesEditorInput } from '../../browser/sessionChangesEditorInput.js';

suite('SessionChangesEditorInput', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('releases resolved multi-diff models without disposing restorable input state', async () => {
		const instantiationService = disposables.add(new TestInstantiationService());
		const viewModel = disposables.add(new MultiDiffEditorViewModel({
			documents: ValueWithChangeEvent.const([]),
		}, instantiationService));

		let firstModelReferenceDisposed = false;
		instantiationService.stubInstance(MultiDiffEditorInput, {
			getViewModel: async () => viewModel,
			dispose: () => firstModelReferenceDisposed = true,
		});

		const input = disposables.add(new SessionChangesEditorInput(
			URI.parse('changes-multi-diff-source:?{"sessionResource":"agent-host-copilotcli:/session"}'),
			instantiationService,
		));
		await input.getViewModel();
		input.releaseResolvedModel();

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

			override releaseResolvedModel(): void {
				this.released = true;
				super.releaseResolvedModel();
			}
		}

		const instantiationService = workbenchInstantiationService(undefined, disposables);
		instantiationService.stub(IChangesViewService, {});
		instantiationService.stub(IAgentWorkbenchLayoutService, {});
		instantiationService.stub(ISessionChangesService, {});

		const editor = disposables.add(instantiationService.createInstance(TestSessionChangesEditor, new TestEditorGroupView(1)));
		const input = disposables.add(new TestSessionChangesEditorInput(
			URI.parse('changes-multi-diff-source:?{"sessionResource":"agent-host-copilotcli:/session"}'),
			instantiationService,
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
});
