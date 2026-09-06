/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SimulationStorageValue } from './simulationStorage';

/**
 * The top-level mode of the simulation workbench. This is independent of
 * {@link TestSource} (which is purely about where simulation tests come from):
 * the workbench can either be showing tests or the standalone "Adhoc request
 * sender" utility.
 */
export type WorkbenchMode = 'tests' | 'adhocRequest';

export type WorkbenchModeValue = SimulationStorageValue<WorkbenchMode>;
