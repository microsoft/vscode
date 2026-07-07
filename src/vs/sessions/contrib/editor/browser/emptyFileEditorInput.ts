/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { URI } from '../../../../base/common/uri.js';
import { EditorInputCapabilities, IEditorSerializer, IUntypedEditorInput, Verbosity } from '../../../../workbench/common/editor.js';
import { EditorInput } from '../../../../workbench/common/editor/editorInput.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';

export class EmptyFileEditorInput extends EditorInput {

	static readonly ID = 'workbench.editors.agentSessions.emptyFile';
	static readonly EDITOR_ID = 'workbench.editor.agentSessions.emptyFile';

	override get resource(): URI | undefined {
		return undefined;
	}

	override get typeId(): string {
		return EmptyFileEditorInput.ID;
	}

	override get editorId(): string {
		return EmptyFileEditorInput.EDITOR_ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton | EditorInputCapabilities.ForceReveal;
	}

	override getName(): string {
		return localize('emptyFileEditor.name', "Files");
	}

	override getIcon(): ThemeIcon {
		return Codicon.files;
	}

	override getTitle(_verbosity?: Verbosity): string {
		return this.getName();
	}

	override canReopen(): boolean {
		return true;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return super.matches(otherInput) || otherInput instanceof EmptyFileEditorInput;
	}
}

export class EmptyFileEditorSerializer implements IEditorSerializer {

	canSerialize(editorInput: EditorInput): editorInput is EmptyFileEditorInput {
		return editorInput instanceof EmptyFileEditorInput;
	}

	serialize(editorInput: EditorInput): string | undefined {
		return this.canSerialize(editorInput) ? '' : undefined;
	}

	deserialize(instantiationService: IInstantiationService, _serializedEditor: string): EditorInput {
		return instantiationService.createInstance(EmptyFileEditorInput);
	}
}
