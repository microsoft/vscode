/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { ANSIOutputLine, ANSIOutputRun } from '../../../../../base/common/ansiOutput.js';

export const formatOutputLinesForClipboard = (outputLines: readonly ANSIOutputLine[], prefix?: string): string[] => {
	return outputLines.map(outputLine => {
		const formattedOutputLine = outputLine.outputRuns.map((outputRun: ANSIOutputRun) => {
			if (outputRun.hyperlink) {
				return outputRun.text + ' (' + outputRun.hyperlink.url + ') ';
			} else {
				return outputRun.text;
			}
		}).join('');

		return prefix ? prefix + formattedOutputLine : formattedOutputLine;
	});
};
