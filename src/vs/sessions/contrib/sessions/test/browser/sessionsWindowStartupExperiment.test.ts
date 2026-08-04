/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullWorkbenchAssignmentService } from '../../../../../workbench/services/assignment/test/common/nullAssignmentService.js';
import { AGENTS_WINDOW_STARTUP_AA_EXPERIMENT, SessionsWindowStartupExperiment } from '../../browser/sessionsWindowStartupExperiment.js';

class TestAssignmentService extends NullWorkbenchAssignmentService {
	readonly treatments: string[] = [];

	override async getTreatment<T extends string | number | boolean>(name: string): Promise<T | undefined> {
		this.treatments.push(name);
		return true as T;
	}
}

suite('SessionsWindowStartupExperiment', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads the A/A treatment when the contribution starts', () => {
		const assignmentService = new TestAssignmentService();

		new SessionsWindowStartupExperiment(assignmentService);

		assert.deepStrictEqual(assignmentService.treatments, [AGENTS_WINDOW_STARTUP_AA_EXPERIMENT]);
	});
});
