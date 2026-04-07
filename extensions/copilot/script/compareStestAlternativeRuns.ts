/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AssertionError } from 'assert';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * An entry from `baseline.json`.
 */
interface BaselineTestResult {
	/** Test name */
	name: string;
	score: number;
	passCount: number;
	failCount: number;
	contentFilterCount: number;
	attributes: (Record<string, string | number> & { ['CompScore1']: number | undefined } & { ['CompScore2']: number | undefined } & { ['CompScore3']: number | undefined });
}

enum SignalKind {
	OldFormat = 'OldFormat',
	MustHave = 'MustHave',
	NiceToHave = 'NiceToHave',
	BadSuggestions = 'BadSuggestions',
	Other = 'Other',
}

namespace SignalKind {
	export function getFromTestName(testName: string): SignalKind | undefined {
		const signalKindRe = `^\\[(${Object.values(SignalKind).join('|')})\\]`;
		const signalKind = testName.match(signalKindRe);
		if (signalKind) {
			return Object.values(SignalKind).includes(signalKind[1] as SignalKind) ? signalKind[1] as SignalKind : undefined;
		}
	}
}

interface TestResult {
	/** unflavored */
	name: string;
	signalKind: SignalKind | undefined;
	testResults: BaselineTestResult[];
	compScore1: number | undefined;
	compScore2: number | undefined;
	compScore3: number | undefined;
}

const regexForProviderName = / \(\[(([a-zA-Z0-9\-])+)\]\)/;
const DEFAULT_PROVIDER_NAME = 'Default Provider';

function getFlavor(testResult: BaselineTestResult): string {
	const match = testResult.name.match(regexForProviderName);
	if (match) {
		switch (match[1]) {
			case 'prodFineTunedModel': return 'NES';
			case 'prodFineTunedModelWithSummarizedDocument': return 'NES-summ';
			case 'speculativeEditingInlineEditProvider': return 'SpecEdit';
			default:
				return match[1];
		}
	} else {
		return DEFAULT_PROVIDER_NAME;
	}
}

function computeTestResultsFromBaseline(baseline: BaselineTestResult[]): TestResult[] {

	const nesTestsWithFlavor = baseline.filter((currentBaselineTestResult) =>
		currentBaselineTestResult.name.startsWith('NES ') || (currentBaselineTestResult.name.startsWith('InlineEdit') && currentBaselineTestResult.name.includes('])')));

	const fullNameToTestName = (fullName: string) => {
		const indexOfSuiteTestNameSplit = fullName.indexOf(' - ');
		const testName = fullName.slice(indexOfSuiteTestNameSplit + 3);
		if (testName === undefined) { throw new AssertionError({ message: `does not follow the expected pattern: ${fullName}` }); }
		return testName;
	};

	const testNameToResults = new Map<string, BaselineTestResult[]>();

	for (const nesTest of nesTestsWithFlavor) {
		const testName = fullNameToTestName(nesTest.name);
		const baselineTestResults = testNameToResults.get(testName) ?? [];
		baselineTestResults.push(nesTest);
		testNameToResults.set(testName, baselineTestResults);
	}

	const sortedTestNameToFlavor = Array.from(testNameToResults.entries());

	sortedTestNameToFlavor.sort((a, b) => {
		const aTestName = a[0];
		const bTestName = b[0];
		return aTestName.localeCompare(bTestName);
	});

	return sortedTestNameToFlavor.map(([testName, baselineTestResults]) => {
		return {
			name: testName,
			signalKind: SignalKind.getFromTestName(testName),
			testResults: baselineTestResults,
			compScore1: baselineTestResults[0]?.attributes?.CompScore1 as number | undefined,
			compScore2: baselineTestResults[0]?.attributes?.CompScore2 as number | undefined,
			compScore3: baselineTestResults[0]?.attributes?.CompScore3 as number | undefined,
		} satisfies TestResult;
	});
}

function formatAsBold(text: string) {
	return `${text} *`;
}

function formatAsColored(text: string, color: 'green' | 'violet' | 'red' | undefined) {
	if (!color) {
		return text;
	}
	const colorMap = {
		'green': 32,
		'red': 31,
		'violet': 35,
	};
	return `\x1b[${colorMap[color]}m${text}\x1b[0m`;
}

// For BadSuggestion tests, a score > 0 is considered a pass, otherwise a fail
function isBadSuggestionPassed(score: number): boolean {
	return score > 0;
}

// Format pass ratio as a percentage string
function formatPassRatio(passed: number, total: number): string {
	if (total === 0) {
		return '0.00%';
	}
	return `${((passed / total) * 100).toFixed(2)}%`;
}

type TestScoreByFlavor = Record<string /* flavor */, number | { oldScore: number; newScore: number } | undefined>;
type AggregatedTest = { test: string; scores: TestScoreByFlavor; signalKind?: SignalKind };

function printTable(data: AggregatedTest[], { compare, useColoredOutput, filterProviders, omitEqual }: { compare: boolean; useColoredOutput: boolean; filterProviders?: string[]; omitEqual: boolean }) {
	const providers = Array.from(new Set(data.flatMap(d => Object.keys(d.scores))));
	const filteredProviders = filterProviders ? providers.filter(provider => filterProviders.includes(provider.toLocaleLowerCase())) : providers;

	const aggregatedTestsBySignalKind = data.reduce((acc: Record<SignalKind, AggregatedTest[]>, item) => {
		const group = item.signalKind ?? SignalKind.Other;
		if (!acc[group]) {
			acc[group] = [];
		}
		acc[group].push(item);
		return acc;
	}, {} as Record<SignalKind, AggregatedTest[]>);

	const tableData: Record<string, string>[] = [];

	const totalScoreByProvider: Record<string, number> = {};
	const oldTotalScoreByProvider: Record<string, number> = {};

	// Track pass/fail counts for BadSuggestion tests
	const badSuggestionPassedByProvider: Record<string, number> = {};
	const badSuggestionTotalByProvider: Record<string, number> = {};
	const oldBadSuggestionPassedByProvider: Record<string, number> = {};

	for (const provider of filteredProviders) {
		totalScoreByProvider[provider] = 0;
		oldTotalScoreByProvider[provider] = 0;
		badSuggestionPassedByProvider[provider] = 0;
		badSuggestionTotalByProvider[provider] = 0;
		oldBadSuggestionPassedByProvider[provider] = 0;
	}

	// Iterate over each signal kind
	for (const [signalKind, tests] of Object.entries(aggregatedTestsBySignalKind)) {
		// add header
		tableData.push({ 'Test Name': `=== ${signalKind} ===` });

		const totalByProviderForSignalKind: Record<string /* provider */, number> = {};
		const oldTotalByProviderForSignalKind: Record<string /* provider */, number> = {};

		// Track pass/fail counts for BadSuggestion tests within this signal kind
		const badSuggestionPassedByProviderForSignalKind: Record<string, number> = {};
		const badSuggestionTotalByProviderForSignalKind: Record<string, number> = {};
		const oldBadSuggestionPassedByProviderForSignalKind: Record<string, number> = {};

		for (const provider of filteredProviders) {
			totalByProviderForSignalKind[provider] = 0;
			oldTotalByProviderForSignalKind[provider] = 0;
			badSuggestionPassedByProviderForSignalKind[provider] = 0;
			badSuggestionTotalByProviderForSignalKind[provider] = 0;
			oldBadSuggestionPassedByProviderForSignalKind[provider] = 0;
		}

		const isBadSuggestionCategory = signalKind === SignalKind.BadSuggestions;

		for (const test of tests) {
			const scores = filteredProviders.map(provider => {
				const score = test.scores[provider];
				const oldScore = typeof score === 'object' ? score.oldScore : undefined;
				const numericScore = typeof score === 'object' ? score.newScore : score ?? 0;

				// Handle BadSuggestion scores differently
				if (isBadSuggestionCategory) {
					badSuggestionTotalByProvider[provider]++;
					badSuggestionTotalByProviderForSignalKind[provider]++;

					if (isBadSuggestionPassed(numericScore)) {
						badSuggestionPassedByProvider[provider]++;
						badSuggestionPassedByProviderForSignalKind[provider]++;
					}

					if (oldScore !== undefined) {
						if (isBadSuggestionPassed(oldScore)) {
							oldBadSuggestionPassedByProvider[provider]++;
							oldBadSuggestionPassedByProviderForSignalKind[provider]++;
						}
					}
				} else {
					// Regular handling for non-BadSuggestion tests
					totalByProviderForSignalKind[provider] += numericScore;
					oldTotalScoreByProvider[provider] += oldScore ?? 0;
					totalScoreByProvider[provider] += numericScore;
					oldTotalByProviderForSignalKind[provider] += oldScore ?? 0;
				}

				return numericScore;
			});

			const maxScore = Math.max(...scores);
			const minScore = Math.min(...scores);
			const areAllScoresEqual = maxScore === minScore;

			if (omitEqual && areAllScoresEqual) {
				continue;
			}

			const resultRow: Record<string, string> = { 'Test Name': test.test };
			for (let i = 0; i < filteredProviders.length; i++) {
				const provider = filteredProviders[i];
				const rawScore = test.scores[provider];
				const score = scores[i];

				let formattedScore: string;

				if (isBadSuggestionCategory) {
					// For BadSuggestion, show "Pass" or "Fail" instead of score
					formattedScore = isBadSuggestionPassed(score) ? 'Pass' : 'Fail';

					if (compare && typeof rawScore === 'object') {
						const oldResult = isBadSuggestionPassed(rawScore.oldScore) ? 'Pass' : 'Fail';
						const newResult = isBadSuggestionPassed(rawScore.newScore) ? 'Pass' : 'Fail';

						if (oldResult !== newResult) {
							const color = useColoredOutput ?
								(oldResult === 'Fail' && newResult === 'Pass' ? 'green' : 'red') :
								undefined;
							formattedScore = formatAsColored(`${oldResult} -> ${newResult}`, color);
						}
					}
				} else {
					// Regular formatting for non-BadSuggestion tests
					formattedScore = score.toFixed(2);
					if (compare && typeof rawScore === 'object' && rawScore.oldScore !== rawScore.newScore) {
						const color = useColoredOutput ? (rawScore.newScore > rawScore.oldScore ? 'green' : 'red') : undefined;
						formattedScore = formatAsColored(`${rawScore.oldScore.toFixed(2)} -> ${rawScore.newScore.toFixed(2)}`, color);
					} else if (maxScore - score < 0.001 && !areAllScoresEqual) {
						formattedScore = formatAsBold(formattedScore);
					}
				}

				resultRow[provider] = typeof rawScore === 'undefined' ? '-' : formattedScore;
			}

			tableData.push(resultRow);
		}

		// Add subtotal for signal kind
		const subtotalRow: Record<string, string> = { 'Test Name': `${signalKind} Subtotal (${tests.length} tests)` };
		for (const provider of filteredProviders) {
			if (isBadSuggestionCategory) {
				// For BadSuggestion, show pass ratio
				const passedTests = badSuggestionPassedByProviderForSignalKind[provider];
				const totalTests = badSuggestionTotalByProviderForSignalKind[provider];
				const passRatio = formatPassRatio(passedTests, totalTests);

				if (compare) {
					const oldPassedTests = oldBadSuggestionPassedByProviderForSignalKind[provider];
					const oldPassRatio = formatPassRatio(oldPassedTests, totalTests);

					if (oldPassedTests !== passedTests) {
						const color = useColoredOutput ? (passedTests > oldPassedTests ? 'green' : 'red') : undefined;
						subtotalRow[provider] = formatAsColored(`${oldPassRatio} -> ${passRatio}`, color);
					} else {
						subtotalRow[provider] = passRatio;
					}
				} else {
					subtotalRow[provider] = passRatio;
				}
			} else {
				// Regular handling for non-BadSuggestion categories
				const oldSubTotal = oldTotalByProviderForSignalKind[provider];
				const subTotal = totalByProviderForSignalKind[provider];
				if (compare && Math.abs(oldSubTotal - subTotal) > 0.001 && !provider.startsWith('Comp')) {
					const rawOut = `${oldSubTotal.toFixed(2)} -> ${subTotal.toFixed(2)}`;
					const color = useColoredOutput ? (oldSubTotal < subTotal ? 'green' : 'red') : undefined;
					subtotalRow[provider] = formatAsColored(rawOut, color);
				} else {
					subtotalRow[provider] = subTotal.toFixed(2);
				}
			}
		}
		tableData.push(subtotalRow, { 'Test Name': '' });
	}

	// Add total (don't include BadSuggestion in the grand total)
	const totalRow: Record<string, string> = { 'Test Name': 'Grand Total (excluding BadSuggestions)' };
	for (const provider of filteredProviders) {
		const oldTotal = oldTotalScoreByProvider[provider];
		const total = totalScoreByProvider[provider];
		if (compare && Math.abs(oldTotal - total) > 0.001 && !provider.startsWith('Comp')) {
			const rawOut = `${oldTotal.toFixed(2)} -> ${total.toFixed(2)}`;
			const color = useColoredOutput ? (oldTotal < total ? 'green' : 'red') : undefined;
			totalRow[provider] = formatAsColored(rawOut, color);
		} else {
			totalRow[provider] = total.toFixed(2);
		}
	}
	tableData.push(totalRow);

	// Add BadSuggestion aggregate pass ratio
	const badSuggestionRow: Record<string, string> = { 'Test Name': 'BadSuggestion Pass Ratio' };
	for (const provider of filteredProviders) {
		const passedTests = badSuggestionPassedByProvider[provider];
		const totalTests = badSuggestionTotalByProvider[provider];
		const passRatio = formatPassRatio(passedTests, totalTests);

		if (compare && totalTests > 0) {
			const oldPassedTests = oldBadSuggestionPassedByProvider[provider];
			const oldPassRatio = formatPassRatio(oldPassedTests, totalTests);

			if (oldPassedTests !== passedTests) {
				const color = useColoredOutput ? (passedTests > oldPassedTests ? 'green' : 'red') : undefined;
				badSuggestionRow[provider] = formatAsColored(`${oldPassRatio} -> ${passRatio}`, color);
			} else {
				badSuggestionRow[provider] = passRatio;
			}
		} else {
			badSuggestionRow[provider] = passRatio;
		}
	}
	tableData.push(badSuggestionRow);

	console.table(tableData);
}

const DEFAULT_BASELINE_JSON_PATH = path.join(__dirname, '../test/simulation/baseline.json');
const DEFAULT_BASELINE_OLD_JSON_PATH = path.join(__dirname, '../test/simulation/baseline.old.json');

async function main() {
	const args = process.argv.slice(2);
	const compare = args.includes('--compare');
	const upgradeBaselineOldJson = args.includes('--upgrade-old-baseline');
	const useColoredOutput = args.includes('--color');
	const omitEqual = args.includes('--omit-equal');
	const filterArg = args.find(arg => arg.startsWith('--filter='));
	const filterProviders = filterArg ? filterArg.split('=')[1].split(',').map(s => s.toLocaleLowerCase()) : undefined;
	const externalBaselineArg = args.find(arg => arg.startsWith('--external-baseline='));
	const externalBaselinePath = externalBaselineArg ? externalBaselineArg.split('=')[1] : undefined;

	// Determine baseline paths
	const BASELINE_JSON_PATH = externalBaselinePath ? path.resolve(externalBaselinePath) : DEFAULT_BASELINE_JSON_PATH;
	const BASELINE_OLD_JSON_PATH = path.join(path.dirname(BASELINE_JSON_PATH), 'baseline.old.json');

	let baselineJson: string;
	try {
		baselineJson = await fs.readFile(BASELINE_JSON_PATH, 'utf8');
	} catch (e: unknown) {
		console.error('Failed to read baseline.json');
		throw e;
	}
	let baseline: BaselineTestResult[];
	try {
		baseline = JSON.parse(baselineJson) as BaselineTestResult[];
	} catch (e: unknown) {
		console.error('Failed to parse baseline.json');
		throw e;
	}

	if (upgradeBaselineOldJson) {
		const baselineJsonContentsFromHEAD = await new Promise<string>((resolve, reject) => {
			execFile('git', ['show', `HEAD:${path.relative(process.cwd(), BASELINE_JSON_PATH)}`], (error: Error | null, stdout: string) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(stdout);
			});
		});
		await fs.writeFile(BASELINE_OLD_JSON_PATH, baselineJsonContentsFromHEAD);
	}

	let oldBaseline: BaselineTestResult[] | undefined;
	if (compare) {
		let oldBaselineJson: string | undefined;
		try {
			oldBaselineJson = await fs.readFile(BASELINE_OLD_JSON_PATH, 'utf8');
		} catch (e: unknown) {
			console.error('Failed to read baseline.json');
			throw e;
		}
		try {
			oldBaseline = JSON.parse(oldBaselineJson) as BaselineTestResult[];
		} catch (e: unknown) {
			console.error('Failed to parse baseline.json');
			throw e;
		}
	}

	const testResults = computeTestResultsFromBaseline(baseline);
	const oldTestResults = compare && oldBaseline ? computeTestResultsFromBaseline(oldBaseline) : undefined;

	const testNameToOldScoresByFlavor = oldTestResults?.reduce((acc: Record<string /* testName */, Record<string /* flavor */, number | undefined>>, testResult) => {
		acc[testResult.name] = testResult.testResults.reduce((acc, testResult) => {
			acc[getFlavor(testResult)] = testResult.score;
			return acc;
		}, { 'Comp1': testResult.compScore1, 'Comp2': testResult.compScore2, 'Comp3': testResult.compScore3 } as Record<string, number | undefined>);
		return acc;
	}, {}) ?? {};

	const result = testResults.map(testResult => {
		const oldScoresByFlavor = testNameToOldScoresByFlavor[testResult.name] || {};
		const scores = testResult.testResults.reduce((acc: TestScoreByFlavor, testResult) => {
			const flavor = getFlavor(testResult);
			const newScore = testResult.score;
			const oldScore = oldScoresByFlavor[flavor];
			acc[flavor] = oldScore === undefined ? newScore : { oldScore, newScore };
			return acc;
		}, { 'Comp1': testResult.compScore1, 'Comp2': testResult.compScore2, 'Comp3': testResult.compScore3 });
		return {
			test: testResult.name,
			signalKind: testResult.signalKind,
			scores,
		};
	});

	printTable(result, { compare, useColoredOutput, filterProviders, omitEqual });
}

main();
