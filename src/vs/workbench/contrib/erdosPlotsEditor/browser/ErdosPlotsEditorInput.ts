/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2024-2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { localize } from '../../../../nls.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { IUntypedEditorInput } from '../../../common/editor.js';

/**
 * ErdosPlotsEditorInput class for managing plots editor inputs.
 */
export class ErdosPlotsEditorInput extends EditorInput {

	static count = 0;
	readonly uniqueId: string = `erdos-plots-editor-${ErdosPlotsEditorInput.count++}`;

	static readonly ID: string = 'workbench.input.erdosPlotsEditor';
	static readonly EditorID: string = 'workbench.editor.erdosPlotsEditor';

	constructor(
		public readonly plotId: string,
		public readonly plotTitle: string
	) {
		super();
	}

	override get typeId(): string {
		return ErdosPlotsEditorInput.ID;
	}

	override get editorId(): string {
		return ErdosPlotsEditorInput.EditorID;
	}

	override getName(): string {
		return this.plotTitle || localize('erdosPlotsEditorInputName', "Erdos Plot");
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return otherInput instanceof ErdosPlotsEditorInput &&
			otherInput.plotId === this.plotId;
	}

	override get resource(): URI | undefined {
		// Plots don't have a file resource
		return undefined;
	}
}
