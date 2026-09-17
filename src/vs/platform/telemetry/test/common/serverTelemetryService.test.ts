/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../configuration/test/common/testConfigurationService.js';
import product from '../../../product/common/product.js';
import { IProductService } from '../../../product/common/productService.js';
import { TelemetryLevel } from '../../common/telemetry.js';
import { ServerTelemetryService } from '../../common/serverTelemetryService.js';
import { NullAppender } from '../../common/telemetryUtils.js';

suite('ServerTelemetryService', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	const productService: IProductService = { _serviceBrand: undefined, ...product };

	test('exposes and preserves the most restrictive injected telemetry level', async () => {
		const service = disposables.add(new ServerTelemetryService(
			{ appenders: [NullAppender] },
			TelemetryLevel.ERROR,
			new TestConfigurationService(),
			productService,
		));

		const initialLevel = service.telemetryLevel;
		await service.updateInjectedTelemetryLevel(TelemetryLevel.NONE);
		await service.updateInjectedTelemetryLevel(TelemetryLevel.USAGE);

		assert.deepStrictEqual({
			initialLevel,
			finalLevel: service.telemetryLevel,
		}, {
			initialLevel: TelemetryLevel.ERROR,
			finalLevel: TelemetryLevel.NONE,
		});
	});
});
