/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ICustomViewDescriptor } from '../../services/customView/browser/customView.js';
import { ICustomViewGridPartService } from '../../services/customView/browser/customViewGridPartService.js';
import { CustomViewGridPart } from './customViewGridPart.js';

/**
 * Owns the lifecycle of the {@link CustomViewGridPart}. Registered as an eager
 * singleton so the part registers itself with the workbench layout service
 * before the workbench starts laying out parts.
 */
export class CustomViewGridParts extends Disposable implements ICustomViewGridPartService {

	declare readonly _serviceBrand: undefined;

	private readonly _mainPart: CustomViewGridPart;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._mainPart = this._register(instantiationService.createInstance(CustomViewGridPart));
	}

	setView(descriptor: ICustomViewDescriptor | undefined): void {
		this._mainPart.setView(descriptor);
	}

	focusActiveView(): void {
		this._mainPart.focus();
	}
}

registerSingleton(ICustomViewGridPartService, CustomViewGridParts, InstantiationType.Eager);
