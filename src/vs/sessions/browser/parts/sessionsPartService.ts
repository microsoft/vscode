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
import { IActiveSession, ISessionsManagementService } from '../../services/sessions/common/sessionsManagement.js';
import { autorun } from '../../../base/common/observable.js';

export const ISessionsPartService = createDecorator<ISessionsPartService>('sessionsPartService');

export interface ISessionsPartService {
	readonly _serviceBrand: undefined;

	/**
	 * Wires the part to the {@link ISessionsManagementService} so that changes to
	 * the active session are reflected in the UI. Must be called after the part
	 * has been added to the DOM via {@link SessionsPart.create}.
	 */
	init(): void;
}

/**
 * Owns the lifecycle of the {@link SessionsPart}. Selects the mobile vs. desktop
 * variant based on viewport width at construction time. Registered as an eager
 * singleton so the part registers itself with the workbench layout service
 * before the workbench starts laying out parts.
 */
export class SessionsParts extends Disposable implements ISessionsPartService {

	declare readonly _serviceBrand: undefined;

	private readonly _mainPart: SessionsPart;

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService
	) {
		super();

		const { width } = getClientArea(mainWindow.document.body);
		const isPhoneLayout = width < 640;

		this._mainPart = this._register(instantiationService.createInstance(isPhoneLayout ? MobileSessionsPart : SessionsPart));
	}

	init(): void {
		this._register(autorun(reader => {
			const activeSession = this.sessionsManagementService.activeSession.read(reader);
			this._openSession(activeSession);
		}));
	}

	private _openSession(session: IActiveSession | undefined): void {
		this._mainPart.openSession(session);
	}
}

registerSingleton(ISessionsPartService, SessionsParts, InstantiationType.Eager);
