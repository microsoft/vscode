/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IComputedEditorOptions } from '../../../../common/config/editorOptions.js';
import { Selection } from '../../../../common/core/selection.js';

export interface IScreenReaderContent {

	/**
	 * Handle screen reader content before cutting the content
	 */
	onWillCut(): void;

	/**
	 * Handle screen reader content before pasting the content
	 */
	onWillPaste(): void;

	/**
	 * Handle configuration changes
	 */
	onConfigurationChanged(options: IComputedEditorOptions): void;

	/**
	 * Handle focus changes
	 */
	onFocusChange(newFocusValue: boolean): void;

	/**
	 * Set the screen reader content given the selection. It will update the content and set the range within the screen reader content if needed.
	 */
	setScreenReaderContent(primarySelection: Selection): void;
}
