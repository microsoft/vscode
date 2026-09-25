/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IProcessEnvironment } from '../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NativeMcpDiscoveryHelperService } from '../../node/nativeMcpDiscoveryHelperService.js';

suite('NativeMcpDiscoveryHelperService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('reads native configuration roots from the process environment', async () => {
		const data = await new NativeMcpDiscoveryHelperService({
			COPILOT_HOME: '/custom/copilot',
			APPDATA: '/custom/app-data',
			XDG_CONFIG_HOME: '/custom/config',
		}).load();

		assert.deepStrictEqual({
			copilotHome: data.copilotHome?.path,
			winAppData: data.winAppData?.path,
			xdgHome: data.xdgHome?.path,
		}, {
			copilotHome: '/custom/copilot',
			winAppData: '/custom/app-data',
			xdgHome: '/custom/config',
		});
	});

	const cases: { name: string; environment: IProcessEnvironment; shellEnvironment: IProcessEnvironment; expectedHome: string | undefined }[] = [
		{ name: 'uses a shell-only Copilot home on GUI launches', environment: {}, shellEnvironment: { COPILOT_HOME: '/shell/copilot' }, expectedHome: '/shell/copilot' },
		{ name: 'lets the shell Copilot home override the process environment', environment: { COPILOT_HOME: '/process/copilot' }, shellEnvironment: { COPILOT_HOME: '/shell/copilot' }, expectedHome: '/shell/copilot' },
		{ name: 'preserves the process Copilot home when shell resolution is skipped or fails', environment: { COPILOT_HOME: '/process/copilot' }, shellEnvironment: {}, expectedHome: '/process/copilot' },
		{ name: 'uses the default Copilot home when neither environment sets it', environment: {}, shellEnvironment: {}, expectedHome: undefined },
		{ name: 'uses the default Copilot home when the shell clears it', environment: { COPILOT_HOME: '/process/copilot' }, shellEnvironment: { COPILOT_HOME: '' }, expectedHome: undefined },
	];

	for (const { name, environment, shellEnvironment, expectedHome } of cases) {
		test(name, async () => {
			const data = await new NativeMcpDiscoveryHelperService({
				...environment,
				APPDATA: '/process/app-data',
				XDG_CONFIG_HOME: '/process/config',
			}, async () => ({
				...shellEnvironment,
				APPDATA: '/shell/app-data',
				XDG_CONFIG_HOME: '/shell/config',
			})).load();

			assert.deepStrictEqual({
				copilotHome: data.copilotHome?.path,
				winAppData: data.winAppData?.path,
				xdgHome: data.xdgHome?.path,
			}, {
				copilotHome: expectedHome,
				winAppData: '/process/app-data',
				xdgHome: '/process/config',
			});
		});
	}
});
