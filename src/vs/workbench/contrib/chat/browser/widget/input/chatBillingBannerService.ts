/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, MutableDisposable } from '../../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../../nls.js';
import { Categories } from '../../../../../../platform/action/common/actionCommonCategories.js';
import { MenuId, MenuRegistry } from '../../../../../../platform/actions/common/actions.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IsDevelopmentContext } from '../../../../../../platform/contextkey/common/contextkeys.js';
import { ChatContextKeys } from '../../../common/chatContextKeys.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';

const COMPLETED_STORAGE_KEY_PREFIX = 'chat.usageBillingBanner.completed';

export const IChatBillingBannerService = createDecorator<IChatBillingBannerService>('chatBillingBannerService');

export interface IChatBillingBannerService {
	readonly _serviceBrand: undefined;
	readonly onDidChange: Event<void>;
	readonly shouldShow: boolean;
	/**
	 * Update banner eligibility. `accountId` scopes the dismissal so a
	 * different signed-in account is not silently suppressed by a previous
	 * user's dismissal. Pass `undefined` when no account is signed in.
	 */
	setEnabled(enabled: boolean, accountId: string | undefined): void;
	markCompleted(): void;
	devForceShow(): void;
}

class ChatBillingBannerService extends Disposable implements IChatBillingBannerService {
	readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange = this._onDidChange.event;

	private _enabled = false;
	private _forceShow = false;
	private _activeAccountId: string | undefined;
	private readonly _storageListener = this._register(new MutableDisposable());

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();
		this._wireStorageListener();
	}

	private get _storageKey(): string {
		return `${COMPLETED_STORAGE_KEY_PREFIX}.${this._activeAccountId ?? 'unknown'}`;
	}

	private _wireStorageListener(): void {
		this._storageListener.value = this._storageService.onDidChangeValue(StorageScope.PROFILE, this._storageKey, this._store)(() => this._onDidChange.fire());
	}

	get shouldShow(): boolean {
		return this._forceShow || (this._enabled && !this._storageService.getBoolean(this._storageKey, StorageScope.PROFILE, false));
	}

	setEnabled(enabled: boolean, accountId: string | undefined): void {
		const accountChanged = this._activeAccountId !== accountId;
		const enabledChanged = this._enabled !== enabled;
		if (!accountChanged && !enabledChanged) {
			return;
		}
		this._enabled = enabled;
		if (accountChanged) {
			this._activeAccountId = accountId;
			this._wireStorageListener();
		}
		this._onDidChange.fire();
	}

	markCompleted(): void {
		this._forceShow = false;
		this._storageService.store(this._storageKey, true, StorageScope.PROFILE, StorageTarget.USER);
		this._onDidChange.fire();
	}

	devForceShow(): void {
		this._storageService.remove(this._storageKey, StorageScope.PROFILE);
		this._forceShow = true;
		this._onDidChange.fire();
	}
}

registerSingleton(IChatBillingBannerService, ChatBillingBannerService, InstantiationType.Delayed);

// Internal bridge command — invoked by the Copilot extension when
// `copilotToken.isUsageBasedBilling` changes. Underscore-prefixed to keep it
// out of the command palette. `accountId` scopes the per-user dismissal flag.
CommandsRegistry.registerCommand('_chat.billing.usageBannerSetEnabled', (accessor, enabled: unknown, accountId?: unknown) => {
	accessor.get(IChatBillingBannerService).setEnabled(Boolean(enabled), typeof accountId === 'string' ? accountId : undefined);
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
	when: ContextKeyExpr.and(IsDevelopmentContext, ChatContextKeys.enabled),
});
