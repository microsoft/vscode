/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { EditorInput } from '../../../common/editor/editorInput.js';
import { URI } from '../../../../base/common/uri.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorSerializer } from '../../../common/editor.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IBaseUntypedEditorInput } from '../../../../platform/editor/common/editor.js';

export class AiBrowserEditorInput extends EditorInput {

	static readonly ID = 'workbench.input.aiBrowser';

	private static _counter = 0;
	private readonly _id = AiBrowserEditorInput._counter++;

	constructor() {
		super();
	}

	override get typeId(): string {
		return AiBrowserEditorInput.ID;
	}

	override get editorId(): string {
		return 'workbench.editor.aiBrowser';
	}

	override get resource(): URI | undefined {
		return undefined;
	}

	override getName(): string {
		return 'AI Browser';
	}

	override getDescription(): string {
		return 'AI-Powered Web Browser';
	}

	override getIcon(): ThemeIcon | undefined {
		return undefined;
	}

	override matches(otherInput: EditorInput | IBaseUntypedEditorInput): boolean {
		if (otherInput === this) {
			return true;
		}
		if (otherInput instanceof AiBrowserEditorInput) {
			return otherInput._id === this._id;
		}
		return false;
	}

	override dispose(): void {
		super.dispose();
	}
}

// Serializer for saving/restoring editor state
export class AiBrowserEditorSerializer implements IEditorSerializer {

	canSerialize(): boolean {
		return true;
	}

	serialize(input: AiBrowserEditorInput): string {
		return JSON.stringify({
			typeId: input.typeId
		});
	}

	deserialize(instantiationService: IInstantiationService, serializedEditorInput: string): AiBrowserEditorInput {
		return new AiBrowserEditorInput();
	}
}
