/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Button, Checkbox, Input, Select, Text, Tooltip } from '@fluentui/react-components';
import { Play16Regular, Stop16Regular } from '@fluentui/react-icons';
import * as mobx from 'mobx';
import * as mobxlite from 'mobx-react-lite';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NesExternalOptions } from '../stores/nesExternalOptions';
import { CacheMode, RunnerOptions } from '../stores/runnerOptions';
import { SimulationRunsProvider } from '../stores/simulationBaseline';
import { SimulationRunner, StateKind } from '../stores/simulationRunner';
import { useLocalStorageState } from '../stores/storage';
import { CompareAgainstRunPicker } from './compareAgainstRunPicker';
import { CurrentRunPicker } from './currentRunPicker';
import {
	createCacheMissesFilter,
	createFailuresFilter,
	createFilterer,
	createGrepFilter,
	createRanTestsFilter,
} from './filterUtils';
import { TestFilterer } from './testFilterer';

interface FilterParams {
	grep: string;
	showFailedOnly: boolean;
	showWithCacheMissesOnly: boolean;
	showOnlyRanTests: boolean;
}

/** Adapted from localModeToolbar's useAsyncFilter */
const useAsyncFilter = (
	filterParams: FilterParams,
	debounceMs: number,
	createFilter: (params: FilterParams) => TestFilterer,
	onFilterChange: (filter: TestFilterer | undefined) => void
) => {
	const isMounted = useRef(true);
	const latestFilterParams = useRef(filterParams);
	const isFilteringRef = useRef(false);
	const hasPendingFilterRef = useRef(false);
	const [isFiltering, setIsFiltering] = useState(false);

	useEffect(() => {
		latestFilterParams.current = filterParams;
	}, [filterParams]);

	useEffect(() => {
		return () => { isMounted.current = false; };
	}, []);

	const applyFilter = useCallback(() => {
		if (!isMounted.current) { return; }
		if (isFilteringRef.current) {
			hasPendingFilterRef.current = true;
			return;
		}
		isFilteringRef.current = true;
		setIsFiltering(true);

		setTimeout(() => {
			const params = latestFilterParams.current;
			requestAnimationFrame(() => {
				try {
					const newFilter = createFilter(params);
					requestAnimationFrame(() => {
						if (isMounted.current) {
							onFilterChange(newFilter);
							isFilteringRef.current = false;
							setIsFiltering(false);
							if (hasPendingFilterRef.current) {
								hasPendingFilterRef.current = false;
								applyFilter();
							}
						}
					});
				} catch (error) {
					console.error('Error applying filter:', error);
					if (isMounted.current) {
						isFilteringRef.current = false;
						setIsFiltering(false);
						if (hasPendingFilterRef.current) {
							hasPendingFilterRef.current = false;
							applyFilter();
						}
					}
				}
			});
		}, 0);
	}, [createFilter, onFilterChange]);

	useEffect(() => {
		const debounceTimer = setTimeout(applyFilter, debounceMs);
		return () => clearTimeout(debounceTimer);
	}, [filterParams, applyFilter, debounceMs]);

	return { isFiltering };
};

type SelectOptionEvent = { value: string };

type Props = {
	runner: SimulationRunner;
	runnerOptions: RunnerOptions;
	nesExternalOptions: NesExternalOptions;
	simulationRunsProvider: SimulationRunsProvider;
	onFiltererChange: (filter: TestFilterer | undefined) => void;
};

export const NesExternalModeToolbar = mobxlite.observer(
	({
		runner,
		runnerOptions,
		nesExternalOptions,
		simulationRunsProvider,
		onFiltererChange,
	}: Props) => {

		const [showFailedOnly, setShowFailedOnly] = useLocalStorageState('nesShowFailedOnly', undefined, false);
		const [showOnlyRanTests, setShowOnlyRanTests] = useLocalStorageState('nesShowOnlyRanTests', undefined, false);
		const [showWithCacheMissesOnly, setShowWithCacheMissesOnly] = useState(false);

		const filterParams = useMemo(() => ({
			grep: runnerOptions.grep.value,
			showFailedOnly,
			showWithCacheMissesOnly,
			showOnlyRanTests,
		}), [
			runnerOptions.grep.value,
			showFailedOnly,
			showWithCacheMissesOnly,
			showOnlyRanTests,
		]);

		const createFilter = useCallback((params: FilterParams): TestFilterer => {
			const predicates = [];
			predicates.push(createGrepFilter(params.grep));
			if (params.showFailedOnly) {
				predicates.push(createFailuresFilter());
			}
			if (params.showWithCacheMissesOnly) {
				predicates.push(createCacheMissesFilter());
			}
			if (params.showOnlyRanTests) {
				predicates.push(createRanTestsFilter());
			}
			return createFilterer(predicates);
		}, []);

		const handleFilterChange = useCallback((filter: TestFilterer | undefined) => {
			onFiltererChange(filter);
		}, [onFiltererChange]);

		const { isFiltering } = useAsyncFilter(filterParams, 500, createFilter, handleFilterChange);

		const isSimulationRunning = runner.state.kind === StateKind.Running;

		const handleRunStopButtonClick = useCallback(() => {
			mobx.runInAction(() => {
				if (isSimulationRunning) {
					runner.stopRunning();
				} else {
					runner.startRunning({
						grep: runnerOptions.grep.value,
						cacheMode: runnerOptions.cacheMode.value,
						n: parseInt(runnerOptions.n.value),
						noFetch: runnerOptions.noFetch.value,
						additionalArgs: runnerOptions.additionalArgs.value,
						nesExternalScenariosPath: nesExternalOptions.externalScenariosPath.value,
					});
				}
			});
		}, [isSimulationRunning, runner, runnerOptions, nesExternalOptions]);

		const handleScenariosPathChange = useCallback((e: React.FormEvent<HTMLInputElement>) => {
			mobx.runInAction(() => {
				nesExternalOptions.externalScenariosPath.value = (e.target as HTMLInputElement).value;
			});
		}, [nesExternalOptions]);

		const handleGrepChange = useCallback((e: React.FormEvent<HTMLInputElement>) => {
			mobx.runInAction(() => {
				runnerOptions.grep.value = (e.target as HTMLInputElement).value;
			});
		}, [runnerOptions.grep]);

		const handleNRunsChange = useCallback((e: React.FormEvent<HTMLInputElement>) => {
			runnerOptions.n.value = (e.target as HTMLInputElement).value;
		}, [runnerOptions.n]);

		const handleNoFetchChange = useCallback(() => {
			mobx.runInAction(() => {
				runnerOptions.noFetch.value = !runnerOptions.noFetch.value;
			});
		}, [runnerOptions.noFetch]);

		const handleExtraArgsChange = useCallback((e: React.FormEvent<HTMLInputElement>) => {
			mobx.runInAction(() => {
				runnerOptions.additionalArgs.value = (e.target as HTMLInputElement).value;
			});
		}, [runnerOptions.additionalArgs]);

		const handleRunFromDiskChange = useCallback((selected: string | undefined) => {
			const name = selected ?? '';
			runner.setSelectedRunFromDisk(name);
		}, [runner]);

		const handleCacheModeChange = useCallback((_e: React.FormEvent<HTMLSelectElement>, option: SelectOptionEvent) => {
			runnerOptions.cacheMode.value = option.value as CacheMode;
		}, [runnerOptions.cacheMode]);

		const hasValidScenariosPath = nesExternalOptions.externalScenariosPath.value.length > 0;

		return (
			<div
				className='toolbar'
				style={{
					display: 'flex',
					flexDirection: 'column',
					justifyContent: 'space-between',
				}}
			>
				<div style={{ display: 'flex', justifyContent: 'space-between' }}>
					<div style={{ display: 'flex', alignItems: 'center' }}>
						<CurrentRunPicker
							simulationRunsProvider={simulationRunsProvider}
							disabled={isSimulationRunning}
							onChange={handleRunFromDiskChange}
							outputFolderName={runner.selectedRun}
						/>
						<CompareAgainstRunPicker
							simulationRunsProvider={simulationRunsProvider}
						/>
					</div>
				</div>
				<div style={{ height: '8px' }} />
				<div>
					<div>NES External Scenarios</div>
					<div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
						<Input
							id='nesExternalScenariosPath'
							size='small'
							placeholder='Path to external scenarios, e.g., ../eval/simulation/nes'
							title='Path to directory containing NES external scenario recordings'
							value={nesExternalOptions.externalScenariosPath.value}
							onChange={handleScenariosPathChange}
							style={{ width: '400px', maxWidth: '30vw' }}
						/>
					</div>
				</div>
				<div style={{ height: '8px' }} />
				<div>
					<div>Configure new run</div>
					<div style={{ display: 'flex', gap: '10px' }}>
						<Input
							id='grep'
							size='small'
							placeholder='grep'
							title='Filter by test name'
							value={runnerOptions.grep.value}
							onChange={handleGrepChange}
							style={{ width: '300px', maxWidth: '25vw' }}
						/>
						<Input
							id='nRuns'
							size='small'
							style={{ width: '40px' }}
							placeholder='N'
							title='Specify number of runs per each test'
							value={runnerOptions.n.value}
							onChange={handleNRunsChange}
						/>
						<Select onChange={handleCacheModeChange} defaultValue={runnerOptions.cacheMode.value}>
							<option value={CacheMode.Default} title='Use cache if available'>Use Cache</option>
							<option value={CacheMode.Disable} title='Do not use cache'>No Cache</option>
							<option value={CacheMode.Require} title='Use cache, fail if not available'>Require Cache</option>
						</Select>
						<Tooltip relationship='label' content={'Do not send requests to the model endpoint (uses cache but doesn\'t write to it)'}>
							<Checkbox
								label='No fetch'
								defaultChecked={runnerOptions.noFetch.value}
								onChange={handleNoFetchChange}
							/>
						</Tooltip>
						<Input
							id='extraArgs'
							size='small'
							style={{ width: '300px' }}
							placeholder='Extra args, e.g., --parallelism=10 --require-cache'
							value={runnerOptions.additionalArgs.value}
							onInput={handleExtraArgsChange}
						/>
						<Tooltip relationship='label' content={!hasValidScenariosPath ? 'Set the external scenarios path first' : ''}>
							<Button
								size='small' appearance={isSimulationRunning ? 'secondary' : 'primary'}
								icon={isSimulationRunning ? <Stop16Regular /> : <Play16Regular />}
								iconPosition='before'
								onClick={handleRunStopButtonClick}
								disabled={!hasValidScenariosPath && !isSimulationRunning}
								style={{ width: '69px' }}
							>
								{isSimulationRunning ? 'Stop' : 'Run'}
							</Button>
						</Tooltip>
					</div>
				</div>
				<div style={{ height: '8px' }} />
				<div>
					<Tooltip content={'Only modify tests displayed. Tests will be run even if not in list below'} relationship={'label'}>
						<Text>View Filters {isFiltering && '(Filtering...)'}</Text>
					</Tooltip>
					<div style={{ display: 'flex', alignItems: 'center' }}>
						<Checkbox
							className='showFailedOnly'
							label='Show with failures only'
							checked={showFailedOnly}
							onChange={() => setShowFailedOnly(!showFailedOnly)}
						/>
						<Checkbox
							label='Show with cache misses only'
							checked={showWithCacheMissesOnly}
							onChange={() => setShowWithCacheMissesOnly(!showWithCacheMissesOnly)}
						/>
						<Checkbox
							label='Show ran tests only'
							checked={showOnlyRanTests}
							onChange={() => setShowOnlyRanTests(!showOnlyRanTests)}
						/>
					</div>
				</div>
			</div>
		);
	}
);
