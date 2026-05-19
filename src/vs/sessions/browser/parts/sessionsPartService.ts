/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { createDecorator, IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../platform/instantiation/common/extensions.js';
import { getClientArea } from '../../../base/browser/dom.js';
import { mainWindow } from '../../../base/browser/window.js';
import { SessionsPart } from './sessionsPart.js';
import { MobileSessionsPart } from './mobile/mobileSessionsPart.js';

export const ISessionsPartService = createDecorator<ISessionsPartService>('sessionsPartService');

export interface ISessionsPartService {

	readonly _serviceBrand: undefined;

	/**
	 * The main sessions part instance.
	 */
	readonly mainPart: SessionsPart;
}

/**
 * Owns the lifecycle of the {@link SessionsPart}. Selects the mobile vs. desktop
 * variant based on viewport width at construction time. Registered as an eager
 * singleton so the part registers itself with the workbench layout service
 * before the workbench starts laying out parts.
 */
export class SessionsPartService extends Disposable implements ISessionsPartService {

	declare readonly _serviceBrand: undefined;

	readonly mainPart: SessionsPart;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService
	) {
		super();

		const { width } = getClientArea(mainWindow.document.body);
		const isPhoneLayout = width < 640;

		this.mainPart = this._register(instantiationService.createInstance(isPhoneLayout ? MobileSessionsPart : SessionsPart));
	}
}

registerSingleton(ISessionsPartService, SessionsPartService, InstantiationType.Eager);
