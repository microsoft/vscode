// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Product } from '../types';

export const ProductNames = new Map<Product, string>();
ProductNames.set(Product.pytest, 'pytest');
ProductNames.set(Product.tensorboard, 'tensorboard');
ProductNames.set(Product.torchProfilerInstallName, 'torch-tb-profiler');
ProductNames.set(Product.torchProfilerImportName, 'torch_tb_profiler');
ProductNames.set(Product.pip, 'pip');
ProductNames.set(Product.ensurepip, 'ensurepip');
