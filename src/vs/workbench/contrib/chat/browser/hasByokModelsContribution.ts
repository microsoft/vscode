/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKey, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ChatEntitlementContextKeys } from '../../../services/chat/common/chatEntitlementService.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ChatConfiguration } from '../common/constants.js';
import { COPILOT_VENDOR_ID } from '../common/languageModels.js';
import { ILanguageModelsConfigurationService } from '../common/languageModelsConfiguration.js';

/**
 * Owns the `github.copilot.hasByokModels` context key. The key is true iff:
 *  - `github.copilot.clientByokEnabled` is true (set by `ChatEntitlementService` + Copilot extension),
 *  - the user has at least one persisted non-Copilot provider group (read from `chatLanguageModels.json`
 *    via `ILanguageModelsConfigurationService`), and
 *  - the temporary `chat.offlineByok` rollout flag is on.
 *
 * Eager so the key is bound at workbench startup before any sign-in UI surfaces render. Injecting
 * `ILanguageModelsConfigurationService` (itself Delayed) forces it to instantiate eagerly, which loads
 * the persisted JSON so we can compute the signal without needing any provider to be active.
 */
export class HasByokModelsContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.hasByokModels';

	private static readonly _CLIENT_BYOK_ENABLED_KEYS = new Set([ChatEntitlementContextKeys.clientByokEnabled.key]);

	private readonly _hasByokModels: IContextKey<boolean>;

	constructor(
		@ILanguageModelsConfigurationService private readonly _languageModelsConfigurationService: ILanguageModelsConfigurationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		super();

		this._hasByokModels = ChatEntitlementContextKeys.hasByokModels.bindTo(this._contextKeyService);
		this._update();

		this._register(this._languageModelsConfigurationService.onDidChangeLanguageModelGroups(() => this._update()));

		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.OfflineByok)) {
				this._update();
			}
		}));

		this._register(this._contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(HasByokModelsContribution._CLIENT_BYOK_ENABLED_KEYS)) {
				this._update();
			}
		}));
	}

	private _update(): void {
		if (!this._configurationService.getValue<boolean>(ChatConfiguration.OfflineByok)) {
			this._hasByokModels.set(false);
			return;
		}

		if (!this._contextKeyService.getContextKeyValue<boolean>(ChatEntitlementContextKeys.clientByokEnabled.key)) {
			this._hasByokModels.set(false);
			return;
		}

		this._hasByokModels.set(
			this._languageModelsConfigurationService.getLanguageModelsProviderGroups().some(group => group.vendor !== COPILOT_VENDOR_ID)
		);
	}
}
