/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Badge, BadgeProps, CounterBadge, Text, Tooltip, Tree, TreeItem, TreeItemLayout } from '@fluentui/react-components';
import { ArrowRight16Regular, Checkmark20Filled, DatabaseWarning20Regular, Dismiss20Filled, FluentIconsProps } from '@fluentui/react-icons';
import * as mobx from 'mobx';
import * as mobxlite from 'mobx-react-lite';
import * as React from 'react';
import { OutputAnnotation } from '../../shared/sharedTypes';
import { NesExternalOptions } from '../stores/nesExternalOptions';
import { RunnerOptions } from '../stores/runnerOptions';
import { RunnerTestStatus } from '../stores/runnerTestStatus';
import { SimulationRunner, StateKind } from '../stores/simulationRunner';
import { ISimulationTest } from '../stores/simulationTestsProvider';
import { TestRun } from '../stores/testRun';
import { TestSource, TestSourceValue } from '../stores/testSource';
import { DisplayOptions } from './app';
import { useContextMenu } from './contextMenu';
import { OpenInVSCodeButton } from './openInVSCode';
import { TestRunView } from './testRun';

type Props = {
	readonly test: ISimulationTest;
	readonly runner: SimulationRunner;
	readonly runnerOptions: RunnerOptions;
	readonly nesExternalOptions: NesExternalOptions;
	readonly testSource: TestSourceValue;
	readonly displayOptions: DisplayOptions;
};

export const TestView = mobxlite.observer(({ test, runner, runnerOptions, nesExternalOptions, testSource, displayOptions }: Props) => {

	// Set the default open status for test runs. If there is is only one test run, the open status is `true`.
	// Otherwise, they are `false`.
	const [isTestRunOpen, setIsTestRunOpen] = React.useState(new Array(test.runnerStatus?.runs.length).fill(test.runnerStatus?.runs.length === 1 ? true : false));
	const [highlightedIndices, setHighlightedIndices] = React.useState<boolean[]>(new Array(test.runnerStatus?.runs.length).fill(false));

	const { showMenu } = useContextMenu();

	// Add a ref to store the test item elements
	const testItemRefs = React.useRef<HTMLDivElement[]>([]);

	const updateNth = (n: number, value: boolean) => {
		const copy = Array.from(isTestRunOpen);
		copy[n] = value;
		setIsTestRunOpen(copy);
	};

	const closeTestRunView = (idx: number) => {
		updateNth(idx, false);
		const copy = Array.from(highlightedIndices);
		copy[idx] = true;
		setHighlightedIndices(copy);
	};

	React.useEffect(() => {
		const timeoutId = highlightedIndices.includes(true)
			? setTimeout(() => {
				setHighlightedIndices(new Array(test.runnerStatus?.runs.length).fill(false));
			}, 1000)
			: undefined;

		return () => timeoutId && clearTimeout(timeoutId);
	}, [highlightedIndices, test.runnerStatus?.runs.length]);

	const testNameContextMenuEntries = (testName: string) => [
		{
			label: `Run test`,
			onClick: () => runner.startRunning({
				grep: `${testName}`,
				cacheMode: runnerOptions.cacheMode.value,
				n: parseInt(runnerOptions.n.value),
				noFetch: runnerOptions.noFetch.value,
				additionalArgs: runnerOptions.additionalArgs.value,
				nesExternalScenariosPath: testSource.value === TestSource.NesExternal ? nesExternalOptions.externalScenariosPath.value || undefined : undefined,
			}),
		},
		{
			label: `Run test (grep update)`,
			onClick: () => {
				mobx.runInAction(() => runnerOptions.grep.value = testName);
				runner.startRunning({
					grep: testName,
					cacheMode: runnerOptions.cacheMode.value,
					n: parseInt(runnerOptions.n.value),
					noFetch: runnerOptions.noFetch.value,
					additionalArgs: runnerOptions.additionalArgs.value,
					nesExternalScenariosPath: testSource.value === TestSource.NesExternal ? nesExternalOptions.externalScenariosPath.value || undefined : undefined,
				});
			},
		},
		{
			label: `Run test once`,
			onClick: () => runner.startRunning({
				grep: `${testName}`,
				cacheMode: runnerOptions.cacheMode.value,
				n: 1,
				noFetch: runnerOptions.noFetch.value,
				additionalArgs: runnerOptions.additionalArgs.value,
				nesExternalScenariosPath: testSource.value === TestSource.NesExternal ? nesExternalOptions.externalScenariosPath.value || undefined : undefined,
			}),
		},
		{
			label: 'Copy full test name',
			onClick: () => navigator.clipboard.writeText(testName),
		}
	];

	return (
		<TreeItem itemType={'branch'} className='test-runs-container'>
			<TreeItemLayout className='test-renderer'
				iconBefore={<StatusIcon runner={runner} runnerOptions={runnerOptions} nesExternalOptions={nesExternalOptions} testSource={testSource} test={test} />}
				iconAfter={test.runnerStatus && <RunsSummaryBadge runs={test.runnerStatus.runs} />}
				onAuxClick={(e) => showMenu(e, testNameContextMenuEntries(test.name))}
			>
				<Score test={test} />
				{displayOptions.testsKind.value === 'suiteList' ? null : <Text weight='semibold'>{test.suiteName}</Text>}
				<Text>{test.suiteName ? test.name.replace(test.suiteName, '') : test.name}</Text>
				<InlineTestError runnerStatus={test.runnerStatus} />
			</TreeItemLayout>
			<Tree>
				{
					test.runnerStatus === undefined
						? (
							<TreeItem itemType='leaf'>
								<TreeItemLayout> Test doesn't have run info. Have you run the test? </TreeItemLayout>
							</TreeItem>
						)
						: <>
							{test.activeEditorLangId &&
								<TreeItem itemType='leaf'>
									<TreeItemLayout>
										Language: {test.activeEditorLangId}
									</TreeItemLayout>
								</TreeItem>
							}
							{test.runnerStatus.runs.map(
								(run, idx) => {
									const key = `${test.name}-${idx}`;
									const baseline = test.baseline?.runs[idx];
									return (
										// Wrap each TreeItem in a div and assign a ref
										<div key={key} ref={el => testItemRefs.current[idx] = el!}>
											<TreeItem
												itemType='branch'
												open={isTestRunOpen[idx]}
												onOpenChange={() => updateNth(idx, !isTestRunOpen[idx])}
											>
												<TreeItemLayout
													className={highlightedIndices[idx] ? 'fade-out-background' : undefined}
													iconBefore={run.explicitScore === undefined ? undefined : <Badge title='Test Run Score (range [0, 1])' color='informative' size='small'>{run.explicitScore}</Badge>}
													iconAfter={<RunSummaryBadge run={run} baseline={baseline} />}
												>
													Test Run # {idx + 1}
												</TreeItemLayout>
												<Tree>
													<TreeItem itemType='leaf'>
														<OpenInVSCodeButton test={test} />
														<TestRunView
															key={key}
															test={test}
															run={run}
															baseline={baseline}
															displayOptions={displayOptions}
															closeTestRunView={() => closeTestRunView(idx)}
														/>
													</TreeItem>
												</Tree>
											</TreeItem>
										</div>
									);
								}
							)}
						</>
				}
			</Tree>
		</TreeItem >
	);
});

const redIconStyleProps: FluentIconsProps = {
	primaryFill: 'red',
};

const greenIconStyleProps: FluentIconsProps = {
	primaryFill: 'green',
};

const RunSummaryBadge = ({ run, baseline }: { run: TestRun; baseline: TestRun | undefined }) => (
	<>
		<RunAndBaselineOutcomeBadge run={run} baseline={baseline} /> {/* show a "X" icon if run validation function failed */}
		<CacheMisses cacheMissCount={run.hasCacheMiss ? 1 : 0} /> {/* shows a "cache miss" icon if a cache miss happens */}
		<TotalDuration title='Total request run duration' timeInMs={run.averageRequestDuration && run.requestCount ? run.averageRequestDuration * run.requestCount : undefined} />
		<AnnotationBadges annotations={run.annotations} />
	</>
);

const RunOutcomeBadge = ({ testRun }: { testRun: TestRun }) => {

	let tooltipContent: string | undefined;

	if (testRun.pass) {
		tooltipContent = 'Test passed';
	} else {
		const errorFirstLine = testRun.error?.split('\n')[0];
		tooltipContent = (errorFirstLine ?? testRun.error) ?? 'Error info missing';
	}

	return (
		<Tooltip content={tooltipContent} relationship={'description'}>
			{testRun.pass ? <Checkmark20Filled {...greenIconStyleProps} /> : <Dismiss20Filled {...redIconStyleProps} />}
		</Tooltip>
	);
};

const RunAndBaselineOutcomeBadge = ({ run, baseline }: { run: TestRun; baseline: TestRun | undefined }) => {
	if (baseline === undefined) {
		if (run.pass) {
			return null; // if test is passing, we don't need to show anything
		} else {
			return <RunOutcomeBadge testRun={run} />; // if there is no baseline, show just failure
		}
	} else {
		if (baseline.pass === run.pass) {
			if (run.pass) {
				return null;
			} else {
				return <RunOutcomeBadge testRun={run} />;
			}
		} else {
			return (
				<>
					<RunOutcomeBadge testRun={baseline} />
					<Tooltip content={'Left - outcome of "Compare against" run | Right - outcome of "Current run"'} relationship={'description'}>
						<ArrowRight16Regular />
					</Tooltip>
					<RunOutcomeBadge testRun={run} />
				</>
			);
		}
	}
};

const RunsSummaryBadge = ({ runs }: { runs: TestRun[] }) => {
	let failingRunsCount = 0, cacheMissCount = 0, totalDurations = 0;
	const infos: OutputAnnotation[] = [];
	for (const run of runs) {
		if (!run.pass) {
			failingRunsCount++;
		}
		if (run.hasCacheMiss) {
			cacheMissCount++;
		}
		if (run.averageRequestDuration !== undefined && run.requestCount !== undefined) {
			const totalDuration = run.averageRequestDuration * run.requestCount;
			totalDurations += totalDuration;
		}
		if (run.annotations) {
			infos.push(...run.annotations);
		}
	}

	return <>
		{failingRunsCount ? <Dismiss20Filled {...redIconStyleProps} /> : null}
		{failingRunsCount ? <CounterBadge count={failingRunsCount} color='danger' size='small' /> : null}
		<CacheMisses cacheMissCount={cacheMissCount} />
		{runs.length ? <TotalDuration title='Average request duration' timeInMs={totalDurations / runs.length} /> : null}
		<AnnotationBadges annotations={infos} />
	</>;
};

const AnnotationBadges = ({ annotations }: { annotations: OutputAnnotation[] }) => {
	if (annotations.length) {
		const colors: Record<string, BadgeProps['color']> = {
			'error': 'severe',
			'warning': 'warning',
			'info': 'informative',
		};
		const annotationCounts = new Set<string>();
		const badges: JSX.Element[] = [];
		for (const info of annotations) {
			if (!annotationCounts.has(info.label)) {
				annotationCounts.add(info.label);
				badges.push(<Badge key={info.label} title={info.message} color={colors[info.severity] ?? 'informative'} shape='square' appearance='outline' size='small'>{info.label}</Badge>);
			}
		}
		return <>{badges}</>;
	}
	return null;
};

const CacheMisses = ({ cacheMissCount }: { cacheMissCount: number }) => {
	if (cacheMissCount > 0) {
		return <DatabaseWarning20Regular primaryFill={'orange'} title={`${cacheMissCount} cache misses`} />;
	}
	return null;
};

const TotalDuration = ({ timeInMs: timeInMillis, title }: { timeInMs: number | undefined; title: string }) => {
	if (timeInMillis !== undefined) {
		return <Badge title={title} color='informative' size='small'>{+((timeInMillis / 1000).toFixed(2))}s</Badge>;
	}
	return null;
};

const Score = mobxlite.observer(({ test }: { test: ISimulationTest }) => {
	// Shows the score number and its comparison against the baseline. The baseline is defined as followed
	// if test.baselineJSON is defined, it's used as the baseline.
	// If test.baselineJSON is not defined and test.baseline is defined, test.baseline is used as the baseline.
	// If neight test.baselineJSON nor test.baseline is defined, then there is no comaprison.

	if (test.runnerStatus === undefined || test.runnerStatus.isSkipped) {
		return null;
	}

	if (test.runnerStatus.runs.length < test.runnerStatus.expectedRuns) {
		return (
			<div className='test-score' title='# of runs completed (regardless of result) / # of total runs'>
				{test.runnerStatus.runs.length} / {test.runnerStatus.expectedRuns}
			</div>
		);
	}

	const runs = test.runnerStatus.runs;

	let explicitScoreRendering = '';
	let explicitScoreColor: string | undefined = undefined;
	let explicitScoreTitle = 'Score set by test itself on some rubric';

	if (runs.length > 0 && runs[0].explicitScore !== undefined) {

		const testRunsScore = runs.reduce((acc, run) => (acc + (run.explicitScore ?? 0)), 0) / runs.length;
		const scoreToString = (passes: number) => `${String(passes.toFixed(2)).padStart(2, ' ')}`;

		const testRunsScoreAsString = scoreToString(testRunsScore);

		if (test.baselineJSON === undefined) {
			explicitScoreRendering = testRunsScoreAsString;
		} else {

			const baselineJsonScoreAsString = scoreToString(test.baselineJSON.score);

			explicitScoreColor =
				testRunsScoreAsString === baselineJsonScoreAsString
					? 'gray'
					: (parseFloat(testRunsScoreAsString) > parseFloat(baselineJsonScoreAsString) ? 'green' : 'red');

			if (testRunsScoreAsString === baselineJsonScoreAsString) {
				explicitScoreRendering = `= ${scoreToString(testRunsScore)}`;
			} else {
				explicitScoreTitle += '(left - baseline | right - current)';
				explicitScoreRendering = `${baselineJsonScoreAsString} -> ${testRunsScoreAsString}`;
			}
		}
	}

	const passCount = runs.filter(r => r.pass).length;
	const hasBaseline = test.baselineJSON || test.baseline;

	if (!hasBaseline) {
		const title = `${passCount} runs passing`;
		const scoreToString = (passes: number) => `${String(passes.toFixed(0)).padStart(3, ' ')}`;
		return (
			<div className='test-score' title={title}>
				{scoreToString(passCount)} ({explicitScoreRendering})
			</div>
		);
	}

	const passPercentage = passCount / runs.length;

	// When it runs to this line, either test.baselineJSON or test.baseline is defined. We'll use test.baselineJSON as the baseline first.
	// If they both are not defined, we've already returned without comparison at line 328.

	const baselinePassCount = test.baselineJSON
		? test.baselineJSON.passCount
		: (test.baseline ? test.baseline.runs.filter(r => r.pass).length : 0);

	const baselineTotal = test.baselineJSON
		? test.baselineJSON.passCount + test.baselineJSON.failCount
		: (test.baseline ? test.baseline.runs.length : 0);

	const baselinePercentage = baselinePassCount / baselineTotal;

	const color =
		passPercentage === baselinePercentage
			? 'gray'
			: (passPercentage > baselinePercentage ? 'green' : 'red');

	const scoreToString = (passes: number) => `${String(passes).padStart(2, ' ')}`;

	const title = [
		`Runs: ${runs.length}`,
		`Passing: ${passCount}`,
		`Expected: ${runs.length * baselinePercentage} (Baseline: ${baselinePassCount} / ${baselineTotal})`,
		`'=' sign means current score equals baseline score.`,
	].join('\n');

	const renderedScore =
		passPercentage === baselinePercentage
			? `= ${scoreToString(passCount)}`
			: `${scoreToString(runs.length * baselinePercentage)} -> ${scoreToString(passCount)}`;

	return (
		<>
			<span className='test-score' style={{ color }} title={title}>
				{`${renderedScore} | `}
			</span>
			{explicitScoreRendering === ''
				? null
				: <span className='test-score' style={{ color: explicitScoreColor }} title={explicitScoreTitle}>
					{`${explicitScoreRendering} | `}
				</span>}
		</>
	);
});

const StatusIcon = mobxlite.observer(({ runner, runnerOptions, nesExternalOptions, testSource, test }: { runner: SimulationRunner; runnerOptions: RunnerOptions; nesExternalOptions: NesExternalOptions; testSource: TestSourceValue; test: ISimulationTest }) => {
	const runTest = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (runner.state.kind !== StateKind.Running) {
			runner.startRunning({
				grep: test.name,
				cacheMode: runnerOptions.cacheMode.value,
				n: parseInt(runnerOptions.n.value),
				noFetch: runnerOptions.noFetch.value,
				additionalArgs: runnerOptions.additionalArgs.value,
				nesExternalScenariosPath: testSource.value === TestSource.NesExternal ? nesExternalOptions.externalScenariosPath.value || undefined : undefined,
			});
		}
	};

	const runnerStatus = test.runnerStatus;

	if (runnerStatus) {
		if (runnerStatus.isSkipped) {
			return <span title='Test is skipped'>⏭️</span>;
		} else if (runnerStatus.isCancelled && runner.terminationReason) {
			return <span title='Simulation terminated early due to an error, click to run again.' onClick={runTest}>❌</span>;
		} else if (runnerStatus.isCancelled) {
			return <span title='Test is cancelled, click to run again.' onClick={runTest}>⭕️</span>;
		} else if (runnerStatus.isNowRunning > 0) {
			return <span title='Test is currently running'>🏃</span>;
		} else if (runnerStatus.runs.length < runnerStatus.expectedRuns) {
			return <span title='Test is queued to be run'>⏳</span>;
		} else {
			const failCount = runnerStatus.runs.filter(r => !r.pass).length;
			if (failCount === runnerStatus.runs.length) {
				return <span title='All runs failed, click to run again.' onClick={runTest}>❌</span>;
			} else if (failCount > 0) {
				return <span title={`${failCount} of ${runnerStatus.runs.length} runs failed, click to run again.`} onClick={runTest}>⚠️</span>;
			}
			return <span title='Test is complete, click to run again.' onClick={runTest}>🏁</span>;
		}
	}
	return <span title='Test has not been run, click to run.' onClick={runTest}>🔘</span>;
});

const InlineTestError = mobxlite.observer(({ runnerStatus }: { runnerStatus: RunnerTestStatus | undefined }) => {
	if (!runnerStatus) {
		return null;
	}
	const failedRuns = runnerStatus.runs.filter(r => !r.pass && r.error);
	if (failedRuns.length === 0) {
		return null;
	}
	const firstError = failedRuns[0].error!;
	const firstLine = firstError.split(/\r?\n/)[0];
	const label = failedRuns.length > 1
		? `${firstLine} (+${failedRuns.length - 1} more)`
		: firstLine;
	return (
		<Tooltip content={firstError} relationship='description'>
			<Text style={{ color: 'var(--colorPaletteRedForeground1)', marginLeft: '8px', fontSize: '12px' }}>{label}</Text>
		</Tooltip>
	);
});

