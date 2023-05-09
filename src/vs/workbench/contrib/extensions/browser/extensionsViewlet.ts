/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/extensionsViewlet';
import { localize } from 'vs/nls';
import { timeout, Delayer, Promises } from 'vs/base/common/async';
import { isCancellationError } from 'vs/base/common/errors';
import { createErrorWithActions } from 'vs/base/common/errorMessage';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { Event } from 'vs/base/common/event';
import { Action } from 'vs/base/common/actions';
import { append, $, Dimension, hide, show, DragAndDropObserver } from 'vs/base/browser/dom';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IExtensionsWorkbenchService, IExtensionsViewPaneContainer, VIEWLET_ID, CloseExtensionDetailsOnViewChangeKey, INSTALL_EXTENSION_FROM_VSIX_COMMAND_ID, WORKSPACE_RECOMMENDATIONS_VIEW_ID, AutoCheckUpdatesConfigurationKey, OUTDATED_EXTENSIONS_VIEW_ID, CONTEXT_HAS_GALLERY } from '../common/extensions';
import { InstallLocalExtensionsInRemoteAction, InstallRemoteExtensionsInLocalAction } from 'vs/workbench/contrib/extensions/browser/extensionsActions';
import { IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IWorkbenchExtensionEnablementService, IExtensionManagementServerService, IExtensionManagementServer } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ExtensionsInput } from 'vs/workbench/contrib/extensions/common/extensionsInput';
import { ExtensionsListView, EnabledExtensionsView, DisabledExtensionsView, RecommendedExtensionsView, WorkspaceRecommendedExtensionsView, BuiltInFeatureExtensionsView, BuiltInThemesExtensionsView, BuiltInProgrammingLanguageExtensionsView, ServerInstalledExtensionsView, DefaultRecommendedExtensionsView, UntrustedWorkspaceUnsupportedExtensionsView, UntrustedWorkspacePartiallySupportedExtensionsView, VirtualWorkspaceUnsupportedExtensionsView, VirtualWorkspacePartiallySupportedExtensionsView, DefaultPopularExtensionsView, DeprecatedExtensionsView, SearchMarketplaceExtensionsView, RecentlyUpdatedExtensionsView, OutdatedExtensionsView } from 'vs/workbench/contrib/extensions/browser/extensionsViews';
import { IProgressService, ProgressLocation } from 'vs/platform/progress/common/progress';
import { IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import Severity from 'vs/base/common/severity';
import { IActivityService, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IViewsRegistry, IViewDescriptor, Extensions, ViewContainer, IViewDescriptorService, IAddedViewDescriptorRef, ViewContainerLocation } from 'vs/workbench/common/views';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IContextKeyService, ContextKeyExpr, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { ILogService } from 'vs/platform/log/common/log';
import { INotificationService, NotificationPriority } from 'vs/platform/notification/common/notification';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IWorkbenchLayoutService } from 'vs/workbench/services/layout/browser/layoutService';
import { ViewPaneContainer } from 'vs/workbench/browser/parts/views/viewPaneContainer';
import { ViewPane } from 'vs/workbench/browser/parts/views/viewPane';
import { Query } from 'vs/workbench/contrib/extensions/common/extensionQuery';
import { SuggestEnabledInput } from 'vs/workbench/contrib/codeEditor/browser/suggestEnabledInput/suggestEnabledInput';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { ExtensionType } from 'vs/platform/extensions/common/extensions';
import { Registry } from 'vs/platform/registry/common/platform';
import { ILabelService } from 'vs/platform/label/common/label';
import { MementoObject } from 'vs/workbench/common/memento';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { SIDE_BAR_DRAG_AND_DROP_BACKGROUND } from 'vs/workbench/common/theme';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { VirtualWorkspaceContext, WorkbenchStateContext } from 'vs/workbench/common/contextkeys';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { installLocalInRemoteIcon } from 'vs/workbench/contrib/extensions/browser/extensionsIcons';
import { registerAction2, Action2, MenuId } from 'vs/platform/actions/common/actions';
import { IPaneComposite } from 'vs/workbench/common/panecomposite';
import { IPaneCompositePartService } from 'vs/workbench/services/panecomposite/browser/panecomposite';
import { coalesce } from 'vs/base/common/arrays';
import { extractEditorsAndFilesDropData } from 'vs/platform/dnd/browser/dnd';
import { extname } from 'vs/base/common/resources';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ILocalizedString } from 'vs/platform/action/common/action';

export const DefaultViewsContext = new RawContextKey<boolean>('defaultExtensionViews', true);
export const ExtensionsSortByContext = new RawContextKey<string>('extensionsSortByValue', '');
export const SearchMarketplaceExtensionsContext = new RawContextKey<boolean>('searchMarketplaceExtensions', false);
export const SearchHasTextContext = new RawContextKey<boolean>('extensionSearchHasText', false);
const SearchInstalledExtensionsContext = new RawContextKey<boolean>('searchInstalledExtensions', false);
const SearchRecentlyUpdatedExtensionsContext = new RawContextKey<boolean>('searchRecentlyUpdatedExtensions', false);
const SearchExtensionUpdatesContext = new RawContextKey<boolean>('searchExtensionUpdates', false);
const SearchOutdatedExtensionsContext = new RawContextKey<boolean>('searchOutdatedExtensions', false);
const SearchEnabledExtensionsContext = new RawContextKey<boolean>('searchEnabledExtensions', false);
const SearchDisabledExtensionsContext = new RawContextKey<boolean>('searchDisabledExtensions', false);
const HasInstalledExtensionsContext = new RawContextKey<boolean>('hasInstalledExtensions', true);
export const BuiltInExtensionsContext = new RawContextKey<boolean>('builtInExtensions', false);
const SearchBuiltInExtensionsContext = new RawContextKey<boolean>('searchBuiltInExtensions', false);
const SearchUnsupportedWorkspaceExtensionsContext = new RawContextKey<boolean>('searchUnsupportedWorkspaceExtensions', false);
const SearchDeprecatedExtensionsContext = new RawContextKey<boolean>('searchDeprecatedExtensions', false);
export const RecommendedExtensionsContext = new RawContextKey<boolean>('recommendedExtensions', false);
const SortByUpdateDateContext = new RawContextKey<boolean>('sortByUpdateDate', false);

const REMOTE_CATEGORY: ILocalizedString = { value: localize({ key: 'remote', comment: ['Remote as in remote machine'] }, "Remote"), original: 'Remote' };

export class ExtensionsViewletViewsContribution implements IWorkbenchContribution {

	private readonly container: ViewContainer;

	constructor(
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
		@ILabelService private readonly labelService: ILabelService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		this.container = viewDescriptorService.getViewContainerById(VIEWLET_ID)!;
		this.registerViews();
	}

	private registerViews(): void {
		const viewDescriptors: IViewDescriptor[] = [];

		/* Default views */
		viewDescriptors.push(...this.createDefaultExtensionsViewDescriptors());

		/* Search views */
		viewDescriptors.push(...this.createSearchExtensionsViewDescriptors());

		/* Recommendations views */
		viewDescriptors.push(...this.createRecommendedExtensionsViewDescriptors());

		/* Built-in extensions views */
		viewDescriptors.push(...this.createBuiltinExtensionsViewDescriptors());

		/* Trust Required extensions views */
		viewDescriptors.push(...this.createUnsupportedWorkspaceExtensionsViewDescriptors());

		/* Other Local Filtered extensions views */
		viewDescriptors.push(...this.createOtherLocalFilteredExtensionsViewDescriptors());

		Registry.as<IViewsRegistry>(Extensions.ViewsRegistry).registerViews(viewDescriptors, this.container);
	}

	private createDefaultExtensionsViewDescriptors(): IViewDescriptor[] {
		const viewDescriptors: IViewDescriptor[] = [];

		/*
		 * Default installed extensions views - Shows all user installed extensions.
		 */
		const servers: IExtensionManagementServer[] = [];
		if (this.extensionManagementServerService.localExtensionManagementServer) {
			servers.push(this.extensionManagementServerService.localExtensionManagementServer);
		}
		if (this.extensionManagementServerService.remoteExtensionManagementServer) {
			servers.push(this.extensionManagementServerService.remoteExtensionManagementServer);
		}
		if (this.extensionManagementServerService.webExtensionManagementServer) {
			servers.push(this.extensionManagementServerService.webExtensionManagementServer);
		}
		const getViewName = (viewTitle: string, server: IExtensionManagementServer): string => {
			return servers.length > 1 ? `${server.label} - ${viewTitle}` : viewTitle;
		};
		let installedWebExtensionsContextChangeEvent = Event.None;
		if (this.extensionManagementServerService.webExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
			const interestingContextKeys = new Set();
			interestingContextKeys.add('hasInstalledWebExtensions');
			installedWebExtensionsContextChangeEvent = Event.filter(this.contextKeyService.onDidChangeContext, e => e.affectsSome(interestingContextKeys));
		}
		const serverLabelChangeEvent = Event.any(this.labelService.onDidChangeFormatters, installedWebExtensionsContextChangeEvent);
		for (const server of servers) {
			const getInstalledViewName = (): string => getViewName(localize('installed', "Installed"), server);
			const onDidChangeTitle = Event.map<void, string>(serverLabelChangeEvent, () => getInstalledViewName());
			const id = servers.length > 1 ? `workbench.views.extensions.${server.id}.installed` : `workbench.views.extensions.installed`;
			/* Installed extensions view */
			viewDescriptors.push({
				id,
				get name() { return getInstalledViewName(); },
				weight: 100,
				order: 1,
				when: ContextKeyExpr.and(DefaultViewsContext),
				ctorDescriptor: new SyncDescriptor(ServerInstalledExtensionsView, [{ server, flexibleHeight: true, onDidChangeTitle }]),
				/* Installed extensions views shall not be allowed to hidden when there are more than one server */
				canToggleVisibility: servers.length === 1
			});

			if (server === this.extensionManagementServerService.remoteExtensionManagementServer && this.extensionManagementServerService.localExtensionManagementServer) {
				registerAction2(class InstallLocalExtensionsInRemoteAction2 extends Action2 {
					constructor() {
						super({
							id: 'workbench.extensions.installLocalExtensions',
							get title() {
								return {
									value: localize('select and install local extensions', "Install Local Extensions in '{0}'...", server.label),
									original: `Install Local Extensions in '${server.label}'...`,
								};
							},
							category: REMOTE_CATEGORY,
							icon: installLocalInRemoteIcon,
							f1: true,
							menu: {
								id: MenuId.ViewTitle,
								when: ContextKeyExpr.equals('view', id),
								group: 'navigation',
							}
						});
					}
					run(accessor: ServicesAccessor): Promise<void> {
						return accessor.get(IInstantiationService).createInstance(InstallLocalExtensionsInRemoteAction).run();
					}
				});
			}
		}

		if (this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
			registerAction2(class InstallRemoteExtensionsInLocalAction2 extends Action2 {
				constructor() {
					super({
						id: 'workbench.extensions.actions.installLocalExtensionsInRemote',
						title: { value: localize('install remote in local', "Install Remote Extensions Locally..."), original: 'Install Remote Extensions Locally...' },
						category: REMOTE_CATEGORY,
						f1: true
					});
				}
				run(accessor: ServicesAccessor): Promise<void> {
					return accessor.get(IInstantiationService).createInstance(InstallRemoteExtensionsInLocalAction, 'workbench.extensions.actions.installLocalExtensionsInRemote').run();
				}
			});
		}

		/*
		 * Default popular extensions view
		 * Separate view for popular extensions required as we need to show popular and recommended sections
		 * in the default view when there is no search text, and user has no installed extensions.
		 */
		viewDescriptors.push({
			id: 'workbench.views.extensions.popular',
			name: localize('popularExtensions', "Popular"),
			ctorDescriptor: new SyncDescriptor(DefaultPopularExtensionsView, [{ hideBadge: true }]),
			when: ContextKeyExpr.and(DefaultViewsContext, ContextKeyExpr.not('hasInstalledExtensions'), CONTEXT_HAS_GALLERY),
			weight: 60,
			order: 2,
			canToggleVisibility: false
		});

		/*
		 * Default recommended extensions view
		 * When user has installed extensions, this is shown along with the views for enabled & disabled extensions
		 * When user has no installed extensions, this is shown along with the view for popular extensions
		 */
		viewDescriptors.push({
			id: 'extensions.recommendedList',
			name: localize('recommendedExtensions', "Recommended"),
			ctorDescriptor: new SyncDescriptor(DefaultRecommendedExtensionsView, [{ flexibleHeight: true }]),
			when: ContextKeyExpr.and(DefaultViewsContext, SortByUpdateDateContext.negate(), ContextKeyExpr.not('config.extensions.showRecommendationsOnlyOnDemand'), CONTEXT_HAS_GALLERY),
			weight: 40,
			order: 3,
			canToggleVisibility: true
		});

		/* Installed views shall be default in multi server window  */
		if (servers.length === 1) {
			/*
			 * Default enabled extensions view - Shows all user installed enabled extensions.
			 * Hidden by default
			 */
			viewDescriptors.push({
				id: 'workbench.views.extensions.enabled',
				name: localize('enabledExtensions', "Enabled"),
				ctorDescriptor: new SyncDescriptor(EnabledExtensionsView, [{}]),
				when: ContextKeyExpr.and(DefaultViewsContext, ContextKeyExpr.has('hasInstalledExtensions')),
				hideByDefault: true,
				weight: 40,
				order: 4,
				canToggleVisibility: true
			});

			/*
			 * Default disabled extensions view - Shows all disabled extensions.
			 * Hidden by default
			 */
			viewDescriptors.push({
				id: 'workbench.views.extensions.disabled',
				name: localize('disabledExtensions', "Disabled"),
				ctorDescriptor: new SyncDescriptor(DisabledExtensionsView, [{}]),
				when: ContextKeyExpr.and(DefaultViewsContext, ContextKeyExpr.has('hasInstalledExtensions')),
				hideByDefault: true,
				weight: 10,
				order: 5,
				canToggleVisibility: true
			});

		}

		return viewDescriptors;
	}

	private createSearchExtensionsViewDescriptors(): IViewDescriptor[] {
		const viewDescriptors: IViewDescriptor[] = [];

		/*
		 * View used for searching Marketplace
		 */
		viewDescriptors.push({
			id: 'workbench.views.extensions.marketplace',
			name: localize('marketPlace', "Marketplace"),
			ctorDescriptor: new SyncDescriptor(SearchMarketplaceExtensionsView, [{}]),
			when: ContextKeyExpr.and(ContextKeyExpr.has('searchMarketplaceExtensions')),
		});

		/*
		 * View used for searching all installed extensions
		 */
		viewDescriptors.push({
			id: 'workbench.views.extensions.searchInstalled',
			name: localize('installed', "Installed"),
			ctorDescriptor: new SyncDescriptor(ExtensionsListView, [{}]),
			when: ContextKeyExpr.and(ContextKeyExpr.has('searchInstalledExtensions')),
		});

		/*
		 * View used for searching recently updated extensions
		 */
		viewDescriptors.push({
			id: 'workbench.views.extensions.searchRecentlyUpdated',
			name: localize('recently updated', "Recently Updated"),
			ctorDescriptor: new SyncDescriptor(RecentlyUpdatedExtensionsView, [{}]),
			when: ContextKeyExpr.or(SearchExtensionUpdatesContext, ContextKeyExpr.has('searchRecentlyUpdatedExtensions')),
			order: 2,
		});

		/*
		 * View used for searching enabled extensions
		 */
		viewDescriptors.push({
			id: 'workbench.views.extensions.searchEnabled',
			name: localize('enabled', "Enabled"),
			ctorDescriptor: new SyncDescriptor(ExtensionsListView, [{}]),
			when: ContextKeyExpr.and(ContextKeyExpr.has('searchEnabledExtensions')),
		});

		/*
		 * View used for searching disabled extensions
		 */
		viewDescriptors.push({
			id: 'workbench.views.extensions.searchDisabled',
			name: localize('disabled', "Disabled"),
			ctorDescriptor: new SyncDescriptor(ExtensionsListView, [{}]),
			when: ContextKeyExpr.and(ContextKeyExpr.has('searchDisabledExtensions')),
		});

		/*
		 * View used for searching outdated extensions
		 */
		viewDescriptors.push({
			id: OUTDATED_EXTENSIONS_VIEW_ID,
			name: localize('availableUpdates', "Available Updates"),
			ctorDescriptor: new SyncDescriptor(OutdatedExtensionsView, [{}]),
			when: ContextKeyExpr.or(SearchExtensionUpdatesContext, ContextKeyExpr.has('searchOutdatedExtensions')),
			order: 1,
		});

		/*
		 * View used for searching builtin extensions
		 */
		viewDescriptors.push({
			id: 'workbench.views.extensions.searchBuiltin',
			name: localize('builtin', "Builtin"),
			ctorDescriptor: new SyncDescriptor(ExtensionsListView, [{}]),
			when: ContextKeyExpr.and(ContextKeyExpr.has('searchBuiltInExtensions')),
		});

		/*
		 * View used for searching workspace unsupported extensions
		 */
		viewDescriptors.push({
			id: 'workbench.views.extensions.searchWorkspaceUnsupported',
			name: localize('workspaceUnsupported', "Workspace Unsupported"),
			ctorDescriptor: new SyncDescriptor(ExtensionsListView, [{}]),
			when: ContextKeyExpr.and(ContextKeyExpr.has('searchWorkspaceUnsupportedExtensions')),
		});

		return viewDescriptors;
	}

	private createRecommendedExtensionsViewDescriptors(): IViewDescriptor[] {
		const viewDescriptors: IViewDescriptor[] = [];

		viewDescriptors.push({
			id: WORKSPACE_RECOMMENDATIONS_VIEW_ID,
			name: localize('workspaceRecommendedExtensions', "Workspace Recommendations"),
			ctorDescriptor: new SyncDescriptor(WorkspaceRecommendedExtensionsView, [{}]),
			when: ContextKeyExpr.and(ContextKeyExpr.has('recommendedExtensions'), WorkbenchStateContext.notEqualsTo('empty')),
			order: 1
		});

		viewDescriptors.push({
			id: 'workbench.views.extensions.otherRecommendations',
			name: localize('otherRecommendedExtensions', "Other Recommendations"),
			ctorDescriptor: new SyncDescriptor(RecommendedExtensionsView, [{}]),
			when: ContextKeyExpr.has('recommendedExtensions'),
			order: 2
		});

		return viewDescriptors;
	}

	private createBuiltinExtensionsViewDescriptors(): IViewDescriptor[] {
		const viewDescriptors: IViewDescriptor[] = [];

		viewDescriptors.push({
			id: 'workbench.views.extensions.builtinFeatureExtensions',
			name: localize('builtinFeatureExtensions', "Features"),
			ctorDescriptor: new SyncDescriptor(BuiltInFeatureExtensionsView, [{}]),
			when: ContextKeyExpr.has('builtInExtensions'),
		});

		viewDescriptors.push({
			id: 'workbench.views.extensions.builtinThemeExtensions',
			name: localize('builtInThemesExtensions', "Themes"),
			ctorDescriptor: new SyncDescriptor(BuiltInThemesExtensionsView, [{}]),
			when: ContextKeyExpr.has('builtInExtensions'),
		});

		viewDescriptors.push({
			id: 'workbench.views.extensions.builtinProgrammingLanguageExtensions',
			name: localize('builtinProgrammingLanguageExtensions', "Programming Languages"),
			ctorDescriptor: new SyncDescriptor(BuiltInProgrammingLanguageExtensionsView, [{}]),
			when: ContextKeyExpr.has('builtInExtensions'),
		});

		return viewDescriptors;
	}

	private createUnsupportedWorkspaceExtensionsViewDescriptors(): IViewDescriptor[] {
		const viewDescriptors: IViewDescriptor[] = [];

		viewDescriptors.push({
			id: 'workbench.views.extensions.untrustedUnsupportedExtensions',
			name: localize('untrustedUnsupportedExtensions', "Disabled in Restricted Mode"),
			ctorDescriptor: new SyncDescriptor(UntrustedWorkspaceUnsupportedExtensionsView, [{}]),
			when: ContextKeyExpr.and(SearchUnsupportedWorkspaceExtensionsContext),
		});

		viewDescriptors.push({
			id: 'workbench.views.extensions.untrustedPartiallySupportedExtensions',
			name: localize('untrustedPartiallySupportedExtensions', "Limited in Restricted Mode"),
			ctorDescriptor: new SyncDescriptor(UntrustedWorkspacePartiallySupportedExtensionsView, [{}]),
			when: ContextKeyExpr.and(SearchUnsupportedWorkspaceExtensionsContext),
		});

		viewDescriptors.push({
			id: 'workbench.views.extensions.virtualUnsupportedExtensions',
			name: localize('virtualUnsupportedExtensions', "Disabled in Virtual Workspaces"),
			ctorDescriptor: new SyncDescriptor(VirtualWorkspaceUnsupportedExtensionsView, [{}]),
			when: ContextKeyExpr.and(VirtualWorkspaceContext, SearchUnsupportedWorkspaceExtensionsContext),
		});

		viewDescriptors.push({
			id: 'workbench.views.extensions.virtualPartiallySupportedExtensions',
			name: localize('virtualPartiallySupportedExtensions', "Limited in Virtual Workspaces"),
			ctorDescriptor: new SyncDescriptor(VirtualWorkspacePartiallySupportedExtensionsView, [{}]),
			when: ContextKeyExpr.and(VirtualWorkspaceContext, SearchUnsupportedWorkspaceExtensionsContext),
		});

		return viewDescriptors;
	}

	private createOtherLocalFilteredExtensionsViewDescriptors(): IViewDescriptor[] {
		const viewDescriptors: IViewDescriptor[] = [];

		viewDescriptors.push({
			id: 'workbench.views.extensions.deprecatedExtensions',
			name: localize('deprecated', "Deprecated"),
			ctorDescriptor: new SyncDescriptor(DeprecatedExtensionsView, [{}]),
			when: ContextKeyExpr.and(SearchDeprecatedExtensionsContext),
		});

		return viewDescriptors;
	}

}

export class ExtensionsViewPaneContainer extends ViewPaneContainer implements IExtensionsViewPaneContainer {

	private defaultViewsContextKey: IContextKey<boolean>;
	private sortByContextKey: IContextKey<string>;
	private searchMarketplaceExtensionsContextKey: IContextKey<boolean>;
	private searchHasTextContextKey: IContextKey<boolean>;
	private sortByUpdateDateContextKey: IContextKey<boolean>;
	private searchInstalledExtensionsContextKey: IContextKey<boolean>;
	private searchRecentlyUpdatedExtensionsContextKey: IContextKey<boolean>;
	private searchExtensionUpdatesContextKey: IContextKey<boolean>;
	private searchOutdatedExtensionsContextKey: IContextKey<boolean>;
	private searchEnabledExtensionsContextKey: IContextKey<boolean>;
	private searchDisabledExtensionsContextKey: IContextKey<boolean>;
	private hasInstalledExtensionsContextKey: IContextKey<boolean>;
	private builtInExtensionsContextKey: IContextKey<boolean>;
	private searchBuiltInExtensionsContextKey: IContextKey<boolean>;
	private searchWorkspaceUnsupportedExtensionsContextKey: IContextKey<boolean>;
	private searchDeprecatedExtensionsContextKey: IContextKey<boolean>;
	private recommendedExtensionsContextKey: IContextKey<boolean>;

	private searchDelayer: Delayer<void>;
	private root: HTMLElement | undefined;
	private searchBox: SuggestEnabledInput | undefined;
	private readonly searchViewletState: MementoObject;

	constructor(
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IProgressService private readonly progressService: IProgressService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
		@INotificationService private readonly notificationService: INotificationService,
		@IPaneCompositePartService private readonly paneCompositeService: IPaneCompositePartService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@ICommandService private readonly commandService: ICommandService
	) {
		super(VIEWLET_ID, { mergeViewWithContainerWhenSingleView: true }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService);

		this.searchDelayer = new Delayer(500);
		this.defaultViewsContextKey = DefaultViewsContext.bindTo(contextKeyService);
		this.sortByContextKey = ExtensionsSortByContext.bindTo(contextKeyService);
		this.searchMarketplaceExtensionsContextKey = SearchMarketplaceExtensionsContext.bindTo(contextKeyService);
		this.searchHasTextContextKey = SearchHasTextContext.bindTo(contextKeyService);
		this.sortByUpdateDateContextKey = SortByUpdateDateContext.bindTo(contextKeyService);
		this.searchInstalledExtensionsContextKey = SearchInstalledExtensionsContext.bindTo(contextKeyService);
		this.searchRecentlyUpdatedExtensionsContextKey = SearchRecentlyUpdatedExtensionsContext.bindTo(contextKeyService);
		this.searchExtensionUpdatesContextKey = SearchExtensionUpdatesContext.bindTo(contextKeyService);
		this.searchWorkspaceUnsupportedExtensionsContextKey = SearchUnsupportedWorkspaceExtensionsContext.bindTo(contextKeyService);
		this.searchDeprecatedExtensionsContextKey = SearchDeprecatedExtensionsContext.bindTo(contextKeyService);
		this.searchOutdatedExtensionsContextKey = SearchOutdatedExtensionsContext.bindTo(contextKeyService);
		this.searchEnabledExtensionsContextKey = SearchEnabledExtensionsContext.bindTo(contextKeyService);
		this.searchDisabledExtensionsContextKey = SearchDisabledExtensionsContext.bindTo(contextKeyService);
		this.hasInstalledExtensionsContextKey = HasInstalledExtensionsContext.bindTo(contextKeyService);
		this.builtInExtensionsContextKey = BuiltInExtensionsContext.bindTo(contextKeyService);
		this.searchBuiltInExtensionsContextKey = SearchBuiltInExtensionsContext.bindTo(contextKeyService);
		this.recommendedExtensionsContextKey = RecommendedExtensionsContext.bindTo(contextKeyService);
		this._register(this.paneCompositeService.onDidPaneCompositeOpen(e => { if (e.viewContainerLocation === ViewContainerLocation.Sidebar) { this.onViewletOpen(e.composite); } }, this));
		this._register(extensionsWorkbenchService.onReset(() => this.refresh()));
		this.searchViewletState = this.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	get searchValue(): string | undefined {
		return this.searchBox?.getValue();
	}

	override create(parent: HTMLElement): void {
		parent.classList.add('extensions-viewlet');
		this.root = parent;

		const overlay = append(this.root, $('.overlay'));
		const overlayBackgroundColor = this.getColor(SIDE_BAR_DRAG_AND_DROP_BACKGROUND) ?? '';
		overlay.style.backgroundColor = overlayBackgroundColor;
		hide(overlay);

		const header = append(this.root, $('.header'));
		const placeholder = localize('searchExtensions', "Search Extensions in Marketplace");

		const searchValue = this.searchViewletState['query.value'] ? this.searchViewletState['query.value'] : '';

		this.searchBox = this._register(this.instantiationService.createInstance(SuggestEnabledInput, `${VIEWLET_ID}.searchbox`, header, {
			triggerCharacters: ['@'],
			sortKey: (item: string) => {
				if (item.indexOf(':') === -1) { return 'a'; }
				else if (/ext:/.test(item) || /id:/.test(item) || /tag:/.test(item)) { return 'b'; }
				else if (/sort:/.test(item)) { return 'c'; }
				else { return 'd'; }
			},
			provideResults: (query: string) => Query.suggestions(query)
		}, placeholder, 'extensions:searchinput', { placeholderText: placeholder, value: searchValue }));

		this.updateInstalledExtensionsContexts();
		if (this.searchBox.getValue()) {
			this.triggerSearch();
		}

		this._register(this.searchBox.onInputDidChange(() => {
			this.sortByContextKey.set(Query.parse(this.searchBox!.getValue() || '').sortBy);
			this.triggerSearch();
		}, this));

		this._register(this.searchBox.onShouldFocusResults(() => this.focusListView(), this));

		// Register DragAndDrop support
		this._register(new DragAndDropObserver(this.root, {
			onDragEnd: (e: DragEvent) => undefined,
			onDragEnter: (e: DragEvent) => {
				if (this.isSupportedDragElement(e)) {
					show(overlay);
				}
			},
			onDragLeave: (e: DragEvent) => {
				if (this.isSupportedDragElement(e)) {
					hide(overlay);
				}
			},
			onDragOver: (e: DragEvent) => {
				if (this.isSupportedDragElement(e)) {
					e.dataTransfer!.dropEffect = 'copy';
				}
			},
			onDrop: async (e: DragEvent) => {
				if (this.isSupportedDragElement(e)) {
					hide(overlay);

					const vsixs = coalesce((await this.instantiationService.invokeFunction(accessor => extractEditorsAndFilesDropData(accessor, e)))
						.map(editor => editor.resource && extname(editor.resource) === '.vsix' ? editor.resource : undefined));

					if (vsixs.length > 0) {
						try {
							// Attempt to install the extension(s)
							await this.commandService.executeCommand(INSTALL_EXTENSION_FROM_VSIX_COMMAND_ID, vsixs);
						}
						catch (err) {
							this.notificationService.error(err);
						}
					}
				}
			}
		}));

		super.create(append(this.root, $('.extensions')));
	}

	override focus(): void {
		this.searchBox?.focus();
	}

	override layout(dimension: Dimension): void {
		if (this.root) {
			this.root.classList.toggle('narrow', dimension.width <= 250);
			this.root.classList.toggle('mini', dimension.width <= 200);
		}
		this.searchBox?.layout(new Dimension(dimension.width - 34 - /*padding*/8, 20));
		super.layout(new Dimension(dimension.width, dimension.height - 41));
	}

	override getOptimalWidth(): number {
		return 400;
	}

	search(value: string): void {
		if (this.searchBox && this.searchBox.getValue() !== value) {
			this.searchBox.setValue(value);
		}
	}

	async refresh(): Promise<void> {
		await this.updateInstalledExtensionsContexts();
		this.doSearch(true);
		if (this.configurationService.getValue(AutoCheckUpdatesConfigurationKey)) {
			this.extensionsWorkbenchService.checkForUpdates();
		}
	}

	private async updateInstalledExtensionsContexts(): Promise<void> {
		const result = await this.extensionsWorkbenchService.queryLocal();
		this.hasInstalledExtensionsContextKey.set(result.some(r => !r.isBuiltin));
	}

	private triggerSearch(): void {
		this.searchDelayer.trigger(() => this.doSearch(), this.searchBox && this.searchBox.getValue() ? 500 : 0).then(undefined, err => this.onError(err));
	}

	private normalizedQuery(): string {
		return this.searchBox
			? this.searchBox.getValue()
				.trim()
				.replace(/@category/g, 'category')
				.replace(/@tag:/g, 'tag:')
				.replace(/@ext:/g, 'ext:')
				.replace(/@featured/g, 'featured')
				.replace(/@popular/g, this.extensionManagementServerService.webExtensionManagementServer && !this.extensionManagementServerService.localExtensionManagementServer && !this.extensionManagementServerService.remoteExtensionManagementServer ? '@web' : '@popular')
			: '';
	}

	protected override saveState(): void {
		const value = this.searchBox ? this.searchBox.getValue() : '';
		if (ExtensionsListView.isLocalExtensionsQuery(value)) {
			this.searchViewletState['query.value'] = value;
		} else {
			this.searchViewletState['query.value'] = '';
		}
		super.saveState();
	}

	private doSearch(refresh?: boolean): Promise<void> {
		const value = this.normalizedQuery();
		this.contextKeyService.bufferChangeEvents(() => {
			const isRecommendedExtensionsQuery = ExtensionsListView.isRecommendedExtensionsQuery(value);
			this.searchHasTextContextKey.set(value.trim() !== '');
			this.searchInstalledExtensionsContextKey.set(ExtensionsListView.isInstalledExtensionsQuery(value));
			this.searchRecentlyUpdatedExtensionsContextKey.set(ExtensionsListView.isSearchRecentlyUpdatedQuery(value) && !ExtensionsListView.isSearchExtensionUpdatesQuery(value));
			this.searchOutdatedExtensionsContextKey.set(ExtensionsListView.isOutdatedExtensionsQuery(value) && !ExtensionsListView.isSearchExtensionUpdatesQuery(value));
			this.searchExtensionUpdatesContextKey.set(ExtensionsListView.isSearchExtensionUpdatesQuery(value));
			this.searchEnabledExtensionsContextKey.set(ExtensionsListView.isEnabledExtensionsQuery(value));
			this.searchDisabledExtensionsContextKey.set(ExtensionsListView.isDisabledExtensionsQuery(value));
			this.searchBuiltInExtensionsContextKey.set(ExtensionsListView.isSearchBuiltInExtensionsQuery(value));
			this.searchWorkspaceUnsupportedExtensionsContextKey.set(ExtensionsListView.isSearchWorkspaceUnsupportedExtensionsQuery(value));
			this.searchDeprecatedExtensionsContextKey.set(ExtensionsListView.isSearchDeprecatedExtensionsQuery(value));
			this.builtInExtensionsContextKey.set(ExtensionsListView.isBuiltInExtensionsQuery(value));
			this.recommendedExtensionsContextKey.set(isRecommendedExtensionsQuery);
			this.searchMarketplaceExtensionsContextKey.set(!!value && !ExtensionsListView.isLocalExtensionsQuery(value) && !isRecommendedExtensionsQuery);
			this.sortByUpdateDateContextKey.set(ExtensionsListView.isSortUpdateDateQuery(value));
			this.defaultViewsContextKey.set(!value || ExtensionsListView.isSortInstalledExtensionsQuery(value));
		});

		return this.progress(Promise.all(this.panes.map(view =>
			(<ExtensionsListView>view).show(this.normalizedQuery(), refresh)
				.then(model => this.alertSearchResult(model.length, view.id))
		))).then(() => undefined);
	}

	protected override onDidAddViewDescriptors(added: IAddedViewDescriptorRef[]): ViewPane[] {
		const addedViews = super.onDidAddViewDescriptors(added);
		this.progress(Promise.all(addedViews.map(addedView =>
			(<ExtensionsListView>addedView).show(this.normalizedQuery())
				.then(model => this.alertSearchResult(model.length, addedView.id))
		)));
		return addedViews;
	}

	private alertSearchResult(count: number, viewId: string): void {
		const view = this.viewContainerModel.visibleViewDescriptors.find(view => view.id === viewId);
		switch (count) {
			case 0:
				break;
			case 1:
				if (view) {
					alert(localize('extensionFoundInSection', "1 extension found in the {0} section.", view.name));
				} else {
					alert(localize('extensionFound', "1 extension found."));
				}
				break;
			default:
				if (view) {
					alert(localize('extensionsFoundInSection', "{0} extensions found in the {1} section.", count, view.name));
				} else {
					alert(localize('extensionsFound', "{0} extensions found.", count));
				}
				break;
		}
	}

	private count(): number {
		return this.panes.reduce((count, view) => (<ExtensionsListView>view).count() + count, 0);
	}

	private focusListView(): void {
		if (this.count() > 0) {
			this.panes[0].focus();
		}
	}

	private onViewletOpen(viewlet: IPaneComposite): void {
		if (!viewlet || viewlet.getId() === VIEWLET_ID) {
			return;
		}

		if (this.configurationService.getValue<boolean>(CloseExtensionDetailsOnViewChangeKey)) {
			const promises = this.editorGroupService.groups.map(group => {
				const editors = group.editors.filter(input => input instanceof ExtensionsInput);

				return group.closeEditors(editors);
			});

			Promise.all(promises);
		}
	}

	private progress<T>(promise: Promise<T>): Promise<T> {
		return this.progressService.withProgress({ location: ProgressLocation.Extensions }, () => promise);
	}

	private onError(err: Error): void {
		if (isCancellationError(err)) {
			return;
		}

		const message = err && err.message || '';

		if (/ECONNREFUSED/.test(message)) {
			const error = createErrorWithActions(localize('suggestProxyError', "Marketplace returned 'ECONNREFUSED'. Please check the 'http.proxy' setting."), [
				new Action('open user settings', localize('open user settings', "Open User Settings"), undefined, true, () => this.preferencesService.openUserSettings())
			]);

			this.notificationService.error(error);
			return;
		}

		this.notificationService.error(err);
	}

	private isSupportedDragElement(e: DragEvent): boolean {
		if (e.dataTransfer) {
			const typesLowerCase = e.dataTransfer.types.map(t => t.toLocaleLowerCase());
			return typesLowerCase.indexOf('files') !== -1;
		}

		return false;
	}
}

export class StatusUpdater extends Disposable implements IWorkbenchContribution {

	private readonly badgeHandle = this._register(new MutableDisposable());

	constructor(
		@IActivityService private readonly activityService: IActivityService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService
	) {
		super();
		this.onServiceChange();
		this._register(Event.debounce(extensionsWorkbenchService.onChange, () => undefined, 100, undefined, undefined, undefined, this._store)(this.onServiceChange, this));
	}

	private onServiceChange(): void {
		this.badgeHandle.clear();

		const extensionsReloadRequired = this.extensionsWorkbenchService.installed.filter(e => e.reloadRequiredStatus !== undefined);
		const outdated = this.extensionsWorkbenchService.outdated.reduce((r, e) => r + (this.extensionEnablementService.isEnabled(e.local!) && !e.pinned && !extensionsReloadRequired.includes(e) ? 1 : 0), 0);
		const newBadgeNumber = outdated + extensionsReloadRequired.length;
		if (newBadgeNumber > 0) {
			let msg = '';
			if (outdated) {
				msg += outdated === 1 ? localize('extensionToUpdate', '{0} requires update', outdated) : localize('extensionsToUpdate', '{0} require update', outdated);
			}
			if (outdated > 0 && extensionsReloadRequired.length > 0) {
				msg += ', ';
			}
			if (extensionsReloadRequired.length) {
				msg += extensionsReloadRequired.length === 1 ? localize('extensionToReload', '{0} requires reload', extensionsReloadRequired.length) : localize('extensionsToReload', '{0} require reload', extensionsReloadRequired.length);
			}
			const badge = new NumberBadge(newBadgeNumber, () => msg);
			this.badgeHandle.value = this.activityService.showViewContainerActivity(VIEWLET_ID, { badge, clazz: 'extensions-badge count-badge' });
		}
	}
}

export class MaliciousExtensionChecker implements IWorkbenchContribution {

	constructor(
		@IExtensionManagementService private readonly extensionsManagementService: IExtensionManagementService,
		@IHostService private readonly hostService: IHostService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IWorkbenchEnvironmentService private readonly environmentService: IWorkbenchEnvironmentService
	) {
		if (!this.environmentService.disableExtensions) {
			this.loopCheckForMaliciousExtensions();
		}
	}

	private loopCheckForMaliciousExtensions(): void {
		this.checkForMaliciousExtensions()
			.then(() => timeout(1000 * 60 * 5)) // every five minutes
			.then(() => this.loopCheckForMaliciousExtensions());
	}

	private checkForMaliciousExtensions(): Promise<void> {
		return this.extensionsManagementService.getExtensionsControlManifest().then(extensionsControlManifest => {

			return this.extensionsManagementService.getInstalled(ExtensionType.User).then(installed => {
				const maliciousExtensions = installed
					.filter(e => extensionsControlManifest.malicious.some(identifier => areSameExtensions(e.identifier, identifier)));

				if (maliciousExtensions.length) {
					return Promises.settled(maliciousExtensions.map(e => this.extensionsManagementService.uninstall(e).then(() => {
						this.notificationService.prompt(
							Severity.Warning,
							localize('malicious warning', "We have uninstalled '{0}' which was reported to be problematic.", e.identifier.id),
							[{
								label: localize('reloadNow', "Reload Now"),
								run: () => this.hostService.reload()
							}],
							{
								sticky: true,
								priority: NotificationPriority.URGENT
							}
						);
					})));
				} else {
					return Promise.resolve(undefined);
				}
			}).then(() => undefined);
		}, err => this.logService.error(err));
	}
}
