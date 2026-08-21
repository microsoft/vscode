/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dropdown, Option, OptionOnSelectData, SelectionEvents } from '@fluentui/react-components';
import * as mobxlite from 'mobx-react-lite';
import * as React from 'react';
import { SimulationRunsProvider } from '../stores/simulationBaseline';
import { useInternalToolbarPickerStyles } from './pickerStyle';

type Props = {
	simulationRunsProvider: SimulationRunsProvider;
};

export const CompareAgainstRunPicker = mobxlite.observer(({ simulationRunsProvider }: Props) => {

	const id = 'compareAgainstRunPicker';
	const styles = useInternalToolbarPickerStyles();

	const pickedRun = simulationRunsProvider.selectedBaselineRunName.value;

	return (
		<div className={styles.root}>
			<label htmlFor={id}>Compare against run</label>
			<Dropdown
				aria-labelledby={id}
				clearable={pickedRun !== ''}
				placeholder='Compare against current run'
				size='small'
				selectedOptions={[pickedRun]}
				value={pickedRun}
				onOptionSelect={(_e: SelectionEvents, { optionValue }: OptionOnSelectData) => simulationRunsProvider.selectedBaselineRunName.value = (optionValue ?? '')}
			>
				{simulationRunsProvider.runs.map((run) => (
					<Option key={run.name} value={run.name}>
						{run.friendlyName}
					</Option>
				))}
			</Dropdown>
		</div>
	);
});
