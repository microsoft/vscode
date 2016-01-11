/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ICodeEditor} from 'vs/editor/browser/editorBrowser';
import {StringEditorInput} from 'vs/workbench/common/editor/stringEditorInput';
import {BaseTextEditor} from 'vs/workbench/browser/parts/editor/textEditor';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';

/**
 * A read-only text editor input whos contents are made of the provided value and mime type. As a subclass of StringEditorInput
 * it adds additional functionality suitable for using it to show output or logs.
 */
export class LogEditorInput extends StringEditorInput {

	public static ID = 'workbench.editors.logEditorInput';

	constructor(
		name: string,
		description: string,
		value: string,
		mime: string,
		singleton: boolean,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(name, description, value, mime, singleton, instantiationService);
	}

	public getId(): string {
		return LogEditorInput.ID;
	}

	/**
	 * Appends text to the end of this input and automatically reveals the last line if an editor is visible with this input.
	 */
	public append(value: string): void {
		super.append(value);

		this.revealLastLine();
	}

	/**
	 * Removes all lines from the top if the line number exceeds the given line count. Returns the new value if lines got trimmed.
	 * Automatically reveals the last line if an editor is visible with this input.
	 *
	 * Note: This method is a no-op if the input has not yet been resolved.
	 */
	public trim(linecount: number): string {
		let newValue = super.trim(linecount);
		if (newValue !== null) {
			this.revealLastLine();
		}

		return newValue;
	}

	private revealLastLine(): void {
		let editors = this.editorService.getVisibleEditors();
		for (let i = 0; i < editors.length; i++) {
			let editor = editors[i];
			if (editor.input === this && editor instanceof BaseTextEditor) {
				let textEditor = <BaseTextEditor>editor;
				let editorControl = <ICodeEditor>textEditor.getControl();
				if (editorControl) {
					let model = editorControl.getModel();
					if (model) {
						let lastLine = model.getLineCount();
						editorControl.revealLine(lastLine);
					}
				}
			}
		}
	}
}