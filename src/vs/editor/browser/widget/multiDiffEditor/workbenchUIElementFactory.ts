/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionViewItem } from '../../../../base/browser/ui/actionbar/actionbar.js';
import { IActionViewItemOptions } from '../../../../base/browser/ui/actionbar/actionViewItems.js';
import { IAction } from '../../../../base/common/actions.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';

/**
 * Which of a multi-diff entry's two file-path labels is being created: the
 * primary (modified/current) label, or the secondary (original) label shown for
 * renames.
 */
export const enum MultiDiffEditorItemLabelKind {
	Primary = 'primary',
	Secondary = 'secondary',
}

/**
 * This solves the problem that the editor layer cannot depend on the workbench layer.
 *
 * Maybe the multi diff editor widget should be moved to the workbench layer?
 * This would make monaco-editor consumption much more difficult though.
 */
export interface IWorkbenchUIElementFactory {
	createResourceLabel?(element: HTMLElement, kind: MultiDiffEditorItemLabelKind): IResourceLabel;

	/**
	 * When true, the entire header area is clickable to toggle collapse/expand
	 * and receives keyboard activation (Enter/Space) and ARIA button semantics.
	 */
	readonly headerClickToCollapse?: boolean;

	/**
	 * Optional override for how individual actions render in the per-file header
	 * toolbar (`MenuId.MultiDiffEditorFileToolbar`). Return `undefined` to fall
	 * back to the default icon/label rendering.
	 */
	createToolbarActionViewItem?(action: IAction, options: IActionViewItemOptions): IActionViewItem | undefined;
}

export interface IResourceLabel extends IDisposable {
	setUri(uri: URI | undefined, options?: IResourceLabelOptions): void;
}

export interface IResourceLabelOptions {
	strikethrough?: boolean;
}
