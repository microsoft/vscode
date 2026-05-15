/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArrowRight12Regular } from '@fluentui/react-icons';
import * as mobxlite from 'mobx-react-lite';
import * as React from 'react';
import { TestRun } from '../stores/testRun';

type TestCaseSummaryProps = {
	currentRun: TestRun;
	baselineRun?: TestRun;
};

export const TestCaseSummary = mobxlite.observer(
	({ currentRun, baselineRun }: TestCaseSummaryProps) => {
		return (
			<div>
				<div className='test-case-count'>
					<span>Total generated test case numbers: </span>
					{baselineRun
						? <>
							<span>{baselineRun.generatedTestCaseCount}</span>
							<ArrowRight12Regular />
						</>
						: null
					}

					<span>{currentRun.generatedTestCaseCount}</span>
				</div>
				<div className='test-assertion-count'>
					<span>Total generated assertions numbers: </span>
					{baselineRun
						? <>
							<span>{baselineRun.generatedAssertCount}</span>
							<ArrowRight12Regular />
						</>
						: null
					}

					<span>{currentRun.generatedAssertCount}</span>
				</div>
			</div>
		);
	}
);