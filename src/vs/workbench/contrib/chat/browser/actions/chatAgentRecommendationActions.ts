/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { TimeoutTimer } from '../../../../../base/common/async.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { localize2 } from '../../../../../nls.js';
import { Action2, MenuId, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { IExtensionGalleryService } from '../../../../../platform/extensionManagement/common/extensionManagement.js';
import { ICommandService, CommandsRegistry } from '../../../../../platform/commands/common/commands.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchExtensionManagementService } from '../../../../services/extensionManagement/common/extensionManagement.js';
import { CHAT_CATEGORY } from './chatActions.js';
import { IChatSessionRecommendation } from '../../../../../base/common/product.js';
import { ExtensionIdentifier } from '../../../../../platform/extensions/common/extensions.js';

const INSTALL_CONTEXT_PREFIX = 'chat.installRecommendationAvailable';

export class ChatAgentRecommendation extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatAgentRecommendation';

	private readonly availabilityContextKeys = new Map<string, IContextKey<boolean>>();
	private refreshRequestId = 0;

	constructor(
		@IProductService private readonly productService: IProductService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IWorkbenchExtensionManagementService private readonly extensionManagementService: IWorkbenchExtensionManagementService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
	) {
		super();

		const recommendations = this.productService.chatSessionRecommendations;
		if (!recommendations?.length || !this.extensionGalleryService.isEnabled()) {
			return;
		}

		for (const recommendation of recommendations) {
			this.registerRecommendation(recommendation);
		}

		this.refreshInstallAvailability();

		const refresh = () => this.refreshInstallAvailability();
		this._register(this.extensionManagementService.onProfileAwareDidInstallExtensions(refresh));
		this._register(this.extensionManagementService.onProfileAwareDidUninstallExtension(refresh));
		this._register(this.extensionManagementService.onDidChangeProfile(refresh));
	}

	private registerRecommendation(recommendation: IChatSessionRecommendation): void {
		const extensionKey = ExtensionIdentifier.toKey(recommendation.extensionId);
		const commandId = `chat.installRecommendation.${extensionKey}`;
		const availabilityContextId = `${INSTALL_CONTEXT_PREFIX}.${extensionKey}`;
		const availabilityContext = new RawContextKey<boolean>(availabilityContextId, false).bindTo(this.contextKeyService);
		this.availabilityContextKeys.set(extensionKey, availabilityContext);

		const title = localize2('chat.installRecommendation', "New {0}", recommendation.displayName);

		this._register(registerAction2(class extends Action2 {
			constructor() {
				super({
					id: commandId,
					title,
					tooltip: recommendation.description,
					f1: false,
					category: CHAT_CATEGORY,
					icon: Codicon.extensions,
					precondition: ContextKeyExpr.equals(availabilityContextId, true),
					menu: [
						{
							id: MenuId.AgentSessionsInstallMenu,
							group: '0_install',
							when: ContextKeyExpr.equals(availabilityContextId, true)
						},
						{
							id: MenuId.AgentSessionsViewTitle,
							group: 'navigation@98',
							when: ContextKeyExpr.equals(availabilityContextId, true)
						},
						{
							id: MenuId.ChatNewMenu,
							group: '4_recommendations',
							when: ContextKeyExpr.equals(availabilityContextId, true)
						}
					]
				});
			}

			override async run(accessor: ServicesAccessor): Promise<void> {
				const commandService = accessor.get(ICommandService);
				const productService = accessor.get(IProductService);

				const installPreReleaseVersion = productService.quality !== 'stable';
				await commandService.executeCommand('workbench.extensions.installExtension', recommendation.extensionId, {
					installPreReleaseVersion
				});

				await runPostInstallCommand(commandService, recommendation.postInstallCommand);
			}
		}));
	}

	private refreshInstallAvailability(): void {
		if (!this.availabilityContextKeys.size) {
			return;
		}

		const currentRequest = ++this.refreshRequestId;
		this.extensionManagementService.getInstalled().then(installedExtensions => {
			if (currentRequest !== this.refreshRequestId) {
				return;
			}

			const installed = new Set(installedExtensions.map(ext => ExtensionIdentifier.toKey(ext.identifier.id)));
			for (const [extensionKey, context] of this.availabilityContextKeys) {
				context.set(!installed.has(extensionKey));
			}
		}, () => {
			if (currentRequest !== this.refreshRequestId) {
				return;
			}

			for (const [, context] of this.availabilityContextKeys) {
				context.set(false);
			}
		});
	}
}

async function runPostInstallCommand(commandService: ICommandService, commandId: string | undefined): Promise<void> {
	if (!commandId) {
		return;
	}

	await waitForCommandRegistration(commandId);

	try {
		await commandService.executeCommand(commandId);
	} catch {
		// Command failed or was cancelled; ignore.
	}
}

function waitForCommandRegistration(commandId: string): Promise<void> {
	if (CommandsRegistry.getCommands().has(commandId)) {
		return Promise.resolve();
	}

	return new Promise<void>(resolve => {
		const timer = new TimeoutTimer();
		const listener = CommandsRegistry.onDidRegisterCommand((id: string) => {
			if (id === commandId) {
				listener.dispose();
				timer.dispose();
				resolve();
			}
		});
		timer.cancelAndSet(() => {
			listener.dispose();
			resolve();
		}, 10_000);
	});
}
