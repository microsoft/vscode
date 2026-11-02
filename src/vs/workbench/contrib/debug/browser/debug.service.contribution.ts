/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { registerSingleton, InstantiationType } from '../../../../platform/instantiation/common/extensions.js';
import { DebugService } from './debugService.js';
import { IDebugService } from '../common/debug.js';
import { IDebugVisualizerService, DebugVisualizerService } from '../common/debugVisualizers.js';
import { buildFeatureTesting } from '../../../../platform/product/common/buildFeatures.js';
import { NullTestResultService, NullTestService } from '../../testing/common/nullTestingService.js';
import { ITestResultService } from '../../testing/common/testResultService.js';
import { ITestService } from '../../testing/common/testService.js';

if (!buildFeatureTesting) {
	// Debug sessions consume these services for correlated test runs. Keep the
	// Debug service usable without restoring the Testing UI or API bridge.
	registerSingleton(ITestService, NullTestService, InstantiationType.Delayed);
	registerSingleton(ITestResultService, NullTestResultService, InstantiationType.Delayed);
}

registerSingleton(IDebugService, DebugService, InstantiationType.Delayed);
registerSingleton(IDebugVisualizerService, DebugVisualizerService, InstantiationType.Delayed);
