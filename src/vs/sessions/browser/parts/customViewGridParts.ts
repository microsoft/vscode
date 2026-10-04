/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { getClientArea } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ICustomViewDescriptor } from '../../services/customView/browser/customView.js';
import { ICustomViewGridPartService } from '../../services/customView/browser/customViewGridPartService.js';
import { CustomViewGridPart } from './customViewGridPart.js';
import { MobileCustomViewGridPart } from './mobile/mobileCustomViewGridPart.js';

/**
 * Owns the lifecycle of the {@link CustomViewGridPart}. Selects the mobile vs.
 * desktop variant based on viewport width at construction time. Registered as an
 * eager singleton so the part registers itself with the workbench layout service
 * before the workbench starts laying out parts.
 */
export class CustomViewGridParts extends Disposable implements ICustomViewGridPartService {

	declare readonly _serviceBrand: undefined;

	private readonly _mainPart: CustomViewGridPart;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		const { width } = getClientArea(mainWindow.document.body);
		const isPhoneLayout = width < 640;

		this._mainPart = this._register(instantiationService.createInstance(isPhoneLayout ? MobileCustomViewGridPart : CustomViewGridPart));
	}

	setView(descriptor: ICustomViewDescriptor | undefined): void {
		this._mainPart.setView(descriptor);
	}

	focusActiveView(): void {
		this._mainPart.focus();
	}
}

registerSingleton(ICustomViewGridPartService, CustomViewGridParts, InstantiationType.Eager);
