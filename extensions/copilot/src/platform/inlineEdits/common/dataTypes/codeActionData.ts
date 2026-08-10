/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextReplacement } from '../../../../util/vs/editor/common/core/edits/textEdit';
import { DiagnosticData } from './diagnosticData';

export class CodeActionData {
	constructor(
		public readonly title: string,
		public readonly diagnostics: DiagnosticData[],
		public readonly edits?: TextReplacement[]
	) { }

	public toString(): string {
		return `${this.title}: ${this.diagnostics.map(d => d.toString())}) => ${this.edits?.map(e => e.toString())}`;
	}

	public equals(other: CodeActionData): boolean {
		const edits = this.edits || [];
		const otherEdits = other.edits || [];
		return this.title === other.title
			&& this.diagnostics.length === other.diagnostics.length
			&& this.diagnostics.every((d, i) => d.equals(other.diagnostics[i]))
			&& edits.length === otherEdits.length
			&& edits.every((e, i) => e.equals(otherEdits[i]));

	}
}
