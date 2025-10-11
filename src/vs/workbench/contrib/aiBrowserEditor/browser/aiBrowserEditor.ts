/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorPane } from '../../../browser/parts/editor/editorPane.js';
import { Dimension } from '../../../../base/browser/dom.js';

export class AiBrowserEditor extends EditorPane {
	// Create DOM structure with:
	// - Left panel (80%): embedded browser (webview or iframe)
	// - Right panel (20%): chat interface

	protected createEditor(parent: HTMLElement): void {
		// TODO: Implement DOM structure
	}

	override layout(dimension: Dimension): void {
		// TODO: Implement layout logic
	}
}
