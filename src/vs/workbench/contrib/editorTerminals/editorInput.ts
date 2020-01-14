/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { URI } from 'vs/base/common/uri';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import type { ITerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';

export class TerminalEditorInput extends ResourceEditorInput {
	static terminalCount = 0;

	static readonly ID = 'vs.workbench.contrib.editorTerminals.editorInput';

	private _used: boolean = false;

	constructor(
		public readonly terminalInstance: ITerminalInstance,
		@ITextModelService textModelResolverService: ITextModelService,
		@ITextFileService textFileService: ITextFileService,
		@IEditorService editorService: IEditorService
	) {
		super(terminalInstance.title, terminalInstance.title,
			URI.parse('terminal://editor-terminals/' + new Date().getTime() + (TerminalEditorInput.terminalCount++) + '/terminal'), undefined,
			textModelResolverService, textFileService, editorService);
	}

	get used() {
		return this._used;
	}

	use() {
		if (this._used) {
			throw new Error('Should not be used');
		}
		this._used = true;
	}

	release() {
		if (!this._used) {
			throw new Error('Should be used');
		}
		this._used = false;
	}

	getTypeId(): string {
		return TerminalEditorInput.ID;
	}

	isDirty(): boolean {
		return true;
	}

	dispose() {
		this.terminalInstance.dispose();
	}
}
