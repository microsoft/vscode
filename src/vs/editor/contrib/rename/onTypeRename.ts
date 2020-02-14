/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./onTypeRename';
import { registerEditorContribution, registerModelAndPositionCommand } from 'vs/editor/browser/editorExtensions';
import * as arrays from 'vs/base/common/arrays';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Position } from 'vs/editor/common/core/position';
import { ITextModel, IModelDeltaDecoration, TrackedRangeStickiness, IIdentifiedSingleEditOperation } from 'vs/editor/common/model';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IRange, Range } from 'vs/editor/common/core/range';
import { OnTypeRenameProviderRegistry } from 'vs/editor/common/modes';
import { first, createCancelablePromise, CancelablePromise } from 'vs/base/common/async';
// import { onUnexpectedExternalError, onUnexpectedError } from 'vs/base/common/errors';
import { ModelDecorationOptions } from 'vs/editor/common/model/textModel';
import { IModelContentChange } from 'vs/editor/common/model/textModelEvents';
// import { Selection } from 'vs/editor/common/core/selection';

function isWithin(inner: IRange, outer: IRange) {
	return outer.startLineNumber <= inner.startLineNumber &&
		outer.endLineNumber >= inner.endLineNumber &&
		outer.startColumn <= inner.startColumn &&
		outer.endColumn >= inner.endColumn;
}

function toRangeStringRepresentation(r: IRange) {
	if (r.startLineNumber === r.endLineNumber) {
		return `(${r.startLineNumber}, ${r.startColumn}-${r.endColumn})`;
	}

	return `(${r.startLineNumber}, ${r.startColumn})-(${r.endLineNumber}, ${r.endColumn})`;
}

function computeSyncedRegionEdits(editor: ICodeEditor, change: IModelContentChange, regions: IRange[] | null | undefined): IIdentifiedSingleEditOperation[] {
	if (!regions) {
		return [];
	}

	let containingRegion: IRange | undefined;
	const beforeRegions: IRange[] = [];
	const afterRegions: IRange[] = [];
	for (let r of regions) {
		if (isWithin(change.range, r)) {
			containingRegion = r;
		} else {
			if (!containingRegion) {
				beforeRegions.push(r);
			} else {
				afterRegions.push(r);
			}
		}
	}
	if (!containingRegion) {
		return [];
	}

	const model = editor.getModel()!;
	const startOffset = change.rangeOffset - model.getOffsetAt({
		lineNumber: containingRegion.startLineNumber,
		column: containingRegion.startColumn
	});
	const endOffset = change.rangeOffset + change.rangeLength - model.getOffsetAt({
		lineNumber: containingRegion.endLineNumber,
		column: containingRegion.endColumn
	});

	const beforeRegionEdits = beforeRegions
		.map(r => {
			const newStartPos = model.getPositionAt(model.getOffsetAt({
				lineNumber: r.startLineNumber,
				column: r.startColumn
			}) + startOffset);
			const newEndPos = model.getPositionAt(model.getOffsetAt({
				lineNumber: r.endLineNumber,
				column: r.endColumn
			}) + endOffset);

			const range = new Range(newStartPos.lineNumber, newStartPos.column, newEndPos.lineNumber, newEndPos.column);

			return {
				range,
				text: change.text
			};
		});

	const textDiffDelta = change.text === ''
		? -change.rangeLength
		: change.text.length;

	const afterRegionEdits = afterRegions
		.map(r => {
			if (r.startLineNumber === containingRegion!.startLineNumber) {
				const newStartPos = model.getPositionAt(model.getOffsetAt({
					lineNumber: r.startLineNumber,
					column: r.startColumn
				}) + startOffset + (1) * textDiffDelta);
				const newEndPos = model.getPositionAt(model.getOffsetAt({
					lineNumber: r.endLineNumber,
					column: r.endColumn
				}) + endOffset + (1) * textDiffDelta);

				const range = new Range(newStartPos.lineNumber, newStartPos.column, newEndPos.lineNumber, newEndPos.column);

				return {
					range,
					text: change.text
				};
			} else {
				const newStartPos = model.getPositionAt(model.getOffsetAt({
					lineNumber: r.startLineNumber,
					column: r.startColumn
				}) + startOffset);
				const newEndPos = model.getPositionAt(model.getOffsetAt({
					lineNumber: r.endLineNumber,
					column: r.endColumn
				}) + endOffset);

				const range = new Range(newStartPos.lineNumber, newStartPos.column, newEndPos.lineNumber, newEndPos.column);

				return {
					range,
					text: change.text
				};
			}
		});

	return beforeRegionEdits.concat(afterRegionEdits);

	// const deltaStartLine = change.range.startLineNumber - containingRegion.startLineNumber;
	// const deltaStartColumn = change.range.startColumn - containingRegion.startColumn;
	// const deltaEndLine = change.range.endLineNumber - containingRegion.endLineNumber;
	// const deltaEndColumn = change.range.endColumn - containingRegion.endColumn;

	// const beforeRegionEdits = beforeRegions
	// 	.map(r => {
	// 		const matchingRange = new Range(
	// 			r.startLineNumber + deltaStartLine,
	// 			r.startColumn + deltaStartColumn,
	// 			r.endLineNumber + deltaEndLine,
	// 			r.endColumn + deltaEndColumn,
	// 		);

	// 		console.log(`Applying changes to (${matchingRange.startLineNumber}, ${matchingRange.startColumn} - ${matchingRange.endColumn}): ${editor.getModel()?.getValueInRange(matchingRange)}`);

	// 		return {
	// 			range: matchingRange,
	// 			text: change.text
	// 		};
	// 	});

	// const columnDelta = change.text === ''
	// 	? -change.rangeLength
	// 	: change.text.length;

	// const afterRegionEdits = afterRegions
	// 	.map(r => {
	// 		const matchingRange = new Range(
	// 			r.startLineNumber + deltaStartLine,
	// 			r.startColumn + deltaStartColumn + columnDelta,
	// 			r.endLineNumber + deltaEndLine,
	// 			r.endColumn + deltaEndColumn + columnDelta
	// 		);

	// 		console.log(`Applying changes to (${matchingRange.startLineNumber}, ${matchingRange.startColumn} - ${matchingRange.endColumn}): ${editor.getModel()?.getValueInRange(matchingRange)}`);

	// 		return {
	// 			range: matchingRange,
	// 			text: change.text
	// 		};
	// 	});

	// return beforeRegionEdits.concat(afterRegionEdits);
}

class OnTypeRenameContribution extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.onTypeRename';

	private static readonly DECORATION = ModelDecorationOptions.register({
		stickiness: TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges,
		className: 'on-type-rename-decoration'
	});

	private readonly _editor: ICodeEditor;
	private _enabled: boolean;

	private _currentRequest: CancelablePromise<IRange[] | null | undefined> | null;
	private _currentDecorations: string[];

	private _syncedRanges: IRange[] | null | undefined;

	private _shouldMirrorChanges = false;
	private _lastVersion: number = -1;

	constructor(
		editor: ICodeEditor,
	) {
		super();
		this._editor = editor;
		this._enabled = this._editor.getOption(EditorOption.autoRename);
		this._currentRequest = null;
		this._currentDecorations = [];

		this._register(this._editor.onDidChangeModel((e) => {
			this._stopAll();
			this._run();
		}));

		this._register(this._editor.onDidChangeConfiguration((e) => {
			if (e.hasChanged(EditorOption.autoRename)) {
				this._enabled = this._editor.getOption(EditorOption.autoRename);
				this._stopAll();
				this._run();
			}
		}));

		this._register(this._editor.onDidChangeCursorPosition((e) => {
			this._run(e.position);
		}));

		this._register(OnTypeRenameProviderRegistry.onDidChange(() => {
			this._run();
		}));

		this._register(this._editor.onDidChangeModelContent((e) => {
			if (!this._editor.hasModel()) {
				return;
			}

			console.log('=== Changes ===');

			e.changes.forEach(c => {
				const text = c.text === '' ? '<DEL>' : c.text;
				console.log(toRangeStringRepresentation(c.range) + ' | ' + text);
			});

			// const model = this._editor.getModel();
			// TODO
			// console.log(`buffer changed!`);

			if (e.changes.length === 1) {
				const change = e.changes[0];

				// Insert non text - break case
				if (change.text !== '' && !change.text.match(/^([A-Za-z\-_])/)) {
					return;
				}

				if (e.versionId === this._lastVersion + 1 && !this._shouldMirrorChanges) {
					console.log('=== Unmirrored changes ===');
					this._shouldMirrorChanges = true;
					return;
				}

				const newChanges = computeSyncedRegionEdits(this._editor, change, this._syncedRanges);
				this._lastVersion = e.versionId;
				if (newChanges.length > 0) {
					this._shouldMirrorChanges = false;
					console.log('=== Mirror Changes ===');
					newChanges.forEach(c => {
						const text = c.text === '' ? '<DEL>' : c.text;
						console.log(toRangeStringRepresentation(c.range) + ' | ' + text);
					});

					this._editor.executeEdits('foo', newChanges);
				}
			}

			// console.log(this._currentDecorations.map(id => model.getDecorationRange(id)));
		}));
	}

	public dispose(): void {
		super.dispose();
		this._stopAll();
	}

	private _stopAll(): void {
		this._currentDecorations = this._editor.deltaDecorations(this._currentDecorations, []);
	}

	private _run(position: Position | null = this._editor.getPosition()): void {
		if (!this._enabled || !position) {
			return;
		}
		if (!this._editor.hasModel()) {
			return;
		}

		if (this._currentRequest) {
			this._currentRequest.cancel();
			this._currentRequest = null;
		}

		const model = this._editor.getModel();

		this._currentRequest = createCancelablePromise(token => getOnTypeRenameRanges(model, position, token));

		this._currentRequest.then((value) => {
			if (!value) {
				value = [];
			}
			const decorations: IModelDeltaDecoration[] = value.map(range => ({ range: range, options: OnTypeRenameContribution.DECORATION }));
			this._syncedRanges = value;
			this._currentDecorations = this._editor.deltaDecorations(this._currentDecorations, decorations);
		}, err => {
			return;
			// return onUnexpectedError(err);
		});
	}
}

export function getOnTypeRenameRanges(model: ITextModel, position: Position, token: CancellationToken): Promise<IRange[] | null | undefined> {

	const orderedByScore = OnTypeRenameProviderRegistry.ordered(model);

	// in order of score ask the occurrences provider
	// until someone response with a good result
	// (good = none empty array)
	return first<IRange[] | null | undefined>(orderedByScore.map(provider => () => {
		return Promise.resolve(provider.provideOnTypeRenameRanges(model, position, token))
			.then(undefined, (err) => {
				return undefined;
				// onUnexpectedExternalError(err);
			});
	}), arrays.isNonEmptyArray);
}

registerModelAndPositionCommand('_executeRenameOnTypeProvider', (model, position) => getOnTypeRenameRanges(model, position, CancellationToken.None));

registerEditorContribution(OnTypeRenameContribution.ID, OnTypeRenameContribution);
