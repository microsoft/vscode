/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	decodedMappings,
	GREATEST_LOWER_BOUND,
	LEAST_UPPER_BOUND,
	originalPositionFor,
	TraceMap,
} from '@jridgewell/trace-mapping';
import * as styles from 'ansi-styles';
import { ChildProcessWithoutNullStreams } from 'child_process';
import * as vscode from 'vscode';
import { istanbulCoverageContext, PerTestCoverageTracker } from './coverageProvider';
import { attachTestMessageMetadata } from './metadata';
import { snapshotComment } from './snapshot';
import { StackTraceLocation, StackTraceParser } from './stackTraceParser';
import { StreamSplitter } from './streamSplitter';
import { getContentFromFilesystem } from './testTree';
import { IScriptCoverage } from './v8CoverageWrangling';

export const enum MochaEvent {
	Start = 'start',
	TestStart = 'testStart',
	Pass = 'pass',
	Fail = 'fail',
	End = 'end',

	// custom events:
	CoverageInit = 'coverageInit',
	CoverageIncrement = 'coverageIncrement',
}

export interface IStartEvent {
	total: number;
}

export interface ITestStartEvent {
	title: string;
	fullTitle: string;
	file: string;
	currentRetry: number;
	speed: string;
}

export interface IPassEvent extends ITestStartEvent {
	duration: number;
}

export interface IFailEvent extends IPassEvent {
	err: string;
	stack: string | null;
	expected?: string;
	actual?: string;
	expectedJSON?: unknown;
	actualJSON?: unknown;
	snapshotPath?: string;
}

export interface IEndEvent {
	suites: number;
	tests: number;
	passes: number;
	pending: number;
	failures: number;
	start: string /* ISO date */;
	end: string /* ISO date */;
}

export interface ITestCoverageCoverage {
	file: string;
	fullTitle: string;
	coverage: { result: IScriptCoverage[] };
}

export type MochaEventTuple =
	| [MochaEvent.Start, IStartEvent]
	| [MochaEvent.TestStart, ITestStartEvent]
	| [MochaEvent.Pass, IPassEvent]
	| [MochaEvent.Fail, IFailEvent]
	| [MochaEvent.End, IEndEvent]
	| [MochaEvent.CoverageInit, { result: IScriptCoverage[] }]
	| [MochaEvent.CoverageIncrement, ITestCoverageCoverage];

const LF = '\n'.charCodeAt(0);

export class TestOutputScanner implements vscode.Disposable {
	protected mochaEventEmitter = new vscode.EventEmitter<MochaEventTuple>();
	protected outputEventEmitter = new vscode.EventEmitter<string>();
	protected onExitEmitter = new vscode.EventEmitter<string | undefined>();

	/**
	 * Fired when a mocha event comes in.
	 */
	public readonly onMochaEvent = this.mochaEventEmitter.event;

	/**
	 * Fired when other output from the process comes in.
	 */
	public readonly onOtherOutput = this.outputEventEmitter.event;

	/**
	 * Fired when the process encounters an error, or exits.
	 */
	public readonly onRunnerExit = this.onExitEmitter.event;

	constructor(private readonly process: ChildProcessWithoutNullStreams, private args?: string[]) {
		process.stdout.pipe(new StreamSplitter(LF)).on('data', this.processData);
		process.stderr.pipe(new StreamSplitter(LF)).on('data', this.processData);
		process.on('error', e => this.onExitEmitter.fire(e.message));
		process.on('exit', code =>
			this.onExitEmitter.fire(code ? `Test process exited with code ${code}` : undefined)
		);
	}

	/**
	 * @override
	 */
	public dispose() {
		try {
			this.process.kill();
		} catch {
			// ignored
		}
	}

	protected readonly processData = (data: string | Buffer) => {
		if (this.args) {
			this.outputEventEmitter.fire(`./scripts/test ${this.args.join(' ')}`);
			this.args = undefined;
		}

		data = data.toString();

		try {
			const parsed = JSON.parse(data.trim()) as unknown;
			if (parsed instanceof Array && parsed.length === 2 && typeof parsed[0] === 'string') {
				this.mochaEventEmitter.fire(parsed as MochaEventTuple);
			} else {
				this.outputEventEmitter.fire(data);
			}
		} catch {
			this.outputEventEmitter.fire(data);
		}
	};
}

type QueuedOutput = string | [string, vscode.Location | undefined, vscode.TestItem | undefined];

export async function scanTestOutput(
	tests: Map<string, vscode.TestItem>,
	task: vscode.TestRun,
	scanner: TestOutputScanner,
	coverageDir: string | undefined,
	cancellation: vscode.CancellationToken
): Promise<void> {
	const exitBlockers: Set<Promise<unknown>> = new Set();
	const skippedTests = new Set(tests.values());
	const store = new SourceMapStore();
	let outputQueue = Promise.resolve();
	const enqueueOutput = (fn: QueuedOutput | (() => Promise<QueuedOutput>)) => {
		exitBlockers.delete(outputQueue);
		outputQueue = outputQueue.finally(async () => {
			const r = typeof fn === 'function' ? await fn() : fn;
			typeof r === 'string' ? task.appendOutput(r) : task.appendOutput(...r);
		});
		exitBlockers.add(outputQueue);
		return outputQueue;
	};
	const enqueueExitBlocker = <T>(prom: Promise<T>): Promise<T> => {
		exitBlockers.add(prom);
		prom.finally(() => exitBlockers.delete(prom));
		return prom;
	};

	let perTestCoverage: PerTestCoverageTracker | undefined;
	let lastTest: vscode.TestItem | undefined;
	let ranAnyTest = false;

	try {
		if (cancellation.isCancellationRequested) {
			return;
		}

		await new Promise<void>(resolve => {
			cancellation.onCancellationRequested(() => {
				resolve();
			});

			let currentTest: vscode.TestItem | undefined;

			scanner.onRunnerExit(err => {
				if (err) {
					enqueueOutput(err + crlf);
				}
				resolve();
			});

			scanner.onOtherOutput(str => {
				const match = spdlogRe.exec(str);
				if (!match) {
					enqueueOutput(str + crlf);
					return;
				}

				const logLocation = store.getSourceLocation(match[2], Number(match[3]) - 1);
				const logContents = replaceAllLocations(store, match[1]);
				const test = currentTest;

				enqueueOutput(() =>
					Promise.all([logLocation, logContents]).then(([location, contents]) => [
						contents + crlf,
						location,
						test,
					])
				);
			});

			scanner.onMochaEvent(evt => {
				switch (evt[0]) {
					case MochaEvent.Start:
						break; // no-op
					case MochaEvent.TestStart:
						currentTest = tests.get(evt[1].fullTitle);
						if (!currentTest) {
							console.warn(`Could not find test ${evt[1].fullTitle}`);
							return;
						}
						skippedTests.delete(currentTest);
						task.started(currentTest);
						ranAnyTest = true;
						break;
					case MochaEvent.Pass:
						{
							const title = evt[1].fullTitle;
							const tcase = tests.get(title);
							enqueueOutput(` ${styles.green.open}√${styles.green.close} ${title}\r\n`);
							if (tcase) {
								lastTest = tcase;
								task.passed(tcase, evt[1].duration);
							}
						}
						break;
					case MochaEvent.Fail:
						{
							const {
								err,
								stack,
								duration,
								expected,
								expectedJSON,
								actual,
								actualJSON,
								snapshotPath,
								fullTitle: id,
							} = evt[1];
							let tcase = tests.get(id);
							// report failures on hook to the last-seen test, or first test if none run yet
							if (!tcase && (id.includes('hook for') || id.includes('hook in'))) {
								tcase = lastTest ?? tests.values().next().value;
							}

							enqueueOutput(`${styles.red.open} x ${id}${styles.red.close}\r\n`);
							const rawErr = stack || err;
							const locationsReplaced = replaceAllLocations(store, forceCRLF(rawErr));
							if (rawErr) {
								enqueueOutput(async () => [await locationsReplaced, undefined, tcase]);
							}

							if (!tcase) {
								return;
							}

							const hasDiff =
								actual !== undefined &&
								expected !== undefined &&
								(expected !== '[undefined]' || actual !== '[undefined]');
							const testFirstLine =
								tcase.range &&
								new vscode.Location(
									tcase.uri!,
									new vscode.Range(
										tcase.range.start,
										new vscode.Position(tcase.range.start.line, 100)
									)
								);

							enqueueExitBlocker(
								(async () => {
									const stackInfo = await deriveStackLocations(store, rawErr, tcase!);
									let message: vscode.TestMessage;

									if (hasDiff) {
										message = new vscode.TestMessage(tryMakeMarkdown(err));
										message.actualOutput = outputToString(actual);
										message.expectedOutput = outputToString(expected);
										if (snapshotPath) {
											message.contextValue = 'isSelfhostSnapshotMessage';
											message.expectedOutput += snapshotComment + snapshotPath;
										}

										attachTestMessageMetadata(message, {
											expectedValue: expectedJSON,
											actualValue: actualJSON,
										});
									} else {
										message = new vscode.TestMessage(
											stack ? await sourcemapStack(store, stack) : await locationsReplaced
										);
									}

									message.location = stackInfo.primary ?? testFirstLine;
									message.stackTrace = stackInfo.stack;
									task.failed(tcase!, message, duration);
								})()
							);
						}
						break;
					case MochaEvent.End:
						// no-op, we wait until the process exits to ensure coverage is written out
						break;
					case MochaEvent.CoverageInit:
						perTestCoverage ??= new PerTestCoverageTracker(store);
						for (const result of evt[1].result) {
							perTestCoverage.add(result);
						}
						break;
					case MochaEvent.CoverageIncrement: {
						const { fullTitle, coverage } = evt[1];
						const tcase = tests.get(fullTitle);
						if (tcase) {
							perTestCoverage ??= new PerTestCoverageTracker(store);
							for (const result of coverage.result) {
								perTestCoverage.add(result, tcase);
							}
						}
						break;
					}
				}
			});
		});

		if (perTestCoverage) {
			enqueueExitBlocker(perTestCoverage.report(task));
		}

		await Promise.all([...exitBlockers]);

		if (coverageDir) {
			try {
				await istanbulCoverageContext.apply(task, coverageDir, {
					mapFileUri: uri => store.getSourceFile(uri.toString()),
					mapLocation: (uri, position) =>
						store.getSourceLocation(uri.toString(), position.line, position.character),
				});
			} catch (e) {
				const msg = `Error loading coverage:\n\n${e}\n`;
				task.appendOutput(msg.replace(/\n/g, crlf));
			}
		}

		// no tests? Possible crash, show output:
		if (!ranAnyTest) {
			await vscode.commands.executeCommand('testing.showMostRecentOutput');
		}
	} catch (e) {
		task.appendOutput((e as Error).stack || (e as Error).message);
	} finally {
		scanner.dispose();
		for (const test of skippedTests) {
			task.skipped(test);
		}
		task.end();
	}
}

const spdlogRe = /"(.+)", source: (file:\/\/\/.*?)+ \(([0-9]+)\)/;
const crlf = '\r\n';

const forceCRLF = (str: string) => str.replace(/(?<!\r)\n/gm, '\r\n');

const sourcemapStack = async (store: SourceMapStore, str: string) => {
	locationRe.lastIndex = 0;

	const replacements = await Promise.all(
		[...str.matchAll(locationRe)].map(async match => {
			const location = await deriveSourceLocation(store, match);
			if (!location) {
				return;
			}
			return {
				from: match[0],
				to: location?.uri.with({
					fragment: `L${location.range.start.line + 1}:${location.range.start.character + 1}`,
				}),
			};
		})
	);

	for (const replacement of replacements) {
		if (replacement) {
			str = str.replace(replacement.from, replacement.to.toString(true));
		}
	}

	return str;
};

const outputToString = (output: unknown) =>
	typeof output === 'object' ? JSON.stringify(output, null, 2) : String(output);

const tryMakeMarkdown = (message: string) => {
	const lines = message.split('\n');
	const start = lines.findIndex(l => l.includes('+ actual'));
	if (start === -1) {
		return message;
	}

	lines.splice(start, 1, '```diff');
	lines.push('```');
	return new vscode.MarkdownString(lines.join('\n'));
};

const inlineSourcemapRe = /^\/\/# sourceMappingURL=data:application\/json;base64,(.+)/m;
const sourceMapBiases = [GREATEST_LOWER_BOUND, LEAST_UPPER_BOUND] as const;

export const enum SearchStrategy {
	FirstBefore = -1,
	FirstAfter = 1,
}

export type SourceLocationMapper = (line: number, col: number, strategy: SearchStrategy) => vscode.Location | undefined;

export class SourceMapStore {
	private readonly cache = new Map</* file uri */ string, Promise<TraceMap | undefined>>();

	async getSourceLocationMapper(fileUri: string): Promise<SourceLocationMapper> {
		const sourceMap = await this.loadSourceMap(fileUri);
		return (line, col, strategy) => {
			if (!sourceMap) {
				return undefined;
			}

			// 1. Look for the ideal position on this line if it exists
			const idealPosition = originalPositionFor(sourceMap, { column: col, line: line + 1, bias: SearchStrategy.FirstAfter ? GREATEST_LOWER_BOUND : LEAST_UPPER_BOUND });
			if (idealPosition.line !== null && idealPosition.column !== null && idealPosition.source !== null) {
				return new vscode.Location(
					this.completeSourceMapUrl(sourceMap, idealPosition.source),
					new vscode.Position(idealPosition.line - 1, idealPosition.column)
				);
			}

			// Otherwise get the first/last valid mapping on another line.
			const decoded = decodedMappings(sourceMap);
			const enum MapField {
				COLUMN = 0,
				SOURCES_INDEX = 1,
				SOURCE_LINE = 2,
				SOURCE_COLUMN = 3,
			}

			do {
				line += strategy;
				const segments = decoded[line];
				if (!segments?.length) {
					continue;
				}

				const index = strategy === SearchStrategy.FirstBefore
					? findLastIndex(segments, s => s.length !== 1)
					: segments.findIndex(s => s.length !== 1);
				const segment = segments[index];

				if (!segment || segment.length === 1) {
					continue;
				}

				return new vscode.Location(
					this.completeSourceMapUrl(sourceMap, sourceMap.sources[segment[MapField.SOURCES_INDEX]]!),
					new vscode.Position(segment[MapField.SOURCE_LINE] - 1, segment[MapField.SOURCE_COLUMN])
				);
			} while (strategy === SearchStrategy.FirstBefore ? line > 0 : line < decoded.length);

			return undefined;
		};
	}

	/** Gets an original location from a base 0 line and column */
	async getSourceLocation(fileUri: string, line: number, col = 0) {
		const sourceMap = await this.loadSourceMap(fileUri);
		if (!sourceMap) {
			return undefined;
		}

		let smLine = line + 1;

		// if the range is after the end of mappings, adjust it to the last mapped line
		const decoded = decodedMappings(sourceMap);
		if (decoded.length <= line) {
			smLine = decoded.length; // base 1, no -1 needed
			col = Number.MAX_SAFE_INTEGER;
		}

		for (const bias of sourceMapBiases) {
			const position = originalPositionFor(sourceMap, { column: col, line: smLine, bias });
			if (position.line !== null && position.column !== null && position.source !== null) {
				return new vscode.Location(
					this.completeSourceMapUrl(sourceMap, position.source),
					new vscode.Position(position.line - 1, position.column)
				);
			}
		}

		return undefined;
	}

	async getSourceFile(compiledUri: string) {
		const sourceMap = await this.loadSourceMap(compiledUri);
		if (!sourceMap) {
			return undefined;
		}

		if (sourceMap.sources[0]) {
			return this.completeSourceMapUrl(sourceMap, sourceMap.sources[0]);
		}

		for (const bias of sourceMapBiases) {
			const position = originalPositionFor(sourceMap, { column: 0, line: 1, bias });
			if (position.source !== null) {
				return this.completeSourceMapUrl(sourceMap, position.source);
			}
		}

		return undefined;
	}

	private completeSourceMapUrl(sm: TraceMap, source: string) {
		if (sm.sourceRoot) {
			try {
				return vscode.Uri.parse(new URL(source, sm.sourceRoot).toString());
			} catch {
				// ignored
			}
		}

		return vscode.Uri.parse(source);
	}

	private loadSourceMap(fileUri: string) {
		const existing = this.cache.get(fileUri);
		if (existing) {
			return existing;
		}

		const promise = (async () => {
			try {
				const contents = await getContentFromFilesystem(vscode.Uri.parse(fileUri));
				const sourcemapMatch = inlineSourcemapRe.exec(contents);
				if (!sourcemapMatch) {
					return;
				}

				const decoded = Buffer.from(sourcemapMatch[1], 'base64').toString();
				return new TraceMap(decoded, fileUri);
			} catch (e) {
				console.warn(`Error parsing sourcemap for ${fileUri}: ${(e as Error).stack}`);
				return;
			}
		})();

		this.cache.set(fileUri, promise);
		return promise;
	}
}

const locationRe = /(file:\/{3}.+):([0-9]+):([0-9]+)/g;

async function replaceAllLocations(store: SourceMapStore, str: string) {
	const output: (string | Promise<string>)[] = [];
	let lastIndex = 0;

	for (const match of str.matchAll(locationRe)) {
		const locationPromise = deriveSourceLocation(store, match);
		const startIndex = match.index || 0;
		const endIndex = startIndex + match[0].length;

		if (startIndex > lastIndex) {
			output.push(str.substring(lastIndex, startIndex));
		}

		output.push(
			locationPromise.then(location =>
				location
					? `${location.uri}:${location.range.start.line + 1}:${location.range.start.character + 1}`
					: match[0]
			)
		);

		lastIndex = endIndex;
	}

	// Preserve the remaining string after the last match
	if (lastIndex < str.length) {
		output.push(str.substring(lastIndex));
	}

	const values = await Promise.all(output);
	return values.join('');
}

async function deriveStackLocations(
	store: SourceMapStore,
	stack: string,
	tcase: vscode.TestItem
) {
	locationRe.lastIndex = 0;

	const locationsRaw = [...new StackTraceParser(stack)].filter(t => t instanceof StackTraceLocation);
	const locationsMapped = await Promise.all(locationsRaw.map(async location => {
		const mapped = location.path.startsWith('file:') ? await store.getSourceLocation(location.path, location.lineBase1 - 1, location.columnBase1 - 1) : undefined;
		const stack = new vscode.TestMessageStackFrame(location.label || '<anonymous>', mapped?.uri, mapped?.range.start || new vscode.Position(location.lineBase1 - 1, location.columnBase1 - 1));
		return { location: mapped, stack };
	}));

	let best: undefined | { location: vscode.Location; score: number };
	for (const { location } of locationsMapped) {
		if (!location) {
			continue;
		}
		let score = 0;
		if (tcase.uri && tcase.uri.toString() === location.uri.toString()) {
			score = 1;
			if (tcase.range && tcase.range.contains(location?.range)) {
				score = 2;
			}
		}
		if (!best || score > best.score) {
			best = { location, score };
		}
	}

	return { stack: locationsMapped.map(s => s.stack), primary: best?.location };
}

async function deriveSourceLocation(store: SourceMapStore, parts: RegExpMatchArray) {
	const [, fileUri, line, col] = parts;
	return store.getSourceLocation(fileUri, Number(line) - 1, Number(col));
}

function findLastIndex<T>(arr: T[], predicate: (value: T) => boolean) {
	for (let i = arr.length - 1; i >= 0; i--) {
		if (predicate(arr[i])) {
			return i;
		}
	}

	return -1;
}
