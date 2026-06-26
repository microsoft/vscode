/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import product from '../../../../platform/product/common/product.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { EnablementState, IWorkbenchExtensionEnablementService } from '../../../services/extensionManagement/common/extensionManagement.js';
import { IExtensionsWorkbenchService } from '../../extensions/common/extensions.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ChatEntitlementContextKeys } from '../../../services/chat/common/chatEntitlementService.js';
import { ChatConfiguration } from '../common/constants.js';

const defaultChatExtensionId = product.defaultChatAgent?.chatExtensionId ?? '';

export interface IEnsureCopilotForByokServices {
	extensionsWorkbenchService: IExtensionsWorkbenchService;
	extensionEnablementService: IWorkbenchExtensionEnablementService;
	configurationService: IConfigurationService;
	logService: ILogService;
}

/**
 * When BYOK models (e.g. DIAL) are available, chat setup is bypassed but the built-in
 * Copilot extension may still be globally disabled on a fresh profile. Enable it so
 * chat participants register without GitHub sign-in.
 */
export async function ensureCopilotEnabledForByok(services: IEnsureCopilotForByokServices): Promise<void> {
	const { extensionsWorkbenchService, extensionEnablementService, configurationService, logService } = services;

	if (!defaultChatExtensionId) {
		return;
	}

	if (configurationService.getValue<boolean>(ChatConfiguration.AIDisabled)) {
		logService.info('[enableCopilotForByok] AI features disabled, enabling for BYOK');
		await configurationService.updateValue(ChatConfiguration.AIDisabled, false);
	}

	await extensionsWorkbenchService.queryLocal();
	const chatExtension = extensionsWorkbenchService.local.find(
		value => ExtensionIdentifier.equals(value.identifier.id, defaultChatExtensionId)
	);
	if (!chatExtension?.local) {
		return;
	}

	if (extensionEnablementService.isEnabled(chatExtension.local)) {
		return;
	}

	if (!extensionEnablementService.canChangeEnablement(chatExtension.local)) {
		logService.warn('[enableCopilotForByok] Cannot change enablement for built-in chat extension');
		return;
	}

	logService.info('[enableCopilotForByok] Enabling built-in chat extension for BYOK');
	await extensionsWorkbenchService.setEnablement([chatExtension], EnablementState.EnabledGlobally);
	await extensionsWorkbenchService.updateRunningExtensions(localize('restartExtensionHost.reason.enableByok', "Enabling AI features for BYOK models"));
}

export function ensureCopilotEnabledForByokFromAccessor(accessor: ServicesAccessor): Promise<void> {
	return ensureCopilotEnabledForByok({
		extensionsWorkbenchService: accessor.get(IExtensionsWorkbenchService),
		extensionEnablementService: accessor.get(IWorkbenchExtensionEnablementService),
		configurationService: accessor.get(IConfigurationService),
		logService: accessor.get(ILogService),
	});
}

export class EnableCopilotForByokContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.enableCopilotForByok';

	private static readonly TRACKED_KEYS = new Set([
		ChatEntitlementContextKeys.hasByokModels.key,
	]);

	private _ensurePromise: Promise<void> | undefined;

	constructor(
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IExtensionsWorkbenchService private readonly _extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IWorkbenchExtensionEnablementService private readonly _extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(Event.filter(
			this._contextKeyService.onDidChangeContext,
			e => e.affectsSome(EnableCopilotForByokContribution.TRACKED_KEYS)
		)(() => this._onHasByokModelsChanged()));

		this._onHasByokModelsChanged();
	}

	private _onHasByokModelsChanged(): void {
		if (this._contextKeyService.getContextKeyValue<boolean>(ChatEntitlementContextKeys.hasByokModels.key) !== true) {
			return;
		}

		if (!this._ensurePromise) {
			this._ensurePromise = ensureCopilotEnabledForByok({
				extensionsWorkbenchService: this._extensionsWorkbenchService,
				extensionEnablementService: this._extensionEnablementService,
				configurationService: this._configurationService,
				logService: this._logService,
			}).finally(() => {
				this._ensurePromise = undefined;
			});
		}
	}
}
