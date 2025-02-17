/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, IObservable, observableValue } from '../../../../../base/common/observable.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { ICodeEditor } from '../../../../../editor/browser/editorBrowser.js';
import { observableCodeEditor } from '../../../../../editor/browser/observableCodeEditor.js';
import { Position } from '../../../../../editor/common/core/position.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { IEditorDecorationsCollection } from '../../../../../editor/common/editorCommon.js';
import { IModelDeltaDecoration } from '../../../../../editor/common/model.js';
import { ModelDecorationOptions } from '../../../../../editor/common/model/textModel.js';
import { IModifiedFileEntryEditorIntegration } from '../../common/chatEditingService.js';
import { ChatEditingModifiedFileEntry } from './chatEditingModifiedFileEntry.js';

export class ChatEditingCodeEditorIntegration implements IModifiedFileEntryEditorIntegration {

	private static readonly _diffLineDecorationData = ModelDecorationOptions.register({ description: 'diff-line-decoration' });

	private readonly _currentIndex = observableValue(this, -1);
	readonly currentIndex: IObservable<number> = this._currentIndex;

	private readonly _diffLineDecorations: IEditorDecorationsCollection;
	private readonly _store = new DisposableStore();

	constructor(
		private readonly _codeEditor: ICodeEditor,
		entry: ChatEditingModifiedFileEntry,
	) {
		this._diffLineDecorations = _codeEditor.createDecorationsCollection();
		const codeEditorObs = observableCodeEditor(_codeEditor);

		const enabledObs = derived(r => {
			return isEqual(codeEditorObs.model.read(r)?.uri, entry.modifiedURI);
		});

		const lineDecorationDataObs = derived(r => {
			const result: IModelDeltaDecoration[] = [];

			if (enabledObs.read(r)) {
				const diff = entry.diffInfo.read(r);

				for (const diffEntry of diff.changes) {
					result.push({
						range: diffEntry.modified.toInclusiveRange() ?? new Range(diffEntry.modified.startLineNumber, 1, diffEntry.modified.startLineNumber, Number.MAX_SAFE_INTEGER),
						options: ChatEditingCodeEditorIntegration._diffLineDecorationData
					});
				}
			}

			return result;
		});

		let lastModifyingRequestId: string | undefined;

		this._store.add(autorun(r => {

			const data = lineDecorationDataObs.read(r);

			// update decorations
			this._diffLineDecorations.set(data);

			// INIT current index when: enabled, not streaming anymore, once per request, and when having changes
			if (enabledObs.read(r)
				&& !entry.isCurrentlyBeingModifiedBy.read(r)
				&& lastModifyingRequestId !== entry.lastModifyingRequestId
				&& data.length
			) {
				lastModifyingRequestId = entry.lastModifyingRequestId;
				const position = _codeEditor.getPosition() ?? new Position(1, 1);
				const ranges = this._diffLineDecorations.getRanges();
				let initialIndex = ranges.findIndex(r => r.containsPosition(position));
				if (initialIndex < 0) {
					initialIndex = 0;
					for (; initialIndex < ranges.length - 1; initialIndex++) {
						const range = ranges[initialIndex];
						if (range.endLineNumber >= position.lineNumber) {
							break;
						}
					}
				}
				this._currentIndex.set(initialIndex, undefined);
				_codeEditor.revealRange(ranges[initialIndex]);
			}
		}));
	}

	dispose(): void {
		this._diffLineDecorations.clear();
		this._store.dispose();
	}

	next(wrap: boolean): boolean {
		return this._reveal(true, !wrap);
	}

	previous(wrap: boolean): boolean {
		return this._reveal(false, !wrap);
	}

	private _reveal(next: boolean, strict: boolean) {

		const position = this._codeEditor.getPosition();
		if (!position) {
			this._currentIndex.set(-1, undefined);
			return false;
		}

		const decorations = this._diffLineDecorations
			.getRanges()
			.sort((a, b) => Range.compareRangesUsingStarts(a, b));

		if (decorations.length === 0) {
			this._currentIndex.set(-1, undefined);
			return false;
		}

		let newIndex: number = -1;
		for (let i = 0; i < decorations.length; i++) {
			const range = decorations[i];
			if (range.containsPosition(position)) {
				newIndex = i + (next ? 1 : -1);
				break;
			} else if (Position.isBefore(position, range.getStartPosition())) {
				newIndex = next ? i : i - 1;
				break;
			}
		}

		if (strict && (newIndex < 0 || newIndex >= decorations.length)) {
			// NO change
			return false;
		}

		newIndex = (newIndex + decorations.length) % decorations.length;

		this._currentIndex.set(newIndex, undefined);

		const targetRange = decorations[newIndex];
		const targetPosition = next ? targetRange.getStartPosition() : targetRange.getEndPosition();
		this._codeEditor.setPosition(targetPosition);
		this._codeEditor.revealPositionInCenter(targetPosition);
		this._codeEditor.focus();

		return true;
	}
}
