/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IstanbulCoverageContext } from 'istanbul-to-vscode';
import { SourceMapStore } from './testOutputScanner';
import * as vscode from 'vscode';
import { IScriptCoverage, OffsetToPosition, RangeCoverageTracker } from './v8CoverageWrangling';
import * as v8ToIstanbul from 'v8-to-istanbul';

export const istanbulCoverageContext = new IstanbulCoverageContext();

/**
 * Tracks coverage in per-script coverage mode. There are two modes of coverage
 * in this extension: generic istanbul reports, and reports from the runtime
 * sent before and after each test case executes. This handles the latter.
 */
export class PerTestCoverageTracker {
	private readonly scripts = new Map</* script ID */ string, Script>();

	constructor(
		private readonly initialCoverage: IScriptCoverage,
		private readonly maps: SourceMapStore,
	) {}

	public add(coverage: IScriptCoverage, test?: vscode.TestItem) {
		const script = this.scripts.get(coverage.scriptId);
		if (script) {
			return script.add(coverage, test);
		}
		if (!coverage.source) {
			throw new Error('expected to have source the first time a script is seen');
		}

		const src = new Script(coverage.url, coverage.source, this.maps);
	}
}

class Script {
	private converter: OffsetToPosition;

	/** Tracking the overall coverage for the file */
	private overall = new ScriptProjection();
	/** Range tracking per-test item */
	private readonly perItem = new Map<vscode.TestItem, ScriptProjection>();

	constructor(
		public readonly url: string,
		source: string,
		private readonly maps: SourceMapStore,
	) {
		this.converter = new OffsetToPosition(source);
	}

	public add(coverage: IScriptCoverage, test?: vscode.TestItem) {
		this.overall.add(coverage);
		if (test) {
			const p = new ScriptProjection();
			p.add(coverage);
			this.perItem.set(test, p);
		}
	}

	public report(run: vscode.TestRun) {

	}
}

class ScriptProjection {
	/** Range tracking for non-block coverage in the file */
	private file = new RangeCoverageTracker();
	/** Range tracking for block coverage in the file */
	private readonly blocks = new Map<string, RangeCoverageTracker>();

	public add(coverage: IScriptCoverage) {

		for (const fn of coverage.functions) {
			if (fn.isBlockCoverage) {
				const key = `${fn.ranges[0].startOffset}/${fn.ranges[0].endOffset}`;
				const block = this.blocks.get(key);
				if (block) {
					for (let i = 1; i < fn.ranges.length; i++) {
						block.setCovered(fn.ranges[i].startOffset, fn.ranges[i].endOffset, fn.ranges[i].count > 0);
					}
				} else {
					this.blocks.set(key, RangeCoverageTracker.initializeBlock(fn.ranges));
				}
			} else {
				for (const range of fn.ranges) {
					this.file.setCovered(range.startOffset, range.endOffset, range.count > 0);
				}
			}
		}
	}

	public report(run: vscode.TestRun, convert: OffsetToPosition, item?: vscode.TestItem) {
		const ranges = [...this.file];
		for (const block of this.blocks.values()) {
			for (const range of block) {
				ranges.push(range);
			}
		}

		let ri = 0;
		ranges.sort((a, b) => a.end - b.end);

		let offset = 0;
		for (let i = 0; i < convert.lines.length; i++) {
			const lineEnd = offset + convert.lines[i] + 1;

			const coverage = new RangeCoverageTracker();
			for (let i = ri; i < ranges.length && ranges[i].start < lineEnd; i++) {
				coverage.setCovered(ranges[i].start - offset, ranges[i].end - offset, ranges[i].covered);
			}

			while (ri < ranges.length && ranges[ri].end < lineEnd) {
				ri++;
			}
		}

	}
}
