/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { URI } from '../../../../../base/common/uri.js';
import type { IDisposable } from '../../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

export const IRuntimeRequiredPluginService = createDecorator<IRuntimeRequiredPluginService>('runtimeRequiredPluginService');

export interface IRuntimeRequiredPluginService {
	readonly _serviceBrand: undefined;
	ensure(workingDirectories?: readonly URI[]): Promise<void>;
	whenDiscoverySettled(): Promise<void>;
	retainWorkingDirectories(workingDirectories: readonly URI[]): IDisposable;
}
