/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { SandboxSettingsResolutionHelper } from '../../common/sandboxSettingsResolutionHelper.js';
import { AgentSandboxEnabledValue } from '../../common/settings.js';

suite('SandboxSettingsResolutionHelper', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('only managed true forces enablement', () => {
		for (const local of [undefined, AgentSandboxEnabledValue.Off, AgentSandboxEnabledValue.On]) {
			assert.deepStrictEqual(
				[undefined, false, true].map(managed => SandboxSettingsResolutionHelper.resolveEnabled(local, managed)),
				[local, local, AgentSandboxEnabledValue.On],
			);
		}
	});

	test('managed false denies outbound access without widening local restrictions', () => {
		for (const local of [undefined, false, true]) {
			assert.deepStrictEqual(
				[undefined, false, true].map(managed => SandboxSettingsResolutionHelper.resolveAllowOutbound(local, managed)),
				[local, false, local],
			);
		}
	});

	test('bypass requires managed permission under a forced sandbox and never widens the local choice', () => {
		for (const local of [undefined, false, true]) {
			for (const enabled of [undefined, false, true]) {
				assert.deepStrictEqual(
					[undefined, false, true].map(managed => SandboxSettingsResolutionHelper.resolveAllowBypass(local, managed, enabled)),
					[enabled === true ? false : local, false, local],
				);
			}
		}
	});
});
