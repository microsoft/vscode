/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IExtensionHostProfileService } from '../../electron-browser/runtimeExtensionsEditor.js';
import { ExtensionsAutoProfiler } from '../../electron-browser/extensionsAutoProfiler.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { INativeWorkbenchEnvironmentService } from '../../../../services/environment/electron-browser/environmentService.js';
import { ITimerService } from '../../../../services/timer/browser/timerService.js';

suite('ExtensionsAutoProfiler', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('does not register for extension test hosts', async () => {
		let didRegisterListener = false;
		const extensionService: Pick<IExtensionService, 'onDidChangeResponsiveChange'> = {
			onDidChangeResponsiveChange: () => {
				didRegisterListener = true;
				return { dispose() { } };
			}
		};
		const environmentService = { extensionTestsLocationURI: URI.file('/test') } as INativeWorkbenchEnvironmentService;
		const timerService = { perfBaseline: Promise.resolve(1) } as ITimerService;

		disposables.add(new ExtensionsAutoProfiler(
			extensionService as IExtensionService,
			undefined! as IExtensionHostProfileService,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			undefined!,
			environmentService,
			undefined!,
			undefined!,
			undefined!,
			timerService
		));

		await Promise.resolve();
		assert.strictEqual(didRegisterListener, false);
	});
});
