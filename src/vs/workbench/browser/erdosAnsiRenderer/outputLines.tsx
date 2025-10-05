/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import './outputLines.css';

import React from 'react';

import { OutputLine } from './outputLine.js';
import { ANSIOutputLine } from '../../../base/common/ansiOutput.js';

interface OutputLinesProps {
	readonly outputLines: readonly ANSIOutputLine[];
}

export const OutputLines = (props: OutputLinesProps) => {
	return (
		<>
			{props.outputLines.map(outputLine =>
				<OutputLine key={outputLine.id} outputLine={outputLine} />
			)}
		</>
	);
};
