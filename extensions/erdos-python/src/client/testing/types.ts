// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { Product } from '../common/types';
import { TestSettingsPropertyNames } from './configuration/types';

export type TestProvider = 'pytest' | 'unittest';

// ****************
// interfaces

export const ITestingService = Symbol('ITestingService');
export interface ITestingService {
    getSettingsPropertyNames(product: Product): TestSettingsPropertyNames;
}
