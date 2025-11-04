/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInputCapabilities, IUntypedEditorInput } from '../../../common/editor.js';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { localize } from '../../../../nls.js';

export class AiEditorInput extends EditorInput {

	static readonly ID = 'workbench.input.aiEditor';

	static create(): AiEditorInput {
		return new AiEditorInput();
	}

	override get typeId(): string {
		return AiEditorInput.ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton;
	}

	override getName(): string {
		return localize('aiEditor', "AI Editor");
	}

	override getDescription(): string {
		return localize('aiEditorDescription', "Browse web pages and chat with AI");
	}

	override getIcon(): ThemeIcon {
		return Codicon.robot;
	}

	override get resource(): undefined {
		return undefined; // AI Editor doesn't have a backing file resource
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(otherInput) || otherInput instanceof AiEditorInput;
	}
}