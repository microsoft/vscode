/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/extensionsViewlet';
import uri from 'vs/base/common/uri';
import * as modes from 'vs/editor/common/modes';
import { localize } from 'vs/nls';
import { ThrottledDelayer, always } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { isPromiseCanceledError, onUnexpectedError, create as createError } from 'vs/base/common/errors';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Event as EventOf, Emitter, chain } from 'vs/base/common/event';
import { IAction } from 'vs/base/common/actions';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { append, $, addClass, removeClass, toggleClass, Dimension } from 'vs/base/browser/dom';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IExtensionsWorkbenchService, IExtensionsViewlet, VIEWLET_ID, ExtensionState, AutoUpdateConfigurationKey, ShowRecommendationsOnlyOnDemandKey, CloseExtensionDetailsOnViewChangeKey, VIEW_CONTAINER } from '../common/extensions';
import {
	ShowEnabledExtensionsAction, ShowInstalledExtensionsAction, ShowRecommendedExtensionsAction, ShowPopularExtensionsAction, ShowDisabledExtensionsAction,
	ShowOutdatedExtensionsAction, ClearExtensionsInputAction, ChangeSortAction, UpdateAllAction, CheckForUpdatesAction, DisableAllAction, EnableAllAction,
	EnableAutoUpdateAction, DisableAutoUpdateAction, ShowBuiltInExtensionsAction, InstallVSIXAction, ChangeGroupAction
} from 'vs/workbench/parts/extensions/electron-browser/extensionsActions';
import { LocalExtensionType, IExtensionManagementService, IExtensionManagementServerService, IExtensionManagementServer } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionsInput } from 'vs/workbench/parts/extensions/common/extensionsInput';
import { ExtensionsListView, InstalledExtensionsView, EnabledExtensionsView, DisabledExtensionsView, RecommendedExtensionsView, WorkspaceRecommendedExtensionsView, BuiltInExtensionsView, BuiltInThemesExtensionsView, BuiltInBasicsExtensionsView, GroupByServerExtensionsView, DefaultRecommendedExtensionsView } from './extensionsViews';
import { OpenGlobalSettingsAction } from 'vs/workbench/parts/preferences/browser/preferencesActions';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { IEditorGroupsService } from 'vs/workbench/services/group/common/editorGroupsService';
import Severity from 'vs/base/common/severity';
import { IActivityService, ProgressBadge, NumberBadge } from 'vs/workbench/services/activity/common/activity';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { inputForeground, inputBackground, inputBorder, inputPlaceholderForeground } from 'vs/platform/theme/common/colorRegistry';
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
import { SingleServerExtensionManagementServerService } from 'vs/workbench/services/extensions/node/extensionManagementServerService';
import { Query } from 'vs/workbench/parts/extensions/common/extensionQuery';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditorWidget';
import { IModelService } from 'vs/editor/common/services/modelService';
import { Range } from 'vs/editor/common/core/range';
import { Position } from 'vs/editor/common/core/position';
import { ITextModel } from 'vs/editor/common/model';
import { IEditorOptions } from 'vs/editor/common/config/editorOptions';
import { getSimpleEditorOptions } from 'vs/workbench/parts/codeEditor/electron-browser/simpleEditorOptions';
import { SuggestController } from 'vs/editor/contrib/suggest/suggestController';
import { ContextMenuController } from 'vs/editor/contrib/contextmenu/contextmenu';
import { MenuPreventer } from 'vs/workbench/parts/codeEditor/electron-browser/menuPreventer';
import { SnippetController2 } from 'vs/editor/contrib/snippet/snippetController2';
import { isMacintosh } from 'vs/base/common/platform';

interface SearchInputEvent extends Event {
	target: HTMLInputElement;
	immediate?: boolean;
}

const NonEmptyWorkspaceContext = new RawContextKey<boolean>('nonEmptyWorkspace', false);
const SearchExtensionsContext = new RawContextKey<boolean>('searchExtensions', false);
const SearchInstalledExtensionsContext = new RawContextKey<boolean>('searchInstalledExtensions', false);
const SearchBuiltInExtensionsContext = new RawContextKey<boolean>('searchBuiltInExtensions', false);
const RecommendedExtensionsContext = new RawContextKey<boolean>('recommendedExtensions', false);
const DefaultRecommendedExtensionsContext = new RawContextKey<boolean>('defaultRecommendedExtensions', false);
const GroupByServersContext = new RawContextKey<boolean>('groupByServersContext', false);

export class ExtensionsViewletViewsContribution implements IWorkbenchContribution {

	constructor(
		@IExtensionManagementServerService private extensionManagementServerService: IExtensionManagementServerService
	) {
		this.registerViews();
	}

	private registerViews(): void {
		let viewDescriptors = [];
		viewDescriptors.push(this.createMarketPlaceExtensionsListViewDescriptor());
		viewDescriptors.push(this.createEnabledExtensionsListViewDescriptor());
		viewDescriptors.push(this.createDisabledExtensionsListViewDescriptor());
		viewDescriptors.push(this.createSearchInstalledExtensionsListViewDescriptor());
		viewDescriptors.push(this.createSearchBuiltInExtensionsListViewDescriptor());
		viewDescriptors.push(this.createSearchBuiltInBasicsExtensionsListViewDescriptor());
		viewDescriptors.push(this.createSearchBuiltInThemesExtensionsListViewDescriptor());
		viewDescriptors.push(this.createDefaultRecommendedExtensionsListViewDescriptor());
		viewDescriptors.push(this.createOtherRecommendedExtensionsListViewDescriptor());
		viewDescriptors.push(this.createWorkspaceRecommendedExtensionsListViewDescriptor());

		if (this.extensionManagementServerService.extensionManagementServers.length > 1) {
			for (const extensionManagementServer of this.extensionManagementServerService.extensionManagementServers) {
				viewDescriptors.push(...this.createExtensionsViewDescriptorsForServer(extensionManagementServer));
			}
		}

		ViewsRegistry.registerViews(viewDescriptors);
	}

	private createMarketPlaceExtensionsListViewDescriptor(): IViewDescriptor {
		return {
			id: 'extensions.listView',
			name: localize('marketPlace', "Marketplace"),
			container: VIEW_CONTAINER,
			ctor: ExtensionsListView,
			when: ContextKeyExpr.and(ContextKeyExpr.has('searchExtensions'), ContextKeyExpr.not('searchInstalledExtensions'), ContextKeyExpr.not('searchBuiltInExtensions'), ContextKeyExpr.not('recommendedExtensions'), ContextKeyExpr.not('groupByServersContext')),
			weight: 100
		};
	}

	private createEnabledExtensionsListViewDescriptor(): IViewDescriptor {
		return {
			id: 'extensions.enabledExtensionList',
			name: localize('enabledExtensions', "Enabled"),
			container: VIEW_CONTAINER,
			ctor: EnabledExtensionsView,
			when: ContextKeyExpr.not('searchExtensions'),
			weight: 40,
			canToggleVisibility: true,
			order: 1
		};
	}

	private createDisabledExtensionsListViewDescriptor(): IViewDescriptor {
		return {
			id: 'extensions.disabledExtensionList',
			name: localize('disabledExtensions', "Disabled"),
			container: VIEW_CONTAINER,
			ctor: DisabledExtensionsView,
			when: ContextKeyExpr.not('searchExtensions'),
			weight: 10,
			canToggleVisibility: true,
			order: 3,
			collapsed: true
		};
	}

	private createSearchInstalledExtensionsListViewDescriptor(): IViewDescriptor {
		return {
			id: 'extensions.searchInstalledList',
			name: localize('searchInstalledExtensions', "Installed"),
			container: VIEW_CONTAINER,
			ctor: InstalledExtensionsView,
			when: ContextKeyExpr.and(ContextKeyExpr.has('searchInstalledExtensions'), ContextKeyExpr.not('groupByServersContext')),
			weight: 100
		};
	}

	private createExtensionsViewDescriptorsForServer(server: IExtensionManagementServer): IViewDescriptor[] {
		return [{
			id: `server.extensionsList.${server.location.toString()}`,
			name: server.location.authority,
			container: VIEW_CONTAINER,
			ctor: GroupByServerExtensionsView,
			when: ContextKeyExpr.has('groupByServersContext'),
			weight: 100
		}];
	}

	private createDefaultRecommendedExtensionsListViewDescriptor(): IViewDescriptor {
		return {
			id: 'extensions.recommendedList',
			name: localize('recommendedExtensions', "Recommended"),
			container: VIEW_CONTAINER,
			ctor: DefaultRecommendedExtensionsView,
			when: ContextKeyExpr.and(ContextKeyExpr.not('searchExtensions'), ContextKeyExpr.has('defaultRecommendedExtensions')),
			weight: 60,
			order: 2,
			canToggleVisibility: true
		};
	}

	private createOtherRecommendedExtensionsListViewDescriptor(): IViewDescriptor {
		return {
			id: 'extensions.otherrecommendedList',
			name: localize('otherRecommendedExtensions', "Other Recommendations"),
			container: VIEW_CONTAINER,
			ctor: RecommendedExtensionsView,
			when: ContextKeyExpr.has('recommendedExtensions'),
			weight: 50,
			canToggleVisibility: true,
			order: 2
		};
	}

	private createWorkspaceRecommendedExtensionsListViewDescriptor(): IViewDescriptor {
		return {
			id: 'extensions.workspaceRecommendedList',
			name: localize('workspaceRecommendedExtensions', "Workspace Recommendations"),
			container: VIEW_CONTAINER,
			ctor: WorkspaceRecommendedExtensionsView,
			when: ContextKeyExpr.and(ContextKeyExpr.has('recommendedExtensions'), ContextKeyExpr.has('nonEmptyWorkspace')),
			weight: 50,
			canToggleVisibility: true,
			order: 1
		};
	}

	private createSearchBuiltInExtensionsListViewDescriptor(): IViewDescriptor {
		return {
			id: 'extensions.builtInExtensionsList',
			name: localize('builtInExtensions', "Features"),
			container: VIEW_CONTAINER,
			ctor: BuiltInExtensionsView,
			when: ContextKeyExpr.has('searchBuiltInExtensions'),
			weight: 100,
			canToggleVisibility: true
		};
	}

	private createSearchBuiltInThemesExtensionsListViewDescriptor(): IViewDescriptor {
		return {
			id: 'extensions.builtInThemesExtensionsList',
			name: localize('builtInThemesExtensions', "Themes"),
			container: VIEW_CONTAINER,
			ctor: BuiltInThemesExtensionsView,
			when: ContextKeyExpr.has('searchBuiltInExtensions'),
			weight: 100,
			canToggleVisibility: true
		};
	}

	private createSearchBuiltInBasicsExtensionsListViewDescriptor(): IViewDescriptor {
		return {
			id: 'extensions.builtInBasicsExtensionsList',
			name: localize('builtInBasicsExtensions', "Programming Languages"),
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
	private searchInstalledExtensionsContextKey: IContextKey<boolean>;
	private searchBuiltInExtensionsContextKey: IContextKey<boolean>;
	private groupByServersContextKey: IContextKey<boolean>;
	private recommendedExtensionsContextKey: IContextKey<boolean>;
	private defaultRecommendedExtensionsContextKey: IContextKey<boolean>;

	private searchDelayer: ThrottledDelayer<any>;
	private root: HTMLElement;

	private searchBox: CodeEditorWidget;
	private extensionsBox: HTMLElement;
	private primaryActions: IAction[];
	private secondaryActions: IAction[];
	private groupByServerAction: IAction;
	private disposables: IDisposable[] = [];
	private monacoStyleContainer: HTMLDivElement;
	private placeholderText: HTMLDivElement;

	constructor(
		@IPartService partService: IPartService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IProgressService private progressService: IProgressService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IEditorGroupsService private editorGroupService: IEditorGroupsService,
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
		@INotificationService private notificationService: INotificationService,
		@IViewletService private viewletService: IViewletService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService,
		@IExtensionManagementServerService private extensionManagementServerService: IExtensionManagementServerService,
		@IModelService private modelService: IModelService,
	) {
		super(VIEWLET_ID, `${VIEWLET_ID}.state`, true, partService, telemetryService, storageService, instantiationService, themeService, contextMenuService, extensionService, contextService);

		this.searchDelayer = new ThrottledDelayer(500);
		this.nonEmptyWorkspaceContextKey = NonEmptyWorkspaceContext.bindTo(contextKeyService);
		this.searchExtensionsContextKey = SearchExtensionsContext.bindTo(contextKeyService);
		this.searchInstalledExtensionsContextKey = SearchInstalledExtensionsContext.bindTo(contextKeyService);
		this.searchBuiltInExtensionsContextKey = SearchBuiltInExtensionsContext.bindTo(contextKeyService);
		this.recommendedExtensionsContextKey = RecommendedExtensionsContext.bindTo(contextKeyService);
		this.groupByServersContextKey = GroupByServersContext.bindTo(contextKeyService);
		this.defaultRecommendedExtensionsContextKey = DefaultRecommendedExtensionsContext.bindTo(contextKeyService);
		this.defaultRecommendedExtensionsContextKey.set(!this.configurationService.getValue<boolean>(ShowRecommendationsOnlyOnDemandKey));
		this.disposables.push(this.viewletService.onDidViewletOpen(this.onViewletOpen, this, this.disposables));

		this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(AutoUpdateConfigurationKey)) {
				this.secondaryActions = null;
				this.updateTitleArea();
			}
			if (e.affectedKeys.indexOf(ShowRecommendationsOnlyOnDemandKey) > -1) {
				this.defaultRecommendedExtensionsContextKey.set(!this.configurationService.getValue<boolean>(ShowRecommendationsOnlyOnDemandKey));
			}
		}, this, this.disposables);

		modes.SuggestRegistry.register({ scheme: 'extensions', pattern: '**/searchinput', hasAccessToAllModels: true }, {
			triggerCharacters: ['@'],
			provideCompletionItems: (model: ITextModel, position: Position, _context: modes.SuggestContext) => {
				const sortKey = (item: string) => {
					if (item.indexOf(':') === -1) { return 'a'; }
					else if (/ext:/.test(item) || /tag:/.test(item)) { return 'b'; }
					else if (/sort:/.test(item)) { return 'c'; }
					else { return 'd'; }
				};
				return {
					suggestions: this.autoComplete(model.getValue(), position.column).map(item => (
						{
							label: item.fullText,
							insertText: item.fullText,
							overwriteBefore: item.overwrite,
							sortText: sortKey(item.fullText),
							type: <modes.SuggestionType>'keyword'
						}))
				};
			}
		});
	}

	create(parent: HTMLElement): TPromise<void> {
		addClass(parent, 'extensions-viewlet');
		this.root = parent;

		const header = append(this.root, $('.header'));
		this.monacoStyleContainer = append(header, $('.monaco-container'));
		this.searchBox = this.instantiationService.createInstance(CodeEditorWidget, this.monacoStyleContainer,
			mixinHTMLInputStyleOptions(getSimpleEditorOptions(), localize('searchExtensions', "Search Extensions in Marketplace")),
			{
				isSimpleWidget: true, contributions: [
					SuggestController,
					SnippetController2,
					ContextMenuController,
					MenuPreventer
				]
			});

		this.placeholderText = append(this.monacoStyleContainer, $('.search-placeholder', null, localize('searchExtensions', "Search Extensions in Marketplace")));

		this.extensionsBox = append(this.root, $('.extensions'));

		this.searchBox.setModel(this.modelService.createModel('', null, uri.parse('extensions:searchinput'), true));

		this.disposables.push(this.searchBox.onDidPaste(() => {
			let trimmed = this.searchBox.getValue().replace(/\s+/g, ' ');
			this.searchBox.setValue(trimmed);
			this.searchBox.setScrollTop(0);
			this.searchBox.setPosition(new Position(1, trimmed.length + 1));
		}));

		this.disposables.push(this.searchBox.onDidFocusEditorText(() => addClass(this.monacoStyleContainer, 'synthetic-focus')));
		this.disposables.push(this.searchBox.onDidBlurEditorText(() => removeClass(this.monacoStyleContainer, 'synthetic-focus')));

		const onKeyDownMonaco = chain(this.searchBox.onKeyDown);
		onKeyDownMonaco.filter(e => e.keyCode === KeyCode.Enter).on(e => e.preventDefault(), this, this.disposables);
		onKeyDownMonaco.filter(e => e.keyCode === KeyCode.DownArrow && (isMacintosh ? e.metaKey : e.ctrlKey)).on(() => this.focusListView(), this, this.disposables);

		const searchChangeEvent = new Emitter<string>();
		this.onSearchChange = searchChangeEvent.event;

		let existingContent = this.searchBox.getValue().trim();
		this.disposables.push(this.searchBox.getModel().onDidChangeContent(() => {
			this.placeholderText.style.visibility = this.searchBox.getValue() ? 'hidden' : 'visible';
			let content = this.searchBox.getValue().trim();
			if (existingContent === content) { return; }
			this.triggerSearch();
			searchChangeEvent.fire(content);
			existingContent = content;
		}));

		return super.create(this.extensionsBox)
			.then(() => this.extensionManagementService.getInstalled(LocalExtensionType.User))
			.then(installed => {
				if (installed.length === 0) {
					this.searchBox.setValue('@sort:installs');
					this.searchExtensionsContextKey.set(true);
				}
			});
	}

	public updateStyles(): void {
		super.updateStyles();

		this.monacoStyleContainer.style.backgroundColor = this.getColor(inputBackground);
		this.monacoStyleContainer.style.color = this.getColor(inputForeground);
		this.placeholderText.style.color = this.getColor(inputPlaceholderForeground);

		const inputBorderColor = this.getColor(inputBorder);
		this.monacoStyleContainer.style.borderWidth = inputBorderColor ? '1px' : null;
		this.monacoStyleContainer.style.borderStyle = inputBorderColor ? 'solid' : null;
		this.monacoStyleContainer.style.borderColor = inputBorderColor;

		let cursor = this.monacoStyleContainer.getElementsByClassName('cursor')[0] as HTMLDivElement;
		if (cursor) {
			cursor.style.backgroundColor = this.getColor(inputForeground);
		}
	}

	setVisible(visible: boolean): TPromise<void> {
		const isVisibilityChanged = this.isVisible() !== visible;
		return super.setVisible(visible).then(() => {
			if (isVisibilityChanged) {
				if (visible) {
					this.searchBox.focus();
					this.searchBox.setSelection(new Range(1, 1, 1, this.searchBox.getValue().length + 1));
				}
			}
		});
	}

	focus(): void {
		this.searchBox.focus();
	}

	layout(dimension: Dimension): void {
		toggleClass(this.root, 'narrow', dimension.width <= 300);
		this.searchBox.layout({ height: 20, width: dimension.width - 34 });
		this.placeholderText.style.width = '' + (dimension.width - 30) + 'px';

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
					this.groupByServerAction.enabled = !value || InstalledExtensionsView.isInstalledExtensionsQuery(value) || ExtensionsListView.isBuiltInExtensionsQuery(value);
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
				...(this.extensionManagementServerService.extensionManagementServers.length > 1 ? [this.groupByServerAction, new Separator()] : []),
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
		this.searchBox.setPosition(new Position(1, value.length + 1));
	}

	private triggerSearch(immediate = false): void {
		this.searchDelayer.trigger(() => this.doSearch(), immediate || !this.searchBox.getValue() ? 0 : 500).done(null, err => this.onError(err));
	}

	private normalizedQuery(): string {
		return (this.searchBox.getValue() || '').replace(/@category/g, 'category').replace(/@tag:/g, 'tag:').replace(/@ext:/g, 'ext:');
	}

	private doSearch(): TPromise<any> {
		const value = this.normalizedQuery();
		this.searchExtensionsContextKey.set(!!value);
		this.searchInstalledExtensionsContextKey.set(InstalledExtensionsView.isInstalledExtensionsQuery(value));
		this.searchBuiltInExtensionsContextKey.set(ExtensionsListView.isBuiltInExtensionsQuery(value));
		this.groupByServersContextKey.set(ExtensionsListView.isGroupByServersExtensionsQuery(value));
		this.recommendedExtensionsContextKey.set(ExtensionsListView.isRecommendedExtensionsQuery(value));
		this.nonEmptyWorkspaceContextKey.set(this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY);

		if (value) {
			return this.progress(TPromise.join(this.panels.map(view => (<ExtensionsListView>view).show(this.normalizedQuery()))));
		}
		return TPromise.as(null);
	}

	protected onDidAddViews(added: IAddedViewDescriptorRef[]): ViewletPanel[] {
		const addedViews = super.onDidAddViews(added);
		this.progress(TPromise.join(addedViews.map(addedView => (<ExtensionsListView>addedView).show(this.normalizedQuery()))));
		return addedViews;
	}

	protected createView(viewDescriptor: IViewDescriptor, options: IViewletViewOptions): ViewletPanel {
		for (const extensionManagementServer of this.extensionManagementServerService.extensionManagementServers) {
			if (viewDescriptor.id === `server.extensionsList.${extensionManagementServer.location.toString()}`) {
				const servicesCollection: ServiceCollection = new ServiceCollection();
				servicesCollection.set(IExtensionManagementServerService, new SingleServerExtensionManagementServerService(extensionManagementServer));
				servicesCollection.set(IExtensionManagementService, extensionManagementServer.extensionManagementService);
				servicesCollection.set(IExtensionsWorkbenchService, new SyncDescriptor(ExtensionsWorkbenchService));
				const instantiationService = this.instantiationService.createChild(servicesCollection);
				return instantiationService.createInstance(viewDescriptor.ctor, options, [extensionManagementServer]) as ViewletPanel;
			}
		}
		return this.instantiationService.createInstance(viewDescriptor.ctor, options) as ViewletPanel;
	}

	private autoComplete(query: string, position: number): { fullText: string, overwrite: number }[] {
		let wordStart = query.lastIndexOf(' ', position - 1) + 1;
		let alreadyTypedCount = position - wordStart - 1;

		// dont show autosuggestions if the user has typed something, but hasn't used the trigger character
		if (alreadyTypedCount > 0 && query[wordStart] !== '@') { return []; }

		return Query.autocompletions(query).map(replacement => ({ fullText: replacement, overwrite: alreadyTypedCount }));
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

				return TPromise.join(promises);
			});

			TPromise.join(promises).done(null, onUnexpectedError);
		}
	}

	private progress<T>(promise: TPromise<T>): TPromise<T> {
		const progressRunner = this.progressService.show(true);
		return always(promise, () => progressRunner.done());
	}

	private onError(err: any): void {
		if (isPromiseCanceledError(err)) {
			return;
		}

		const message = err && err.message || '';

		if (/ECONNREFUSED/.test(message)) {
			const error = createError(localize('suggestProxyError', "Marketplace returned 'ECONNREFUSED'. Please check the 'http.proxy' setting."), {
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
		@IActivityService private activityService: IActivityService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		extensionsWorkbenchService.onChange(this.onServiceChange, this, this.disposables);
	}

	private onServiceChange(): void {

		dispose(this.badgeHandle);

		if (this.extensionsWorkbenchService.local.some(e => e.state === ExtensionState.Installing)) {
			this.badgeHandle = this.activityService.showActivity(VIEWLET_ID, new ProgressBadge(() => localize('extensions', "Extensions")), 'extensions-badge progress-badge');
			return;
		}

		const outdated = this.extensionsWorkbenchService.local.reduce((r, e) => r + (e.outdated ? 1 : 0), 0);
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
		@IExtensionManagementService private extensionsManagementService: IExtensionManagementService,
		@IWindowService private windowService: IWindowService,
		@ILogService private logService: ILogService,
		@INotificationService private notificationService: INotificationService
	) {
		this.loopCheckForMaliciousExtensions();
	}

	private loopCheckForMaliciousExtensions(): void {
		this.checkForMaliciousExtensions()
			.then(() => TPromise.timeout(1000 * 60 * 5)) // every five minutes
			.then(() => this.loopCheckForMaliciousExtensions());
	}

	private checkForMaliciousExtensions(): TPromise<any> {
		return this.extensionsManagementService.getExtensionsReport().then(report => {
			const maliciousSet = getMaliciousExtensionsSet(report);

			return this.extensionsManagementService.getInstalled(LocalExtensionType.User).then(installed => {
				const maliciousExtensions = installed
					.filter(e => maliciousSet.has(getGalleryExtensionIdFromLocal(e)));

				if (maliciousExtensions.length) {
					return TPromise.join(maliciousExtensions.map(e => this.extensionsManagementService.uninstall(e, true).then(() => {
						this.notificationService.prompt(
							Severity.Warning,
							localize('malicious warning', "We have uninstalled '{0}' which was reported to be problematic.", getGalleryExtensionIdFromLocal(e)),
							[{
								label: localize('reloadNow', "Reload Now"),
								run: () => this.windowService.reloadWindow()
							}]
						);
					})));
				} else {
					return TPromise.as(null);
				}
			});
		}, err => this.logService.error(err));
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
	}
}

function mixinHTMLInputStyleOptions(config: IEditorOptions, ariaLabel?: string): IEditorOptions {
	config.fontSize = 13;
	config.lineHeight = 22;
	config.wordWrap = 'off';
	config.scrollbar.vertical = 'hidden';
	config.ariaLabel = ariaLabel || '';
	config.renderIndentGuides = false;
	config.cursorWidth = 1;
	config.snippetSuggestions = 'none';
	config.suggest = { filterGraceful: false };
	config.fontFamily = ' -apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", "HelveticaNeue-Light", "Ubuntu", "Droid Sans", sans-serif';
	return config;
}
