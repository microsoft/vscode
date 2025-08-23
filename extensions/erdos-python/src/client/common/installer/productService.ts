// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

'use strict';

import { injectable } from 'inversify';
import { Product, ProductType } from '../types';
import { IProductService } from './types';

@injectable()
export class ProductService implements IProductService {
    private ProductTypes = new Map<Product, ProductType>();

    constructor() {
        this.ProductTypes.set(Product.pytest, ProductType.TestFramework);
        this.ProductTypes.set(Product.unittest, ProductType.TestFramework);
        this.ProductTypes.set(Product.tensorboard, ProductType.DataScience);
        this.ProductTypes.set(Product.torchProfilerInstallName, ProductType.DataScience);
        this.ProductTypes.set(Product.torchProfilerImportName, ProductType.DataScience);
        this.ProductTypes.set(Product.pip, ProductType.DataScience);
        this.ProductTypes.set(Product.ensurepip, ProductType.DataScience);
        this.ProductTypes.set(Product.python, ProductType.Python);
    }
    public getProductType(product: Product): ProductType {
        return this.ProductTypes.get(product)!;
    }
}
