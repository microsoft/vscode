/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { ILanguageModelsService } from '../../common/languageModels.js';
import { IAuthenticationAccessService } from '../../../../services/authentication/browser/authenticationAccessService.js';
import { localize, localize2 } from '../../../../../nls.js';
import { AllowedExtension, INTERNAL_AUTH_PROVIDER_PREFIX } from '../../../../services/authentication/common/authentication.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IExtensionsWorkbenchService } from '../../../extensions/common/extensions.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../../base/common/themables.js';
import { ChatContextKeys } from '../../common/actions/chatContextKeys.js';

class ManageLanguageModelAuthenticationAction extends Action2 {
	static readonly ID = 'workbench.action.chat.manageLanguageModelAuthentication';

	constructor() {
		super({
			id: ManageLanguageModelAuthenticationAction.ID,
			title: localize2('manageLanguageModelAuthentication', 'Manage Language Model Access...'),
			category: CHAT_CATEGORY,
			precondition: ChatContextKeys.enabled,
			menu: [{
				id: MenuId.AccountsContext,
				order: 100,
			}],
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const quickInputService = accessor.get(IQuickInputService);
		const languageModelsService = accessor.get(ILanguageModelsService);
		const authenticationAccessService = accessor.get(IAuthenticationAccessService);
		const dialogService = accessor.get(IDialogService);
		const extensionService = accessor.get(IExtensionService);
		const extensionsWorkbenchService = accessor.get(IExtensionsWorkbenchService);
		const productService = accessor.get(IProductService);

		// Get all registered language models
		const modelIds = languageModelsService.getLanguageModelIds();

		// Group models by owning extension and collect all allowed extensions
		const extensionAuth = new Map<string, AllowedExtension[]>();

		const ownerToAccountLabel = new Map<string, string>();
		for (const modelId of modelIds) {
			const model = languageModelsService.lookupLanguageModel(modelId);
			if (!model?.auth) {
				continue; // Skip if model is not found
			}
			const ownerId = model.extension.value;
			if (extensionAuth.has(ownerId)) {
				// If the owner already exists, just continue
				continue;
			}

			// Get allowed extensions for this model's auth provider
			try {
				// Use providerLabel as the providerId and accountLabel (or default)
				const providerId = INTERNAL_AUTH_PROVIDER_PREFIX + ownerId;
				const accountLabel = model.auth.accountLabel || 'Language Models';
				ownerToAccountLabel.set(ownerId, accountLabel);
				const allowedExtensions = authenticationAccessService.readAllowedExtensions(
					providerId,
					accountLabel
				).filter(ext => !ext.trusted); // Filter out trusted extensions because those should not be modified

				if (productService.trustedExtensionAuthAccess && !Array.isArray(productService.trustedExtensionAuthAccess)) {
					const trustedExtensions = productService.trustedExtensionAuthAccess[providerId];
					// If the provider is trusted, add all trusted extensions to the allowed list
					for (const ext of trustedExtensions) {
						const index = allowedExtensions.findIndex(a => a.id === ext);
						if (index !== -1) {
							allowedExtensions.splice(index, 1);
						}
						const extension = await extensionService.getExtension(ext);
						if (!extension) {
							continue; // Skip if the extension is not found
						}
						allowedExtensions.push({
							id: ext,
							name: extension.displayName || extension.name,
							allowed: true, // Assume trusted extensions are allowed by default
							trusted: true // Mark as trusted
						});
					}
				}

				// Only grab extensions that are gettable from the extension service
				const filteredExtensions = new Array<AllowedExtension>();
				for (const ext of allowedExtensions) {
					if (await extensionService.getExtension(ext.id)) {
						filteredExtensions.push(ext);
					}
				}

				extensionAuth.set(ownerId, filteredExtensions);
				// Add all allowed extensions to the set for this owner
			} catch (error) {
				// Handle error by ensuring the owner is in the map
				if (!extensionAuth.has(ownerId)) {
					extensionAuth.set(ownerId, []);
				}
			}
		}

		if (extensionAuth.size === 0) {
			dialogService.prompt({
				type: 'info',
				message: localize('noLanguageModels', 'No language models requiring authentication found.'),
				detail: localize('noLanguageModelsDetail', 'There are currently no language models that require authentication.')
			});
			return;
		}

		const items: QuickPickInput<IQuickPickItem & { extension?: AllowedExtension; ownerId?: string }>[] = [];
		// Create QuickPick items grouped by owner extension
		for (const [ownerId, allowedExtensions] of extensionAuth) {
			const extension = await extensionService.getExtension(ownerId);
			if (!extension) {
				// If the extension is not found, skip it
				continue;
			}
			// Add separator for the owning extension
			items.push({
				type: 'separator',
				id: ownerId,
				label: localize('extensionOwner', '{0}', extension.displayName || extension.name),
				buttons: [{
					iconClass: ThemeIcon.asClassName(Codicon.info),
					tooltip: localize('openExtension', 'Open Extension'),
				}]
			});

			// Add allowed extensions as checkboxes (visual representation)
			let addedTrustedSeparator = false;
			if (allowedExtensions.length > 0) {
				for (const allowedExt of allowedExtensions) {
					if (allowedExt.trusted && !addedTrustedSeparator) {
						items.push({
							type: 'separator',
							label: localize('trustedExtension', 'Trusted by Microsoft'),
						});
						addedTrustedSeparator = true;
					}
					items.push({
						label: allowedExt.name,
						ownerId,
						id: allowedExt.id,
						picked: allowedExt.allowed ?? false,
						extension: allowedExt,
						disabled: allowedExt.trusted, // Don't allow toggling trusted extensions
						buttons: [{
							iconClass: ThemeIcon.asClassName(Codicon.info),
							tooltip: localize('openExtension', 'Open Extension'),
						}]
					});
				}
			} else {
				items.push({
					label: localize('noAllowedExtensions', 'No extensions have access'),
					description: localize('noAccessDescription', 'No extensions are currently allowed to use models from {0}', ownerId),
					pickable: false
				});
			}
		}

		// Show the QuickPick
		const result = await quickInputService.pick(
			items,
			{
				canPickMany: true,
				sortByLabel: true,
				onDidTriggerSeparatorButton(context) {
					// Handle separator button clicks
					const extId = context.separator.id;
					if (extId) {
						// Open the extension in the editor
						void extensionsWorkbenchService.open(extId);
					}
				},
				onDidTriggerItemButton(context) {
					// Handle item button clicks
					const extId = context.item.id;
					if (extId) {
						// Open the extension in the editor
						void extensionsWorkbenchService.open(extId);
					}
				},
				title: localize('languageModelAuthTitle', 'Manage Language Model Access'),
				placeHolder: localize('languageModelAuthPlaceholder', 'Choose which extensions can access language models'),
			}
		);
		if (!result) {
			return;
		}

		for (const [ownerId, allowedExtensions] of extensionAuth) {
			// diff with result to find out which extensions are allowed or not
			// but we need to only look at the result items that have the ownerId
			const allowedSet = new Set(result
				.filter(item => item.ownerId === ownerId)
				// only save items that are not trusted automatically
				.filter(item => !item.extension?.trusted)
				.map(item => item.id!));

			for (const allowedExt of allowedExtensions) {
				allowedExt.allowed = allowedSet.has(allowedExt.id);
			}

			authenticationAccessService.updateAllowedExtensions(
				INTERNAL_AUTH_PROVIDER_PREFIX + ownerId,
				ownerToAccountLabel.get(ownerId) || 'Language Models',
				allowedExtensions
			);
		}

	}
}

export function registerLanguageModelActions() {
	registerAction2(ManageLanguageModelAuthenticationAction);
}
