/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TraceMap } from '@jridgewell/trace-mapping';
import { IstanbulCoverageContext } from 'istanbul-to-vscode';
import { fileURLToPath } from 'url';
import * as vscode from 'vscode';
import { SourceMapStore } from './sourceMapStore';
import v8ToIstanbul = require('v8-to-istanbul');

export const istanbulCoverageContext = new IstanbulCoverageContext();

export interface ICoverageRange {
	start: number;
	end: number;
	covered: boolean;
}

export interface IV8FunctionCoverage {
	functionName: string;
	isBlockCoverage: boolean;
	ranges: IV8CoverageRange[];
}

export interface IV8CoverageRange {
	startOffset: number;
	endOffset: number;
	count: number;
}

/** V8 Script coverage data */
export interface IScriptCoverage {
	scriptId: string;
	url: string;
	// Script source added by the runner the first time the script is emitted.
	source?: string;
	functions: IV8FunctionCoverage[];
}

/**
 * Tracks coverage in per-script coverage mode. There are two modes of coverage
 * in this extension: generic istanbul reports, and V8 reports from the runtime
 * sent before and after each test case executes. This handles the latter.
 */
export class PerTestCoverageTracker {
	private readonly scripts = new Map</* script ID */ string, Script>();

	constructor(private readonly maps: SourceMapStore) { }

	/** Adds new coverage data to the run, optionally for a test item. */
	public add(run: vscode.TestRun, coverage: IScriptCoverage, test?: vscode.TestItem) {
		let script = this.scripts.get(coverage.scriptId);
		if (!script) {
			if (!coverage.source) {
				throw new Error('expected to have source the first time a script is seen');
			}

			script = new Script(coverage.url, coverage.source, this.maps);
			this.scripts.set(coverage.scriptId, script);
		}

		return script.add(run, coverage, test);
	}
}

class Script {
	private sourceMap?: Promise<TraceMap | undefined>;
	private originalContent?: Promise<string | undefined>;

	constructor(
		public readonly url: string,
		private readonly source: string,
		private readonly maps: SourceMapStore,
	) {
	}

	public async add(run: vscode.TestRun, coverage: IScriptCoverage, test?: vscode.TestItem) {
		if (!coverage.url.startsWith('file://')) {
			return;
		}

		const sourceMap = await (this.sourceMap ??= this.maps.loadSourceMap(coverage.url));
		const originalSource = await (this.originalContent ??= this.maps.getSourceFileContents(coverage.url));
		const istanbuled = v8ToIstanbul(fileURLToPath(coverage.url), undefined, sourceMap && originalSource
			? { source: this.source, originalSource, sourceMap: { sourcemap: sourceMap } }
			: { source: this.source }
		);

		await istanbuled.load();

		const coverages = await istanbulCoverageContext.fromJson(istanbuled.toIstanbul(), {
			mapFileUri: uri => this.maps.getSourceFile(uri.toString()),
			mapLocation: (uri, position) =>
				this.maps.getSourceLocation(uri.toString(), position.line, position.character),
		});

		for (const coverage of coverages) {
			if (test) {
				(coverage as vscode.FileCoverage2).testItem = test;
			}
			run.addCoverage(coverage);
		}
	}
}
