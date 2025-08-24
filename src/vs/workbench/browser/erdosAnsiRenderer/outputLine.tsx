/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './outputLine.css';

import React from 'react';

import { OutputRun } from './outputRun.js';
import { ANSIOutputLine } from '../../../base/common/ansiOutput.js';

export interface OutputLineProps {
	readonly outputLine: ANSIOutputLine;
}

export const OutputLine = (props: OutputLineProps) => {
	if (!props.outputLine.outputRuns.length) {
		return <br />;
	}

	return (
		<div>
			{props.outputLine.outputRuns.map(outputRun =>
				<OutputRun key={outputRun.id} outputRun={outputRun} />
			)}
		</div>
	);
};
