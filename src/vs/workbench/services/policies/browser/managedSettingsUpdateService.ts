/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { derivedOpts, observableFromEvent } from '../../../../base/common/observable.js';
import { equals } from '../../../../base/common/objects.js';
import { IDefaultAccountService } from '../../../../platform/defaultAccount/common/defaultAccount.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { IUpdateService } from '../../../../platform/update/common/update.js';
import { getManagedSettingsUpdateInfo, IManagedSettingsUpdateService } from '../common/managedSettingsUpdate.js';

export class ManagedSettingsUpdateService extends Disposable implements IManagedSettingsUpdateService {
	declare readonly _serviceBrand: undefined;

	private readonly compatibilityError = observableFromEvent(this, this.defaultAccountService.onDidChangeManagedSettingsCompatibilityError, () => this.defaultAccountService.managedSettingsCompatibilityError);
	private readonly updateState = observableFromEvent(this, this.updateService.onStateChange, () => this.updateService.state);

	readonly updateInfo = derivedOpts({ owner: this, equalsFn: equals }, reader => {
		const error = this.compatibilityError.read(reader);
		return error ? getManagedSettingsUpdateInfo(error, this.productService, this.updateState.read(reader)) : undefined;
	});

	constructor(
		@IDefaultAccountService private readonly defaultAccountService: IDefaultAccountService,
		@IProductService private readonly productService: IProductService,
		@IUpdateService private readonly updateService: IUpdateService,
	) {
		super();
	}
}

registerSingleton(IManagedSettingsUpdateService, ManagedSettingsUpdateService, InstantiationType.Delayed);
