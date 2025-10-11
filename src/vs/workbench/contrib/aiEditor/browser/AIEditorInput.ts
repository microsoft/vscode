/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../common/editor/editorInput.js';

export class AIEditorInput extends EditorInput {

	static readonly ID = 'aiEditorInput';

	override get typeId(): string { return AIEditorInput.ID; }

	// No backing resource for now
	get resource(): undefined { return undefined; }

	override getName(): string { return 'AI Editor'; }
}


