/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as mobx from 'mobx';
import * as mobxlite from 'mobx-react-lite';
import * as React from 'react';
import { AMLProvider } from '../stores/amlSimulations';

export const AMLPicker = mobxlite.observer(({ amlProvider }: { amlProvider: AMLProvider }) => {

	const selectedRun = amlProvider.selected;

	const runsToCompareAgainst = amlProvider.runs.filter(run => !selectedRun || selectedRun.kind === run.kind && selectedRun.name !== run.name);

	return (
		<div style={{ display: 'flex' }}>
			<div className='external-toolbar-aml-picker'>
				<label className='title'> AML Run </label>
				<select
					onChange={mobx.action(e => amlProvider.selectedName.value = e.target.value)}
					className='items'
					value={amlProvider.selectedName.value}
				>
					<option key='none' value=''> None </option>
					{
						amlProvider.runs.map((run) => (
							<option key={run.name} value={run.name}>{run.name}</option>
						))
					}
				</select>
			</div>
			<div>
				<label className='title'> Compare against </label>
				<select
					onChange={mobx.action(e => amlProvider.compareAgainstRunName.value = e.target.value)}
					className='items'
					value={amlProvider.compareAgainstRunName.value}
				>
					{
						runsToCompareAgainst.length > 0
							? [
								<option key='none' value=''> None </option>,
								...runsToCompareAgainst.map((run) => (
									<option key={run.name} value={run.name}>{run.name}</option>
								)),
							]
							: <option key='no-comparable-runs' value=''>No comparable runs</option>
					}
				</select>
			</div>
		</div>
	);
});
