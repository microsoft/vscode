/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'vs/base/common/assert';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import * as objects from 'vs/base/common/objects';
import { IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { ICursorPositionChangedEvent } from 'vs/editor/common/cursorEvents';
import { Range } from 'vs/editor/common/core/range';
import { ILineChange } from 'vs/editor/common/diff/legacyLinesDiffComputer';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { AudioCue, IAudioCueService } from 'vs/platform/audioCues/browser/audioCueService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { IAccessibilityService } from 'vs/platform/accessibility/common/accessibility';


interface IDiffRange {
	rhs: boolean;
	range: Range;
}

export interface Options {
	followsCaret?: boolean;
	ignoreCharChanges?: boolean;
	alwaysRevealFirst?: boolean;
	findResultLoop?: boolean;
}

const defaultOptions: Options = {
	followsCaret: true,
	ignoreCharChanges: true,
	alwaysRevealFirst: true,
	findResultLoop: true
};

export interface IDiffNavigator {
	canNavigate(): boolean;
	next(): void;
	previous(): void;
	dispose(): void;
}

/**
 * Create a new diff navigator for the provided diff editor.
 */
export class DiffNavigator extends Disposable implements IDiffNavigator {

	private readonly _editor: IDiffEditor;
	private readonly _options: Options;
	private readonly _onDidUpdate = this._register(new Emitter<this>());

	readonly onDidUpdate: Event<this> = this._onDidUpdate.event;

	private disposed: boolean;
	public revealFirst: boolean;
	private nextIdx: number;
	private ranges: IDiffRange[];
	private ignoreSelectionChange: boolean;

	constructor(
		editor: IDiffEditor,
		options: Options = {},
		@IAudioCueService private readonly _audioCueService: IAudioCueService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IAccessibilityService private readonly _accessibilityService: IAccessibilityService
	) {
		super();
		this._editor = editor;
		this._options = objects.mixin(options, defaultOptions, false);

		this.disposed = false;

		this.nextIdx = -1;
		this.ranges = [];
		this.ignoreSelectionChange = false;
		this.revealFirst = Boolean(this._options.alwaysRevealFirst);

		this._register(this._editor.onDidUpdateDiff(() => this._onDiffUpdated()));

		if (this._options.followsCaret) {
			this._register(this._editor.getModifiedEditor().onDidChangeCursorPosition((e: ICursorPositionChangedEvent) => {
				if (this.ignoreSelectionChange) {
					return;
				}
				this._updateAccessibilityState(e.position.lineNumber);
				this.nextIdx = -1;
			}));
		}

		// init things
		this._init();
	}

	private _init(): void {
		const changes = this._editor.getLineChanges();
		if (!changes) {
			return;
		}
	}

	private _onDiffUpdated(): void {
		this._init();

		this._compute(this._editor.getLineChanges());
		if (this.revealFirst) {
			// Only reveal first on first non-null changes
			if (this._editor.getLineChanges() !== null) {
				this.revealFirst = false;
				this.nextIdx = -1;
				this.next(ScrollType.Immediate);
			}
		}
	}

	private _compute(lineChanges: ILineChange[] | null): void {

		// new ranges
		this.ranges = [];

		if (lineChanges) {
			// create ranges from changes
			lineChanges.forEach((lineChange) => {

				if (!this._options.ignoreCharChanges && lineChange.charChanges) {

					lineChange.charChanges.forEach((charChange) => {
						this.ranges.push({
							rhs: true,
							range: new Range(
								charChange.modifiedStartLineNumber,
								charChange.modifiedStartColumn,
								charChange.modifiedEndLineNumber,
								charChange.modifiedEndColumn)
						});
					});

				} else {
					if (lineChange.modifiedEndLineNumber === 0) {
						// a deletion
						this.ranges.push({
							rhs: true,
							range: new Range(lineChange.modifiedStartLineNumber, 1, lineChange.modifiedStartLineNumber + 1, 1)
						});
					} else {
						// an insertion or modification
						this.ranges.push({
							rhs: true,
							range: new Range(lineChange.modifiedStartLineNumber, 1, lineChange.modifiedEndLineNumber + 1, 1)
						});
					}
				}
			});
		}

		// sort
		this.ranges.sort((left, right) => Range.compareRangesUsingStarts(left.range, right.range));
		this._onDidUpdate.fire(this);
	}

	private _initIdx(fwd: boolean): void {
		let found = false;
		const position = this._editor.getPosition();
		if (!position) {
			this.nextIdx = 0;
			return;
		}
		for (let i = 0, len = this.ranges.length; i < len && !found; i++) {
			const range = this.ranges[i].range;
			if (position.isBeforeOrEqual(range.getStartPosition())) {
				this.nextIdx = i + (fwd ? 0 : -1);
				found = true;
			}
		}
		if (!found) {
			// after the last change
			this.nextIdx = fwd ? 0 : this.ranges.length - 1;
		}
		if (this.nextIdx < 0) {
			this.nextIdx = this.ranges.length - 1;
		}
	}

	private _move(fwd: boolean, scrollType: ScrollType): void {
		assert.ok(!this.disposed, 'Illegal State - diff navigator has been disposed');

		if (!this.canNavigate()) {
			return;
		}

		if (this.nextIdx === -1) {
			this._initIdx(fwd);

		} else if (fwd) {
			this.nextIdx += 1;
			if (this.nextIdx >= this.ranges.length) {
				this.nextIdx = 0;
			}
		} else {
			this.nextIdx -= 1;
			if (this.nextIdx < 0) {
				this.nextIdx = this.ranges.length - 1;
			}
		}

		const info = this.ranges[this.nextIdx];
		this.ignoreSelectionChange = true;
		try {
			const pos = info.range.getStartPosition();
			this._editor.setPosition(pos);
			this._editor.revealRangeInCenter(info.range, scrollType);
			this._updateAccessibilityState(pos.lineNumber, true);
		} finally {
			this.ignoreSelectionChange = false;
		}
	}

	_updateAccessibilityState(lineNumber: number, jumpToChange?: boolean): void {
		const modifiedEditor = this._editor.getModel()?.modified;
		if (!modifiedEditor) {
			return;
		}
		const insertedOrModified = modifiedEditor.getLineDecorations(lineNumber).find(l => l.options.className === 'line-insert');
		if (insertedOrModified) {
			this._audioCueService.playAudioCue(AudioCue.diffLineModified, { allowManyInParallel: true });
		} else if (jumpToChange) {
			// The modified editor does not include deleted lines, but when
			// we are moved to the area where lines were deleted, play this cue
			this._audioCueService.playAudioCue(AudioCue.diffLineDeleted, { allowManyInParallel: true });
		} else {
			return;
		}

		const codeEditor = this._codeEditorService.getActiveCodeEditor();
		if (jumpToChange && codeEditor && insertedOrModified && this._accessibilityService.isScreenReaderOptimized()) {
			codeEditor.setSelection({ startLineNumber: lineNumber, startColumn: 0, endLineNumber: lineNumber, endColumn: Number.MAX_VALUE });
			codeEditor.writeScreenReaderContent('diff-navigation');
		}
	}

	canNavigate(): boolean {
		return this.ranges && this.ranges.length > 0;
	}

	next(scrollType: ScrollType = ScrollType.Smooth): void {
		if (!this.canNavigateNext()) {
			return;
		}
		this._move(true, scrollType);
	}

	previous(scrollType: ScrollType = ScrollType.Smooth): void {
		if (!this.canNavigatePrevious()) {
			return;
		}
		this._move(false, scrollType);
	}

	canNavigateNext(): boolean {
		return this.canNavigateLoop() || this.nextIdx < this.ranges.length - 1;
	}

	canNavigatePrevious(): boolean {
		return this.canNavigateLoop() || this.nextIdx !== 0;
	}

	canNavigateLoop(): boolean {
		return Boolean(this._options.findResultLoop);
	}

	override dispose(): void {
		super.dispose();
		this.ranges = [];
		this.disposed = true;
	}
}
