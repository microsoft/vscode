/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import * as nls from 'vs/nls';
import { IUntypedEditorInput } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';
import { InteractiveSessionEditor } from 'vs/workbench/contrib/interactiveSession/browser/interactiveSessionEditor';

export class InteractiveSessionEditorInput extends EditorInput {
	static readonly ID: string = 'workbench.input.interactiveSession';

	constructor(readonly resource: URI) {
		super();
	}

	override get editorId(): string | undefined {
		return InteractiveSessionEditor.ID;
	}

	override matches(otherInput: EditorInput | IUntypedEditorInput): boolean {
		return otherInput instanceof InteractiveSessionEditorInput && otherInput.resource.toString() === this.resource.toString();
	}

	override get typeId(): string {
		return InteractiveSessionEditorInput.ID;
	}

	override getName(): string {
		return nls.localize('interactiveSessionEditorName', "Interactive Session");
	}

	override async resolve(): Promise<null> {
		return null;
	}
}
