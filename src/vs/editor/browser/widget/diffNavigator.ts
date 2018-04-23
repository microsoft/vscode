/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'vs/base/common/assert';
import * as objects from 'vs/base/common/objects';
import { Range } from 'vs/editor/common/core/range';
import { ILineChange, ScrollType } from 'vs/editor/common/editorCommon';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { ICursorPositionChangedEvent } from 'vs/editor/common/controller/cursorEvents';
import { IDiffEditor } from 'vs/editor/browser/editorBrowser';
import { Event, Emitter } from 'vs/base/common/event';


interface IDiffRange {
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

/**
 * Create a new diff navigator for the provided diff editor.
 */
export class DiffNavigator {

	private readonly _editor: IDiffEditor;
	private readonly _options: Options;
	private readonly _disposables: IDisposable[];
	private readonly _onDidUpdate = new Emitter<this>();

	readonly onDidUpdate: Event<this> = this._onDidUpdate.event;

	private disposed: boolean;
	private revealFirst: boolean;
	private nextIdx: number;
	private ranges: IDiffRange[];
	private ignoreSelectionChange: boolean;

	constructor(editor: IDiffEditor, options: Options = {}) {
		this._editor = editor;
		this._options = objects.mixin(options, defaultOptions, false);

		this.disposed = false;
		this._disposables = [];

		this.nextIdx = -1;
		this.ranges = [];
		this.ignoreSelectionChange = false;
		this.revealFirst = this._options.alwaysRevealFirst;

		// hook up to diff editor for diff, disposal, and caret move
		this._disposables.push(this._editor.onDidDispose(() => this.dispose()));
		this._disposables.push(this._editor.onDidUpdateDiff(() => this._onDiffUpdated()));

		if (this._options.followsCaret) {
			this._disposables.push(this._editor.getModifiedEditor().onDidChangeCursorPosition((e: ICursorPositionChangedEvent) => {
				if (this.ignoreSelectionChange) {
					return;
				}
				this.nextIdx = -1;
			}));
		}
		if (this._options.alwaysRevealFirst) {
			this._disposables.push(this._editor.getModifiedEditor().onDidChangeModel((e) => {
				this.revealFirst = true;
			}));
		}

		// init things
		this._init();
	}

	private _init(): void {
		let changes = this._editor.getLineChanges();
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
				this.next();
			}
		}
	}

	private _compute(lineChanges: ILineChange[]): void {

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
					this.ranges.push({
						rhs: true,
						range: new Range(lineChange.modifiedStartLineNumber, 1, lineChange.modifiedStartLineNumber, 1)
					});
				}
			});
		}

		// sort
		this.ranges.sort((left, right) => {
			if (left.range.getStartPosition().isBeforeOrEqual(right.range.getStartPosition())) {
				return -1;
			} else if (right.range.getStartPosition().isBeforeOrEqual(left.range.getStartPosition())) {
				return 1;
			} else {
				return 0;
			}
		});
		this._onDidUpdate.fire(this);
	}

	private _initIdx(fwd: boolean): void {
		let found = false;
		let position = this._editor.getPosition();
		for (let i = 0, len = this.ranges.length; i < len && !found; i++) {
			let range = this.ranges[i].range;
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

	private _move(fwd: boolean): void {
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

		let info = this.ranges[this.nextIdx];
		this.ignoreSelectionChange = true;
		try {
			let pos = info.range.getStartPosition();
			this._editor.setPosition(pos);
			this._editor.revealPositionInCenter(pos, ScrollType.Smooth);
		} finally {
			this.ignoreSelectionChange = false;
		}
	}

	canNavigate(): boolean {
		return this.ranges && this.ranges.length > 0;
	}

	next(): void {
		this._move(true);
	}

	previous(): void {
		this._move(false);
	}

	dispose(): void {
		dispose(this._disposables);
		this._disposables.length = 0;
		this._onDidUpdate.dispose();
		this.ranges = null;
		this.disposed = true;
	}
}
