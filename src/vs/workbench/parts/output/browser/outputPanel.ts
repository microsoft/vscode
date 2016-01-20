/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {TPromise} from 'vs/base/common/winjs.base';
import actions = require('vs/base/common/actions');
import builder = require('vs/base/browser/builder');
import {IEditorOptions} from 'vs/editor/common/editorCommon';
import {EditorInput, EditorOptions} from 'vs/workbench/common/editor';
import {StringEditor} from 'vs/workbench/browser/parts/editor/stringEditor';

// TODO@Isidor trim and append need to reveal last line

export class OutputPanel extends StringEditor {

	public create(parent: builder.Builder): TPromise<void> {
		super.createEditor(parent);
		return TPromise.as(null);
	}

	public layout(dimension: builder.Dimension): void {
		super.layout(dimension);
	}

	public getActions(): actions.IAction[] {
		return [];
	}

	protected getCodeEditorOptions(): IEditorOptions {
		let options = super.getCodeEditorOptions();
		options.wrappingColumn = 0;				// all log editors wrap
		options.lineNumbers = false;				// all log editors hide line numbers

		return options;
	}

	public setInput(input: EditorInput, options: EditorOptions): TPromise<void> {
		return super.setInput(input, options).then(() => this.revealLastLine());
	}

	public focus(): void {
		super.focus();
		this.revealLastLine();
	}
}
