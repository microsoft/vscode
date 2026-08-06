/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, expect, it } from 'vitest';
import { DEFAULT_NES_DATAGEN_ORACLE_EDIT_LIMIT, SimulationOptions } from './simulationOptions';

describe('SimulationOptions nes-datagen', () => {
	it('parses the workspace recording oracle edit limit', () => {
		const defaults = SimulationOptions.fromArray(['node', 'simulate', 'nes-datagen', '--input', 'recording.jsonl']);
		const configured = SimulationOptions.fromArray(['node', 'simulate', 'nes-datagen', '--input', 'recording.jsonl', '--max-oracle-edits', '3']);

		expect({
			defaultValue: defaults.nesDatagen?.maxOracleEdits,
			configuredValue: configured.nesDatagen?.maxOracleEdits,
		}).toEqual({
			defaultValue: DEFAULT_NES_DATAGEN_ORACLE_EDIT_LIMIT,
			configuredValue: 3,
		});
	});

	it('rejects a non-positive workspace recording oracle edit limit', () => {
		expect(() => SimulationOptions.fromArray([
			'node',
			'simulate',
			'nes-datagen',
			'--input',
			'recording.jsonl',
			'--max-oracle-edits',
			'0',
		])).toThrow('--max-oracle-edits must be a positive integer');
	});
});
