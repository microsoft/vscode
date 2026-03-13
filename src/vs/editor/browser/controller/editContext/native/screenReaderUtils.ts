/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IComputedEditorOptions } from '../../../../common/config/editorOptions.js';
import { Selection } from '../../../../common/core/selection.js';

export interface IScreenReaderContent {

	dispose(): void;

	/**
	 * Handle screen reader content before cutting the content
	 */
	onWillCut(): void;

	/**
	 * Handle screen reader content before pasting the content
	 */
	onWillPaste(): void;

	/**
	 * Handle focus changes
	 */
	onFocusChange(newFocusValue: boolean): void;

	/**
	 * Handle configuration changes
	 */
	onConfigurationChanged(options: IComputedEditorOptions): void;

	/**
	 * Update the screen reader content given the selection. It will update the content and set the range within the screen reader content if needed.
	 */
	updateScreenReaderContent(primarySelection: Selection): void;

	/**
	 * Update the scroll top value of the screen reader content
	 */
	updateScrollTop(primarySelection: Selection): void;
}
