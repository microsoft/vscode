/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// @ts-check

/**
 * Merge per-group perf results into a single unified CI summary.
 *
 * Called by the CI report job after all matrix groups have finished.
 * Reads results.json and baseline-*.json from each group directory,
 * merges all scenarios into one combined report, and writes a single
 * ci-summary.md file.
 *
 * Usage:
 *   node scripts/chat-simulation/merge-ci-summary.js \
 *     --results-dir perf-results \
 *     --output ci-summary.md \
 *     [--leak-summary leak-results/.chat-simulation-data/ci-summary-leak.md] \
 *     [--threshold 0.2]
 */

const fs = require('fs');
const path = require('path');
const { welchTTest, loadConfig } = require('./common/utils');

// -- CLI args ----------------------------------------------------------------

function parseArgs() {
	const args = process.argv.slice(2);
	const opts = {
		resultsDir: '',
		output: '',
		/** @type {string | undefined} */
		leakSummary: undefined,
		threshold: 0.2,
		/** @type {Record<string, number | string>} */
		metricThresholds: {},
	};
	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
			case '--results-dir': opts.resultsDir = args[++i]; break;
			case '--output': opts.output = args[++i]; break;
			case '--leak-summary': opts.leakSummary = args[++i]; break;
			case '--threshold': opts.threshold = parseFloat(args[++i]); break;
			case '--help': case '-h':
				console.log([
					'Merge per-group perf results into a single CI summary.',
					'',
					'Options:',
					'  --results-dir <dir>     Directory containing perf-results-* or perf-summary-* subdirs',
					'  --output <path>         Output path for ci-summary.md',
					'  --leak-summary <path>   Path to ci-summary-leak.md (optional)',
					'  --threshold <frac>      Regression threshold fraction (default: 0.2)',
				].join('\n'));
				process.exit(0);
		}
	}
	if (!opts.resultsDir || !opts.output) {
		console.error('Required: --results-dir and --output');
		process.exit(1);
	}
	return opts;
}

// -- Merge logic -------------------------------------------------------------

/**
 * Find all results.json and baseline-*.json files across group directories,
 * merge scenarios into a single combined report.
 * @param {string} resultsDir
 */
function mergeResults(resultsDir) {
	let groupDirs = fs.readdirSync(resultsDir)
		.filter(d => d.startsWith('perf-results-') || d.startsWith('perf-summary-'))
		.map(d => path.join(resultsDir, d))
		.filter(d => fs.statSync(d).isDirectory());

	// Fallback: when download-artifact extracts a single artifact directly into
	// resultsDir (no artifact-named subdirectory), treat resultsDir itself as the
	// sole group directory if it contains a .chat-simulation-data folder.
	if (groupDirs.length === 0) {
		const simDataDir = path.join(resultsDir, '.chat-simulation-data');
		if (fs.existsSync(simDataDir) && fs.statSync(simDataDir).isDirectory()) {
			console.log(`No named subdirectories found; using ${resultsDir} directly as single group`);
			groupDirs = [resultsDir];
		} else {
			console.error(`No perf-results-* or perf-summary-* directories found in ${resultsDir}`);
			return null;
		}
	}

	/** @type {Record<string, any>} */
	const mergedScenarios = {};
	/** @type {Record<string, any>} */
	const mergedBaselineScenarios = {};
	let runsPerScenario = 0;
	let platform = 'linux';
	/** @type {string | undefined} */
	let buildMode;
	/** @type {string | undefined} */
	let baselineBuildVersion;
	/** @type {string | undefined} */
	let threshold;

	// Read per-metric thresholds from config.jsonc (same source as the perf script)
	const perfConfig = loadConfig('perfRegression');
	/** @type {Record<string, number | string>} */
	const metricThresholds = perfConfig.metricThresholds ?? {};

	for (const groupDir of groupDirs) {
		// Find results.json (may be in a timestamped subdir under .chat-simulation-data)
		const simDataDir = path.join(groupDir, '.chat-simulation-data');
		if (!fs.existsSync(simDataDir)) { continue; }

		// Search for results.json in timestamped subdirs
		const subdirs = fs.readdirSync(simDataDir).filter(d => {
			const full = path.join(simDataDir, d);
			return fs.statSync(full).isDirectory() && /^\d{4}-/.test(d);
		});

		for (const subdir of subdirs) {
			const resultsPath = path.join(simDataDir, subdir, 'results.json');
			if (fs.existsSync(resultsPath)) {
				const results = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
				runsPerScenario = results.runsPerScenario || runsPerScenario;
				platform = results.platform || platform;
				buildMode = results.buildMode || buildMode;
				for (const [scenario, data] of Object.entries(results.scenarios || {})) {
					mergedScenarios[scenario] = data;
				}
			}

			// Find baseline-*.json in the same dir
			const baselineFiles = fs.readdirSync(path.join(simDataDir, subdir))
				.filter(f => f.startsWith('baseline-') && f.endsWith('.json'));
			for (const bf of baselineFiles) {
				const baseline = JSON.parse(fs.readFileSync(path.join(simDataDir, subdir, bf), 'utf-8'));
				baselineBuildVersion = baseline.baselineBuildVersion || baselineBuildVersion;
				for (const [scenario, data] of Object.entries(baseline.scenarios || {})) {
					mergedBaselineScenarios[scenario] = data;
				}
			}
		}

		// Also check for baseline cached at top-level .chat-simulation-data
		const topBaselines = fs.readdirSync(simDataDir)
			.filter(f => f.startsWith('baseline-') && f.endsWith('.json'));
		for (const bf of topBaselines) {
			const baseline = JSON.parse(fs.readFileSync(path.join(simDataDir, bf), 'utf-8'));
			baselineBuildVersion = baseline.baselineBuildVersion || baselineBuildVersion;
			for (const [scenario, data] of Object.entries(baseline.scenarios || {})) {
				mergedBaselineScenarios[scenario] = data;
			}
		}

		// Read threshold/metricThresholds from the group's ci-summary or config
		const ciSummaryPath = path.join(simDataDir, 'ci-summary.md');
		if (fs.existsSync(ciSummaryPath)) {
			const content = fs.readFileSync(ciSummaryPath, 'utf-8');
			const thresholdMatch = content.match(/Regression threshold\*\* \| (\d+)%/);
			if (thresholdMatch) {
				threshold = thresholdMatch[1];
			}
		}
	}

	const mergedReport = {
		timestamp: new Date().toISOString(),
		platform,
		runsPerScenario,
		buildMode,
		scenarios: mergedScenarios,
	};

	const mergedBaseline = Object.keys(mergedBaselineScenarios).length > 0
		? { baselineBuildVersion, scenarios: mergedBaselineScenarios }
		: null;

	return { report: mergedReport, baseline: mergedBaseline, baselineBuildVersion, threshold: threshold ? parseInt(threshold, 10) / 100 : undefined, metricThresholds };
}

// -- Summary generation (unified, single-header format) ----------------------

const GITHUB_REPO = 'https://github.com/microsoft/vscode';

/** @param {string} label */
function formatBuildLink(label) {
	if (/^[0-9a-f]{7,40}$/.test(label)) {
		return `[\`${label.substring(0, 7)}\`](${GITHUB_REPO}/commit/${label})`;
	}
	if (/^\d+\.\d+\.\d+/.test(label)) {
		return `[\`${label}\`](${GITHUB_REPO}/releases/tag/${label})`;
	}
	return `\`${label}\``;
}

/**
 * @param {string} base
 * @param {string} test
 */
function formatCompareLink(base, test) {
	const isRef = (/** @type {string} */ v) => /^[0-9a-f]{7,40}$/.test(v) || /^\d+\.\d+\.\d+/.test(v);
	if (!isRef(base) || !isRef(test)) { return ''; }
	return `[compare](${GITHUB_REPO}/compare/${base}...${test})`;
}

/**
 * @param {{ type: string, value: number }} threshold
 * @param {number} change
 * @param {number} absoluteDelta
 */
function exceedsThreshold(threshold, change, absoluteDelta) {
	if (threshold.type === 'absolute') { return absoluteDelta > threshold.value; }
	return change > threshold.value;
}

/**
 * @param {{ threshold: number, metricThresholds?: Record<string, number | string> }} opts
 * @param {string} metric
 */
function getMetricThreshold(opts, metric) {
	const raw = opts.metricThresholds?.[metric];
	if (raw !== undefined) {
		const num = typeof raw === 'number' ? raw : parseFloat(/** @type {string} */(raw));
		return typeof raw === 'number' ? { type: 'fraction', value: num } : { type: 'absolute', value: num };
	}
	return { type: 'fraction', value: opts.threshold };
}

/** @param {number} v */
function round2(v) { return Math.round(v * 100) / 100; }

/**
 * Generate a unified Markdown summary for all scenarios.
 *
 * @param {Record<string, any>} jsonReport
 * @param {Record<string, any> | null} baseline
 * @param {{ threshold: number, metricThresholds?: Record<string, number | string>, runs: number, baselineBuild?: string, build?: string, hasLeakFailure?: boolean }} opts
 */
function generateUnifiedSummary(jsonReport, baseline, opts) {
	const baseLabel = opts.baselineBuild || 'baseline';
	const testBuildMode = jsonReport.buildMode || 'dev';
	const testLabel = testBuildMode === 'dev' ? 'dev (local)'
		: testBuildMode === 'production' ? 'production (local)'
			: opts.build || testBuildMode;
	const baseLink = formatBuildLink(baseLabel);
	const testLink = formatBuildLink(testLabel);
	const compareLink = formatCompareLink(baseLabel, testLabel);

	const allMetrics = [
		['timeToFirstToken', 'timing', 'ms'],
		['timeToComplete', 'timing', 'ms'],
		['layoutCount', 'rendering', ''],
		['recalcStyleCount', 'rendering', ''],
		['forcedReflowCount', 'rendering', ''],
		['longTaskCount', 'rendering', ''],
		['longAnimationFrameCount', 'rendering', ''],
		['longAnimationFrameTotalMs', 'rendering', 'ms'],
		['frameCount', 'rendering', ''],
		['compositeLayers', 'rendering', ''],
		['paintCount', 'rendering', ''],
		['heapDelta', 'memory', 'MB'],
		['heapDeltaPostGC', 'memory', 'MB'],
		['gcDurationMs', 'memory', 'ms'],
		['extHostHeapDelta', 'extHost', 'MB'],
		['extHostHeapDeltaPostGC', 'extHost', 'MB'],
	];
	const regressionMetricNames = new Set([
		'timeToFirstToken', 'timeToComplete', 'layoutCount', 'recalcStyleCount',
		'forcedReflowCount', 'longTaskCount', 'longAnimationFrameCount',
	]);

	const lines = [];
	const scenarios = Object.keys(jsonReport.scenarios);

	// -- Collect verdicts ------------------------------------------------
	/** @type {Map<string, { metric: string, verdict: string, change: number, pValue: string, basStr: string, curStr: string }[]>} */
	const scenarioVerdicts = new Map();
	let totalRegressions = 0;
	let totalImprovements = 0;

	for (const scenario of scenarios) {
		const current = jsonReport.scenarios[scenario];
		const base = baseline?.scenarios?.[scenario];
		/** @type {{ metric: string, verdict: string, change: number, pValue: string, basStr: string, curStr: string }[]} */
		const verdicts = [];

		if (base) {
			for (const [metric, group, unit] of allMetrics) {
				const cur = current[group]?.[metric];
				const bas = base[group]?.[metric];
				if (!cur || !bas || bas.median === null || bas.median === undefined) { continue; }

				const change = bas.median !== 0 ? (cur.median - bas.median) / bas.median : 0;
				const isRegressionMetric = regressionMetricNames.has(metric);

				const curRaw = (current.rawRuns || []).map((/** @type {any} */ r) => r[metric]).filter((/** @type {any} */ v) => v >= 0);
				const basRaw = (base.rawRuns || []).map((/** @type {any} */ r) => r[metric]).filter((/** @type {any} */ v) => v >= 0);
				const ttest = welchTTest(basRaw, curRaw);
				const pStr = ttest ? `${ttest.pValue}` : 'n/a';

				const metricThreshold = getMetricThreshold(opts, metric);
				const absoluteDelta = cur.median - bas.median;
				let verdict = '';
				if (isRegressionMetric) {
					if (exceedsThreshold(metricThreshold, change, absoluteDelta)) {
						if (!ttest || ttest.significant) {
							verdict = 'REGRESSION';
							totalRegressions++;
						} else {
							verdict = 'noise';
						}
					} else if (exceedsThreshold(metricThreshold, -change, -absoluteDelta) && ttest?.significant) {
						verdict = 'improved';
						totalImprovements++;
					} else {
						verdict = 'ok';
					}
				} else {
					verdict = 'info';
				}

				const basStr = `${bas.median}${unit} \xb1${bas.stddev}${unit}`;
				const curStr = `${cur.median}${unit} \xb1${cur.stddev}${unit}`;
				verdicts.push({ metric, verdict, change, pValue: pStr, basStr, curStr });
			}
		}
		scenarioVerdicts.set(scenario, verdicts);
	}

	// -- Header ----------------------------------------------------------
	const hasRegressions = totalRegressions > 0;
	const hasLeakFailure = !!opts.hasLeakFailure;
	const hasFailed = hasRegressions || hasLeakFailure;
	const verdictIcon = hasFailed ? '\u274C' : '\u2705';
	const verdictParts = [];
	if (hasRegressions && totalImprovements > 0) {
		verdictParts.push(`${totalRegressions} regression(s), ${totalImprovements} improvement(s)`);
	} else if (hasRegressions) {
		verdictParts.push(`${totalRegressions} regression(s) detected`);
	} else if (totalImprovements > 0) {
		verdictParts.push(`No regressions \u2014 ${totalImprovements} improvement(s)`);
	} else {
		verdictParts.push('No significant changes');
	}
	if (hasLeakFailure) {
		verdictParts.push('memory leak detected');
	}
	const verdictText = verdictParts.join('; ');

	lines.push(`# ${verdictIcon} Chat Performance: ${verdictText}`);
	lines.push('');
	lines.push(`| | |`);
	lines.push(`|---|---|`);
	lines.push(`| **Baseline** | ${baseLink} |`);
	lines.push(`| **Test** | ${testLink} |`);
	if (compareLink) {
		lines.push(`| **Diff** | ${compareLink} |`);
	}
	lines.push(`| **Runs per scenario** | ${opts.runs} |`);
	const overrides = Object.entries(opts.metricThresholds || {}).filter(([, v]) => {
		const parsed = typeof v === 'number' ? { type: 'fraction', value: v } : { type: 'absolute', value: parseFloat(/** @type {string} */(v)) };
		return parsed.type !== 'fraction' || parsed.value !== opts.threshold;
	});
	if (overrides.length > 0) {
		const overrideStr = overrides.map(([k, v]) => {
			if (typeof v === 'number') {
				return `${k}: ${(v * 100).toFixed(0)}%`;
			}
			return `${k}: ${v}`;
		}).join(', ');
		lines.push(`| **Regression threshold** | ${(opts.threshold * 100).toFixed(0)}% (${overrideStr}) |`);
	} else {
		lines.push(`| **Regression threshold** | ${(opts.threshold * 100).toFixed(0)}% |`);
	}
	lines.push(`| **Scenarios** | ${scenarios.length} |`);
	lines.push(`| **Platform** | ${jsonReport.platform || 'linux'} / x64 |`);
	lines.push('');

	// -- Overview table --------------------------------------------------
	lines.push('## Overview');
	lines.push('');
	lines.push('| Scenario | TTFT | Complete | Layouts | Styles | LoAF | Verdict |');
	lines.push('|----------|-----:|---------:|--------:|-------:|-----:|:-------:|');

	for (const scenario of scenarios) {
		const verdicts = scenarioVerdicts.get(scenario) || [];
		const get = (/** @type {string} */ m) => verdicts.find(v => v.metric === m);

		const ttft = get('timeToFirstToken');
		const complete = get('timeToComplete');
		const layouts = get('layoutCount');
		const styles = get('recalcStyleCount');
		const loaf = get('longAnimationFrameCount');

		const fmtCell = (/** @type {{ change: number } | undefined} */ v) => {
			if (!v) { return '\u2014'; }
			return `${v.change > 0 ? '+' : ''}${(v.change * 100).toFixed(0)}%`;
		};

		const keyVerdicts = [ttft, complete, layouts, styles, loaf].filter(Boolean);
		const hasRegression = keyVerdicts.some(v => v?.verdict === 'REGRESSION');
		const hasImproved = keyVerdicts.some(v => v?.verdict === 'improved');
		const rowVerdict = hasRegression ? '\u274C' : hasImproved ? '\u2B06\uFE0F' : '\u2705';

		lines.push(`| ${scenario} | ${fmtCell(ttft)} | ${fmtCell(complete)} | ${fmtCell(layouts)} | ${fmtCell(styles)} | ${fmtCell(loaf)} | ${rowVerdict} |`);
	}
	lines.push('');

	// -- Regressions & improvements (compact table) ----------------------
	const notableRows = [];
	for (const scenario of scenarios) {
		const verdicts = scenarioVerdicts.get(scenario) || [];
		for (const v of verdicts) {
			if (v.verdict === 'REGRESSION' || v.verdict === 'improved') {
				notableRows.push({ scenario, ...v });
			}
		}
	}

	if (notableRows.length > 0) {
		lines.push('## Regressions & Improvements');
		lines.push('');

		lines.push('| Scenario | Metric | Baseline | Test | Change | p-value | |');
		lines.push('|----------|--------|----------|------|-------:|--------:|:-:|');
		for (const r of notableRows) {
			const pct = `${r.change > 0 ? '+' : ''}${(r.change * 100).toFixed(1)}%`;
			const icon = r.verdict === 'REGRESSION' ? '\u274C' : '\u2B06\uFE0F';
			lines.push(`| ${r.scenario} | ${r.metric} | ${r.basStr} | ${r.curStr} | ${pct} | ${r.pValue} | ${icon} |`);
		}
		lines.push('');
	}

	// -- Full details (collapsible) --------------------------------------
	lines.push('<details><summary>Full metric details per scenario</summary>');
	lines.push('');

	for (const scenario of scenarios) {
		const verdicts = scenarioVerdicts.get(scenario) || [];
		const base = baseline?.scenarios?.[scenario];

		lines.push(`### ${scenario}`);
		lines.push('');

		if (!base) {
			const current = jsonReport.scenarios[scenario];
			lines.push('> No baseline data for this scenario.');
			lines.push('');
			lines.push('| Metric | Value | StdDev | CV | n |');
			lines.push('|--------|------:|-------:|---:|--:|');
			for (const [metric, group, unit] of allMetrics) {
				const cur = current[group]?.[metric];
				if (!cur) { continue; }
				lines.push(`| ${metric} | ${cur.median}${unit} | \xb1${cur.stddev}${unit} | ${(cur.cv * 100).toFixed(0)}% | ${cur.n} |`);
			}
			lines.push('');
			continue;
		}

		lines.push('| Metric | Baseline | Test | Change | p-value | Verdict |');
		lines.push('|--------|----------|------|--------|---------|---------|');
		for (const v of verdicts) {
			const pct = `${v.change > 0 ? '+' : ''}${(v.change * 100).toFixed(1)}%`;
			let verdictDisplay = v.verdict;
			if (v.verdict === 'REGRESSION') { verdictDisplay = '\u274C REGRESSION'; }
			else if (v.verdict === 'improved') { verdictDisplay = '\u2B06\uFE0F improved'; }
			else if (v.verdict === 'ok') { verdictDisplay = '\u2705 ok'; }
			else if (v.verdict === 'noise') { verdictDisplay = '\uD83C\uDF2B\uFE0F noise'; }
			else if (v.verdict === 'info') { verdictDisplay = '\u2139\uFE0F'; }
			lines.push(`| ${v.metric} | ${v.basStr} | ${v.curStr} | ${pct} | ${v.pValue} | ${verdictDisplay} |`);
		}
		lines.push('');
	}
	lines.push('</details>');
	lines.push('');

	// -- Raw run data (collapsible) --------------------------------------
	lines.push('<details><summary>Raw run data</summary>');
	lines.push('');
	for (const scenario of scenarios) {
		const current = jsonReport.scenarios[scenario];
		lines.push(`### ${scenario}`);
		lines.push('');
		lines.push('| Run | TTFT (ms) | Complete (ms) | Layouts | Style Recalcs | LoAF Count | LoAF (ms) | Frames | Heap Delta (MB) |');
		lines.push('|----:|----------:|--------------:|--------:|--------------:|-----------:|----------:|-------:|----------------:|');
		const runs = current.rawRuns || [];
		for (let i = 0; i < runs.length; i++) {
			const r = runs[i];
			lines.push(`| ${i + 1} | ${round2(r.timeToFirstToken)} | ${r.timeToComplete} | ${r.layoutCount} | ${r.recalcStyleCount} | ${r.longAnimationFrameCount ?? '-'} | ${round2(r.longAnimationFrameTotalMs ?? 0) || '-'} | ${r.frameCount ?? '-'} | ${r.heapDelta} |`);
		}
		lines.push('');
	}
	if (baseline) {
		for (const scenario of scenarios) {
			const base = baseline.scenarios?.[scenario];
			if (!base) { continue; }
			lines.push(`### ${scenario} (baseline)`);
			lines.push('');
			lines.push('| Run | TTFT (ms) | Complete (ms) | Layouts | Style Recalcs | LoAF Count | LoAF (ms) | Frames | Heap Delta (MB) |');
			lines.push('|----:|----------:|--------------:|--------:|--------------:|-----------:|----------:|-------:|----------------:|');
			const runs = base.rawRuns || [];
			for (let i = 0; i < runs.length; i++) {
				const r = runs[i];
				lines.push(`| ${i + 1} | ${round2(r.timeToFirstToken)} | ${r.timeToComplete} | ${r.layoutCount} | ${r.recalcStyleCount} | ${r.longAnimationFrameCount ?? '-'} | ${round2(r.longAnimationFrameTotalMs ?? 0) || '-'} | ${r.frameCount ?? '-'} | ${r.heapDelta} |`);
			}
			lines.push('');
		}
	}
	lines.push('</details>');
	lines.push('');

	return lines.join('\n');
}

// -- Main --------------------------------------------------------------------

function main() {
	const opts = parseArgs();
	const merged = mergeResults(opts.resultsDir);

	if (!merged) {
		const fallback = '\u26A0\uFE0F No perf results found to merge. Check perf-output.log artifacts.\n';
		fs.writeFileSync(opts.output, fallback);
		console.log('[merge] No results found.');
		process.exit(0);
	}

	const { report, baseline, baselineBuildVersion } = merged;
	const scenarioCount = Object.keys(report.scenarios).length;
	console.log(`[merge] Merged ${scenarioCount} scenarios from ${fs.readdirSync(opts.resultsDir).filter(d => d.startsWith('perf-results-') || d.startsWith('perf-summary-')).length} groups`);
	if (baseline) {
		console.log(`[merge] Baseline: ${baselineBuildVersion || 'unknown'} (${Object.keys(baseline.scenarios).length} scenarios)`);
	}

	// Read leak summary early so we can reflect it in the header verdict
	let leakSummaryContent = '';
	let hasLeakFailure = false;
	if (opts.leakSummary && fs.existsSync(opts.leakSummary)) {
		leakSummaryContent = fs.readFileSync(opts.leakSummary, 'utf-8');
		hasLeakFailure = leakSummaryContent.includes('\u274C');
		console.log(`[merge] Leak summary found (failure: ${hasLeakFailure})`);
	}

	const summary = generateUnifiedSummary(report, baseline, {
		threshold: merged.threshold || opts.threshold,
		metricThresholds: merged.metricThresholds,
		runs: report.runsPerScenario,
		baselineBuild: baselineBuildVersion,
		build: process.env.TEST_COMMIT || undefined,
		hasLeakFailure,
	});

	// Append leak summary if available
	let fullSummary = summary;
	if (leakSummaryContent) {
		fullSummary += '\n' + leakSummaryContent;
	}

	fs.writeFileSync(opts.output, fullSummary);
	console.log(`[merge] Summary written to ${opts.output}`);
}

main();
