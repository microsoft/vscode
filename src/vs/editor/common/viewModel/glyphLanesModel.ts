/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Range } from '../core/range.js';
import { GlyphMarginLane, IGlyphMarginLanesModel } from '../model.js';


const MAX_LANE = GlyphMarginLane.Right;

export class GlyphMarginLanesModel implements IGlyphMarginLanesModel {
	private lanes: Uint8Array;
	private persist = 0;
	private _requiredLanes = 1; // always render at least one lane

	constructor(maxLine: number) {
		this.lanes = new Uint8Array(Math.ceil(((maxLine + 1) * MAX_LANE) / 8));
	}

	public reset(maxLine: number) {
		const bytes = Math.ceil(((maxLine + 1) * MAX_LANE) / 8);
		if (this.lanes.length < bytes) {
			this.lanes = new Uint8Array(bytes);
		} else {
			this.lanes.fill(0);
		}
		this._requiredLanes = 1;
	}

	public get requiredLanes() {
		return this._requiredLanes;
	}

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
