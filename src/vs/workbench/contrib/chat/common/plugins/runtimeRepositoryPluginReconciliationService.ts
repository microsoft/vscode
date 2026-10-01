/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from '../../../../../base/common/uri.js';
import type { IDisposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

export const IRuntimeRepositoryPluginReconciliationService = createDecorator<IRuntimeRepositoryPluginReconciliationService>('runtimeRepositoryPluginReconciliationService');

export interface IRuntimeRepositoryPluginReconciliationService {
	readonly _serviceBrand: undefined;
	reconcile(workingDirectories?: readonly URI[]): Promise<void>;
	whenDiscoverySettled(): Promise<void>;
	retainWorkingDirectories(workingDirectories: readonly URI[]): IDisposable;
}
