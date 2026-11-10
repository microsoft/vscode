/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { readCloudSandboxCloneResult, readCloudSandboxProjects } from '../../common/meta/cloudSandboxProjectMeta.js';

suite('CloudSandboxProjectMeta', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads finite clone percentages, clamps their range, and ignores progress after cloning', () => {
		const project = { id: 'checkout', path: '/checkout', git: true };
		assert.deepStrictEqual({
			cloning: [undefined, 0, 58, 100, -1, 101, NaN, Infinity, '58'].map(progress =>
				readCloudSandboxCloneResult({ project: { ...project, status: 'cloning', progress } })?.progress),
			otherStates: [undefined, 'ready', 'failed'].map(status =>
				readCloudSandboxCloneResult({ project: { ...project, status, progress: 58 } })?.progress),
			root: readCloudSandboxProjects({
				agents: [],
				_meta: { 'copilot.projectManagement': { available: true } },
				config: {
					schema: { type: 'object', properties: {} },
					values: { copilot: { projects: [{ ...project, status: 'cloning', progress: 58 }] } },
				},
			})?.map(project => ({ status: project.status, progress: project.progress })),
		}, {
			cloning: [undefined, 0, 58, 100, 0, 100, undefined, undefined, undefined],
			otherStates: [undefined, undefined, undefined],
			root: [{ status: 'cloning', progress: 58 }],
		});
	});
});
