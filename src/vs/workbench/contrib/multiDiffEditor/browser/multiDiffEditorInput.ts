/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import { DEFAULT_EDITOR_ASSOCIATION, EditorInputCapabilities } from 'vs/workbench/common/editor';
import { EditorInput } from 'vs/workbench/common/editor/editorInput';

export class MultiDiffEditorInput extends EditorInput {
	static readonly ID: string = 'workbench.input.multiDiffEditor';

	get resource(): URI | undefined {
		return undefined;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly;
	}

	override get typeId(): string {
		return MultiDiffEditorInput.ID;
	}

	override getName(): string {
		return this.label ?? localize('name', "Multi Diff Editor");
	}

	override get editorId(): string {
		return DEFAULT_EDITOR_ASSOCIATION.id;
	}

	constructor(readonly label: string | undefined, readonly resources: readonly MultiDiffEditorInputData[]) {
		super();
	}
}

export class MultiDiffEditorInputData {
	constructor(
		readonly resource: URI,
		readonly original: URI | undefined,
		readonly modified: URI | undefined
	) { }
}
