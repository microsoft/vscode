/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025 Lotas Inc. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IRuntimeSessionService as IRuntimeSessionServiceType } from './runtimeSessionTypes.js';

export const IRuntimeSessionService =
	createDecorator<IRuntimeSessionServiceType>('runtimeSessionService');

export * from './runtimeSessionTypes.js';
