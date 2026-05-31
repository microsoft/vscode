/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Badge, Button, Checkbox, ComboboxOpenChangeData, ComboboxOpenEvents, Dropdown, Input, Option, OptionOnSelectData, Select, SelectionEvents, Text, Tooltip } from '@fluentui/react-components';
import { Play16Regular, Stop16Regular } from '@fluentui/react-icons';
import * as mobx from 'mobx';
import * as mobxlite from 'mobx-react-lite';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InitArgs } from '../initArgs';
import { CacheMode, RunnerOptions } from '../stores/runnerOptions';
import { SimulationRunsProvider } from '../stores/simulationBaseline';
import { SimulationRunner, StateKind } from '../stores/simulationRunner';
import { SimulationTestsProvider } from '../stores/simulationTestsProvider';
import { useLocalStorageState } from '../stores/storage';
import { BaselineJSONPicker } from './baselineJSONPicker';
import { CompareAgainstRunPicker } from './compareAgainstRunPicker';
import { CurrentRunPicker } from './currentRunPicker';
import {
	createAnnotationFilter,
	createBaselineChangedFilter,
	createCacheMissesFilter,
	createFailuresFilter,
	createFilterer,
	createGrepFilter,
	createRanTestsFilter
} from './filterUtils';
import { TestFilterer } from './testFilterer';

/**
 * Interface for filter parameters used in filtering tests
 */
interface FilterParams {
	grep: string;
	showBaselineJSONChangedOnly: boolean;
	showFailedOnly: boolean;
	showWithCacheMissesOnly: boolean;
	showOnlyRanTests: boolean;
	showOnlyTestsWithAnnotations: boolean;
	selectedAnnotations: string[];
}

/**
 * Type for Fluent UI select option event
 */
interface SelectOptionEvent {
	value: string;
}

// Hook for asynchronously applying filters
const useAsyncFilter = (
	filterParams: FilterParams,
	debounceMs: number,
	createFilter: (params: FilterParams) => TestFilterer,
	onFilterChange: (filter: TestFilterer | undefined) => void
) => {
	// Track if component is mounted to prevent state updates after unmount
	const isMounted = useRef(true);
	// Store the latest filter parameters
	const latestFilterParams = useRef(filterParams);
	// Track if a filter operation is in progress
	const isFilteringRef = useRef(false);
	// Track if there's a pending filter operation
	const hasPendingFilterRef = useRef(false);
	// Add a state to indicate filtering is in progress (could be used for UI feedback)
	const [isFiltering, setIsFiltering] = useState(false);

	// Update the latest filter params when they change
	useEffect(() => {
		latestFilterParams.current = filterParams;
	}, [filterParams]);

	// Clean up when component unmounts
	useEffect(() => {
		return () => {
			isMounted.current = false;
		};
	}, []);

	// Function to perform the actual filter creation asynchronously
	const applyFilter = useCallback(() => {
		if (!isMounted.current) { return; }

		// If already filtering, mark as pending and return
		if (isFilteringRef.current) {
			hasPendingFilterRef.current = true;
			return;
		}

		isFilteringRef.current = true;
		setIsFiltering(true);

		// Use setTimeout to move filter creation off the main thread
		setTimeout(() => {
			// Create a local copy of the latest filter params to avoid race conditions
			const params = latestFilterParams.current;

			// Use requestAnimationFrame to schedule filter application for the next frame
			requestAnimationFrame(() => {
				try {
					// Create the filter
					const newFilter = createFilter(params);

					// Schedule the filter change callback for the next frame to prevent UI blocking
					requestAnimationFrame(() => {
						if (isMounted.current) {
							onFilterChange(newFilter);
							isFilteringRef.current = false;
							setIsFiltering(false);

							// If there's a pending filter request, process it
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

						// If there's a pending filter request, process it
						if (hasPendingFilterRef.current) {
							hasPendingFilterRef.current = false;
							applyFilter();
						}
					}
				}
			});
		}, 0); // Use 0ms timeout to defer to the next event loop tick
	}, [createFilter, onFilterChange]);

	// Set up a debounced effect to apply the filter
	useEffect(() => {
		const debounceTimer = setTimeout(applyFilter, debounceMs);
		return () => clearTimeout(debounceTimer);
	}, [filterParams, applyFilter, debounceMs]);

	return { isFiltering };
};

type Props = {
	initArgs: InitArgs | undefined;
	runner: SimulationRunner;
	runnerOptions: RunnerOptions;
	simulationRunsProvider: SimulationRunsProvider;
	simulationTestsProvider: SimulationTestsProvider;
	onFiltererChange: (filter: TestFilterer | undefined) => void;
};

export const LocalModeToolbar = mobxlite.observer(
	({
		initArgs,
		runner,
		runnerOptions,
		simulationRunsProvider,
		simulationTestsProvider,
		onFiltererChange,
	}: Props) => {

		// filtering
		const [showBaselineJSONChangedOnly, setShowBaselineJSONChangedOnly] = useLocalStorageState('baselineJSONChangedOnly', undefined, false);
		const [showFailedOnly, setShowFailedOnly] = useLocalStorageState('showFailedOnly', undefined, false);
		const [showOnlyRanTests, setShowOnlyRanTests] = useLocalStorageState('showOnlyRanTests', undefined, false);
		const [showWithCacheMissesOnly, setShowWithCacheMissesOnly] = React.useState(false);
		const [showOnlyTestsWithAnnotations, setShowOnlyTestsWithAnnotations] = useLocalStorageState('showOnlyTestsWithAnnotations', undefined, false);
		const [selectedAnnotations, setSelectedAnnotations] = useLocalStorageState<string[]>('selectedAnnotations', undefined, []);

		// Create filter parameters object that will be processed asynchronously
		const filterParams = useMemo(() => ({
			grep: runnerOptions.grep.value,
			showBaselineJSONChangedOnly,
			showFailedOnly,
			showWithCacheMissesOnly,
			showOnlyRanTests,
			showOnlyTestsWithAnnotations,
			selectedAnnotations
		}), [
			runnerOptions.grep.value,
			showBaselineJSONChangedOnly,
			showFailedOnly,
			showWithCacheMissesOnly,
			showOnlyRanTests,
			showOnlyTestsWithAnnotations,
			selectedAnnotations
		]);

		// Callback for creating a filter instance - memoized to prevent recreations
		const createFilter = useCallback((params: FilterParams): TestFilterer => {
			const predicates = [];

			// Add active filter predicates
			predicates.push(createGrepFilter(params.grep));

			if (params.showBaselineJSONChangedOnly) {
				predicates.push(createBaselineChangedFilter());
			}

			if (params.showFailedOnly) {
				predicates.push(createFailuresFilter());
			}

			if (params.showWithCacheMissesOnly) {
				predicates.push(createCacheMissesFilter());
			}

			if (params.showOnlyRanTests) {
				predicates.push(createRanTestsFilter());
			}

			if (params.showOnlyTestsWithAnnotations && params.selectedAnnotations.length > 0) {
				predicates.push(createAnnotationFilter(new Set(params.selectedAnnotations)));
			}

			return createFilterer(predicates);
		}, []);

		// Memoize the filter change callback
		const handleFilterChange = useCallback((filter: TestFilterer | undefined) => {
			onFiltererChange(filter);
		}, [onFiltererChange]);

		// Use the async filter hook with a longer debounce time (500ms)
		const { isFiltering } = useAsyncFilter(
			filterParams,
			500, // Increased from 300ms to 500ms
			createFilter,
			handleFilterChange
		);

		const isSimulationRunning = runner.state.kind === StateKind.Running;

		const [knownAnnotations, setKnownAnnotations] = React.useState<string[]>([]);

		// Memoize event handlers to prevent recreations on each render
		const updateKnownAnnotations = useCallback(() => {
			const newAnnotations = new Set<string>(knownAnnotations);
			for (const test of simulationTestsProvider.tests) {
				if (test.runnerStatus) {
					for (const run of test.runnerStatus.runs) {
						for (const annotation of run.annotations) {
							newAnnotations.add(annotation.label);
						}
					}
				}
			}
			setKnownAnnotations([...newAnnotations].sort());
		}, [knownAnnotations, simulationTestsProvider.tests]);

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
					});
				}
			});
		}, [isSimulationRunning, runner, runnerOptions]);

		// Memoize checkbox handlers
		const handleBaselineJSONChangedOnlyChange = useCallback(() => {
			setShowBaselineJSONChangedOnly(!showBaselineJSONChangedOnly);
		}, [showBaselineJSONChangedOnly, setShowBaselineJSONChangedOnly]);

		const handleShowFailedOnlyChange = useCallback(() => {
			setShowFailedOnly(!showFailedOnly);
		}, [showFailedOnly, setShowFailedOnly]);

		const handleShowWithCacheMissesOnlyChange = useCallback(() => {
			setShowWithCacheMissesOnly(!showWithCacheMissesOnly);
		}, [showWithCacheMissesOnly]);

		const handleShowOnlyRanTestsChange = useCallback(() => {
			setShowOnlyRanTests(!showOnlyRanTests);
		}, [showOnlyRanTests, setShowOnlyRanTests]);

		const handleShowOnlyTestsWithAnnotationsChange = useCallback(() => {
			setShowOnlyTestsWithAnnotations(!showOnlyTestsWithAnnotations);
		}, [showOnlyTestsWithAnnotations, setShowOnlyTestsWithAnnotations]);

		const handleOptionSelect = useCallback((_e: SelectionEvents, o: OptionOnSelectData) => {
			setSelectedAnnotations(o.selectedOptions);
			setShowOnlyTestsWithAnnotations(o.selectedOptions.length > 0);
		}, [setSelectedAnnotations, setShowOnlyTestsWithAnnotations]);

		const handleOpenChange = useCallback((_e: ComboboxOpenEvents, o: ComboboxOpenChangeData) => {
			if (o.open) {
				updateKnownAnnotations();
			}
		}, [updateKnownAnnotations]);

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

		const handleUpdateBaselineJSON = useCallback(() => {
			simulationTestsProvider.baselineJSONProvider.updateRootBaselineJSON();
		}, [simulationTestsProvider.baselineJSONProvider]);

		const handleRunFromDiskChange = useCallback((selected: string | undefined) => {
			const name = selected ?? '';
			runner.setSelectedRunFromDisk(name);
		}, [runner]);

		const handleCacheModeChange = useCallback((_e: React.FormEvent<HTMLSelectElement>, option: SelectOptionEvent) => {
			runnerOptions.cacheMode.value = option.value as CacheMode;
		}, [runnerOptions.cacheMode]);

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
						<BaselineJSONPicker testsProvider={simulationTestsProvider} />
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
						<Tooltip relationship='label' content={'Do not send requests to the model endpoint (uses cache but doesn\'t write to it) (useful to make sure prompts are unchanged by observing cache misses)'}>
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
						<Button
							size='small' appearance={isSimulationRunning ? 'secondary' : 'primary'}
							icon={isSimulationRunning ? <Stop16Regular /> : <Play16Regular />}
							iconPosition='before'
							onClick={handleRunStopButtonClick}
							style={{ width: '69px' }}
						>
							{isSimulationRunning ? 'Stop' : 'Run'}
						</Button>
						{
							runner.selectedRun !== '' && runner.state.kind !== StateKind.Running &&
							<Button size='small' onClick={handleUpdateBaselineJSON}> Update baseline.json </Button>
						}
					</div>
				</div>
				<div style={{ height: '8px' }} />
				<div>
					<Tooltip content={'Only modify tests displayed. Tests will be run even if not in list below'} relationship={'label'}>
						<Text>View Filters {isFiltering && '(Filtering...)'}</Text>
					</Tooltip>
					<div style={{ display: 'flex', alignItems: 'center' }}>
						<Checkbox
							className='showBaselineJSONChanged'
							label='Show baseline.json changed only'
							checked={showBaselineJSONChangedOnly}
							onChange={handleBaselineJSONChangedOnlyChange}
						/>
						<Checkbox
							className='showFailedOnly'
							label='Show with failures only'
							checked={showFailedOnly}
							onChange={handleShowFailedOnlyChange}
						/>
						<Checkbox
							label='Show with cache misses only'
							checked={showWithCacheMissesOnly}
							onChange={handleShowWithCacheMissesOnlyChange}
						/>
						<Checkbox
							label='Show ran tests only'
							checked={showOnlyRanTests}
							onChange={handleShowOnlyRanTestsChange}
						/>
						<Checkbox
							label='Show with annotations only:'
							checked={showOnlyTestsWithAnnotations}
							onChange={handleShowOnlyTestsWithAnnotationsChange}
						/>
						<Dropdown
							multiselect
							size='small'
							placeholder='Select annotations'
							defaultValue={selectedAnnotations.length ? selectedAnnotations.join(', ') : undefined}
							defaultSelectedOptions={selectedAnnotations}
							onOptionSelect={handleOptionSelect}
							onOpenChange={handleOpenChange}
						>
							{knownAnnotations.map((option) => (
								<Option key={option} text={option}>
									<Badge key={option} shape='square' appearance='outline' size='small'>{option}</Badge>
								</Option>
							))}
						</Dropdown>
					</div>
				</div>
			</div >
		);
	}
);
