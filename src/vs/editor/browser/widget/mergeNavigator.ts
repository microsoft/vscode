/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// TODO: Implement this. It's just a placeholder for now.
import * as assert from 'vs/base/common/assert';
import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import * as objects from 'vs/base/common/objects';
import { IMergeEditor } from 'vs/editor/browser/mergeEditorBrowser';
import { ICursorPositionChangedEvent } from 'vs/editor/common/cursorEvents';
import { Range } from 'vs/editor/common/core/range';
import { ILineChange } from 'vs/editor/common/diff/diffComputer';
import { ScrollType } from 'vs/editor/common/editorCommon';


interface IMergeRange {
	rhs: boolean;
	range: Range;
}

export interface Options {
	followsCaret?: boolean;
	ignoreCharChanges?: boolean;
	alwaysRevealFirst?: boolean;
}

const defaultOptions: Options = {
	followsCaret: true,
	ignoreCharChanges: true,
	alwaysRevealFirst: true
};

export interface IMergeNavigator {
	canNavigate(): boolean;
	next(): void;
	previous(): void;
	dispose(): void;
}

/**
 * Create a new merge navigator for the provided merge editor.
 */
export class MergeNavigator extends Disposable implements IMergeNavigator {

	private readonly _editor: IMergeEditor;
	private readonly _options: Options;
	private readonly _onDidUpdate = this._register(new Emitter<this>());

	readonly onDidUpdate: Event<this> = this._onDidUpdate.event;

	private disposed: boolean;
	private revealFirst: boolean;
	private nextIdx: number;
	private ranges: IMergeRange[];
	private ignoreSelectionChange: boolean;

	constructor(editor: IMergeEditor, options: Options = {}) {
		super();
		this._editor = editor;
		this._options = objects.mixin(options, defaultOptions, false);

		this.disposed = false;

		this.nextIdx = -1;
		this.ranges = [];
		this.ignoreSelectionChange = false;
		this.revealFirst = Boolean(this._options.alwaysRevealFirst);

		// hook up to merge editor for merge, disposal, and caret move
		this._register(this._editor.onDidDispose(() => this.dispose()));
		this._register(this._editor.onDidUpdateDiff(() => this._onDiffUpdated()));

		if (this._options.followsCaret) {
			this._register(this._editor.getOutputEditor().onDidChangeCursorPosition((e: ICursorPositionChangedEvent) => {
				if (this.ignoreSelectionChange) {
					return;
				}
				this.nextIdx = -1;
			}));
		}
		if (this._options.alwaysRevealFirst) {
			this._register(this._editor.getOutputEditor().onDidChangeModel((e) => {
				this.revealFirst = true;
			}));
		}

		// init things
		this._init();
	}

	private _init(): void {
		let currentChanges = this._editor.getCurrentLineChanges();
		let incomingChanges = this._editor.getIncomingLineChanges();
		let outputChanges = this._editor.getOutputLineChanges();
		if (!currentChanges || !incomingChanges || !outputChanges) {
			return;
		}
	}

	private _onDiffUpdated(): void {
		this._init();

		this._compute(this._editor.getOutputLineChanges());
		if (this.revealFirst) {
			// Only reveal first on first non-null changes
			if (this._editor.getOutputLineChanges() !== null) {
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
		assert.ok(!this.disposed, 'Illegal State - merge navigator has been disposed');

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
		} finally {
			this.ignoreSelectionChange = false;
		}
	}

	canNavigate(): boolean {
		return this.ranges && this.ranges.length > 0;
	}

	next(scrollType: ScrollType = ScrollType.Smooth): void {
		this._move(true, scrollType);
	}

	previous(scrollType: ScrollType = ScrollType.Smooth): void {
		this._move(false, scrollType);
	}

	override dispose(): void {
		super.dispose();
		this.ranges = [];
		this.disposed = true;
	}
}
