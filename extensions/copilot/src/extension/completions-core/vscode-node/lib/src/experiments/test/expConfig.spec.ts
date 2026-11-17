/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { ExpConfig, ExpTreatmentVariables, ExpTreatmentVariableValue } from '../expConfig';

describe('ExpConfig', () => {
	it('reports a variable when it is read, not when the config is built', () => {
		const reads: [string, ExpTreatmentVariableValue][] = [];
		const exp = new ExpConfig(
			{ [ExpTreatmentVariables.CppHeadersEnableSwitch]: true, [ExpTreatmentVariables.SuffixPercent]: 10 },
			'copilotcppheadersenableswitch',
			(name, value) => reads.push([name, value])
		);
		exp.addToTelemetry({ properties: {} } as Parameters<ExpConfig['addToTelemetry']>[0]);
		expect(reads).toEqual([]);

		expect(exp.variables[ExpTreatmentVariables.SuffixPercent]).toBe(10);
		expect(exp.variables[ExpTreatmentVariables.RelatedFilesVSCode]).toBeUndefined();

		expect(reads).toEqual([[ExpTreatmentVariables.SuffixPercent, 10]]);
	});
});
