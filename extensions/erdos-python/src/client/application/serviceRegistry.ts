// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { IServiceManager } from '../ioc/types';
import { registerTypes as diagnosticsRegisterTypes } from './diagnostics/serviceRegistry';

export function registerTypes(serviceManager: IServiceManager) {
    diagnosticsRegisterTypes(serviceManager);
}
