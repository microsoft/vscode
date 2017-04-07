/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as assert from 'vs/base/common/assert';
import { EventEmitter } from 'vs/base/common/eventEmitter';
import * as objects from 'vs/base/common/objects';
import { Range } from 'vs/editor/common/core/range';
import { ICommonDiffEditor, ICursorPositionChangedEvent, ILineChange } from 'vs/editor/common/editorCommon';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';

interface IDiffRange {
	rhs: boolean;
	range: Range;
}

export interface Options {
	followsCaret?: boolean;
	ignoreCharChanges?: boolean;
	alwaysRevealFirst?: boolean;
}

var defaultOptions: Options = {
	followsCaret: true,
	ignoreCharChanges: true,
	alwaysRevealFirst: true
};

/**
 * Create a new diff navigator for the provided diff editor.
 */
export class DiffNavigator extends EventEmitter {

	public static Events = {
		UPDATED: 'navigation.updated'
	};

	private editor: ICommonDiffEditor;
	private options: Options;
	private disposed: boolean;
	private toUnbind: IDisposable[];

	private nextIdx: number;
	private ranges: IDiffRange[];
	private ignoreSelectionChange: boolean;
	public revealFirst: boolean;

	constructor(editor: ICommonDiffEditor, options: Options = {}) {
		super([
			DiffNavigator.Events.UPDATED
		]);
		this.editor = editor;
		this.options = objects.mixin(options, defaultOptions, false);

		this.disposed = false;
		this.toUnbind = [];

		this.nextIdx = -1;
		this.ranges = [];
		this.ignoreSelectionChange = false;
		this.revealFirst = this.options.alwaysRevealFirst;

		// hook up to diff editor for diff, disposal, and caret move
		this.toUnbind.push(this.editor.onDidDispose(() => this.dispose()));
		this.toUnbind.push(this.editor.onDidUpdateDiff(() => this.onDiffUpdated()));

		if (this.options.followsCaret) {
			this.toUnbind.push(this.editor.getModifiedEditor().onDidChangeCursorPosition((e: ICursorPositionChangedEvent) => {
				if (this.ignoreSelectionChange) {
					return;
				}
				this.nextIdx = -1;
			}));
		}
		if (this.options.alwaysRevealFirst) {
			this.toUnbind.push(this.editor.getModifiedEditor().onDidChangeModel((e) => {
				this.revealFirst = true;
			}));
		}

		// init things
		this.init();
	}

	private init(): void {
		var changes = this.editor.getLineChanges();
		if (!changes) {
			return;
		}
	}

	private onDiffUpdated(): void {
		this.init();

		this.compute(this.editor.getLineChanges());
		if (this.revealFirst) {
			// Only reveal first on first non-null changes
			if (this.editor.getLineChanges() !== null) {
				this.revealFirst = false;
				this.nextIdx = -1;
				this.next();
			}
		}
	}

	private compute(lineChanges: ILineChange[]): void {

		// new ranges
		this.ranges = [];

		if (lineChanges) {
			// create ranges from changes
			lineChanges.forEach((lineChange) => {

				if (!this.options.ignoreCharChanges && lineChange.charChanges) {

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

		this.emit(DiffNavigator.Events.UPDATED, {});
	}

	private initIdx(fwd: boolean): void {
		var found = false;
		var position = this.editor.getPosition();
		for (var i = 0, len = this.ranges.length; i < len && !found; i++) {
			var range = this.ranges[i].range;
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

	private move(fwd: boolean): void {
		assert.ok(!this.disposed, 'Illegal State - diff navigator has been disposed');

		if (!this.canNavigate()) {
			return;
		}

		if (this.nextIdx === -1) {
			this.initIdx(fwd);

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

		var info = this.ranges[this.nextIdx];
		this.ignoreSelectionChange = true;
		try {
			var pos = info.range.getStartPosition();
			this.editor.setPosition(pos);
			this.editor.revealPositionInCenter(pos);
		} finally {
			this.ignoreSelectionChange = false;
		}
	}

	public canNavigate(): boolean {
		return this.ranges && this.ranges.length > 0;
	}

	public next(): void {
		this.move(true);
	}

	public previous(): void {
		this.move(false);
	}

	public dispose(): void {
		this.toUnbind = dispose(this.toUnbind);
		this.ranges = null;
		this.disposed = true;

		super.dispose();
	}
}

