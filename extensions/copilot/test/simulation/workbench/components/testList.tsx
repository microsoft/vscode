/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Tree, TreeItem, TreeItemLayout } from '@fluentui/react-components';
import * as mobx from 'mobx';
import * as mobxlite from 'mobx-react-lite';
import * as React from 'react';
import { NesExternalOptions } from '../stores/nesExternalOptions';
import { RunnerOptions } from '../stores/runnerOptions';
import { SimulationRunner, StateKind } from '../stores/simulationRunner';
import { ISimulationTest } from '../stores/simulationTestsProvider';
import { TestSource, TestSourceValue } from '../stores/testSource';
import { DisplayOptions } from './app';
import { useContextMenu } from './contextMenu';
import { TestView } from './testView';

type Props = {
	readonly tests: readonly ISimulationTest[];
	readonly runner: SimulationRunner;
	readonly runnerOptions: RunnerOptions;
	readonly nesExternalOptions: NesExternalOptions;
	readonly testSource: TestSourceValue;
	readonly displayOptions: DisplayOptions;
};

export const TestList = mobxlite.observer(({ tests, runner, runnerOptions, nesExternalOptions, testSource, displayOptions }: Props) => {

	const { showMenu } = useContextMenu();

	switch (displayOptions.testsKind.value) {
		case 'testList': {
			return (
				<Tree aria-label='Default' style={{ rowGap: '0px', paddingBottom: '30px' }}>
					{tests.map(test => <TestView key={test.name} test={test} runner={runner} runnerOptions={runnerOptions} nesExternalOptions={nesExternalOptions} testSource={testSource} displayOptions={displayOptions} />)}
				</Tree>
			);
		}
		case 'suiteList': {

			// establish {suiteName -> [tests]} map
			const suites = new Map</* suite name */ string, ISimulationTest[]>();
			for (const test of tests) {
				const suiteName = test.suiteName;
				const suiteTests = suites.get(suiteName) ?? [];
				suiteTests.push(test);
				suites.set(suiteName, suiteTests);
			}

			const suiteNameContextMenuEntries = (suiteName: string) => [
				{
					label: `Run suite`,
					onClick: () => runner.startRunning({
						grep: `!s:${suiteName}`,
						cacheMode: runnerOptions.cacheMode.value,
						n: parseInt(runnerOptions.n.value),
						noFetch: runnerOptions.noFetch.value,
						additionalArgs: runnerOptions.additionalArgs.value,
						nesExternalScenariosPath: testSource.value === TestSource.NesExternal ? nesExternalOptions.externalScenariosPath.value || undefined : undefined,
					}),
				},
				{
					label: `Run suite (grep update)`,
					onClick: () => {
						mobx.runInAction(() => runnerOptions.grep.value = `!s:${suiteName}`);
						runner.startRunning({
							grep: `!s:${suiteName}`,
							cacheMode: runnerOptions.cacheMode.value,
							n: parseInt(runnerOptions.n.value),
							noFetch: runnerOptions.noFetch.value,
							additionalArgs: runnerOptions.additionalArgs.value,
							nesExternalScenariosPath: testSource.value === TestSource.NesExternal ? nesExternalOptions.externalScenariosPath.value || undefined : undefined,
						});
					},
				}
			];

			return (
				<>
					<Tree aria-label='Default' style={{ rowGap: '0px', paddingBottom: '30px' }}>
						{[...suites.entries()].map(([suiteName, tests]) => {

							const nTestInSuite = tests.reduce((acc, test) => test.runnerStatus?.isSkipped ? acc : acc + 1, 0);

							const nTestsRunCompleted = tests.reduce((acc, test) => {
								return (test.runnerStatus === undefined || test.runnerStatus.expectedRuns > test.runnerStatus.runs.length) ? acc : acc + 1;
							}, 0);

							return <TreeItem key={suiteName} itemType='branch' className='test-runs-container'>
								<TreeItemLayout onAuxClick={(e) => showMenu(e, suiteNameContextMenuEntries(suiteName))}>
									<CompletedTestCount runner={runner} nTestsRunCompleted={nTestsRunCompleted} nTestInSuite={nTestInSuite} />
									{suiteName}
								</TreeItemLayout>
								<Tree aria-label='Default'>
									{tests.map(test => <TestView key={test.name} test={test} runner={runner} runnerOptions={runnerOptions} nesExternalOptions={nesExternalOptions} testSource={testSource} displayOptions={displayOptions} />)}
								</Tree>
							</TreeItem>;
						})}
					</Tree>
				</>
			);
		}
	}
});

const CompletedTestCount = mobxlite.observer(({ runner, nTestsRunCompleted, nTestInSuite }: { runner: SimulationRunner; nTestsRunCompleted: number; nTestInSuite: number }) => {
	const digits = 3;
	return <span style={{ whiteSpace: 'pre', fontFamily: 'monospace' }}>{runner.state.kind === StateKind.Running || runner.state.kind === StateKind.Stopped ? `${nTestsRunCompleted.toString().padStart(digits, ' ')} / ${nTestInSuite.toString().padStart(digits, ' ')} | ` : ''}</span>;
});
