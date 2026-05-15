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
 *  - `chat.offlineByok` is enabled and `chat.aiDisabled` is off, and
 *  - the `LanguageModelsService` has at least one resolved, user-selectable non-Copilot model
 *    (signalled by the `chatNonCopilotModelsAreUserSelectable` context key).
 *
 * Verifying the last condition is expensive: it requires activating each BYOK-contributing
 * extension and round-tripping into its provider. To avoid paying that cost just to gate UI,
 * this contribution never triggers such activations itself. The strategy is:
 *
 *  1. On startup, optimistically restore the last persisted answer from
 *     `chat.hasByokModels.lastKnown` so UI surfaces gated by this key are correct on warm
 *     reload before anything else runs.
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
			Event.filter(this._configurationService.onDidChangeConfiguration, e =>
				e.affectsConfiguration(ChatConfiguration.OfflineByok) ||
				e.affectsConfiguration(ChatConfiguration.AIDisabled)),
			Event.filter(this._contextKeyService.onDidChangeContext, e => e.affectsSome(HasByokModelsContribution.TRACKED_KEYS)),
			this._languageModelsConfigurationService.onDidChangeLanguageModelGroups,
		)(() => this._update()));
	}

	private _isFeatureEnabled(): boolean {
		return !this._configurationService.getValue<boolean>(ChatConfiguration.AIDisabled)
			&& !!this._configurationService.getValue<boolean>(ChatConfiguration.OfflineByok)
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

		if (this._contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.nonCopilotLanguageModelsAreUserSelectable.key)) {
			this._setResult(true);
			return;
		}

		if (!this._extensionsRegistered) {
			return;
		}

		const hasByokVendor = this._languageModelsConfigurationService.getLanguageModelsProviderGroups().some(g => g.vendor !== COPILOT_VENDOR_ID);
		if (!hasByokVendor) {
			this._setResult(false);
		}
	}
}
