/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ISimulationTest } from '../stores/simulationTestsProvider';

export type TestFilterer = {
	filter: (tests: readonly ISimulationTest[]) => ISimulationTest[];
};
