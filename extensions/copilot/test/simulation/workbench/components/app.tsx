/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Checkbox, FluentProvider, MessageBar, MessageBarBody, MessageBarTitle, Text, ToggleButton, Tooltip, webDarkTheme, webLightTheme } from '@fluentui/react-components';
import { ListBar20Filled, ListBarTree20Filled } from '@fluentui/react-icons';
import * as mobx from 'mobx';
import * as mobxlite from 'mobx-react-lite';
import * as React from 'react';
import { InitArgs } from '../initArgs';
import { AMLProvider } from '../stores/amlSimulations';
import { NesExternalOptions } from '../stores/nesExternalOptions';
import { RunnerOptions } from '../stores/runnerOptions';
import { SimulationRunsProvider } from '../stores/simulationBaseline';
import { SimulationRunner } from '../stores/simulationRunner';
import { SimulationStorage, SimulationStorageValue } from '../stores/simulationStorage';
import { ISimulationTest, SimulationTestsProvider } from '../stores/simulationTestsProvider';
import { useLocalStorageState } from '../stores/storage';
import { TestSource } from '../stores/testSource';
import { ContextMenu, ContextMenuProvider } from './contextMenu';
import { Scorecard } from './scorecard';
import { ScorecardByLanguage } from './scorecardByLanguage';
import { TestFilterer } from './testFilterer';
import { TestList } from './testList';
import { Toolbar } from './toolbar';

type Props = {
	initArgs: InitArgs | undefined;
	testsProvider: SimulationTestsProvider;
	runner: SimulationRunner;
	runnerOptions: RunnerOptions;
	nesExternalOptions: NesExternalOptions;
	simulationRunsProvider: SimulationRunsProvider;
	amlProvider: AMLProvider;
	displayOptions: DisplayOptions;
};

export type ThemeKind = 'light' | 'dark';

export const App = mobxlite.observer(
	({ initArgs, testsProvider, runner, runnerOptions, nesExternalOptions, simulationRunsProvider, amlProvider, displayOptions }: Props) => {

		const [theme, setTheme] = useLocalStorageState<ThemeKind>('appTheme', undefined, 'light');

		const [filterer, setFilterer] = React.useState<TestFilterer | undefined>(undefined);

		const displayedTests = filterer
			? filterer.filter(testsProvider.tests)
			: testsProvider.tests;

		const toggleTheme = React.useCallback(() => setTheme(theme === 'dark' ? 'light' : 'dark'), [theme]);

		return (
			<FluentProvider theme={theme === 'light' ? webLightTheme : webDarkTheme} style={{ minHeight: 'inherit' }}>
				<ContextMenuProvider>
					<div>
						<ContextMenu />
						<Toolbar
							initArgs={initArgs}
							runner={runner}
							runnerOptions={runnerOptions}
							nesExternalOptions={nesExternalOptions}
							simulationRunsProvider={simulationRunsProvider}
							simulationTestsProvider={testsProvider}
							amlProvider={amlProvider}
							testSource={testsProvider.testSource}
							onFiltererChange={setFilterer}
							allLanguageIds={testsProvider.allLanguageIds}
							theme={theme}
							toggleTheme={toggleTheme}
						/>
						{testsProvider.testSource.value === TestSource.External && (
							<Scorecard amlProvider={amlProvider} />
						)}
						{testsProvider.testSource.value === TestSource.External && (
							<ScorecardByLanguage amlProvider={amlProvider} />
						)}
						{(testsProvider.testSource.value === TestSource.Local || testsProvider.testSource.value === TestSource.NesExternal) && <TerminationMessageBar runner={runner} />}
						<div style={{ margin: '5px', display: 'flex', justifyContent: 'space-between' }}>
							<div style={{ textAlign: 'left' }}>
								<TestsInfo tests={testsProvider.tests} displayedTests={displayedTests} />
							</div>
							<div style={{ textAlign: 'right' }}>
								<Checkbox
									label='Expand prompts'
									defaultChecked={displayOptions.expandPrompts.value}
									onChange={mobx.action(() => displayOptions.expandPrompts.value = !displayOptions.expandPrompts.value)}
								/>
								<DisplayToggle displayOptions={displayOptions} />
							</div>
						</div>
						<TestList tests={displayedTests} runner={runner} runnerOptions={runnerOptions} nesExternalOptions={nesExternalOptions} testSource={testsProvider.testSource} displayOptions={displayOptions} />
					</div>
				</ContextMenuProvider>
			</FluentProvider>
		);
	}
);

const TerminationMessageBar = mobxlite.observer(({ runner }: { runner: SimulationRunner }) =>
	runner.terminationReason === undefined
		? null
		: (
			<MessageBar intent='error' layout='singleline'>
				<MessageBarBody>
					<MessageBarTitle>Simulation terminated early</MessageBarTitle>
					<pre>{runner.terminationReason} </pre>
				</MessageBarBody>
			</MessageBar>
		)
);

const DisplayToggle = mobxlite.observer(({ displayOptions }: { displayOptions: DisplayOptions }) => (
	<Tooltip content='Show all tests or by suites' relationship='label'>
		<ToggleButton
			icon={displayOptions.testsKind.value === 'suiteList' ? <ListBarTree20Filled /> : <ListBar20Filled />}
			onClick={mobx.action(() => displayOptions.testsKind.value = displayOptions.testsKind.value === 'suiteList' ? 'testList' : 'suiteList')}
		/>
	</Tooltip>
));

export class DisplayOptions {

	public testsKind: SimulationStorageValue<'suiteList' | 'testList'>;

	public expandPrompts: SimulationStorageValue<boolean>;

	constructor(storage: SimulationStorage) {
		this.testsKind = new SimulationStorageValue(storage, 'displayTestsKind', 'suiteList');
		this.expandPrompts = new SimulationStorageValue(storage, 'expandPrompts', false);
	}
}

type TestsInfoProps = {
	tests: readonly ISimulationTest[];
	displayedTests: readonly ISimulationTest[];
};

const TestsInfo = mobxlite.observer(({ tests, displayedTests }: TestsInfoProps) => {
	// TODO@ulugbekna: don't show "failing" if tests weren't run yet
	return (
		<Text size={400}>
			# of tests: {tests.length} (<span>displayed:</span> {displayedTests.length})
		</Text>
	);
});
