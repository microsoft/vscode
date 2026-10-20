/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore, IDisposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { SideBySideEditor } from '../../../browser/parts/editor/sideBySideEditor.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IEditorPane } from '../../../common/editor.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ImagePreviewEditor } from './imagePreviewEditor.js';

/**
 * Whether the active editor is an image preview, or for diffs, whether the side that was focused
 * last is an image preview.
 */
export const ActiveImagePreviewContext = new RawContextKey<boolean>('activeImagePreview', false, localize('activeImagePreview', "Whether the active editor, or the focused side of the active diff editor, is an image preview"));

/**
 * Gets the editor pane the user works with: the active editor pane, or for side by side editors
 * such as diffs, the side that was focused last.
 */
export function getActiveInnerEditorPane(editorService: IEditorService): IEditorPane | undefined {
	const pane = editorService.activeEditorPane;
	return pane instanceof SideBySideEditor ? pane.getLastFocusedEditorPane() : pane;
}

/**
 * Calls `callback` with the {@link getActiveInnerEditorPane active inner editor pane} now and
 * whenever it changes, including when focus moves to the other side of a side by side editor.
 */
export function onDidChangeActiveInnerEditorPane(editorService: IEditorService, callback: (pane: IEditorPane | undefined) => void): IDisposable {
	const store = new DisposableStore();
	const sideListener = store.add(new MutableDisposable());
	const update = () => callback(getActiveInnerEditorPane(editorService));
	const onDidActiveEditorChange = () => {
		const pane = editorService.activeEditorPane;
		sideListener.value = pane instanceof SideBySideEditor ? pane.onDidChangeControl(update) : undefined;
		update();
	};
	store.add(editorService.onDidActiveEditorChange(onDidActiveEditorChange));
	onDidActiveEditorChange();
	return store;
}

/**
 * Keeps {@link ActiveImagePreviewContext} up to date.
 */
export class ActiveImagePreviewContextKeyContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.activeImagePreviewContextKey';

	constructor(
		@IEditorService editorService: IEditorService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();

		const activeImagePreview = ActiveImagePreviewContext.bindTo(contextKeyService);
		this._register(onDidChangeActiveInnerEditorPane(editorService, pane => activeImagePreview.set(pane instanceof ImagePreviewEditor)));
	}
}
