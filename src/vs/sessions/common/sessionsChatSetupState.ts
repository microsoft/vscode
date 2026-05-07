/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../base/common/lifecycle.js';
import { createDecorator, IInstantiationService } from '../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../platform/log/common/log.js';
import { IStorageService } from '../../platform/storage/common/storage.js';
import { IUserDataProfileStorageService } from '../../platform/userDataProfile/common/userDataProfileStorageService.js';
import { IUserDataProfilesService } from '../../platform/userDataProfile/common/userDataProfile.js';
import { ServiceCollection } from '../../platform/instantiation/common/serviceCollection.js';
import { ChatEntitlementContext, IChatEntitlementService } from '../../workbench/services/chat/common/chatEntitlementService.js';

export const ISessionsChatSetupStateService = createDecorator<ISessionsChatSetupStateService>('sessionsChatSetupStateService');

export interface ISessionsChatSetupStateService {
	readonly _serviceBrand: undefined;

	/**
	 * Resolves to whether the chat setup has been completed — either
	 * locally in this sessions window or in the main VS Code window
	 * (default profile).
	 */
	whenSetupDone(): Promise<boolean>;

	/**
	 * Mark the setup as completed by updating the current profile's
	 * chat entitlement context. Listeners can observe the change via
	 * `IChatEntitlementService.onDidChangeSentiment`.
	 */
	markDone(): void;
}

export class SessionsChatSetupStateService extends Disposable implements ISessionsChatSetupStateService {

	declare readonly _serviceBrand: undefined;

	private readonly _initPromise: Promise<void>;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUserDataProfileStorageService private readonly userDataProfileStorageService: IUserDataProfileStorageService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this._initPromise = this.initialize();
	}

	async whenSetupDone(): Promise<boolean> {
		await this._initPromise;
		return this.chatEntitlementService.sentiment.completed === true;
	}

	markDone(): void {
		this.chatEntitlementService.markSetupCompleted();
	}

	private async initialize(): Promise<void> {
		if (this.chatEntitlementService.sentiment.completed) {
			return; // already done on current profile
		}

		try {
			const defaultProfile = this.userDataProfilesService.defaultProfile;
			await this.userDataProfileStorageService.withProfileScopedStorageService(defaultProfile, async storageService => {
				const defaultContext = this.instantiationService
					.createChild(new ServiceCollection([IStorageService, storageService]))
					.createInstance(ChatEntitlementContext);
				try {
					if (defaultContext.state.completed) {
						this.logService.info('[sessions chat setup] Setup already completed in default profile, marking done locally');
						this.markDone();
					}
				} finally {
					defaultContext.dispose();
				}
			});
		} catch (error) {
			this.logService.error('[sessions chat setup] Failed to read setup state from default profile:', error);
		}
	}
}
