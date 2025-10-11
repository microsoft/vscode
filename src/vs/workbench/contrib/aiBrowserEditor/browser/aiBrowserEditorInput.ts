/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { EditorInput } from '../../../common/editor/editorInput.js';
import { URI } from '../../../../base/common/uri.js';

export class AiBrowserEditorInput extends EditorInput {
	static readonly ID = 'workbench.input.aiBrowser';

	override get typeId(): string {
		return AiBrowserEditorInput.ID;
	}

	override get resource(): URI | undefined {
		return undefined;
	}

	override getName(): string {
		return 'AI Browser';
	}

	override matches(other: EditorInput): boolean {
		return other instanceof AiBrowserEditorInput;
	}
}
