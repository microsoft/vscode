/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/extensionsViewlet.css';
import { localize, localize2 } from '../../../../nls.js';
import { timeout, Delayer, Promises } from '../../../../base/common/async.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { createErrorWithActions } from '../../../../base/common/errorMessage.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { Event } from '../../../../base/common/event.js';
import { Action } from '../../../../base/common/actions.js';
import { append, $, Dimension, hide, show, DragAndDropObserver, trackFocus, addDisposableListener, EventType, clearNode } from '../../../../base/browser/dom.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IInstantiationService, ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IExtensionService } from '../../../services/extensions/common/extensions.js';
import { IExtensionsWorkbenchService, IExtensionsViewPaneContainer, VIEWLET_ID, CloseExtensionDetailsOnViewChangeKey, INSTALL_EXTENSION_FROM_VSIX_COMMAND_ID, WORKSPACE_RECOMMENDATIONS_VIEW_ID, AutoCheckUpdatesConfigurationKey, OUTDATED_EXTENSIONS_VIEW_ID, CONTEXT_HAS_GALLERY, extensionsSearchActionsMenu, AutoRestartConfigurationKey } from '../common/extensions.js';
import { InstallLocalExtensionsInRemoteAction, InstallRemoteExtensionsInLocalAction } from './extensionsActions.js';
import { IExtensionManagementService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { IWorkbenchExtensionEnablementService, IExtensionManagementServerService, IExtensionManagementServer } from '../../../services/extensionManagement/common/extensionManagement.js';
import { ExtensionsInput } from '../common/extensionsInput.js';
import { ExtensionsListView, EnabledExtensionsView, DisabledExtensionsView, RecommendedExtensionsView, WorkspaceRecommendedExtensionsView, ServerInstalledExtensionsView, DefaultRecommendedExtensionsView, UntrustedWorkspaceUnsupportedExtensionsView, UntrustedWorkspacePartiallySupportedExtensionsView, VirtualWorkspaceUnsupportedExtensionsView, VirtualWorkspacePartiallySupportedExtensionsView, DefaultPopularExtensionsView, DeprecatedExtensionsView, SearchMarketplaceExtensionsView, RecentlyUpdatedExtensionsView, OutdatedExtensionsView, StaticQueryExtensionsView, NONE_CATEGORY } from './extensionsViews.js';
import { IProgressService, ProgressLocation } from '../../../../platform/progress/common/progress.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
import Severity from '../../../../base/common/severity.js';
import { IActivityService, IBadge, NumberBadge, WarningBadge } from '../../../services/activity/common/activity.js';
import { IThemeService } from '../../../../platform/theme/common/themeService.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IViewsRegistry, IViewDescriptor, Extensions, ViewContainer, IViewDescriptorService, IAddedViewDescriptorRef, ViewContainerLocation } from '../../../common/views.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { IContextKeyService, ContextKeyExpr, RawContextKey, IContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { IContextMenuService } from '../../../../platform/contextview/browser/contextView.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService, NotificationPriority } from '../../../../platform/notification/common/notification.js';
import { IHostService } from '../../../services/host/browser/host.js';
import { IWorkbenchLayoutService } from '../../../services/layout/browser/layoutService.js';
import { ViewPaneContainer } from '../../../browser/parts/views/viewPaneContainer.js';
import { ViewPane } from '../../../browser/parts/views/viewPane.js';
import { Query } from '../common/extensionQuery.js';
import { SuggestEnabledInput } from '../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js';
import { alert } from '../../../../base/browser/ui/aria/aria.js';
import { EXTENSION_CATEGORIES, ExtensionType } from '../../../../platform/extensions/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { MementoObject } from '../../../common/memento.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { IPreferencesService } from '../../../services/preferences/common/preferences.js';
import { SIDE_BAR_DRAG_AND_DROP_BACKGROUND } from '../../../common/theme.js';
import { IWorkbenchEnvironmentService } from '../../../services/environment/common/environmentService.js';
import { VirtualWorkspaceContext, WorkbenchStateContext } from '../../../common/contextkeys.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { installLocalInRemoteIcon } from './extensionsIcons.js';
import { registerAction2, Action2, MenuId } from '../../../../platform/actions/common/actions.js';
import { IPaneComposite } from '../../../common/panecomposite.js';
import { IPaneCompositePartService } from '../../../services/panecomposite/browser/panecomposite.js';
import { coalesce } from '../../../../base/common/arrays.js';
import { extractEditorsAndFilesDropData } from '../../../../platform/dnd/browser/dnd.js';
import { extname } from '../../../../base/common/resources.js';
import { isMalicious } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { registerNavigableContainer } from '../../../browser/actions/widgetNavigationCommands.js';
import { MenuWorkbenchToolBar } from '../../../../platform/actions/browser/toolbar.js';
import { createActionViewItem } from '../../../../platform/actions/browser/menuEntryActionViewItem.js';
import { SeverityIcon } from '../../../../platform/severityIcon/browser/severityIcon.js';
import { StandardKeyboardEvent } from '../../../../base/browser/keyboardEvent.js';
import { KeyCode } from '../../../../base/common/keyCodes.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { Codicon } from '../../../../base/common/codicons.js';

export const DefaultViewsContext = new RawContextKey<boolean>('defaultExtensionViews', true);
export const ExtensionsSortByContext = new RawContextKey<string>('extensionsSortByValue', '');
export const SearchMarketplaceExtensionsContext = new RawContextKey<boolean>('searchMarketplaceExtensions', false);
export const SearchHasTextContext = new RawContextKey<boolean>('extensionSearchHasText', false);
const InstalledExtensionsContext = new RawContextKey<boolean>('installedExtensions', false);
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
export const ExtensionsSearchValueContext = new RawContextKey<string>('extensionsSearchValue', '');

const REMOTE_CATEGORY: ILocalizedString = localize2({ key: 'remote', comment: ['Remote as in remote machine'] }, "Remote");

export class ExtensionsViewletViewsContribution extends Disposable implements IWorkbenchContribution {

	private readonly container: ViewContainer;

	constructor(
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
		@ILabelService private readonly labelService: ILabelService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IContextKeyService private readonly contextKeyService: IContextKeyService
	) {
		super();

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
				get name() {
					return {
						value: getInstalledViewName(),
						original: getViewName('Installed', server)
					};
				},
				weight: 100,
				order: 1,
				when: ContextKeyExpr.and(DefaultViewsContext),
				ctorDescriptor: new SyncDescriptor(ServerInstalledExtensionsView, [{ server, flexibleHeight: true, onDidChangeTitle }]),
				/* Installed extensions views shall not be allowed to hidden when there are more than one server */
				canToggleVisibility: servers.length === 1
			});

			if (server === this.extensionManagementServerService.remoteExtensionManagementServer && this.extensionManagementServerService.localExtensionManagementServer) {
				this._register(registerAction2(class InstallLocalExtensionsInRemoteAction2 extends Action2 {
					constructor() {
						super({
							id: 'workbench.extensions.installLocalExtensions',
							get title() {
								return localize2('select and install local extensions', "Install Local Extensions in '{0}'...", server.label);
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
				}));
			}
		}

		if (this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
			this._register(registerAction2(class InstallRemoteExtensionsInLocalAction2 extends Action2 {
				constructor() {
					super({
						id: 'workbench.extensions.actions.installLocalExtensionsInRemote',
						title: localize2('install remote in local', 'Install Remote Extensions Locally...'),
						category: REMOTE_CATEGORY,
						f1: true
					});
				}
				run(accessor: ServicesAccessor): Promise<void> {
					return accessor.get(IInstantiationService).createInstance(InstallRemoteExtensionsInLocalAction, 'workbench.extensions.actions.installLocalExtensionsInRemote').run();
				}
			}));
		}

		/*
		 * Default popular extensions view
		 * Separate view for popular extensions required as we need to show popular and recommended sections
		 * in the default view when there is no search text, and user has no installed extensions.
		 */
		viewDescriptors.push({
			id: 'workbench.views.extensions.popular',
			name: localize2('popularExtensions', "Popular"),
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
			name: localize2('recommendedExtensions', "Recommended"),
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
				name: localize2('enabledExtensions', "Enabled"),
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
				name: localize2('disabledExtensions', "Disabled"),
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
			name: localize2('marketPlace', "Marketplace"),
			ctorDescriptor: new SyncDescriptor(SearchMarketplaceExtensionsView, [{}]),
			when: ContextKeyExpr.and(ContextKeyExpr.has('searchMarketplaceExtensions')),
		});

		/*
		 * View used for searching all installed extensions
		 */
		viewDescriptors.push({
			id: 'workbench.views.extensions.searchInstalled',
			name: localize2('installed', "Installed"),
			ctorDescriptor: new SyncDescriptor(ExtensionsListView, [{}]),
			when: ContextKeyExpr.or(ContextKeyExpr.has('searchInstalledExtensions'), ContextKeyExpr.has('installedExtensions')),
		});

		/*
		 * View used for searching recently updated extensions
		 */
		viewDescriptors.push({
			id: 'workbench.views.extensions.searchRecentlyUpdated',
			name: localize2('recently updated', "Recently Updated"),
			ctorDescriptor: new SyncDescriptor(RecentlyUpdatedExtensionsView, [{}]),
			when: ContextKeyExpr.or(SearchExtensionUpdatesContext, ContextKeyExpr.has('searchRecentlyUpdatedExtensions')),
			order: 2,
		});

		/*
		 * View used for searching enabled extensions
		 */
		viewDescriptors.push({
			id: 'workbench.views.extensions.searchEnabled',
			name: localize2('enabled', "Enabled"),
			ctorDescriptor: new SyncDescriptor(ExtensionsListView, [{}]),
			when: ContextKeyExpr.and(ContextKeyExpr.has('searchEnabledExtensions')),
		});

		/*
		 * View used for searching disabled extensions
		 */
		viewDescriptors.push({
			id: 'workbench.views.extensions.searchDisabled',
			name: localize2('disabled', "Disabled"),
			ctorDescriptor: new SyncDescriptor(ExtensionsListView, [{}]),
			when: ContextKeyExpr.and(ContextKeyExpr.has('searchDisabledExtensions')),
		});

		/*
		 * View used for searching outdated extensions
		 */
		viewDescriptors.push({
			id: OUTDATED_EXTENSIONS_VIEW_ID,
			name: localize2('availableUpdates', "Available Updates"),
			ctorDescriptor: new SyncDescriptor(OutdatedExtensionsView, [{}]),
			when: ContextKeyExpr.or(SearchExtensionUpdatesContext, ContextKeyExpr.has('searchOutdatedExtensions')),
			order: 1,
		});

		/*
		 * View used for searching builtin extensions
		 */
		viewDescriptors.push({
			id: 'workbench.views.extensions.searchBuiltin',
			name: localize2('builtin', "Builtin"),
			ctorDescriptor: new SyncDescriptor(ExtensionsListView, [{}]),
			when: ContextKeyExpr.and(ContextKeyExpr.has('searchBuiltInExtensions')),
		});

		/*
		 * View used for searching workspace unsupported extensions
		 */
		viewDescriptors.push({
			id: 'workbench.views.extensions.searchWorkspaceUnsupported',
			name: localize2('workspaceUnsupported', "Workspace Unsupported"),
			ctorDescriptor: new SyncDescriptor(ExtensionsListView, [{}]),
			when: ContextKeyExpr.and(ContextKeyExpr.has('searchWorkspaceUnsupportedExtensions')),
		});

		return viewDescriptors;
	}

	private createRecommendedExtensionsViewDescriptors(): IViewDescriptor[] {
		const viewDescriptors: IViewDescriptor[] = [];

		viewDescriptors.push({
			id: WORKSPACE_RECOMMENDATIONS_VIEW_ID,
			name: localize2('workspaceRecommendedExtensions', "Workspace Recommendations"),
			ctorDescriptor: new SyncDescriptor(WorkspaceRecommendedExtensionsView, [{}]),
			when: ContextKeyExpr.and(ContextKeyExpr.has('recommendedExtensions'), WorkbenchStateContext.notEqualsTo('empty')),
			order: 1
		});

		viewDescriptors.push({
			id: 'workbench.views.extensions.otherRecommendations',
			name: localize2('otherRecommendedExtensions', "Other Recommendations"),
			ctorDescriptor: new SyncDescriptor(RecommendedExtensionsView, [{}]),
			when: ContextKeyExpr.has('recommendedExtensions'),
			order: 2
		});

		return viewDescriptors;
	}

	private createBuiltinExtensionsViewDescriptors(): IViewDescriptor[] {
		const viewDescriptors: IViewDescriptor[] = [];

		const configuredCategories = ['themes', 'programming languages'];
		const otherCategories = EXTENSION_CATEGORIES.filter(c => !configuredCategories.includes(c.toLowerCase()));
		otherCategories.push(NONE_CATEGORY);
		const otherCategoriesQuery = `${otherCategories.map(c => `category:"${c}"`).join(' ')} ${configuredCategories.map(c => `category:"-${c}"`).join(' ')}`;
		viewDescriptors.push({
			id: 'workbench.views.extensions.builtinFeatureExtensions',
			name: localize2('builtinFeatureExtensions', "Features"),
			ctorDescriptor: new SyncDescriptor(StaticQueryExtensionsView, [{ query: `@builtin ${otherCategoriesQuery}` }]),
			when: ContextKeyExpr.has('builtInExtensions'),
		});

		viewDescriptors.push({
			id: 'workbench.views.extensions.builtinThemeExtensions',
			name: localize2('builtInThemesExtensions', "Themes"),
			ctorDescriptor: new SyncDescriptor(StaticQueryExtensionsView, [{ query: `@builtin category:themes` }]),
			when: ContextKeyExpr.has('builtInExtensions'),
		});

		viewDescriptors.push({
			id: 'workbench.views.extensions.builtinProgrammingLanguageExtensions',
			name: localize2('builtinProgrammingLanguageExtensions', "Programming Languages"),
			ctorDescriptor: new SyncDescriptor(StaticQueryExtensionsView, [{ query: `@builtin category:"programming languages"` }]),
			when: ContextKeyExpr.has('builtInExtensions'),
		});

		return viewDescriptors;
	}

	private createUnsupportedWorkspaceExtensionsViewDescriptors(): IViewDescriptor[] {
		const viewDescriptors: IViewDescriptor[] = [];

		viewDescriptors.push({
			id: 'workbench.views.extensions.untrustedUnsupportedExtensions',
			name: localize2('untrustedUnsupportedExtensions', "Disabled in Restricted Mode"),
			ctorDescriptor: new SyncDescriptor(UntrustedWorkspaceUnsupportedExtensionsView, [{}]),
			when: ContextKeyExpr.and(SearchUnsupportedWorkspaceExtensionsContext),
		});

		viewDescriptors.push({
			id: 'workbench.views.extensions.untrustedPartiallySupportedExtensions',
			name: localize2('untrustedPartiallySupportedExtensions', "Limited in Restricted Mode"),
			ctorDescriptor: new SyncDescriptor(UntrustedWorkspacePartiallySupportedExtensionsView, [{}]),
			when: ContextKeyExpr.and(SearchUnsupportedWorkspaceExtensionsContext),
		});

		viewDescriptors.push({
			id: 'workbench.views.extensions.virtualUnsupportedExtensions',
			name: localize2('virtualUnsupportedExtensions', "Disabled in Virtual Workspaces"),
			ctorDescriptor: new SyncDescriptor(VirtualWorkspaceUnsupportedExtensionsView, [{}]),
			when: ContextKeyExpr.and(VirtualWorkspaceContext, SearchUnsupportedWorkspaceExtensionsContext),
		});

		viewDescriptors.push({
			id: 'workbench.views.extensions.virtualPartiallySupportedExtensions',
			name: localize2('virtualPartiallySupportedExtensions', "Limited in Virtual Workspaces"),
			ctorDescriptor: new SyncDescriptor(VirtualWorkspacePartiallySupportedExtensionsView, [{}]),
			when: ContextKeyExpr.and(VirtualWorkspaceContext, SearchUnsupportedWorkspaceExtensionsContext),
		});

		return viewDescriptors;
	}

	private createOtherLocalFilteredExtensionsViewDescriptors(): IViewDescriptor[] {
		const viewDescriptors: IViewDescriptor[] = [];

		viewDescriptors.push({
			id: 'workbench.views.extensions.deprecatedExtensions',
			name: localize2('deprecated', "Deprecated"),
			ctorDescriptor: new SyncDescriptor(DeprecatedExtensionsView, [{}]),
			when: ContextKeyExpr.and(SearchDeprecatedExtensionsContext),
		});

		return viewDescriptors;
	}

}

export class ExtensionsViewPaneContainer extends ViewPaneContainer implements IExtensionsViewPaneContainer {

	private readonly extensionsSearchValueContextKey: IContextKey<string>;
	private readonly defaultViewsContextKey: IContextKey<boolean>;
	private readonly sortByContextKey: IContextKey<string>;
	private readonly searchMarketplaceExtensionsContextKey: IContextKey<boolean>;
	private readonly searchHasTextContextKey: IContextKey<boolean>;
	private readonly sortByUpdateDateContextKey: IContextKey<boolean>;
	private readonly installedExtensionsContextKey: IContextKey<boolean>;
	private readonly searchInstalledExtensionsContextKey: IContextKey<boolean>;
	private readonly searchRecentlyUpdatedExtensionsContextKey: IContextKey<boolean>;
	private readonly searchExtensionUpdatesContextKey: IContextKey<boolean>;
	private readonly searchOutdatedExtensionsContextKey: IContextKey<boolean>;
	private readonly searchEnabledExtensionsContextKey: IContextKey<boolean>;
	private readonly searchDisabledExtensionsContextKey: IContextKey<boolean>;
	private readonly hasInstalledExtensionsContextKey: IContextKey<boolean>;
	private readonly builtInExtensionsContextKey: IContextKey<boolean>;
	private readonly searchBuiltInExtensionsContextKey: IContextKey<boolean>;
	private readonly searchWorkspaceUnsupportedExtensionsContextKey: IContextKey<boolean>;
	private readonly searchDeprecatedExtensionsContextKey: IContextKey<boolean>;
	private readonly recommendedExtensionsContextKey: IContextKey<boolean>;

	private searchDelayer: Delayer<void>;
	private root: HTMLElement | undefined;
	private header: HTMLElement | undefined;
	private searchBox: SuggestEnabledInput | undefined;
	private notificationContainer: HTMLElement | undefined;
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
		@ICommandService private readonly commandService: ICommandService,
		@ILogService logService: ILogService,
	) {
		super(VIEWLET_ID, { mergeViewWithContainerWhenSingleView: true }, instantiationService, configurationService, layoutService, contextMenuService, telemetryService, extensionService, themeService, storageService, contextService, viewDescriptorService, logService);

		this.searchDelayer = new Delayer(500);
		this.extensionsSearchValueContextKey = ExtensionsSearchValueContext.bindTo(contextKeyService);
		this.defaultViewsContextKey = DefaultViewsContext.bindTo(contextKeyService);
		this.sortByContextKey = ExtensionsSortByContext.bindTo(contextKeyService);
		this.searchMarketplaceExtensionsContextKey = SearchMarketplaceExtensionsContext.bindTo(contextKeyService);
		this.searchHasTextContextKey = SearchHasTextContext.bindTo(contextKeyService);
		this.sortByUpdateDateContextKey = SortByUpdateDateContext.bindTo(contextKeyService);
		this.installedExtensionsContextKey = InstalledExtensionsContext.bindTo(contextKeyService);
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

		this.header = append(this.root, $('.header'));
		const placeholder = localize('searchExtensions', "Search Extensions in Marketplace");

		const searchValue = this.searchViewletState['query.value'] ? this.searchViewletState['query.value'] : '';

		const searchContainer = append(this.header, $('.extensions-search-container'));

		this.searchBox = this._register(this.instantiationService.createInstance(SuggestEnabledInput, `${VIEWLET_ID}.searchbox`, searchContainer, {
			triggerCharacters: ['@'],
			sortKey: (item: string) => {
				if (item.indexOf(':') === -1) { return 'a'; }
				else if (/ext:/.test(item) || /id:/.test(item) || /tag:/.test(item)) { return 'b'; }
				else if (/sort:/.test(item)) { return 'c'; }
				else { return 'd'; }
			},
			provideResults: (query: string) => Query.suggestions(query)
		}, placeholder, 'extensions:searchinput', { placeholderText: placeholder, value: searchValue }));

		this.notificationContainer = append(this.header, $('.notification-container.hidden', { 'tabindex': '0' }));
		this.renderNotificaiton();
		this._register(this.extensionsWorkbenchService.onDidChangeExtensionsNotification(() => this.renderNotificaiton()));

		this.updateInstalledExtensionsContexts();
		if (this.searchBox.getValue()) {
			this.triggerSearch();
		}

		this._register(this.searchBox.onInputDidChange(() => {
			this.sortByContextKey.set(Query.parse(this.searchBox?.getValue() ?? '').sortBy);
			this.triggerSearch();
		}, this));

		this._register(this.searchBox.onShouldFocusResults(() => this.focusListView(), this));

		const controlElement = append(searchContainer, $('.extensions-search-actions-container'));
		this._register(this.instantiationService.createInstance(MenuWorkbenchToolBar, controlElement, extensionsSearchActionsMenu, {
			toolbarOptions: {
				primaryGroup: () => true,
			},
			actionViewItemProvider: (action, options) => createActionViewItem(this.instantiationService, action, options)
		}));

		// Register DragAndDrop support
		this._register(new DragAndDropObserver(this.root, {
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

		const focusTracker = this._register(trackFocus(this.root));
		const isSearchBoxFocused = () => this.searchBox?.inputWidget.hasWidgetFocus();
		this._register(registerNavigableContainer({
			name: 'extensionsView',
			focusNotifiers: [focusTracker],
			focusNextWidget: () => {
				if (isSearchBoxFocused()) {
					this.focusListView();
				}
			},
			focusPreviousWidget: () => {
				if (!isSearchBoxFocused()) {
					this.searchBox?.focus();
				}
			}
		}));
	}

	override focus(): void {
		super.focus();
		this.searchBox?.focus();
	}

	private _dimension: Dimension | undefined;
	override layout(dimension: Dimension): void {
		this._dimension = dimension;
		if (this.root) {
			this.root.classList.toggle('narrow', dimension.width <= 250);
			this.root.classList.toggle('mini', dimension.width <= 200);
		}
		this.searchBox?.layout(new Dimension(dimension.width - 34 - /*padding*/8 - (24 * 2), 20));
		const searchBoxHeight = 20 + 21 /*margin*/;
		const headerHeight = this.header && !!this.notificationContainer?.childNodes.length ? this.notificationContainer.clientHeight + searchBoxHeight + 10 /*margin*/ : searchBoxHeight;
		this.header!.style.height = `${headerHeight}px`;
		super.layout(new Dimension(dimension.width, dimension.height - headerHeight));
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

	private readonly notificationDisposables = this._register(new MutableDisposable<DisposableStore>());
	private renderNotificaiton(): void {
		if (!this.notificationContainer) {
			return;
		}

		clearNode(this.notificationContainer);
		this.notificationDisposables.value = new DisposableStore();
		const status = this.extensionsWorkbenchService.getExtensionsNotification();
		const query = status?.extensions.map(extension => `@id:${extension.identifier.id}`).join(' ');
		if (status && (query === this.searchBox?.getValue() || !this.searchMarketplaceExtensionsContextKey.get())) {
			this.notificationContainer.setAttribute('aria-label', status.message);
			this.notificationContainer.classList.remove('hidden');
			const messageContainer = append(this.notificationContainer, $('.message-container'));
			append(messageContainer, $('span')).className = SeverityIcon.className(status.severity);
			append(messageContainer, $('span.message', undefined, status.message));
			const showAction = append(messageContainer,
				$('span.message-text-action', {
					'tabindex': '0',
					'role': 'button',
					'aria-label': `${status.message}. ${localize('click show', "Click to Show")}`
				}, localize('show', "Show")));
			this.notificationDisposables.value.add(addDisposableListener(showAction, EventType.CLICK, () => this.search(query ?? '')));
			this.notificationDisposables.value.add(addDisposableListener(showAction, EventType.KEY_DOWN, (e: KeyboardEvent) => {
				const standardKeyboardEvent = new StandardKeyboardEvent(e);
				if (standardKeyboardEvent.keyCode === KeyCode.Enter || standardKeyboardEvent.keyCode === KeyCode.Space) {
					this.search(query ?? '');
				}
				standardKeyboardEvent.stopPropagation();
			}));
			const dismissAction = append(this.notificationContainer,
				$(`span.message-action${ThemeIcon.asCSSSelector(Codicon.close)}`, {
					'tabindex': '0',
					'role': 'button',
					'aria-label': localize('dismiss', "Dismiss"),
					'title': localize('dismiss', "Dismiss")
				}));
			this.notificationDisposables.value.add(addDisposableListener(dismissAction, EventType.CLICK, () => status.dismiss()));
			this.notificationDisposables.value.add(addDisposableListener(dismissAction, EventType.KEY_DOWN, (e: KeyboardEvent) => {
				const standardKeyboardEvent = new StandardKeyboardEvent(e);
				if (standardKeyboardEvent.keyCode === KeyCode.Enter || standardKeyboardEvent.keyCode === KeyCode.Space) {
					status.dismiss();
				}
				standardKeyboardEvent.stopPropagation();
			}));
		} else {
			this.notificationContainer.removeAttribute('aria-label');
			this.notificationContainer.classList.add('hidden');
		}

		if (this._dimension) {
			this.layout(this._dimension);
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
			this.extensionsSearchValueContextKey.set(value);
			this.installedExtensionsContextKey.set(ExtensionsListView.isInstalledExtensionsQuery(value));
			this.searchInstalledExtensionsContextKey.set(ExtensionsListView.isSearchInstalledExtensionsQuery(value));
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

		this.renderNotificaiton();

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
					alert(localize('extensionFoundInSection', "1 extension found in the {0} section.", view.name.value));
				} else {
					alert(localize('extensionFound', "1 extension found."));
				}
				break;
			default:
				if (view) {
					alert(localize('extensionsFoundInSection', "{0} extensions found in the {1} section.", count, view.name.value));
				} else {
					alert(localize('extensionsFound', "{0} extensions found.", count));
				}
				break;
		}
	}

	private getFirstExpandedPane(): ExtensionsListView | undefined {
		for (const pane of this.panes) {
			if (pane.isExpanded() && pane instanceof ExtensionsListView) {
				return pane;
			}
		}
		return undefined;
	}

	private focusListView(): void {
		const pane = this.getFirstExpandedPane();
		if (pane && pane.count() > 0) {
			pane.focus();
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
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IConfigurationService private readonly configurationService: IConfigurationService
	) {
		super();
		this.onServiceChange();
		this._register(Event.any(Event.debounce(extensionsWorkbenchService.onChange, () => undefined, 100, undefined, undefined, undefined, this._store), extensionsWorkbenchService.onDidChangeExtensionsNotification)(this.onServiceChange, this));
	}

	private onServiceChange(): void {
		this.badgeHandle.clear();
		let badge: IBadge | undefined;

		const extensionsNotification = this.extensionsWorkbenchService.getExtensionsNotification();
		if (extensionsNotification) {
			if (extensionsNotification.severity === Severity.Warning) {
				badge = new WarningBadge(() => extensionsNotification.message);
			}
		}

		else {
			const actionRequired = this.configurationService.getValue(AutoRestartConfigurationKey) === true ? [] : this.extensionsWorkbenchService.installed.filter(e => e.runtimeState !== undefined);
			const outdated = this.extensionsWorkbenchService.outdated.reduce((r, e) => r + (this.extensionEnablementService.isEnabled(e.local!) && !actionRequired.includes(e) ? 1 : 0), 0);
			const newBadgeNumber = outdated + actionRequired.length;
			if (newBadgeNumber > 0) {
				let msg = '';
				if (outdated) {
					msg += outdated === 1 ? localize('extensionToUpdate', '{0} requires update', outdated) : localize('extensionsToUpdate', '{0} require update', outdated);
				}
				if (outdated > 0 && actionRequired.length > 0) {
					msg += ', ';
				}
				if (actionRequired.length) {
					msg += actionRequired.length === 1 ? localize('extensionToReload', '{0} requires restart', actionRequired.length) : localize('extensionsToReload', '{0} require restart', actionRequired.length);
				}
				badge = new NumberBadge(newBadgeNumber, () => msg);
			}
		}

		if (badge) {
			this.badgeHandle.value = this.activityService.showViewContainerActivity(VIEWLET_ID, { badge });
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
				const maliciousExtensions = installed.filter(e => isMalicious(e.identifier, extensionsControlManifest));

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
