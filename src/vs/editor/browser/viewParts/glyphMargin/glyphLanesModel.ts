/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from 'vs/editor/common/core/range';
import { GlyphMarginLane, IGlyphMarginLanesModel } from 'vs/editor/common/model';


const MAX_LANE = GlyphMarginLane.Right;

export class GlyphMarginLanesModel implements IGlyphMarginLanesModel {
	private readonly lanes: Uint8Array;
	private persist = 0;
	private _requiredLanes = 1; // always render at least one lane

	constructor(maxLine: number) {
		this.lanes = new Uint8Array(Math.ceil((maxLine * MAX_LANE) / 8));
	}

	public get requiredLanes() {
		return this._requiredLanes;
	}

	/** Adds a new range to the model. Assumes ranges are added in ascending order of line number. */
	public push(lane: GlyphMarginLane, range: Range, persist?: boolean): void {
		if (persist) {
			this.persist |= (1 << (lane - 1));
		}
		for (let i = range.startLineNumber; i <= range.endLineNumber; i++) {
			const bit = (MAX_LANE * i) + (lane - 1);
			this.lanes[bit >>> 3] |= (1 << (bit % 8));
			this._requiredLanes = Math.max(this._requiredLanes, this.countAtLine(i));
		}
	}

	public getLanesAtLine(lineNumber: number): GlyphMarginLane[] {
		const lanes: GlyphMarginLane[] = [];
		let bit = MAX_LANE * lineNumber;
		for (let i = 0; i < MAX_LANE; i++) {
			if (this.persist & (1 << i) || this.lanes[bit >>> 3] & (1 << (bit % 8))) {
				lanes.push(i + 1);
			}
			bit++;
		}

		return lanes.length ? lanes : [GlyphMarginLane.Center];
	}

	private countAtLine(lineNumber: number): number {
		let bit = MAX_LANE * lineNumber;
		let count = 0;
		for (let i = 0; i < MAX_LANE; i++) {
			if (this.persist & (1 << i) || this.lanes[bit >>> 3] & (1 << (bit % 8))) {
				count++;
			}
			bit++;
		}
		return count;
	}
}
