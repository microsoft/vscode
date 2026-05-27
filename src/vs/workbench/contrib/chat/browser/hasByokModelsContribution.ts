/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ChatEntitlementContextKeys } from '../../../services/chat/common/chatEntitlementService.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { ChatContextKeys } from '../common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../common/constants.js';
import { COPILOT_VENDOR_ID } from '../common/languageModels.js';
import { ILanguageModelsConfigurationService } from '../common/languageModelsConfiguration.js';

/**
 * Owns the `github.copilot.hasByokModels` context key. The key is true iff:
 *  - `github.copilot.clientByokEnabled` is true (set by `ChatEntitlementService` + Copilot extension),
 *  - `chat.aiDisabled` is off, and
 *  - the language-models configuration has at least one non-Copilot vendor group (post extension scan),
 *    or — pre-scan — the `chatNonCopilotModelsAreUserSelectable` signal is on.
 *
 * Strategy (avoids activating BYOK extensions just to gate UI):
 *  1. Restore the last persisted answer so UI surfaces are correct on warm reload.
 *  2. Before extensions register, treat the signal as optimistic — flip true when it does.
 *  3. After extensions register, configured non-Copilot vendor groups are the source of truth.
 *     The signal is ignored here because the model cache can lag behind group removal (e.g. the
 *     Copilot extension's BYOK secret storage still has the API key, so re-resolving returns
 *     stale models), which would otherwise keep the sign-in UI hidden after removal.
 *
 * Eager so the key is bound before any sign-in UI renders.
 */
export class HasByokModelsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.hasByokModels';

	private static readonly STORAGE_KEY_LAST_KNOWN = 'chat.hasByokModels.lastKnown';

	private static readonly TRACKED_KEYS = new Set([
		ChatEntitlementContextKeys.clientByokEnabled.key,
		ChatContextKeys.nonCopilotLanguageModelsAreUserSelectable.key,
	]);

	private readonly _hasByokModels: IContextKey<boolean>;
	private _extensionsRegistered = false;

	constructor(
		@ILanguageModelsConfigurationService private readonly _languageModelsConfigurationService: ILanguageModelsConfigurationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IStorageService private readonly _storageService: IStorageService,
		@IExtensionService extensionService: IExtensionService,
	) {
		super();

		this._hasByokModels = ChatEntitlementContextKeys.hasByokModels.bindTo(this._contextKeyService);

		this._restore();
		this._update();

		extensionService.whenInstalledExtensionsRegistered().then(() => {
			if (!this._store.isDisposed) {
				this._extensionsRegistered = true;
				this._update();
			}
		});

		this._register(Event.any(
			Event.filter(this._configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.AIDisabled)),
			Event.filter(this._contextKeyService.onDidChangeContext, e => e.affectsSome(HasByokModelsContribution.TRACKED_KEYS)),
			this._languageModelsConfigurationService.onDidChangeLanguageModelGroups,
		)(() => this._update()));
	}

	private _isFeatureEnabled(): boolean {
		return !this._configurationService.getValue<boolean>(ChatConfiguration.AIDisabled)
			&& !!this._contextKeyService.getContextKeyValue<boolean>(ChatEntitlementContextKeys.clientByokEnabled.key);
	}

	private _restore(): void {
		if (!this._isFeatureEnabled()) {
			this._hasByokModels.set(false);
			return;
		}
		this._hasByokModels.set(this._storageService.getBoolean(HasByokModelsContribution.STORAGE_KEY_LAST_KNOWN, StorageScope.APPLICATION, false));
	}

	private _setResult(value: boolean): void {
		this._hasByokModels.set(value);
		this._storageService.store(HasByokModelsContribution.STORAGE_KEY_LAST_KNOWN, value, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	private _update(): void {
		if (!this._isFeatureEnabled()) {
			this._setResult(false);
			return;
		}

		if (!this._extensionsRegistered) {
			// Optimistic flip on the signal; otherwise leave the restored value alone.
			if (this._contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.nonCopilotLanguageModelsAreUserSelectable.key)) {
				this._setResult(true);
			}
			return;
		}

		// Post-registration: configured non-Copilot vendor groups are authoritative; the signal
		// can be stale (model cache may lag behind group removal).
		const hasByokVendor = this._languageModelsConfigurationService.getLanguageModelsProviderGroups().some(g => g.vendor !== COPILOT_VENDOR_ID);
		this._setResult(hasByokVendor);
	}
}
