/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ServicesAccessor } from '../../../../../../../util/vs/platform/instantiation/common/instantiation';
import { ExpTreatmentVariables } from '../../experiments/expConfig';
import { TelemetryWithExp } from '../../telemetry';
import { createLibTestingContext } from '../../test/context';
import { getEngineRequestInfo } from '../config';

suite('OpenAI Config Tests', function () {
	let accessor: ServicesAccessor;

	setup(function () {
		accessor = createLibTestingContext().createTestingAccessor();
	});

	test('getEngineRequestInfo() returns the model from AvailableModelManager', function () {
		const telem = TelemetryWithExp.createEmptyConfigForTesting();
		telem.filtersAndExp.exp.variables[ExpTreatmentVariables.CustomEngine] = 'model.override';

		const info = getEngineRequestInfo(accessor, telem);

		assert.strictEqual(info.modelId, 'model.override');
		assert.deepStrictEqual(info.headers, {});
	});
});
