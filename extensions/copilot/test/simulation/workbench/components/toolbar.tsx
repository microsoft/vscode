/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Select, ToggleButton, Tooltip } from '@fluentui/react-components';
import { WeatherMoon20Regular, WeatherSunny20Regular } from '@fluentui/react-icons';
import * as mobx from 'mobx';
import * as mobxlite from 'mobx-react-lite';
import * as React from 'react';
import { InitArgs } from '../initArgs';
import { AMLProvider } from '../stores/amlSimulations';
import { NesExternalOptions } from '../stores/nesExternalOptions';
import { RunnerOptions } from '../stores/runnerOptions';
import { SimulationRunsProvider } from '../stores/simulationBaseline';
import { SimulationRunner } from '../stores/simulationRunner';
import { SimulationTestsProvider } from '../stores/simulationTestsProvider';
import { TestSource, TestSourceValue } from '../stores/testSource';
import { AMLModeToolbar } from './amlModeToolbar';
import { ThemeKind } from './app';
import { LocalModeToolbar } from './localModeToolbar';
import { NesExternalModeToolbar } from './nesExternalModeToolbar';
import { TestFilterer } from './testFilterer';

type ToolbarProps = {
	initArgs: InitArgs | undefined;
	runner: SimulationRunner;
	runnerOptions: RunnerOptions;
	nesExternalOptions: NesExternalOptions;
	amlProvider: AMLProvider;
	simulationRunsProvider: SimulationRunsProvider;
	simulationTestsProvider: SimulationTestsProvider;
	testSource: TestSourceValue;
	onFiltererChange: (filter: TestFilterer | undefined) => void;
	allLanguageIds: readonly string[];
	theme: ThemeKind;
	toggleTheme: () => void;
};

export const Toolbar = mobxlite.observer(
	({
		initArgs,
		runner,
		runnerOptions,
		nesExternalOptions,
		amlProvider,
		simulationRunsProvider,
		simulationTestsProvider,
		testSource,
		onFiltererChange,
		allLanguageIds,
		theme,
		toggleTheme,
	}: ToolbarProps) => {

		const toolbarContent = (() => {
			switch (testSource.value) {
				case TestSource.Local:
					return (
						<LocalModeToolbar
							initArgs={initArgs}
							runner={runner}
							runnerOptions={runnerOptions}
							simulationRunsProvider={simulationRunsProvider}
							simulationTestsProvider={simulationTestsProvider}
							onFiltererChange={onFiltererChange}
						/>
					);
				case TestSource.NesExternal:
					return (
						<NesExternalModeToolbar
							runner={runner}
							runnerOptions={runnerOptions}
							nesExternalOptions={nesExternalOptions}
							simulationRunsProvider={simulationRunsProvider}
							onFiltererChange={onFiltererChange}
						/>
					);
				case TestSource.External:
					return (
						<AMLModeToolbar
							amlProvider={amlProvider}
							simulationTestsProvider={simulationTestsProvider}
							onFiltererChange={onFiltererChange}
							allLanguageIds={allLanguageIds}
						/>
					);
			}
		})();

		return (
			<div style={{ padding: '5px', display: 'flex' }}>
				{toolbarContent}
				<div style={{ display: 'flex', justifyContent: 'end', maxHeight: '35px' }}>
					<ThemeToggler theme={theme} toggleTheme={toggleTheme} />
					<ModeToggler testSource={testSource} onFiltererChange={onFiltererChange} />
				</div>
			</div>
		);
	}
);

const ThemeToggler = ({ theme, toggleTheme }: { theme: ThemeKind; toggleTheme: () => void }) => (
	<Tooltip content='Toggle workbench theme' relationship='label'>
		<ToggleButton
			appearance='subtle'
			icon={theme === 'dark' ? <WeatherSunny20Regular /> : <WeatherMoon20Regular />}
			onClick={toggleTheme}
		/>
	</Tooltip>
);

const testSourceOptions: { value: string; label: string; source: TestSource }[] = [
	{ value: String(TestSource.Local), label: 'Local', source: TestSource.Local },
	{ value: String(TestSource.NesExternal), label: 'NES External', source: TestSource.NesExternal },
	{ value: String(TestSource.External), label: 'AML', source: TestSource.External },
];

const ModeToggler = ({ testSource, onFiltererChange }: { testSource: TestSourceValue; onFiltererChange: (filter: TestFilterer | undefined) => void }) => (
	<Select
		style={{ marginLeft: '8px', minWidth: '140px' }}
		value={String(testSource.value)}
		onChange={mobx.action((_e, data) => {
			const selected = testSourceOptions.find(o => o.value === data.value);
			if (selected) {
				testSource.value = selected.source;
				onFiltererChange(undefined);
			}
		})}
	>
		{testSourceOptions.map(o => (
			<option key={o.value} value={o.value}>{o.label}</option>
		))}
	</Select>
);
