/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { EditorInputCapabilities } from '../../../../../workbench/common/editor.js';
import { IPartVisibilityChangeEvent, IWorkbenchLayoutService, Parts } from '../../../../../workbench/services/layout/browser/layoutService.js';
import { SessionChangesEditorInput } from '../../browser/sessionChangesEditorInput.js';

suite('SessionChangesEditorInput', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

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
