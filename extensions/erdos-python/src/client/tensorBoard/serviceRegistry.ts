// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { IServiceManager } from '../ioc/types';
import { TensorBoardPrompt } from './tensorBoardPrompt';
import { TensorboardDependencyChecker } from './tensorboardDependencyChecker';

export function registerTypes(serviceManager: IServiceManager): void {
    serviceManager.addSingleton<TensorBoardPrompt>(TensorBoardPrompt, TensorBoardPrompt);
    serviceManager.addSingleton(TensorboardDependencyChecker, TensorboardDependencyChecker);
}
