/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../../base/common/codicons.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import * as nls from '../../../../../../nls.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
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
import { ViewContainer, IViewContainersRegistry, Extensions, ViewContainerLocation, IViewsRegistry, IViewDescriptor, IViewDescriptorService } from '../../../../../common/views.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { IWorkbenchLayoutService } from '../../../../../services/layout/browser/layoutService.js';
import { IChatSessionsService, IChatSessionItemProvider, IChatSessionsExtensionPoint } from '../../../common/chatSessionsService.js';
import { ChatConfiguration, VIEWLET_ID } from '../../../common/constants.js';
import { ACTION_ID_OPEN_CHAT } from '../../actions/chatActions.js';
import { ChatSessionTracker } from '../chatSessionTracker.js';
import { LocalChatSessionsProvider } from '../localChatSessionsProvider.js';
import { SessionsViewPane } from './sessionsViewPane.js';

export class ChatSessionsView extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatSessions';

	private isViewContainerRegistered = false;
	private localProvider: LocalChatSessionsProvider | undefined;
	private readonly sessionTracker: ChatSessionTracker;
	private viewContainer: ViewContainer | undefined;

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IChatEntitlementService private readonly chatEntitlementService: IChatEntitlementService,
	) {
		super();

		this.sessionTracker = this._register(this.instantiationService.createInstance(ChatSessionTracker));
		this.setupEditorTracking();

		// Create and register the local chat sessions provider immediately
		// This ensures it's available even when the view container is not initialized
		this.localProvider = this._register(this.instantiationService.createInstance(LocalChatSessionsProvider));
		this._register(this.chatSessionsService.registerChatSessionItemProvider(this.localProvider));

		// Initial check
		this.updateViewContainerRegistration();

		// Listen for configuration changes
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(ChatConfiguration.AgentSessionsViewLocation)) {
				this.updateViewContainerRegistration();
			}
		}));
		this._register(this.chatEntitlementService.onDidChangeSentiment(e => {
			this.updateViewContainerRegistration();
		}));
	}

	private setupEditorTracking(): void {
		this._register(this.sessionTracker.onDidChangeEditors(e => {
			this.chatSessionsService.notifySessionItemsChanged(e.sessionType);
		}));
	}

	private updateViewContainerRegistration(): void {
		const location = this.configurationService.getValue<string>(ChatConfiguration.AgentSessionsViewLocation);
		const sentiment = this.chatEntitlementService.sentiment;
		if (sentiment.disabled || sentiment.hidden || (location !== 'view' && this.isViewContainerRegistered)) {
			this.deregisterViewContainer();
		} else if (location === 'view' && !this.isViewContainerRegistered) {
			this.registerViewContainer();
		}
	}

	private registerViewContainer(): void {
		if (this.isViewContainerRegistered) {
			return;
		}

		this.viewContainer = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).registerViewContainer(
			{
				id: VIEWLET_ID,
				title: nls.localize2('chat.sessions', "Chat Sessions"),
				ctorDescriptor: new SyncDescriptor(ChatSessionsViewPaneContainer, [this.sessionTracker]),
				hideIfEmpty: false,
				icon: registerIcon('chat-sessions-icon', Codicon.commentDiscussionSparkle, 'Icon for Chat Sessions View'),
				order: 6
			}, ViewContainerLocation.Sidebar);
		this.isViewContainerRegistered = true;
	}

	private deregisterViewContainer(): void {
		if (this.viewContainer) {
			const allViews = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).getViews(this.viewContainer);
			if (allViews.length > 0) {
				Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).deregisterViews(allViews, this.viewContainer);
			}

			Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).deregisterViewContainer(this.viewContainer);
			this.viewContainer = undefined;
			this.isViewContainerRegistered = false;
		}
	}
}

// Chat sessions container
class ChatSessionsViewPaneContainer extends ViewPaneContainer {
	private registeredViewDescriptors: Map<string, IViewDescriptor> = new Map();

	constructor(
		private readonly sessionTracker: ChatSessionTracker,
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
		@IProductService private readonly productService: IProductService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
	) {
		super(
			VIEWLET_ID,
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

		this.updateViewRegistration();

		// Listen for provider changes and register/unregister views accordingly
		this._register(this.chatSessionsService.onDidChangeItemsProviders(() => {
			this.updateViewRegistration();
		}));

		// Listen for session items changes and refresh the appropriate provider tree
		this._register(this.chatSessionsService.onDidChangeSessionItems((chatSessionType) => {
			this.refreshProviderTree(chatSessionType);
		}));

		// Listen for contribution availability changes and update view registration
		this._register(this.chatSessionsService.onDidChangeAvailability(() => {
			this.updateViewRegistration();
		}));
	}

	override getTitle(): string {
		const title = nls.localize('chat.sessions.title', "Chat Sessions");
		return title;
	}

	private getAllChatSessionItemProviders(): IChatSessionItemProvider[] {
		return Array.from(this.chatSessionsService.getAllChatSessionItemProviders());
	}

	private refreshProviderTree(chatSessionType: string): void {
		// Find the provider with the matching chatSessionType
		const providers = this.getAllChatSessionItemProviders();
		const targetProvider = providers.find(provider => provider.chatSessionType === chatSessionType);

		if (targetProvider) {
			// Find the corresponding view and refresh its tree
			const viewId = `${VIEWLET_ID}.${chatSessionType}`;
			const view = this.getView(viewId) as SessionsViewPane | undefined;
			if (view) {
				view.refreshTree();
			}
		}
	}

	private async updateViewRegistration(): Promise<void> {
		// prepare all chat session providers
		const contributions = this.chatSessionsService.getAllChatSessionContributions();
		await Promise.all(contributions.map(contrib => this.chatSessionsService.canResolveItemProvider(contrib.type)));
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
			const container = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).get(VIEWLET_ID);
			if (container) {
				Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).deregisterViews(viewsToUnregister, container);
			}
		}

		// Register new views
		this.registerViews(contributions);
	}

	private async registerViews(extensionPointContributions: IChatSessionsExtensionPoint[]) {
		const container = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).get(VIEWLET_ID);
		const providers = this.getAllChatSessionItemProviders();

		if (container && providers.length > 0) {
			const viewDescriptorsToRegister: IViewDescriptor[] = [];

			// Separate providers by type and prepare display names
			const localProvider = providers.find(p => p.chatSessionType === 'local');
			const historyProvider = providers.find(p => p.chatSessionType === 'history');
			const otherProviders = providers.filter(p => p.chatSessionType !== 'local' && p.chatSessionType !== 'history');

			// Sort other providers alphabetically by display name
			const providersWithDisplayNames = otherProviders.map(provider => {
				const extContribution = extensionPointContributions.find(c => c.type === provider.chatSessionType);
				if (!extContribution) {
					this.logService.warn(`No extension contribution found for chat session type: ${provider.chatSessionType}`);
					return null;
				}
				return {
					provider,
					displayName: extContribution.displayName
				};
			}).filter(item => item !== null) as Array<{ provider: IChatSessionItemProvider; displayName: string }>;

			// Sort alphabetically by display name
			providersWithDisplayNames.sort((a, b) => a.displayName.localeCompare(b.displayName));

			// Register views in priority order: local, history, then alphabetically sorted others
			const orderedProviders = [
				...(localProvider ? [{ provider: localProvider, displayName: 'Local Chat Sessions', baseOrder: 0 }] : []),
				...(historyProvider ? [{ provider: historyProvider, displayName: 'History', baseOrder: 1, when: undefined }] : []),
				...providersWithDisplayNames.map((item, index) => ({
					...item,
					baseOrder: 2 + index, // Start from 2 for other providers
					when: undefined,
				}))
			];

			orderedProviders.forEach(({ provider, displayName, baseOrder, when }) => {
				// Only register if not already registered
				if (!this.registeredViewDescriptors.has(provider.chatSessionType)) {
					const viewDescriptor: IViewDescriptor = {
						id: `${VIEWLET_ID}.${provider.chatSessionType}`,
						name: {
							value: displayName,
							original: displayName,
						},
						ctorDescriptor: new SyncDescriptor(SessionsViewPane, [provider, this.sessionTracker]),
						canToggleVisibility: true,
						canMoveView: true,
						order: baseOrder, // Use computed order based on priority and alphabetical sorting
						when,
					};

					viewDescriptorsToRegister.push(viewDescriptor);
					this.registeredViewDescriptors.set(provider.chatSessionType, viewDescriptor);

					if (provider.chatSessionType === 'local') {
						const viewsRegistry = Registry.as<IViewsRegistry>(Extensions.ViewsRegistry);
						this._register(viewsRegistry.registerViewWelcomeContent(viewDescriptor.id, {
							content: nls.localize('chatSessions.noResults', "No local chat sessions\n[Start a Chat](command:{0})", ACTION_ID_OPEN_CHAT),
						}));
					}
				}
			});

			const gettingStartedViewId = `${VIEWLET_ID}.gettingStarted`;
			if (!this.registeredViewDescriptors.has('gettingStarted')
				&& this.productService.chatSessionRecommendations
				&& this.productService.chatSessionRecommendations.length) {
				const gettingStartedDescriptor: IViewDescriptor = {
					id: gettingStartedViewId,
					name: {
						value: nls.localize('chat.sessions.gettingStarted', "Getting Started"),
						original: 'Getting Started',
					},
					ctorDescriptor: new SyncDescriptor(SessionsViewPane, [null, this.sessionTracker]),
					canToggleVisibility: true,
					canMoveView: true,
					order: 1000,
					collapsed: !!otherProviders.length,
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
			const container = Registry.as<IViewContainersRegistry>(Extensions.ViewContainersRegistry).get(VIEWLET_ID);
			if (container) {
				const allRegisteredViews = Array.from(this.registeredViewDescriptors.values());
				Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).deregisterViews(allRegisteredViews, container);
			}
			this.registeredViewDescriptors.clear();
		}

		super.dispose();
	}
}
