/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LineEdit, LineReplacement } from '../../../../util/vs/editor/common/core/edits/lineEdit';
import { BaseStringEdit, StringEdit } from '../../../../util/vs/editor/common/core/edits/stringEdit';
import { StringText } from '../../../../util/vs/editor/common/core/text/abstractText';
import { ensureDependenciesAreSet } from '../../../../util/vs/editor/common/core/text/positionToOffset';
import { RootedEdit } from './edit';

ensureDependenciesAreSet();

export class RootedLineEdit {
	public static fromEdit<TEdit extends BaseStringEdit>(edit: RootedEdit<TEdit>): RootedLineEdit {
		const lineEdit = LineEdit.fromStringEdit(edit.edit as BaseStringEdit as StringEdit, edit.base);
		return new RootedLineEdit(edit.base, lineEdit);
	}

	constructor(
		public readonly base: StringText,
		public readonly edit: LineEdit,
	) { }


	public toString(): string {
		return this.edit.humanReadablePatch(this.base.getLines());
	}

	public toEdit(): StringEdit {
		return this.edit.toEdit(this.base);
	}

	public toRootedEdit(): RootedEdit {
		return new RootedEdit(this.base, this.toEdit());
	}

	public getEditedState(): string[] {
		const lines = this.base.getLines();
		const newLines = this.edit.apply(lines);
		return newLines;
	}

	public removeCommonSuffixPrefixLines(): RootedLineEdit {
		const isNotEmptyEdit = (edit: LineReplacement) => !edit.lineRange.isEmpty || edit.newLines.length > 0;
		const newEdit = this.edit.replacements.map(e => e.removeCommonSuffixPrefixLines(this.base)).filter(e => isNotEmptyEdit(e));
		return new RootedLineEdit(this.base, new LineEdit(newEdit));
	}
}
