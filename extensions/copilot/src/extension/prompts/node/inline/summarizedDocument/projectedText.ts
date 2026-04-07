/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { PositionOffsetTransformer } from '../../../../../platform/editing/common/positionOffsetTransformer';
import { Lazy } from '../../../../../util/vs/base/common/lazy';
import { StringEdit } from '../../../../../util/vs/editor/common/core/edits/stringEdit';
import { OffsetRange } from '../../../../../util/vs/editor/common/core/ranges/offsetRange';
import { Range } from '../../../../../vscodeTypes';

export class ProjectedText {
	constructor(
		public readonly originalText: string,
		public readonly edits: StringEdit,
	) { }

	private readonly _positionOffsetTransformer = new Lazy(() => new PositionOffsetTransformer(this.text));
	private readonly _originalPositionOffsetTransformer = new Lazy(() => new PositionOffsetTransformer(this.originalText));
	public get positionOffsetTransformer(): PositionOffsetTransformer { return this._positionOffsetTransformer.value; }
	public get originalPositionOffsetTransformer(): PositionOffsetTransformer { return this._originalPositionOffsetTransformer.value; }

	private readonly _text = new Lazy(() => this.edits.apply(this.originalText));
	public get text(): string { return this._text.value; }

	public get lineCount(): number { return this.positionOffsetTransformer.getLineCount(); }

	public get isOriginal(): boolean { return this.edits.isEmpty() || this.edits.isNeutralOn(this.originalText); }

	public project(originalOffset: number): number {
		return this.edits.applyToOffset(originalOffset);
	}

	public projectOffsetRange(originalRange: OffsetRange): OffsetRange {
		return this.edits.applyToOffsetRange(originalRange);
	}

	public projectRange(originalRange: Range): Range {
		const offsetRange = this.originalPositionOffsetTransformer.toOffsetRange(originalRange);
		const projectedRange = this.projectOffsetRange(offsetRange);
		return this.positionOffsetTransformer.toRange(projectedRange);
	}

	public projectOffsetEdit(edit: StringEdit): StringEdit {
		return edit.rebaseSkipConflicting(this.edits);
	}

	public tryRebase(originalEdit: StringEdit): { edit: StringEdit; text: ProjectedText } | undefined {
		const edit = originalEdit.tryRebase(this.edits);
		if (!edit) {
			return undefined;
		}
		const newEdits = this.edits.tryRebase(originalEdit);
		if (!newEdits) {
			return undefined;
		}
		return {
			edit,
			text: new ProjectedText(originalEdit.apply(this.originalText), newEdits),
		};
	}

	public projectBack(projectedOffset: number): number {
		return this.edits.applyInverseToOffset(projectedOffset);
	}

	public projectBackOffsetEdit(edit: StringEdit): StringEdit {
		return edit.rebaseSkipConflicting(this.edits.inverse(this.originalText));
	}

	public projectBackTextEdit(edits: readonly vscode.TextEdit[]): vscode.TextEdit[] {
		const offsetEdit = this.positionOffsetTransformer.toOffsetEdit(edits);
		const back = this.projectBackOffsetEdit(offsetEdit);
		return this.originalPositionOffsetTransformer.toTextEdits(back);
	}
}
