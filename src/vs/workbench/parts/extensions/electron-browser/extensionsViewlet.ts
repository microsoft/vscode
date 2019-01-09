/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/extensionsViewlet';
import { localize } from 'vs/nls';
import { ThrottledDelayer, timeout } from 'vs/base/common/async';
import { isPromiseCanceledError } from 'vs/base/common/errors';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Event as EventOf, Emitter } from 'vs/base/common/event';
import { IAction } from 'vs/base/common/actions';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { append, $, addClass, toggleClass, Dimension } from 'vs/base/browser/dom';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IExtensionsWorkbenchService, IExtensionsViewlet, VIEWLET_ID, ExtensionState, AutoUpdateConfigurationKey, ShowRecommendationsOnlyOnDemandKey, CloseExtensionDetailsOnViewChangeKey, VIEW_CONTAINER } from '../common/extensions';
import {
	ShowEnabledExtensionsAction, ShowInstalledExtensionsAction, ShowRecommendedExtensionsAction, ShowPopularExtensionsAction, ShowDisabledExtensionsAction,
	ShowOutdatedExtensionsAction, ClearExtensionsInputAction, ChangeSortAction, UpdateAllAction, CheckForUpdatesAction, DisableAllAction, EnableAllAction,
	EnableAutoUpdateAction, DisableAutoUpdateAction, ShowBuiltInExtensionsAction, InstallVSIXAction, ChangeGroupAction
} from 'vs/workbench/parts/extensions/electron-browser/extensionsActions';
import { LocalExtensionType, IExtensionManagementService, IExtensionManagementServerService, IExtensionManagementServer, EnablementState } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionsInput } from 'vs/workbench/parts/extensions/common/extensionsInput';
import { ExtensionsListView, EnabledExtensionsView, DisabledExtensionsView, RecommendedExtensionsView, WorkspaceRecommendedExtensionsView, BuiltInExtensionsView, BuiltInThemesExtensionsView, BuiltInBasicsExtensionsView, GroupByServerExtensionsView, DefaultRecommendedExtensionsView } from './extensionsViews';
import { OpenGlobalSettingsAction } from 'vs/workbench/parts/preferences/browser/preferencesActions';
import { IProgressService2, ProgressLocation } from 'vs/platform/progress/common/progress';
import { IEditorGroupsService } from 'vs/workbench/services/group/common/editorGroupsService';
import Severity from 'vs/base/common/severity';
import { IActivityService, ProgressBadge, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ViewsRegistry, IViewDescriptor } from 'vs/workbench/common/views';
import { ViewContainerViewlet, IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IContextKeyService, ContextKeyExpr, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { getGalleryExtensionIdFromLocal, getMaliciousExtensionsSet } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ILogService } from 'vs/platform/log/common/log';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IAddedViewDescriptorRef } from 'vs/workbench/browser/parts/views/views';
import { ViewletPanel } from 'vs/workbench/browser/parts/views/panelViewlet';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ExtensionsWorkbenchService } from 'vs/workbench/parts/extensions/node/extensionsWorkbenchService';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { Query } from 'vs/workbench/parts/extensions/common/extensionQuery';
import { SuggestEnabledInput, attachSuggestEnabledInputBoxStyler } from 'vs/workbench/parts/codeEditor/electron-browser/suggestEnabledInput';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { createErrorWithActions } from 'vs/base/common/errorsWithActions';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';

interface SearchInputEvent extends Event {
	target: HTMLInputElement;
	immediate?: boolean;
}

const NonEmptyWorkspaceContext = new RawContextKey<boolean>('nonEmptyWorkspace', false);
const SearchExtensionsContext = new RawContextKey<boolean>('searchExtensions', false);
const HasInstalledExtensionsContext = new RawContextKey<boolean>('hasInstalledExtensions', true);
const SearchBuiltInExtensionsContext = new RawContextKey<boolean>('searchBuiltInExtensions', false);
const RecommendedExtensionsContext = new RawContextKey<boolean>('recommendedExtensions', false);
const DefaultRecommendedExtensionsContext = new RawContextKey<boolean>('defaultRecommendedExtensions', false);
const GroupByServersContext = new RawContextKey<boolean>('groupByServersContext', false);
const viewIdNameMappings: { [id: string]: string } = {
	'extensions.listView': localize('marketPlace', "Marketplace"),
	'extensions.enabledExtensionList': localize('enabledExtensions', "Enabled"),
	'extensions.disabledExtensionList': localize('disabledExtensions', "Disabled"),
	'extensions.popularExtensionsList': localize('popularExtensions', "Popular"),
	'extensions.recommendedList': localize('recommendedExtensions', "Recommended"),
	'extensions.otherrecommendedList': localize('otherRecommendedExtensions', "Other Recommendations"),
	'extensions.workspaceRecommendedList': localize('workspaceRecommendedExtensions', "Workspace Recommendations"),
	'extensions.builtInExtensionsList': localize('builtInExtensions', "Features"),
	'extensions.builtInThemesExtensionsList': localize('builtInThemesExtensions', "Themes"),
	'extensions.builtInBasicsExtensionsList': localize('builtInBasicsExtensions', "Programming Languages"),
};

export class ExtensionsViewletViewsContribution implements IWorkbenchContribution {

	constructor(
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService
	) {
		this.registerViews();
	}

	private registerViews(): void {
		let viewDescriptors: IViewDescriptor[] = [];
		viewDescriptors.push(this.createMarketPlaceExtensionsListViewDescriptor());
		viewDescriptors.push(this.createEnabledExtensionsListViewDescriptor());
		viewDescriptors.push(this.createDisabledExtensionsListViewDescriptor());
		viewDescriptors.push(this.createPopularExtensionsListViewDescriptor());
		viewDescriptors.push(this.createBuiltInExtensionsListViewDescriptor());
		viewDescriptors.push(this.createBuiltInBasicsExtensionsListViewDescriptor());
		viewDescriptors.push(this.createBuiltInThemesExtensionsListViewDescriptor());
		viewDescriptors.push(this.createDefaultRecommendedExtensionsListViewDescriptor());
		viewDescriptors.push(this.createOtherRecommendedExtensionsListViewDescriptor());
		viewDescriptors.push(this.createWorkspaceRecommendedExtensionsListViewDescriptor());

		if (this.extensionManagementServerService.remoteExtensionManagementServer) {
			viewDescriptors.push(...this.createExtensionsViewDescriptorsForServer(this.extensionManagementServerService.localExtensionManagementServer));
			viewDescriptors.push(...this.createExtensionsViewDescriptorsForServer(this.extensionManagementServerService.remoteExtensionManagementServer));
		}

		ViewsRegistry.registerViews(viewDescriptors);
	}

	// View used for any kind of searching
	private createMarketPlaceExtensionsListViewDescriptor(): IViewDescriptor {
		const id = 'extensions.listView';
		return {
			id,
			name: viewIdNameMappings[id],
			container: VIEW_CONTAINER,
			ctor: ExtensionsListView,
			when: ContextKeyExpr.and(ContextKeyExpr.has('searchExtensions'), ContextKeyExpr.not('searchInstalledExtensions'), ContextKeyExpr.not('searchBuiltInExtensions'), ContextKeyExpr.not('recommendedExtensions'), ContextKeyExpr.not('groupByServersContext')),
			weight: 100
		};
	}

	// Separate view for enabled extensions required as we need to show enabled, disabled and recommended sections
	// in the default view when there is no search text, but user has installed extensions.
	private createEnabledExtensionsListViewDescriptor(): IViewDescriptor {
		const id = 'extensions.enabledExtensionList';
		return {
			id,
			name: viewIdNameMappings[id],
			container: VIEW_CONTAINER,
			ctor: EnabledExtensionsView,
			when: ContextKeyExpr.and(ContextKeyExpr.not('searchExtensions'), ContextKeyExpr.has('hasInstalledExtensions')),
			weight: 40,
			canToggleVisibility: true,
			order: 1
		};
	}

	// Separate view for disabled extensions required as we need to show enabled, disabled and recommended sections
	// in the default view when there is no search text, but user has installed extensions.
	private createDisabledExtensionsListViewDescriptor(): IViewDescriptor {
		const id = 'extensions.disabledExtensionList';
		return {
			id,
			name: viewIdNameMappings[id],
			container: VIEW_CONTAINER,
			ctor: DisabledExtensionsView,
			when: ContextKeyExpr.and(ContextKeyExpr.not('searchExtensions'), ContextKeyExpr.has('hasInstalledExtensions')),
			weight: 10,
			canToggleVisibility: true,
			order: 3,
			collapsed: true
		};
	}

	// Separate view for popular extensions required as we need to show popular and recommended sections
	// in the default view when there is no search text, and user has no installed extensions.
	private createPopularExtensionsListViewDescriptor(): IViewDescriptor {
		const id = 'extensions.popularExtensionsList';
		return {
			id,
			name: viewIdNameMappings[id],
			container: VIEW_CONTAINER,
			ctor: ExtensionsListView,
			when: ContextKeyExpr.and(ContextKeyExpr.not('searchExtensions'), ContextKeyExpr.not('hasInstalledExtensions')),
			weight: 60,
			order: 1
		};
	}

	private createExtensionsViewDescriptorsForServer(server: IExtensionManagementServer): IViewDescriptor[] {
		return [{
			id: `server.extensionsList.${server.authority}`,
			name: server.label,
			container: VIEW_CONTAINER,
			ctor: GroupByServerExtensionsView,
			when: ContextKeyExpr.has('groupByServersContext'),
			weight: 100
		}];
	}

	// Separate view for recommended extensions required as we need to show it along with other views when there is no search text.
	// When user has installed extensions, this is shown along with the views for enabled & disabled extensions
	// When user has no installed extensions, this is shown along with the view for popular extensions
	private createDefaultRecommendedExtensionsListViewDescriptor(): IViewDescriptor {
		const id = 'extensions.recommendedList';
		return {
			id,
			name: viewIdNameMappings[id],
			container: VIEW_CONTAINER,
			ctor: DefaultRecommendedExtensionsView,
			when: ContextKeyExpr.and(ContextKeyExpr.not('searchExtensions'), ContextKeyExpr.has('defaultRecommendedExtensions')),
			weight: 40,
			order: 2,
			canToggleVisibility: true
		};
	}

	// Separate view for recommedations that are not workspace recommendations.
	// Shown along with view for workspace recommendations, when using the command that shows recommendations
	private createOtherRecommendedExtensionsListViewDescriptor(): IViewDescriptor {
		const id = 'extensions.otherrecommendedList';
		return {
			id,
			name: viewIdNameMappings[id],
			container: VIEW_CONTAINER,
			ctor: RecommendedExtensionsView,
			when: ContextKeyExpr.has('recommendedExtensions'),
			weight: 50,
			canToggleVisibility: true,
			order: 2
		};
	}

	// Separate view for workspace recommendations.
	// Shown along with view for other recommendations, when using the command that shows recommendations
	private createWorkspaceRecommendedExtensionsListViewDescriptor(): IViewDescriptor {
		const id = 'extensions.workspaceRecommendedList';
		return {
			id,
			name: viewIdNameMappings[id],
			container: VIEW_CONTAINER,
			ctor: WorkspaceRecommendedExtensionsView,
			when: ContextKeyExpr.and(ContextKeyExpr.has('recommendedExtensions'), ContextKeyExpr.has('nonEmptyWorkspace')),
			weight: 50,
			canToggleVisibility: true,
			order: 1
		};
	}

	private createBuiltInExtensionsListViewDescriptor(): IViewDescriptor {
		const id = 'extensions.builtInExtensionsList';
		return {
			id,
			name: viewIdNameMappings[id],
			container: VIEW_CONTAINER,
			ctor: BuiltInExtensionsView,
			when: ContextKeyExpr.has('searchBuiltInExtensions'),
			weight: 100,
			canToggleVisibility: true
		};
	}

	private createBuiltInThemesExtensionsListViewDescriptor(): IViewDescriptor {
		const id = 'extensions.builtInThemesExtensionsList';
		return {
			id,
			name: viewIdNameMappings[id],
			container: VIEW_CONTAINER,
			ctor: BuiltInThemesExtensionsView,
			when: ContextKeyExpr.has('searchBuiltInExtensions'),
			weight: 100,
			canToggleVisibility: true
		};
	}

	private createBuiltInBasicsExtensionsListViewDescriptor(): IViewDescriptor {
		const id = 'extensions.builtInBasicsExtensionsList';
		return {
			id,
			name: viewIdNameMappings[id],
			container: VIEW_CONTAINER,
			ctor: BuiltInBasicsExtensionsView,
			when: ContextKeyExpr.has('searchBuiltInExtensions'),
			weight: 100,
			canToggleVisibility: true
		};
	}
}

export class ExtensionsViewlet extends ViewContainerViewlet implements IExtensionsViewlet {

	private onSearchChange: EventOf<string>;
	private nonEmptyWorkspaceContextKey: IContextKey<boolean>;
	private searchExtensionsContextKey: IContextKey<boolean>;
	private hasInstalledExtensionsContextKey: IContextKey<boolean>;
	private searchBuiltInExtensionsContextKey: IContextKey<boolean>;
	private groupByServersContextKey: IContextKey<boolean>;
	private recommendedExtensionsContextKey: IContextKey<boolean>;
	private defaultRecommendedExtensionsContextKey: IContextKey<boolean>;

	private searchDelayer: ThrottledDelayer<any>;
	private root: HTMLElement;

	private searchBox: SuggestEnabledInput;
	private extensionsBox: HTMLElement;
	private primaryActions: IAction[];
	private secondaryActions: IAction[];
	private groupByServerAction: IAction;
	private disposables: IDisposable[] = [];

	constructor(
		@IPartService partService: IPartService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IProgressService2 private readonly progressService: IProgressService2,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorGroupsService private readonly editorGroupService: IEditorGroupsService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@INotificationService private readonly notificationService: INotificationService,
		@IViewletService private readonly viewletService: IViewletService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService,
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService
	) {
		super(VIEWLET_ID, `${VIEWLET_ID}.state`, true, configurationService, partService, telemetryService, storageService, instantiationService, themeService, contextMenuService, extensionService, contextService);

		this.searchDelayer = new ThrottledDelayer(500);
		this.nonEmptyWorkspaceContextKey = NonEmptyWorkspaceContext.bindTo(contextKeyService);
		this.searchExtensionsContextKey = SearchExtensionsContext.bindTo(contextKeyService);
		this.hasInstalledExtensionsContextKey = HasInstalledExtensionsContext.bindTo(contextKeyService);
		this.searchBuiltInExtensionsContextKey = SearchBuiltInExtensionsContext.bindTo(contextKeyService);
		this.recommendedExtensionsContextKey = RecommendedExtensionsContext.bindTo(contextKeyService);
		this.groupByServersContextKey = GroupByServersContext.bindTo(contextKeyService);
		this.defaultRecommendedExtensionsContextKey = DefaultRecommendedExtensionsContext.bindTo(contextKeyService);
		this.defaultRecommendedExtensionsContextKey.set(!this.configurationService.getValue<boolean>(ShowRecommendationsOnlyOnDemandKey));
		this.disposables.push(this.viewletService.onDidViewletOpen(this.onViewletOpen, this, this.disposables));

		this.extensionManagementService.getInstalled(LocalExtensionType.User).then(result => {
			this.hasInstalledExtensionsContextKey.set(result.length > 0);
		});

		this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AutoUpdateConfigurationKey)) {
				this.secondaryActions = null;
				this.updateTitleArea();
			}
			if (e.affectedKeys.indexOf(ShowRecommendationsOnlyOnDemandKey) > -1) {
				this.defaultRecommendedExtensionsContextKey.set(!this.configurationService.getValue<boolean>(ShowRecommendationsOnlyOnDemandKey));
			}
		}, this, this.disposables);
	}

	create(parent: HTMLElement): void {
		addClass(parent, 'extensions-viewlet');
		this.root = parent;

		const header = append(this.root, $('.header'));

		const placeholder = localize('searchExtensions', "Search Extensions in Marketplace");

		this.searchBox = this.instantiationService.createInstance(SuggestEnabledInput, `${VIEWLET_ID}.searchbox`, header, {
			triggerCharacters: ['@'],
			sortKey: item => {
				if (item.indexOf(':') === -1) { return 'a'; }
				else if (/ext:/.test(item) || /tag:/.test(item)) { return 'b'; }
				else if (/sort:/.test(item)) { return 'c'; }
				else { return 'd'; }
			},
			provideResults: (query) => Query.suggestions(query)
		}, placeholder, 'extensions:searchinput', { placeholderText: placeholder });

		this.disposables.push(attachSuggestEnabledInputBoxStyler(this.searchBox, this.themeService));

		this.disposables.push(this.searchBox);

		const _searchChange = new Emitter<string>();
		this.onSearchChange = _searchChange.event;
		this.searchBox.onInputDidChange(() => {
			this.triggerSearch();
			_searchChange.fire(this.searchBox.getValue());
		}, this, this.disposables);

		this.searchBox.onShouldFocusResults(() => this.focusListView(), this, this.disposables);

		this._register(this.onDidChangeVisibility(visible => {
			if (visible) {
				this.searchBox.focus();
			}
		}));

		this.extensionsBox = append(this.root, $('.extensions'));
		super.create(this.extensionsBox);
	}

	focus(): void {
		this.searchBox.focus();
	}

	layout(dimension: Dimension): void {
		toggleClass(this.root, 'narrow', dimension.width <= 300);
		this.searchBox.layout({ height: 20, width: dimension.width - 34 });
		super.layout(new Dimension(dimension.width, dimension.height - 38));
	}

	getOptimalWidth(): number {
		return 400;
	}

	getActions(): IAction[] {
		if (!this.primaryActions) {
			this.primaryActions = [
				this.instantiationService.createInstance(ClearExtensionsInputAction, ClearExtensionsInputAction.ID, ClearExtensionsInputAction.LABEL, this.onSearchChange)
			];
		}
		return this.primaryActions;
	}

	getSecondaryActions(): IAction[] {
		if (!this.secondaryActions) {
			if (!this.groupByServerAction) {
				this.groupByServerAction = this.instantiationService.createInstance(ChangeGroupAction, 'extensions.group.servers', localize('group by servers', "Group By: Server"), this.onSearchChange, 'server');
				this.disposables.push(this.onSearchChange(value => {
					this.groupByServerAction.enabled = !value || ExtensionsListView.isInstalledExtensionsQuery(value) || ExtensionsListView.isBuiltInExtensionsQuery(value);
				}));
			}
			this.secondaryActions = [
				this.instantiationService.createInstance(ShowInstalledExtensionsAction, ShowInstalledExtensionsAction.ID, ShowInstalledExtensionsAction.LABEL),
				this.instantiationService.createInstance(ShowOutdatedExtensionsAction, ShowOutdatedExtensionsAction.ID, ShowOutdatedExtensionsAction.LABEL),
				this.instantiationService.createInstance(ShowEnabledExtensionsAction, ShowEnabledExtensionsAction.ID, ShowEnabledExtensionsAction.LABEL),
				this.instantiationService.createInstance(ShowDisabledExtensionsAction, ShowDisabledExtensionsAction.ID, ShowDisabledExtensionsAction.LABEL),
				this.instantiationService.createInstance(ShowBuiltInExtensionsAction, ShowBuiltInExtensionsAction.ID, ShowBuiltInExtensionsAction.LABEL),
				this.instantiationService.createInstance(ShowRecommendedExtensionsAction, ShowRecommendedExtensionsAction.ID, ShowRecommendedExtensionsAction.LABEL),
				this.instantiationService.createInstance(ShowPopularExtensionsAction, ShowPopularExtensionsAction.ID, ShowPopularExtensionsAction.LABEL),
				new Separator(),
				this.instantiationService.createInstance(ChangeSortAction, 'extensions.sort.install', localize('sort by installs', "Sort By: Install Count"), this.onSearchChange, 'installs'),
				this.instantiationService.createInstance(ChangeSortAction, 'extensions.sort.rating', localize('sort by rating', "Sort By: Rating"), this.onSearchChange, 'rating'),
				this.instantiationService.createInstance(ChangeSortAction, 'extensions.sort.name', localize('sort by name', "Sort By: Name"), this.onSearchChange, 'name'),
				new Separator(),
				...(this.extensionManagementServerService.remoteExtensionManagementServer ? [this.groupByServerAction, new Separator()] : []),
				this.instantiationService.createInstance(CheckForUpdatesAction, CheckForUpdatesAction.ID, CheckForUpdatesAction.LABEL),
				...(this.configurationService.getValue(AutoUpdateConfigurationKey) ? [this.instantiationService.createInstance(DisableAutoUpdateAction, DisableAutoUpdateAction.ID, DisableAutoUpdateAction.LABEL)] : [this.instantiationService.createInstance(UpdateAllAction, UpdateAllAction.ID, UpdateAllAction.LABEL), this.instantiationService.createInstance(EnableAutoUpdateAction, EnableAutoUpdateAction.ID, EnableAutoUpdateAction.LABEL)]),
				this.instantiationService.createInstance(InstallVSIXAction, InstallVSIXAction.ID, InstallVSIXAction.LABEL),
				new Separator(),
				this.instantiationService.createInstance(DisableAllAction, DisableAllAction.ID, DisableAllAction.LABEL),
				this.instantiationService.createInstance(EnableAllAction, EnableAllAction.ID, EnableAllAction.LABEL)
			];
		}

		return this.secondaryActions;
	}

	search(value: string): void {
		const event = new Event('input', { bubbles: true }) as SearchInputEvent;
		event.immediate = true;

		this.searchBox.setValue(value);
	}

	private triggerSearch(immediate = false): void {
		this.searchDelayer.trigger(() => this.doSearch(), immediate || !this.searchBox.getValue() ? 0 : 500).then(undefined, err => this.onError(err));
	}

	private normalizedQuery(): string {
		return this.searchBox.getValue().replace(/@category/g, 'category').replace(/@tag:/g, 'tag:').replace(/@ext:/g, 'ext:');
	}

	private doSearch(): Promise<any> {
		const value = this.normalizedQuery();
		this.searchExtensionsContextKey.set(!!value);
		this.searchBuiltInExtensionsContextKey.set(ExtensionsListView.isBuiltInExtensionsQuery(value));
		this.groupByServersContextKey.set(ExtensionsListView.isGroupByServersExtensionsQuery(value));
		this.recommendedExtensionsContextKey.set(ExtensionsListView.isRecommendedExtensionsQuery(value));
		this.nonEmptyWorkspaceContextKey.set(this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY);

		if (value) {
			return this.progress(Promise.all(this.panels.map(view =>
				(<ExtensionsListView>view).show(this.normalizedQuery())
					.then(model => this.alertSearchResult(model.length, view.id))
			)));
		}
		return Promise.resolve(null);
	}

	protected onDidAddViews(added: IAddedViewDescriptorRef[]): ViewletPanel[] {
		const addedViews = super.onDidAddViews(added);
		this.progress(Promise.all(addedViews.map(addedView =>
			(<ExtensionsListView>addedView).show(this.normalizedQuery())
				.then(model => this.alertSearchResult(model.length, addedView.id))
		)));
		return addedViews;
	}

	private alertSearchResult(count: number, viewId: string) {
		switch (count) {
			case 0:
				break;
			case 1:
				if (viewIdNameMappings[viewId]) {
					alert(localize('extensionFoundInSection', "1 extension found in the {0} section.", viewIdNameMappings[viewId]));
				} else {
					alert(localize('extensionFound', "1 extension found."));
				}
				break;
			default:
				if (viewIdNameMappings[viewId]) {
					alert(localize('extensionsFoundInSection', "{0} extensions found in the {1} section.", count, viewIdNameMappings[viewId]));
				} else {
					alert(localize('extensionsFound', "{0} extensions found.", count));
				}
				break;
		}
	}

	protected createView(viewDescriptor: IViewDescriptor, options: IViewletViewOptions): ViewletPanel {
		if (this.extensionManagementServerService.remoteExtensionManagementServer) {
			const extensionManagementServer = viewDescriptor.id === `server.extensionsList.${this.extensionManagementServerService.localExtensionManagementServer.authority}` ? this.extensionManagementServerService.localExtensionManagementServer
				: viewDescriptor.id === `server.extensionsList.${this.extensionManagementServerService.remoteExtensionManagementServer.authority}` ? this.extensionManagementServerService.remoteExtensionManagementServer : null;
			if (extensionManagementServer) {
				const servicesCollection: ServiceCollection = new ServiceCollection();
				servicesCollection.set(IExtensionManagementService, extensionManagementServer.extensionManagementService);
				servicesCollection.set(IExtensionsWorkbenchService, new SyncDescriptor(ExtensionsWorkbenchService));
				const instantiationService = this.instantiationService.createChild(servicesCollection);
				return instantiationService.createInstance(viewDescriptor.ctor, options, [extensionManagementServer]) as ViewletPanel;
			}
		}
		return this.instantiationService.createInstance(viewDescriptor.ctor, options) as ViewletPanel;
	}

	private count(): number {
		return this.panels.reduce((count, view) => (<ExtensionsListView>view).count() + count, 0);
	}

	private focusListView(): void {
		if (this.count() > 0) {
			this.panels[0].focus();
		}
	}

	private onViewletOpen(viewlet: IViewlet): void {
		if (!viewlet || viewlet.getId() === VIEWLET_ID) {
			return;
		}

		if (this.configurationService.getValue<boolean>(CloseExtensionDetailsOnViewChangeKey)) {
			const promises = this.editorGroupService.groups.map(group => {
				const editors = group.editors.filter(input => input instanceof ExtensionsInput);
				const promises = editors.map(editor => group.closeEditor(editor));

				return Promise.all(promises);
			});

			Promise.all(promises);
		}
	}

	private progress<T>(promise: Promise<T>): Promise<T> {
		return this.progressService.withProgress({ location: ProgressLocation.Extensions }, () => promise);
	}

	private onError(err: any): void {
		if (isPromiseCanceledError(err)) {
			return;
		}

		const message = err && err.message || '';

		if (/ECONNREFUSED/.test(message)) {
			const error = createErrorWithActions(localize('suggestProxyError', "Marketplace returned 'ECONNREFUSED'. Please check the 'http.proxy' setting."), {
				actions: [
					this.instantiationService.createInstance(OpenGlobalSettingsAction, OpenGlobalSettingsAction.ID, OpenGlobalSettingsAction.LABEL)
				]
			});

			this.notificationService.error(error);
			return;
		}

		this.notificationService.error(err);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}

export class StatusUpdater implements IWorkbenchContribution {

	private disposables: IDisposable[];
	private badgeHandle: IDisposable;

	constructor(
		@IActivityService private readonly activityService: IActivityService,
		@IExtensionsWorkbenchService private readonly extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		extensionsWorkbenchService.onChange(this.onServiceChange, this, this.disposables);
	}

	private onServiceChange(): void {

		dispose(this.badgeHandle);

		if (this.extensionsWorkbenchService.local.some(e => e.state === ExtensionState.Installing)) {
			this.badgeHandle = this.activityService.showActivity(VIEWLET_ID, new ProgressBadge(() => localize('extensions', "Extensions")), 'extensions-badge progress-badge');
			return;
		}

		const outdated = this.extensionsWorkbenchService.local.reduce((r, e) => r + (e.outdated && e.enablementState !== EnablementState.Disabled && e.enablementState !== EnablementState.WorkspaceDisabled ? 1 : 0), 0);
		if (outdated > 0) {
			const badge = new NumberBadge(outdated, n => localize('outdatedExtensions', '{0} Outdated Extensions', n));
			this.badgeHandle = this.activityService.showActivity(VIEWLET_ID, badge, 'extensions-badge count-badge');
		}
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		dispose(this.badgeHandle);
	}
}

export class MaliciousExtensionChecker implements IWorkbenchContribution {

	private disposables: IDisposable[];

	constructor(
		@IExtensionManagementService private readonly extensionsManagementService: IExtensionManagementService,
		@IWindowService private readonly windowService: IWindowService,
		@ILogService private readonly logService: ILogService,
		@INotificationService private readonly notificationService: INotificationService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService
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

	private checkForMaliciousExtensions(): Promise<any> {
		return this.extensionsManagementService.getExtensionsReport().then(report => {
			const maliciousSet = getMaliciousExtensionsSet(report);

			return this.extensionsManagementService.getInstalled(LocalExtensionType.User).then(installed => {
				const maliciousExtensions = installed
					.filter(e => maliciousSet.has(getGalleryExtensionIdFromLocal(e)));

				if (maliciousExtensions.length) {
					return Promise.all(maliciousExtensions.map(e => this.extensionsManagementService.uninstall(e, true).then(() => {
						this.notificationService.prompt(
							Severity.Warning,
							localize('malicious warning', "We have uninstalled '{0}' which was reported to be problematic.", getGalleryExtensionIdFromLocal(e)),
							[{
								label: localize('reloadNow', "Reload Now"),
								run: () => this.windowService.reloadWindow()
							}],
							{ sticky: true }
						);
					})));
				} else {
					return Promise.resolve(null);
				}
			});
		}, err => this.logService.error(err));
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}
