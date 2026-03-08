/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { Codicon } from '../../../../../base/common/codicons.js';

export class LiquidCanvasEditorInput extends EditorInput {

	static readonly TypeID = 'workbench.input.phonon.canvas';
	static readonly EditorID = 'workbench.editor.phonon.canvas';

	private static _counter = 0;

	static getNewEditorUri(): URI {
		return URI.from({ scheme: 'phonon-canvas', path: `canvas-${LiquidCanvasEditorInput._counter++}` });
	}

	readonly resource: URI;

	constructor(resource?: URI) {
		super();
		this.resource = resource ?? LiquidCanvasEditorInput.getNewEditorUri();
	}

	override get typeId(): string {
		return LiquidCanvasEditorInput.TypeID;
	}

	override get editorId(): string {
		return LiquidCanvasEditorInput.EditorID;
	}

	override getName(): string {
		return 'Phonon Canvas';
	}

	override getIcon(): ThemeIcon {
		return Codicon.layout;
	}

	override matches(otherInput: EditorInput | unknown): boolean {
		return otherInput instanceof LiquidCanvasEditorInput
			&& otherInput.resource.toString() === this.resource.toString();
	}
}
