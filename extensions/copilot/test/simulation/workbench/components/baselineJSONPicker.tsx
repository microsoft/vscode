/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Dropdown, Option, OptionOnSelectData, SelectionEvents } from '@fluentui/react-components';
import * as mobx from 'mobx';
import * as mobxlite from 'mobx-react-lite';
import * as React from 'react';
import { assertType } from '../../../../src/util/vs/base/common/types';
import { SimulationTestsProvider } from '../stores/simulationTestsProvider';
import { useInternalToolbarPickerStyles } from './pickerStyle';

type Props = {
	testsProvider: SimulationTestsProvider;
};

export const BaselineJSONPicker = mobxlite.observer(({ testsProvider }: Props) => {

	const id = 'baselineJSONPicker';
	const styles = useInternalToolbarPickerStyles();

	const onOptionSelect = mobx.action((_e: SelectionEvents, { optionValue }: OptionOnSelectData) => {
		assertType(optionValue === 'beforeRunBaselineJSON' || optionValue === 'workingTreeBaselineJSON');
		testsProvider.comparedBaselineJSON = optionValue;
	});

	return (
		<div className={styles.root}>
			<label htmlFor={id}>Compare against baseline.json</label>
			<Dropdown
				aria-labelledby={id}
				placeholder='which baseline.json'
				size='small'
				selectedOptions={[testsProvider.comparedBaselineJSON]}
				value={testsProvider.comparedBaselineJSON === 'beforeRunBaselineJSON' ? 'Snapshot before run' : 'Working tree'}
				onOptionSelect={onOptionSelect}
			>
				<Option key={0} value={'beforeRunBaselineJSON'}>
					Snapshot before run
				</Option>
				<Option key={1} value={'workingTreeBaselineJSON'}>
					Working tree
				</Option>
			</Dropdown>
		</div>
	);
});
