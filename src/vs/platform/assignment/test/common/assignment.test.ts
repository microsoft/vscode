/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import * as platform from '../../../../base/common/platform.js';
import { AssignmentFilterProvider, isInternalAccount, TargetPopulation, VSCodeCoreAssignmentsFilterProvider, WindowKind } from '../../common/assignment.js';

suite('Assignment', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	for (const windowKind of [WindowKind.Editor, WindowKind.Agents]) {
		test(`includes the CAPI integrator in legacy assignment headers (${windowKind})`, () => {
			const provider = new AssignmentFilterProvider('1.100.0', 'VS Code', 'machine', 'device', TargetPopulation.Public, '', windowKind);
			assert.strictEqual(provider.getFilters().get('integratorid'), 'vscode-chat');
		});

		test(`includes the CAPI integrator in new assignment parameters (${windowKind})`, () => {
			const provider = new VSCodeCoreAssignmentsFilterProvider('1.100.0-insider', 'VS Code', 'device', TargetPopulation.Insiders, '2026-11-02T12:00:00Z', windowKind);
			assert.deepStrictEqual(Object.fromEntries(provider.getFilters()), {
				integratorid: 'vscode-chat',
				vscode_core_appversion: '1.100.0',
				vscode_core_build: 'VS Code',
				devdeviceid: 'device',
				vscode_core_extensionname: 'vscode-core',
				extensionname: 'vscode-core',
				vscode_core_targetpopulation: 'insider',
				vscode_core_platform: platform.PlatformToString(platform.platform),
				vscode_core_releasedate: '2026110212',
				vscode_core_windowkind: windowKind,
			});
		});
	}

	test('an account is internal when it is staff or belongs to an internal organisation', () => {
		assert.deepStrictEqual({
			unknown: isInternalAccount(undefined, undefined),
			external: isInternalAccount(false, ['contoso']),
			staffOnly: isInternalAccount(true, ['contoso']),
			orgOnly: isInternalAccount(false, ['microsoft']),
			vscodeOrg: isInternalAccount(undefined, ['Visual-Studio-Code']),
			githubOrg: isInternalAccount(undefined, ['github']),
			copilotOrg: isInternalAccount(undefined, ['ms-copilot']),
		}, {
			unknown: false,
			external: false,
			staffOnly: true,
			orgOnly: true,
			vscodeOrg: true,
			githubOrg: true,
			copilotOrg: true,
		});
	});
});
