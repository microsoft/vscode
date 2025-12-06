/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import * as nls from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../../../platform/contextview/browser/contextView.js';
import { SyncDescriptor } from '../../../../../../platform/instantiation/common/descriptors.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { registerIcon } from '../../../../../../platform/theme/common/iconRegistry.js';
import { IThemeService } from '../../../../../../platform/theme/common/themeService.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { ViewPaneContainer } from '../../../../../browser/parts/views/viewPaneContainer.js';
import { IWorkbenchContribution } from '../../../../../common/contributions.js';
import { Extensions, IViewContainersRegistry, IViewDescriptor, IViewDescriptorService, IViewsRegistry, ViewContainerLocation } from '../../../../../common/views.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { IWorkbenchLayoutService } from '../../../../../services/layout/browser/layoutService.js';
import { ChatContextKeyExprs } from '../../../common/chatContextKeys.js';
import { IChatSessionItemProvider, IChatSessionsExtensionPoint, IChatSessionsService, localChatSessionType } from '../../../common/chatSessionsService.js';
import { LEGACY_AGENT_SESSIONS_VIEW_ID } from '../../../common/constants.js';
import { ACTION_ID_OPEN_CHAT } from '../../actions/chatActions.js';
import { SessionsViewPane } from './sessionsViewPane.js';

export class ChatSessionsView extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatSessionsView';
	constructor() {
		super();
		this.registerViewContainer();
	}
	private registerViewContainer(): void {
		Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).registerViewContainer(
			{
				id: LEGACY_AGENT_SESSIONS_VIEW_ID,
				title: nls.localize2('chat.agent.sessions', "Agent Sessions"),
				ctorDescriptor: new SyncDescriptor(ChatSessionsViewPaneContainer),
				hideIfEmpty: true,
				icon: registerIcon('chat-sessions-icon', Codicon.commentDiscussionSparkle, 'Icon for Agent Sessions View'),
				order: 6
			}, ViewContainerLocation.Sidebar);
	}

}

export class ChatSessionsViewContrib extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatSessions';
	private readonly registeredViewDescriptors: Map<string, IViewDescriptor> = new Map();

	constructor(
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@ILogService private readonly logService: ILogService,
		@IProductService private readonly productService: IProductService,
	) {
		super();

		// Initial check
		void this.updateViewRegistration();

		this._register(this.chatSessionsService.onDidChangeItemsProviders(() => {
			void this.updateViewRegistration();
		}));

		this._register(this.chatSessionsService.onDidChangeAvailability(() => {
			void this.updateViewRegistration();
		}));
	}

	private getAllChatSessionItemProviders(): IChatSessionItemProvider[] {
		return Array.from(this.chatSessionsService.getAllChatSessionItemProviders());
	}

	private async updateViewRegistration(): Promise<void> {
		// prepare all chat session providers
		const contributions = this.chatSessionsService.getAllChatSessionContributions();
		await Promise.all(contributions.map(contrib => this.chatSessionsService.activateChatSessionItemProvider(contrib.type)));
		const currentProviders = this.getAllChatSessionItemProviders();
		const currentProviderIds = new Set(currentProviders.map(p => p.chatSessionType));

		// Find views that need to be unregistered (providers that are no longer available)
		const viewsToUnregister: IViewDescriptor[] = [];
		for (const [providerId, viewDescriptor] of this.registeredViewDescriptors.entries()) {
			if (!currentProviderIds.has(providerId)) {
				viewsToUnregister.push(viewDescriptor);
				this.registeredViewDescriptors.delete(providerId);
			}
		}

		// Unregister removed views
		if (viewsToUnregister.length > 0) {
			const container = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).get(LEGACY_AGENT_SESSIONS_VIEW_ID);
			if (container) {
				Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).deregisterViews(viewsToUnregister, container);
			}
		}

		// Register new views
		this.registerViews(contributions);
	}

	private async registerViews(extensionPointContributions: IChatSessionsExtensionPoint[]) {
		const container = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).get(LEGACY_AGENT_SESSIONS_VIEW_ID);
		const providers = this.getAllChatSessionItemProviders();

		if (container && providers.length > 0) {
			const viewDescriptorsToRegister: IViewDescriptor[] = [];

			// Separate providers by type and prepare display names with order
			const localProvider = providers.find(p => p.chatSessionType === localChatSessionType);
			const historyProvider = providers.find(p => p.chatSessionType === 'history');
			const otherProviders = providers.filter(p => p.chatSessionType !== localChatSessionType && p.chatSessionType !== 'history');

			// Sort other providers by order, then alphabetically by display name
			const providersWithDisplayNames = otherProviders.map(provider => {
				const extContribution = extensionPointContributions.find(c => c.type === provider.chatSessionType);
				if (!extContribution) {
					this.logService.warn(`No extension contribution found for chat session type: ${provider.chatSessionType}`);
					return null;
				}
				return {
					provider,
					displayName: extContribution.displayName,
					order: extContribution.order
				};
			}).filter(item => item !== null) as Array<{ provider: IChatSessionItemProvider; displayName: string; order: number | undefined }>;

			providersWithDisplayNames.sort((a, b) => {
				// Both have no order - sort by display name
				if (a.order === undefined && b.order === undefined) {
					return a.displayName.localeCompare(b.displayName);
				}

				// Only a has no order - push it to the end
				if (a.order === undefined) {
					return 1;
				}

				// Only b has no order - push it to the end
				if (b.order === undefined) {
					return -1;
				}

				// Both have orders - compare numerically
				const orderCompare = a.order - b.order;
				if (orderCompare !== 0) {
					return orderCompare;
				}

				// Same order - sort by display name
				return a.displayName.localeCompare(b.displayName);
			});

			// Register views in priority order: local, history, then alphabetically sorted others
			const orderedProviders = [
				...(localProvider ? [{ provider: localProvider, displayName: 'Local Chat Agent', baseOrder: 0, when: ChatContextKeyExprs.agentViewWhen }] : []),
				...(historyProvider ? [{ provider: historyProvider, displayName: 'History', baseOrder: 1, when: ChatContextKeyExprs.agentViewWhen }] : []),
				...providersWithDisplayNames.map((item, index) => ({
					...item,
					baseOrder: 2 + index, // Start from 2 for other providers
					when: ChatContextKeyExprs.agentViewWhen,
				}))
			];

			orderedProviders.forEach(({ provider, displayName, baseOrder, when }) => {
				// Only register if not already registered
				if (!this.registeredViewDescriptors.has(provider.chatSessionType)) {
					const viewId = `${LEGACY_AGENT_SESSIONS_VIEW_ID}.${provider.chatSessionType}`;
					const viewDescriptor: IViewDescriptor = {
						id: viewId,
						name: {
							value: displayName,
							original: displayName,
						},
						ctorDescriptor: new SyncDescriptor(SessionsViewPane, [provider, viewId]),
						canToggleVisibility: true,
						canMoveView: true,
						order: baseOrder, // Use computed order based on priority and alphabetical sorting
						when,
					};

					viewDescriptorsToRegister.push(viewDescriptor);
					this.registeredViewDescriptors.set(provider.chatSessionType, viewDescriptor);

					if (provider.chatSessionType === localChatSessionType) {
						const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
						this._register(viewsRegistry.registerViewWelcomeContent(viewDescriptor.id, {
							content: nls.localize('chatSessions.noResults', "No local chat agent sessions\n[Start an Agent Session](command:{0})", ACTION_ID_OPEN_CHAT),
						}));
					}
				}
			});

			const gettingStartedViewId = `${LEGACY_AGENT_SESSIONS_VIEW_ID}.gettingStarted`;
			if (!this.registeredViewDescriptors.has('gettingStarted')
				&& this.productService.chatSessionRecommendations?.length) {
				const gettingStartedDescriptor: IViewDescriptor = {
					id: gettingStartedViewId,
					name: {
						value: nls.localize('chat.sessions.gettingStarted', "Getting Started"),
						original: 'Getting Started',
					},
					ctorDescriptor: new SyncDescriptor(SessionsViewPane, [null, gettingStartedViewId]),
					canToggleVisibility: true,
					canMoveView: true,
					order: 1000,
					collapsed: !!otherProviders.length,
					when: ContextKeyExpr.false()
				};
				viewDescriptorsToRegister.push(gettingStartedDescriptor);
				this.registeredViewDescriptors.set('gettingStarted', gettingStartedDescriptor);
			}

			if (viewDescriptorsToRegister.length > 0) {
				Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).registerViews(viewDescriptorsToRegister, container);
			}
		}
	}

	override dispose(): void {
		// Unregister all views before disposal
		if (this.registeredViewDescriptors.size > 0) {
			const container = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).get(LEGACY_AGENT_SESSIONS_VIEW_ID);
			if (container) {
				const allRegisteredViews = Array.from(this.registeredViewDescriptors.values());
				Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).deregisterViews(allRegisteredViews, container);
			}
			this.registeredViewDescriptors.clear();
		}

		super.dispose();
	}
}

// Chat sessions container
class ChatSessionsViewPaneContainer extends ViewPaneContainer {
	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IExtensionService extensionService: IExtensionService,
		@IThemeService themeService: IThemeService,
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@ILogService logService: ILogService,
	) {
		super(
			LEGACY_AGENT_SESSIONS_VIEW_ID,
			{
				mergeViewWithContainerWhenSingleView: false,
			},
			instantiationService,
			configurationService,
			layoutService,
			contextMenuService,
			telemetryService,
			extensionService,
			themeService,
			storageService,
			contextService,
			viewDescriptorService,
			logService
		);
	}

	override getTitle(): string {
		const title = nls.localize('chat.agent.sessions.title', "Agent Sessions");
		return title;
	}
}
