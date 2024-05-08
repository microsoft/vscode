/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IstanbulCoverageContext } from 'istanbul-to-vscode';
import * as vscode from 'vscode';
import { SourceLocationMapper, SourceMapStore } from './testOutputScanner';
import { ICoverageRange, IScriptCoverage, OffsetToPosition, RangeCoverageTracker } from './v8CoverageWrangling';

export const istanbulCoverageContext = new IstanbulCoverageContext();

/**
 * Tracks coverage in per-script coverage mode. There are two modes of coverage
 * in this extension: generic istanbul reports, and reports from the runtime
 * sent before and after each test case executes. This handles the latter.
 */
export class PerTestCoverageTracker {
	private readonly scripts = new Map</* script ID */ string, Script>();

	constructor(private readonly maps: SourceMapStore,) {}

	public add(coverage: IScriptCoverage, test?: vscode.TestItem) {
		const script = this.scripts.get(coverage.scriptId);
		if (script) {
			return script.add(coverage, test);
		}
		// ignore internals and node_modules
		if (!coverage.url.startsWith('file://') || coverage.url.includes('node_modules')) {
			return;
		}
		if (!coverage.source) {
			throw new Error('expected to have source the first time a script is seen');
		}

		const src = new Script(vscode.Uri.parse(coverage.url), coverage.source, this.maps);
		this.scripts.set(coverage.scriptId, src);
		src.add(coverage, test);
	}

	public async report(run: vscode.TestRun) {
		await Promise.all(Array.from(this.scripts.values()).map(s => s.report(run)));
	}
}

class Script {
	private converter: OffsetToPosition;

	/** Tracking the overall coverage for the file */
	private overall = new ScriptCoverageTracker();
	/** Range tracking per-test item */
	private readonly perItem = new Map<vscode.TestItem, ScriptCoverageTracker>();

	constructor(
		public readonly uri: vscode.Uri,
		source: string,
		private readonly maps: SourceMapStore,
	) {
		this.converter = new OffsetToPosition(source);
	}

	public add(coverage: IScriptCoverage, test?: vscode.TestItem) {
		this.overall.add(coverage);
		if (test) {
			const p = new ScriptCoverageTracker();
			p.add(coverage);
			this.perItem.set(test, p);
		}
	}

	public async report(run: vscode.TestRun) {
		const mapper = await this.maps.getSourceLocationMapper(this.uri.toString());
		const originalUri = await this.maps.getSourceFile(this.uri.toString()) || this.uri;

		run.addCoverage(this.overall.report(originalUri, this.converter, mapper));
		for (const [test, projection] of this.perItem) {
			run.addCoverage(projection.report(originalUri, this.converter, mapper, test));
		}
	}
}

class ScriptCoverageTracker {
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

	/**
	 * Generates the script's coverage for the test run.
	 *
	 * If a source location mapper is given, it assumes the `uri` is the mapped
	 * URI, and that any unmapped locations/outside the URI should be ignored.
	 */
	public report(uri: vscode.Uri, convert: OffsetToPosition, mapper: SourceLocationMapper | undefined, item?: vscode.TestItem): V8CoverageFile {

		const file = new V8CoverageFile(uri, item);

		async function handleBlock(range: ICoverageRange) {
			const startLine = convert.getLineOfOffset(range.start);
			const endLine = convert.getLineOfOffset(range.end);
			for (let i = startLine; i <= endLine; i++) {
				const start = new vscode.Position(i, i === startLine ? range.start - convert.lines[i] : 0);
				const startMap = mapper?.(start.line, start.line);
				const end = new vscode.Position(i, i === endLine ? range.end - convert.lines[i] : 0);
				const endMap = startMap && mapper?.(end.line, end.line);
				if (mapper && (!endMap || uri.toString().toLowerCase() !== endMap.uri.toString().toLowerCase())) {
					return;
				}

				const detail = new vscode.StatementCoverage(range.covered, startMap && endMap
					? new vscode.Range(startMap.range.start, endMap.range.end)
					: new vscode.Range(start, end)
				);

				file.add(detail);
			}
		}

		for (const range of this.file) {
			handleBlock(range);
		}

		for (const block of this.blocks.values()) {
			for (const range of block) {
				handleBlock(range);
			}
		}

		return file;
	}
}

export class V8CoverageFile extends vscode.FileCoverage {
	public details: vscode.StatementCoverage[] = [];

	constructor(uri: vscode.Uri, item?: vscode.TestItem) {
		super(uri, { covered: 0, total: 0 });
		(this as vscode.FileCoverage2).testItem = item;
	}

	public add(detail: vscode.StatementCoverage) {
		this.details.push(detail);
		this.statementCoverage.total++;
		if (detail.executed) {
			this.statementCoverage.covered++;
		}
	}
}
