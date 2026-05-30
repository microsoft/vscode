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
 *  1. On startup, optimistically restore the last persisted answer from
 *     `chat.hasByokModels.lastKnown` so UI surfaces gated by this key are correct on warm
 *     reload before anything else runs. If the language-models configuration already contains
 *     non-Copilot provider groups, treat that as a positive signal too so cold starts don't hide
 *     configured BYOK models while extension registration is still settling.
 *  2. Whenever the `chatNonCopilotModelsAreUserSelectable` signal flips on — which happens
 *     naturally when something else resolves a BYOK vendor (notably `ChatInputPart`, which
 *     activates the previously selected model's vendor when restoring its persisted selection) —
 *     record `true` and persist it.
 *  3. Once extensions are fully scanned, if there are no configured non-Copilot vendors in the
 *     language-models configuration, override a stale optimistic `true` with `false`. Same on
 *     runtime removal of all groups, and when the feature flag flips off.
 *
 * The trade-off is the first-time experience: a brand-new user must pick a BYOK model once
 * before this contribution observes the signal and persists the answer. From then on, the
 * answer survives reloads without any activation cost — users without BYOK pay nothing.
 *
 * Eager so the key is bound at workbench startup before any sign-in UI surfaces render.
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

	private _hasConfiguredByokVendor(): boolean {
		return this._languageModelsConfigurationService.getLanguageModelsProviderGroups().some(g => g.vendor !== COPILOT_VENDOR_ID);
	}

	private _update(): void {
		if (!this._isFeatureEnabled()) {
			this._setResult(false);
			return;
		}

		if (this._contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.nonCopilotLanguageModelsAreUserSelectable.key)) {
			this._setResult(true);
			return;
		}

		if (this._hasConfiguredByokVendor()) {
			this._setResult(true);
			return;
		}

		if (!this._extensionsRegistered) {
			return;
		}

		this._setResult(false);
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
