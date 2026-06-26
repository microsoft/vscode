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
import { COPILOT_VENDOR_ID, ILanguageModelsService } from '../common/languageModels.js';
import { ILanguageModelsConfigurationService } from '../common/languageModelsConfiguration.js';

/**
 * Owns the `github.copilot.hasByokModels` context key. The key is true iff:
 *  - `chat.aiDisabled` is off, and
 *  - at least one of:
 *    - a non-Copilot vendor is configured in the language-models config,
 *    - a non-Copilot language model is already resolved (e.g. extension-provided DIAL models),
 *    - the `chatNonCopilotModelsAreUserSelectable` signal is on (pre extension scan only), or
 *    - the last persisted positive answer is restored from storage.
 *
 * Strategy (avoids activating BYOK extensions just to gate UI where possible):
 *  1. Restore the last persisted answer immediately for correct warm-reload UI (even before
 *     `clientByokEnabled` is set by the Copilot extension).
 *  2. Configured non-Copilot vendor groups are a positive signal at any time.
 *  3. Resolved non-Copilot models from extension providers are a positive signal at any time.
 *  4. Pre-registration only, also trust the `chatNonCopilotModelsAreUserSelectable` signal
 *     (post-registration it can be stale — model cache lags behind group removal).
 *  5. Only persist `false` after both extension scan and first config load complete, so startup
 *     latency doesn't clobber a previously-true answer.
 *
 * Eager so the key is bound before any sign-in UI renders.
 */
export class HasByokModelsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.hasByokModels';

	static readonly STORAGE_KEY_LAST_KNOWN = 'chat.hasByokModels.lastKnown';

	private static readonly TRACKED_KEYS = new Set([
		ChatEntitlementContextKeys.clientByokEnabled.key,
		ChatContextKeys.nonCopilotLanguageModelsAreUserSelectable.key,
	]);

	private readonly _hasByokModels: IContextKey<boolean>;
	private _extensionsRegistered = false;
	private _configurationLoaded = false;

	constructor(
		@ILanguageModelsConfigurationService private readonly _languageModelsConfigurationService: ILanguageModelsConfigurationService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
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
				// Resolve extension-contributed models (e.g. DIAL) so we detect BYOK
				// providers that never appear in the static language-models config file.
				void this._languageModelsService.selectLanguageModels({}).finally(() => {
					if (!this._store.isDisposed) {
						this._update();
					}
				});
			}
		});

		this._languageModelsConfigurationService.whenReady.then(() => {
			if (!this._store.isDisposed) {
				this._configurationLoaded = true;
				this._update();
			}
		});

		this._register(Event.any(
			Event.filter(this._configurationService.onDidChangeConfiguration, e => e.affectsConfiguration(ChatConfiguration.AIDisabled)),
			Event.filter(this._contextKeyService.onDidChangeContext, e => e.affectsSome(HasByokModelsContribution.TRACKED_KEYS)),
			this._languageModelsConfigurationService.onDidChangeLanguageModelGroups,
			this._languageModelsService.onDidChangeLanguageModels,
		)(() => this._update()));
	}

	private _isFeatureEnabled(): boolean {
		return !this._configurationService.getValue<boolean>(ChatConfiguration.AIDisabled)
			&& !!this._contextKeyService.getContextKeyValue<boolean>(ChatEntitlementContextKeys.clientByokEnabled.key);
	}

	private _restore(): void {
		if (this._configurationService.getValue<boolean>(ChatConfiguration.AIDisabled)) {
			this._hasByokModels.set(false);
			return;
		}

		const clientByokEnabled = this._contextKeyService.getContextKeyValue<boolean>(ChatEntitlementContextKeys.clientByokEnabled.key);
		if (clientByokEnabled === false) {
			this._hasByokModels.set(false);
			return;
		}

		// Trust the persisted answer immediately so a second window (Agents) can skip
		// Copilot sign-in before extension-contributed models are resolved.
		const lastKnown = this._storageService.getBoolean(HasByokModelsContribution.STORAGE_KEY_LAST_KNOWN, StorageScope.APPLICATION, false);
		if (lastKnown) {
			this._hasByokModels.set(true);
			return;
		}

		this._hasByokModels.set(false);
	}

	private _setResult(value: boolean): void {
		this._hasByokModels.set(value);
		this._storageService.store(HasByokModelsContribution.STORAGE_KEY_LAST_KNOWN, value, StorageScope.APPLICATION, StorageTarget.MACHINE);
	}

	private _hasResolvedNonCopilotModels(): boolean {
		for (const id of this._languageModelsService.getLanguageModelIds()) {
			const model = this._languageModelsService.lookupLanguageModel(id);
			if (model && model.vendor !== COPILOT_VENDOR_ID && model.isUserSelectable !== false) {
				return true;
			}
		}
		return false;
	}

	private _update(): void {
		if (this._configurationService.getValue<boolean>(ChatConfiguration.AIDisabled)) {
			this._setResult(false);
			return;
		}

		if (this._hasResolvedNonCopilotModels()) {
			this._setResult(true);
			return;
		}

		const hasByokVendor = this._languageModelsConfigurationService.getLanguageModelsProviderGroups().some(g => g.vendor !== COPILOT_VENDOR_ID);
		if (hasByokVendor) {
			this._setResult(true);
			return;
		}

		// Pre-registration only: trust the user-selectable signal as an optimistic positive.
		// Post-registration it can be stale (model cache lags behind group removal), so ignore.
		if (!this._extensionsRegistered && this._contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.nonCopilotLanguageModelsAreUserSelectable.key)) {
			this._setResult(true);
			return;
		}

		if (!this._isFeatureEnabled()) {
			// Don't clobber an optimistic restore while waiting for clientByokEnabled.
			return;
		}

		// Defer negative result until startup signals have settled.
		if (this._extensionsRegistered && this._configurationLoaded) {
			this._setResult(false);
		}
	}
}
