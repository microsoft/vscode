/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as mobxlite from 'mobx-react-lite';
import * as React from 'react';
import { EvaluationError } from '../stores/amlResults';
import { ISimulationTest } from '../stores/simulationTestsProvider';
import { DiffEditor } from './diffEditor';

export const ErrorComparison = mobxlite.observer(
	({ test }: { test: ISimulationTest }) => {
		const errorsOnlyInBefore = test.errorsOnlyInBefore;
		const errorsOnlyInAfter = test.errorsOnlyInAfter;
		if (
			!errorsOnlyInBefore ||
			!errorsOnlyInAfter ||
			!errorsOnlyInBefore.length ||
			!errorsOnlyInAfter.length
		) {
			return null;
		}

		const [expanded, setExpanded] = React.useState(false);

		return (
			<div className='error-comparison'>
				{'\n'}
				<div className='title' onClick={() => setExpanded(!expanded)}>
					{expanded ? '▼' : '▶'} Error Comparison
				</div>{' '}
				{!expanded ? null : (
					<div>
						<p>
							<span className='category'>{`- Source: `}</span>
							{errorsOnlyInBefore[0].tool}
						</p>
						<p>
							<span className='category'>{`- Number of errors that appear in the diagnostics strictly only before the change: `}</span>
							{errorsOnlyInBefore.length}
						</p>
						<p>
							<span className='category'>{`- Number of errors that appear in the diagnostics strictly only after the change: `}</span>
							{errorsOnlyInAfter.length}
						</p>
						<span className='category'>{`- Diff of errors before and after : `}</span>
						<DiffEditor
							original={errorText(errorsOnlyInBefore)}
							modified={errorText(errorsOnlyInAfter)}
							languageId='plaintext'
						/>
					</div>
				)}
			</div>
		);
	}
);

function errorText(errors: EvaluationError[]) {
	let errorText = ``;
	for (const error of errors) {
		errorText +=
			[
				`- Start Line : ${error.startLine}`,
				`- Start Column : ${error.startColumn}`,
				`- End line : ${error.endLine}`,
				`- End column : ${error.endColumn}`,
				`- Message : ${error.message}`,
			].join('\n') + '\n\n';
	}
	return errorText;
}
