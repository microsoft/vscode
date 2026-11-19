/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MockContextKeyService } from '../../../../../platform/keybinding/test/common/mockKeybindingService.js';
import { SideBySideEditor } from '../../../../browser/parts/editor/sideBySideEditor.js';
import { IEditorPane, IVisibleEditorPane } from '../../../../common/editor.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { ActiveImagePreviewContext, ActiveImagePreviewContextKeyContribution } from '../../browser/activeMediaPreview.js';
import { ImagePreviewEditor } from '../../browser/imagePreviewEditor.js';

suite('Media Preview - ActiveImagePreviewContext', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('follows the focused side of diffs', () => {
		const onDidActiveEditorChange = store.add(new Emitter<void>());
		const onDidChangeControl = store.add(new Emitter<void>());
		const imagePane = Object.create(ImagePreviewEditor.prototype) as ImagePreviewEditor;
		const videoPane = upcastPartial<IEditorPane>({});
		let focusedSide: IEditorPane | undefined = imagePane;
		const diffPane = Object.assign(Object.create(SideBySideEditor.prototype), {
			onDidChangeControl: onDidChangeControl.event,
			getLastFocusedEditorPane: () => focusedSide,
		}) as SideBySideEditor;

		let activeEditorPane: IVisibleEditorPane | undefined = imagePane as IVisibleEditorPane;
		const editorService = upcastPartial<IEditorService>({
			get activeEditorPane() { return activeEditorPane; },
			onDidActiveEditorChange: onDidActiveEditorChange.event,
		});
		const contextKeyService = new MockContextKeyService();
		store.add(new ActiveImagePreviewContextKeyContribution(editorService, contextKeyService));
		const isActive = () => contextKeyService.getContextKeyValue(ActiveImagePreviewContext.key);

		const states: Record<string, unknown> = { standaloneImage: isActive() };

		activeEditorPane = diffPane as IVisibleEditorPane;
		onDidActiveEditorChange.fire();
		states.diffFocusedOnImage = isActive();

		focusedSide = videoPane;
		onDidChangeControl.fire();
		states.diffFocusedOnVideo = isActive();

		activeEditorPane = undefined;
		onDidActiveEditorChange.fire();
		focusedSide = imagePane;
		onDidChangeControl.fire();
		states.noEditorAfterDiffClosed = isActive();

		assert.deepStrictEqual(states, {
			standaloneImage: true,
			diffFocusedOnImage: true,
			diffFocusedOnVideo: false,
			noEditorAfterDiffClosed: false,
		});
	});
});
