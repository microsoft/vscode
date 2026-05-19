/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../../nls.js';
import { Categories } from '../../../../../../platform/action/common/actionCommonCategories.js';
import { MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IsDevelopmentContext } from '../../../../../../platform/contextkey/common/contextkeys.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';

const COMPLETED_STORAGE_KEY = 'chat.usageBillingBanner.completed';

export const IChatBillingBannerService = createDecorator<IChatBillingBannerService>('chatBillingBannerService');

export interface IChatBillingBannerService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	readonly shouldShow: boolean;
	setEnabled(enabled: boolean): void;
	markCompleted(): void;
	devForceShow(): void;
}

class ChatBillingBannerService extends Disposable implements IChatBillingBannerService {
	readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _enabled = false;
	private _forceShow = false;

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._register(this._storageService.onDidChangeValue(StorageScope.PROFILE, COMPLETED_STORAGE_KEY, this._store)(() => this._onDidChange.fire()));
	}

	get shouldShow(): boolean {
		return this._forceShow || (this._enabled && !this._storageService.getBoolean(COMPLETED_STORAGE_KEY, StorageScope.PROFILE, false));
	}

	setEnabled(enabled: boolean): void {
		if (this._enabled === enabled) {
			return;
		}
		this._enabled = enabled;
		this._onDidChange.fire();
	}

	markCompleted(): void {
		this._forceShow = false;
		this._storageService.store(COMPLETED_STORAGE_KEY, true, StorageScope.PROFILE, StorageTarget.USER);
		this._onDidChange.fire();
	}

	devForceShow(): void {
		this._storageService.remove(COMPLETED_STORAGE_KEY, StorageScope.PROFILE);
		this._forceShow = true;
		this._onDidChange.fire();
	}
}

registerSingleton(IChatBillingBannerService, ChatBillingBannerService, InstantiationType.Delayed);

// Internal bridge command — invoked by the Copilot extension when
// `copilotToken.isUsageBasedBilling` changes. Underscore-prefixed to keep it
// out of the command palette.
CommandsRegistry.registerCommand('_chat.billing.usageBannerSetEnabled', (accessor, enabled: unknown) => {
	accessor.get(IChatBillingBannerService).setEnabled(Boolean(enabled));
});

// Dev-only: gated on IsDevelopmentContext so it only appears in unpacked dev builds
// (Code OSS / `Run and Compile Code - OSS`). Hidden in shipped Stable/Insiders.
CommandsRegistry.registerCommand('github.copilot.dev.showUsageBillingBanner', accessor => {
	accessor.get(IChatBillingBannerService).devForceShow();
});
MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: 'github.copilot.dev.showUsageBillingBanner',
		title: localize2('billingBanner.dev.show', "Show Copilot Billing Banner"),
		category: Categories.Developer,
	},
	when: IsDevelopmentContext,
});
