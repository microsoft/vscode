/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import { isCancellationError, getErrorMessage } from 'vs/base/common/errors';
import { createErrorWithActions } from 'vs/base/common/errorMessage';
import { PagedModel, IPagedModel, IPager, DelayedPagedModel } from 'vs/base/common/paging';
import { SortOrder, IQueryOptions as IGalleryQueryOptions, SortBy as GallerySortBy, InstallExtensionInfo, ExtensionGalleryErrorCode, ExtensionGalleryError } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IExtensionManagementServer, IExtensionManagementServerService, EnablementState, IWorkbenchExtensionManagementService, IWorkbenchExtensionEnablementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { IExtensionRecommendationsService } from 'vs/workbench/services/extensionRecommendations/common/extensionRecommendations';
import { areSameExtensions, getExtensionDependencies } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { append, $ } from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Delegate, Renderer, IExtensionsViewState } from 'vs/workbench/contrib/extensions/browser/extensionsList';
import { ExtensionState, IExtension, IExtensionsWorkbenchService, IWorkspaceRecommendedExtensionsView } from 'vs/workbench/contrib/extensions/common/extensions';
import { Query } from 'vs/workbench/contrib/extensions/common/extensionQuery';
import { IExtensionService, toExtension } from 'vs/workbench/services/extensions/common/extensions';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { IViewletViewOptions } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { ManageExtensionAction, getContextMenuActions, ExtensionAction } from 'vs/workbench/contrib/extensions/browser/extensionsActions';
import { WorkbenchPagedList } from 'vs/platform/list/browser/listService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { ViewPane, IViewPaneOptions, ViewPaneShowActions } from 'vs/workbench/browser/parts/views/viewPane';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { coalesce, distinct } from 'vs/base/common/arrays';
import { alert } from 'vs/base/browser/ui/aria/aria';
import { IListContextMenuEvent } from 'vs/base/browser/ui/list/list';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IAction, Action, Separator, ActionRunner } from 'vs/base/common/actions';
import { ExtensionIdentifier, ExtensionIdentifierMap, ExtensionUntrustedWorkspaceSupportType, ExtensionVirtualWorkspaceSupportType, IExtensionDescription, isLanguagePackExtension } from 'vs/platform/extensions/common/extensions';
import { CancelablePromise, createCancelablePromise, ThrottledDelayer } from 'vs/base/common/async';
import { IProductService } from 'vs/platform/product/common/productService';
import { SeverityIcon } from 'vs/platform/severityIcon/browser/severityIcon';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IViewDescriptorService, ViewContainerLocation } from 'vs/workbench/common/views';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { isVirtualWorkspace } from 'vs/platform/workspace/common/virtualWorkspace';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { IWorkbenchLayoutService, Position } from 'vs/workbench/services/layout/browser/layoutService';
import { HoverPosition } from 'vs/base/browser/ui/hover/hoverWidget';
import { ILogService } from 'vs/platform/log/common/log';
import { isOfflineError } from 'vs/base/parts/request/common/request';
import { defaultCountBadgeStyles } from 'vs/platform/theme/browser/defaultStyles';
import { Registry } from 'vs/platform/registry/common/platform';
import { Extensions, IExtensionFeatureRenderer, IExtensionFeaturesManagementService, IExtensionFeaturesRegistry } from 'vs/workbench/services/extensionManagement/common/extensionFeatures';
import { URI } from 'vs/base/common/uri';
import { isString } from 'vs/base/common/types';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IHoverService } from 'vs/platform/hover/browser/hover';

export const NONE_CATEGORY = 'none';

class ExtensionsViewState extends Disposable implements IExtensionsViewState {

	private readonly _onFocus: Emitter<IExtension> = this._register(new Emitter<IExtension>());
	readonly onFocus: Event<IExtension> = this._onFocus.event;

	private readonly _onBlur: Emitter<IExtension> = this._register(new Emitter<IExtension>());
	readonly onBlur: Event<IExtension> = this._onBlur.event;

	private currentlyFocusedItems: IExtension[] = [];

	onFocusChange(extensions: IExtension[]): void {
		this.currentlyFocusedItems.forEach(extension => this._onBlur.fire(extension));
		this.currentlyFocusedItems = extensions;
		this.currentlyFocusedItems.forEach(extension => this._onFocus.fire(extension));
	}
}

export interface ExtensionsListViewOptions {
	server?: IExtensionManagementServer;
	flexibleHeight?: boolean;
	onDidChangeTitle?: Event<string>;
	hideBadge?: boolean;
}

interface IQueryResult {
	model: IPagedModel<IExtension>;
	readonly onDidChangeModel?: Event<IPagedModel<IExtension>>;
	readonly disposables: DisposableStore;
}

const enum LocalSortBy {
	UpdateDate = 'UpdateDate',
}

function isLocalSortBy(value: any): value is LocalSortBy {
	switch (value as LocalSortBy) {
		case LocalSortBy.UpdateDate: return true;
	}
}

type SortBy = LocalSortBy | GallerySortBy;
type IQueryOptions = Omit<IGalleryQueryOptions, 'sortBy'> & { sortBy?: SortBy };

export class ExtensionsListView extends ViewPane {

	private static RECENT_UPDATE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days

	private bodyTemplate: {
		messageContainer: HTMLElement;
		messageSeverityIcon: HTMLElement;
		messageBox: HTMLElement;
		extensionsList: HTMLElement;
	} | undefined;
	private badge: CountBadge | undefined;
	private list: WorkbenchPagedList<IExtension> | null = null;
	private queryRequest: { query: string; request: CancelablePromise<IPagedModel<IExtension>> } | null = null;
	private queryResult: IQueryResult | undefined;

	private readonly contextMenuActionRunner = this._register(new ActionRunner());

	constructor(
		protected readonly options: ExtensionsListViewOptions,
		viewletViewOptions: IViewletViewOptions,
		@INotificationService protected notificationService: INotificationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IExtensionService private readonly extensionService: IExtensionService,
		@IExtensionsWorkbenchService protected extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionRecommendationsService protected extensionRecommendationsService: IExtensionRecommendationsService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkspaceContextService protected contextService: IWorkspaceContextService,
		@IExtensionManagementServerService protected readonly extensionManagementServerService: IExtensionManagementServerService,
		@IExtensionManifestPropertiesService private readonly extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IWorkbenchExtensionManagementService protected readonly extensionManagementService: IWorkbenchExtensionManagementService,
		@IWorkspaceContextService protected readonly workspaceService: IWorkspaceContextService,
		@IProductService protected readonly productService: IProductService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IOpenerService openerService: IOpenerService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IStorageService private readonly storageService: IStorageService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkbenchExtensionEnablementService private readonly extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IWorkbenchLayoutService private readonly layoutService: IWorkbenchLayoutService,
		@IExtensionFeaturesManagementService private readonly extensionFeaturesManagementService: IExtensionFeaturesManagementService,
		@IUriIdentityService protected readonly uriIdentityService: IUriIdentityService,
		@ILogService private readonly logService: ILogService
	) {
		super({
			...(viewletViewOptions as IViewPaneOptions),
			showActions: ViewPaneShowActions.Always,
			maximumBodySize: options.flexibleHeight ? (storageService.getNumber(`${viewletViewOptions.id}.size`, StorageScope.PROFILE, 0) ? undefined : 0) : undefined
		}, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, telemetryService, hoverService);
		if (this.options.onDidChangeTitle) {
			this._register(this.options.onDidChangeTitle(title => this.updateTitle(title)));
		}

		this._register(this.contextMenuActionRunner.onDidRun(({ error }) => error && this.notificationService.error(error)));
		this.registerActions();
	}

	protected registerActions(): void { }

	protected override renderHeader(container: HTMLElement): void {
		container.classList.add('extension-view-header');
		super.renderHeader(container);

		if (!this.options.hideBadge) {
			this.badge = new CountBadge(append(container, $('.count-badge-wrapper')), {}, defaultCountBadgeStyles);
		}
	}

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		const extensionsList = append(container, $('.extensions-list'));
		const messageContainer = append(container, $('.message-container'));
		const messageSeverityIcon = append(messageContainer, $(''));
		const messageBox = append(messageContainer, $('.message'));
		const delegate = new Delegate();
		const extensionsViewState = new ExtensionsViewState();
		const renderer = this.instantiationService.createInstance(Renderer, extensionsViewState, {
			hoverOptions: {
				position: () => {
					const viewLocation = this.viewDescriptorService.getViewLocationById(this.id);
					if (viewLocation === ViewContainerLocation.Sidebar) {
						return this.layoutService.getSideBarPosition() === Position.LEFT ? HoverPosition.RIGHT : HoverPosition.LEFT;
					}
					if (viewLocation === ViewContainerLocation.AuxiliaryBar) {
						return this.layoutService.getSideBarPosition() === Position.LEFT ? HoverPosition.LEFT : HoverPosition.RIGHT;
					}
					return HoverPosition.RIGHT;
				}
			}
		});
		this.list = this.instantiationService.createInstance(WorkbenchPagedList, 'Extensions', extensionsList, delegate, [renderer], {
			multipleSelectionSupport: false,
			setRowLineHeight: false,
			horizontalScrolling: false,
			accessibilityProvider: {
				getAriaLabel(extension: IExtension | null): string {
					return getAriaLabelForExtension(extension);
				},
				getWidgetAriaLabel(): string {
					return localize('extensions', "Extensions");
				}
			},
			overrideStyles: this.getLocationBasedColors().listOverrideStyles,
			openOnSingleClick: true
		}) as WorkbenchPagedList<IExtension>;
		this._register(this.list.onContextMenu(e => this.onContextMenu(e), this));
		this._register(this.list.onDidChangeFocus(e => extensionsViewState.onFocusChange(coalesce(e.elements)), this));
		this._register(this.list);
		this._register(extensionsViewState);

		this._register(Event.debounce(Event.filter(this.list.onDidOpen, e => e.element !== null), (_, event) => event, 75, true)(options => {
			this.openExtension(options.element!, { sideByside: options.sideBySide, ...options.editorOptions });
		}));

		this.bodyTemplate = {
			extensionsList,
			messageBox,
			messageContainer,
			messageSeverityIcon
		};

		if (this.queryResult) {
			this.setModel(this.queryResult.model);
		}
	}

	protected override layoutBody(height: number, width: number): void {
		super.layoutBody(height, width);
		if (this.bodyTemplate) {
			this.bodyTemplate.extensionsList.style.height = height + 'px';
		}
		this.list?.layout(height, width);
	}

	async show(query: string, refresh?: boolean): Promise<IPagedModel<IExtension>> {
		if (this.queryRequest) {
			if (!refresh && this.queryRequest.query === query) {
				return this.queryRequest.request;
			}
			this.queryRequest.request.cancel();
			this.queryRequest = null;
		}

		if (this.queryResult) {
			this.queryResult.disposables.dispose();
			this.queryResult = undefined;
		}

		const parsedQuery = Query.parse(query);

		const options: IQueryOptions = {
			sortOrder: SortOrder.Default
		};

		switch (parsedQuery.sortBy) {
			case 'installs': options.sortBy = GallerySortBy.InstallCount; break;
			case 'rating': options.sortBy = GallerySortBy.WeightedRating; break;
			case 'name': options.sortBy = GallerySortBy.Title; break;
			case 'publishedDate': options.sortBy = GallerySortBy.PublishedDate; break;
			case 'updateDate': options.sortBy = LocalSortBy.UpdateDate; break;
		}

		const request = createCancelablePromise(async token => {
			try {
				this.queryResult = await this.query(parsedQuery, options, token);
				const model = this.queryResult.model;
				this.setModel(model);
				if (this.queryResult.onDidChangeModel) {
					this.queryResult.disposables.add(this.queryResult.onDidChangeModel(model => {
						if (this.queryResult) {
							this.queryResult.model = model;
							this.updateModel(model);
						}
					}));
				}
				return model;
			} catch (e) {
				const model = new PagedModel([]);
				if (!isCancellationError(e)) {
					this.logService.error(e);
					this.setModel(model, e);
				}
				return this.list ? this.list.model : model;
			}
		});

		request.finally(() => this.queryRequest = null);
		this.queryRequest = { query, request };
		return request;
	}

	count(): number {
		return this.queryResult?.model.length ?? 0;
	}

	protected showEmptyModel(): Promise<IPagedModel<IExtension>> {
		const emptyModel = new PagedModel([]);
		this.setModel(emptyModel);
		return Promise.resolve(emptyModel);
	}

	private async onContextMenu(e: IListContextMenuEvent<IExtension>): Promise<void> {
		if (e.element) {
			const disposables = new DisposableStore();
			const manageExtensionAction = disposables.add(this.instantiationService.createInstance(ManageExtensionAction));
			const extension = e.element ? this.extensionsWorkbenchService.local.find(local => areSameExtensions(local.identifier, e.element!.identifier) && (!e.element!.server || e.element!.server === local.server)) || e.element
				: e.element;
			manageExtensionAction.extension = extension;
			let groups: IAction[][] = [];
			if (manageExtensionAction.enabled) {
				groups = await manageExtensionAction.getActionGroups();
			} else if (extension) {
				groups = await getContextMenuActions(extension, this.contextKeyService, this.instantiationService);
				groups.forEach(group => group.forEach(extensionAction => {
					if (extensionAction instanceof ExtensionAction) {
						extensionAction.extension = extension;
					}
				}));
			}
			let actions: IAction[] = [];
			for (const menuActions of groups) {
				actions = [...actions, ...menuActions, new Separator()];
			}
			actions.pop();
			this.contextMenuService.showContextMenu({
				getAnchor: () => e.anchor,
				getActions: () => actions,
				actionRunner: this.contextMenuActionRunner,
				onHide: () => disposables.dispose()
			});
		}
	}

	private async query(query: Query, options: IQueryOptions, token: CancellationToken): Promise<IQueryResult> {
		const idRegex = /@id:(([a-z0-9A-Z][a-z0-9\-A-Z]*)\.([a-z0-9A-Z][a-z0-9\-A-Z]*))/g;
		const ids: string[] = [];
		let idMatch;
		while ((idMatch = idRegex.exec(query.value)) !== null) {
			const name = idMatch[1];
			ids.push(name);
		}
		if (ids.length) {
			const model = await this.queryByIds(ids, options, token);
			return { model, disposables: new DisposableStore() };
		}

		if (ExtensionsListView.isLocalExtensionsQuery(query.value, query.sortBy)) {
			return this.queryLocal(query, options);
		}

		if (ExtensionsListView.isSearchPopularQuery(query.value)) {
			query.value = query.value.replace('@popular', '');
			options.sortBy = !options.sortBy ? GallerySortBy.InstallCount : options.sortBy;
		}
		else if (ExtensionsListView.isSearchRecentlyPublishedQuery(query.value)) {
			query.value = query.value.replace('@recentlyPublished', '');
			options.sortBy = !options.sortBy ? GallerySortBy.PublishedDate : options.sortBy;
		}

		const galleryQueryOptions: IGalleryQueryOptions = { ...options, sortBy: isLocalSortBy(options.sortBy) ? undefined : options.sortBy };
		const model = await this.queryGallery(query, galleryQueryOptions, token);
		return { model, disposables: new DisposableStore() };
	}

	private async queryByIds(ids: string[], options: IQueryOptions, token: CancellationToken): Promise<IPagedModel<IExtension>> {
		const idsSet: Set<string> = ids.reduce((result, id) => { result.add(id.toLowerCase()); return result; }, new Set<string>());
		const result = (await this.extensionsWorkbenchService.queryLocal(this.options.server))
			.filter(e => idsSet.has(e.identifier.id.toLowerCase()));

		const galleryIds = result.length ? ids.filter(id => result.every(r => !areSameExtensions(r.identifier, { id }))) : ids;

		if (galleryIds.length) {
			const galleryResult = await this.extensionsWorkbenchService.getExtensions(galleryIds.map(id => ({ id })), { source: 'queryById' }, token);
			result.push(...galleryResult);
		}

		return this.getPagedModel(result);
	}

	private async queryLocal(query: Query, options: IQueryOptions): Promise<IQueryResult> {
		const local = await this.extensionsWorkbenchService.queryLocal(this.options.server);
		let { extensions, canIncludeInstalledExtensions } = await this.filterLocal(local, this.extensionService.extensions, query, options);
		const disposables = new DisposableStore();
		const onDidChangeModel = disposables.add(new Emitter<IPagedModel<IExtension>>());

		if (canIncludeInstalledExtensions) {
			let isDisposed: boolean = false;
			disposables.add(toDisposable(() => isDisposed = true));
			disposables.add(Event.debounce(Event.any(
				Event.filter(this.extensionsWorkbenchService.onChange, e => e?.state === ExtensionState.Installed),
				this.extensionService.onDidChangeExtensions
			), () => undefined)(async () => {
				const local = this.options.server ? this.extensionsWorkbenchService.installed.filter(e => e.server === this.options.server) : this.extensionsWorkbenchService.local;
				const { extensions: newExtensions } = await this.filterLocal(local, this.extensionService.extensions, query, options);
				if (!isDisposed) {
					const mergedExtensions = this.mergeAddedExtensions(extensions, newExtensions);
					if (mergedExtensions) {
						extensions = mergedExtensions;
						onDidChangeModel.fire(new PagedModel(extensions));
					}
				}
			}));
		}

		return {
			model: new PagedModel(extensions),
			onDidChangeModel: onDidChangeModel.event,
			disposables
		};
	}

	private async filterLocal(local: IExtension[], runningExtensions: readonly IExtensionDescription[], query: Query, options: IQueryOptions): Promise<{ extensions: IExtension[]; canIncludeInstalledExtensions: boolean }> {
		const value = query.value;
		let extensions: IExtension[] = [];
		let canIncludeInstalledExtensions = true;

		if (/@builtin/i.test(value)) {
			extensions = this.filterBuiltinExtensions(local, query, options);
			canIncludeInstalledExtensions = false;
		}

		else if (/@installed/i.test(value)) {
			extensions = this.filterInstalledExtensions(local, runningExtensions, query, options);
		}

		else if (/@outdated/i.test(value)) {
			extensions = this.filterOutdatedExtensions(local, query, options);
		}

		else if (/@disabled/i.test(value)) {
			extensions = this.filterDisabledExtensions(local, runningExtensions, query, options);
		}

		else if (/@enabled/i.test(value)) {
			extensions = this.filterEnabledExtensions(local, runningExtensions, query, options);
		}

		else if (/@workspaceUnsupported/i.test(value)) {
			extensions = this.filterWorkspaceUnsupportedExtensions(local, query, options);
		}

		else if (/@deprecated/i.test(query.value)) {
			extensions = await this.filterDeprecatedExtensions(local, query, options);
		}

		else if (/@recentlyUpdated/i.test(query.value)) {
			extensions = this.filterRecentlyUpdatedExtensions(local, query, options);
		}

		else if (/@feature:/i.test(query.value)) {
			extensions = this.filterExtensionsByFeature(local, query, options);
		}

		return { extensions, canIncludeInstalledExtensions };
	}

	private filterBuiltinExtensions(local: IExtension[], query: Query, options: IQueryOptions): IExtension[] {
		let { value, includedCategories, excludedCategories } = this.parseCategories(query.value);
		value = value.replace(/@builtin/g, '').replace(/@sort:(\w+)(-\w*)?/g, '').trim().toLowerCase();

		const result = local
			.filter(e => e.isBuiltin && (e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1)
				&& this.filterExtensionByCategory(e, includedCategories, excludedCategories));

		return this.sortExtensions(result, options);
	}

	private filterExtensionByCategory(e: IExtension, includedCategories: string[], excludedCategories: string[]): boolean {
		if (!includedCategories.length && !excludedCategories.length) {
			return true;
		}
		if (e.categories.length) {
			if (excludedCategories.length && e.categories.some(category => excludedCategories.includes(category.toLowerCase()))) {
				return false;
			}
			return e.categories.some(category => includedCategories.includes(category.toLowerCase()));
		} else {
			return includedCategories.includes(NONE_CATEGORY);
		}
	}

	private parseCategories(value: string): { value: string; includedCategories: string[]; excludedCategories: string[] } {
		const includedCategories: string[] = [];
		const excludedCategories: string[] = [];
		value = value.replace(/\bcategory:("([^"]*)"|([^"]\S*))(\s+|\b|$)/g, (_, quotedCategory, category) => {
			const entry = (category || quotedCategory || '').toLowerCase();
			if (entry.startsWith('-')) {
				if (excludedCategories.indexOf(entry) === -1) {
					excludedCategories.push(entry);
				}
			} else {
				if (includedCategories.indexOf(entry) === -1) {
					includedCategories.push(entry);
				}
			}
			return '';
		});
		return { value, includedCategories, excludedCategories };
	}

	private filterInstalledExtensions(local: IExtension[], runningExtensions: readonly IExtensionDescription[], query: Query, options: IQueryOptions): IExtension[] {
		let { value, includedCategories, excludedCategories } = this.parseCategories(query.value);

		value = value.replace(/@installed/g, '').replace(/@sort:(\w+)(-\w*)?/g, '').trim().toLowerCase();

		const matchingText = (e: IExtension) => (e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1 || e.description.toLowerCase().indexOf(value) > -1)
			&& this.filterExtensionByCategory(e, includedCategories, excludedCategories);
		let result;

		if (options.sortBy !== undefined) {
			result = local.filter(e => !e.isBuiltin && matchingText(e));
			result = this.sortExtensions(result, options);
		} else {
			result = local.filter(e => (!e.isBuiltin || e.outdated || e.runtimeState !== undefined) && matchingText(e));
			const runningExtensionsById = runningExtensions.reduce((result, e) => { result.set(e.identifier.value, e); return result; }, new ExtensionIdentifierMap<IExtensionDescription>());

			const defaultSort = (e1: IExtension, e2: IExtension) => {
				const running1 = runningExtensionsById.get(e1.identifier.id);
				const isE1Running = !!running1 && this.extensionManagementServerService.getExtensionManagementServer(toExtension(running1)) === e1.server;
				const running2 = runningExtensionsById.get(e2.identifier.id);
				const isE2Running = running2 && this.extensionManagementServerService.getExtensionManagementServer(toExtension(running2)) === e2.server;
				if ((isE1Running && isE2Running)) {
					return e1.displayName.localeCompare(e2.displayName);
				}
				const isE1LanguagePackExtension = e1.local && isLanguagePackExtension(e1.local.manifest);
				const isE2LanguagePackExtension = e2.local && isLanguagePackExtension(e2.local.manifest);
				if (!isE1Running && !isE2Running) {
					if (isE1LanguagePackExtension) {
						return -1;
					}
					if (isE2LanguagePackExtension) {
						return 1;
					}
					return e1.displayName.localeCompare(e2.displayName);
				}
				if ((isE1Running && isE2LanguagePackExtension) || (isE2Running && isE1LanguagePackExtension)) {
					return e1.displayName.localeCompare(e2.displayName);
				}
				return isE1Running ? -1 : 1;
			};

			const outdated: IExtension[] = [];
			const actionRequired: IExtension[] = [];
			const noActionRequired: IExtension[] = [];
			result.forEach(e => {
				if (e.outdated) {
					outdated.push(e);
				}
				else if (e.runtimeState) {
					actionRequired.push(e);
				}
				else {
					noActionRequired.push(e);
				}
			});

			result = [...outdated.sort(defaultSort), ...actionRequired.sort(defaultSort), ...noActionRequired.sort(defaultSort)];
		}
		return result;
	}

	private filterOutdatedExtensions(local: IExtension[], query: Query, options: IQueryOptions): IExtension[] {
		let { value, includedCategories, excludedCategories } = this.parseCategories(query.value);

		value = value.replace(/@outdated/g, '').replace(/@sort:(\w+)(-\w*)?/g, '').trim().toLowerCase();

		const result = local
			.sort((e1, e2) => e1.displayName.localeCompare(e2.displayName))
			.filter(extension => extension.outdated
				&& (extension.name.toLowerCase().indexOf(value) > -1 || extension.displayName.toLowerCase().indexOf(value) > -1)
				&& this.filterExtensionByCategory(extension, includedCategories, excludedCategories));

		return this.sortExtensions(result, options);
	}

	private filterDisabledExtensions(local: IExtension[], runningExtensions: readonly IExtensionDescription[], query: Query, options: IQueryOptions): IExtension[] {
		let { value, includedCategories, excludedCategories } = this.parseCategories(query.value);

		value = value.replace(/@disabled/g, '').replace(/@sort:(\w+)(-\w*)?/g, '').trim().toLowerCase();

		const result = local
			.sort((e1, e2) => e1.displayName.localeCompare(e2.displayName))
			.filter(e => runningExtensions.every(r => !areSameExtensions({ id: r.identifier.value, uuid: r.uuid }, e.identifier))
				&& (e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1)
				&& this.filterExtensionByCategory(e, includedCategories, excludedCategories));

		return this.sortExtensions(result, options);
	}

	private filterEnabledExtensions(local: IExtension[], runningExtensions: readonly IExtensionDescription[], query: Query, options: IQueryOptions): IExtension[] {
		let { value, includedCategories, excludedCategories } = this.parseCategories(query.value);

		value = value ? value.replace(/@enabled/g, '').replace(/@sort:(\w+)(-\w*)?/g, '').trim().toLowerCase() : '';

		local = local.filter(e => !e.isBuiltin);
		const result = local
			.sort((e1, e2) => e1.displayName.localeCompare(e2.displayName))
			.filter(e => runningExtensions.some(r => areSameExtensions({ id: r.identifier.value, uuid: r.uuid }, e.identifier))
				&& (e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1)
				&& this.filterExtensionByCategory(e, includedCategories, excludedCategories));

		return this.sortExtensions(result, options);
	}

	private filterWorkspaceUnsupportedExtensions(local: IExtension[], query: Query, options: IQueryOptions): IExtension[] {
		// shows local extensions which are restricted or disabled in the current workspace because of the extension's capability

		const queryString = query.value; // @sortby is already filtered out

		const match = queryString.match(/^\s*@workspaceUnsupported(?::(untrusted|virtual)(Partial)?)?(?:\s+([^\s]*))?/i);
		if (!match) {
			return [];
		}
		const type = match[1]?.toLowerCase();
		const partial = !!match[2];
		const nameFilter = match[3]?.toLowerCase();

		if (nameFilter) {
			local = local.filter(extension => extension.name.toLowerCase().indexOf(nameFilter) > -1 || extension.displayName.toLowerCase().indexOf(nameFilter) > -1);
		}

		const hasVirtualSupportType = (extension: IExtension, supportType: ExtensionVirtualWorkspaceSupportType) => {
			return extension.local && this.extensionManifestPropertiesService.getExtensionVirtualWorkspaceSupportType(extension.local.manifest) === supportType;
		};

		const hasRestrictedSupportType = (extension: IExtension, supportType: ExtensionUntrustedWorkspaceSupportType) => {
			if (!extension.local) {
				return false;
			}

			const enablementState = this.extensionEnablementService.getEnablementState(extension.local);
			if (enablementState !== EnablementState.EnabledGlobally && enablementState !== EnablementState.EnabledWorkspace &&
				enablementState !== EnablementState.DisabledByTrustRequirement && enablementState !== EnablementState.DisabledByExtensionDependency) {
				return false;
			}

			if (this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(extension.local.manifest) === supportType) {
				return true;
			}

			if (supportType === false) {
				const dependencies = getExtensionDependencies(local.map(ext => ext.local!), extension.local);
				return dependencies.some(ext => this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(ext.manifest) === supportType);
			}

			return false;
		};

		const inVirtualWorkspace = isVirtualWorkspace(this.workspaceService.getWorkspace());
		const inRestrictedWorkspace = !this.workspaceTrustManagementService.isWorkspaceTrusted();

		if (type === 'virtual') {
			// show limited and disabled extensions unless disabled because of a untrusted workspace
			local = local.filter(extension => inVirtualWorkspace && hasVirtualSupportType(extension, partial ? 'limited' : false) && !(inRestrictedWorkspace && hasRestrictedSupportType(extension, false)));
		} else if (type === 'untrusted') {
			// show limited and disabled extensions unless disabled because of a virtual workspace
			local = local.filter(extension => hasRestrictedSupportType(extension, partial ? 'limited' : false) && !(inVirtualWorkspace && hasVirtualSupportType(extension, false)));
		} else {
			// show extensions that are restricted or disabled in the current workspace
			local = local.filter(extension => inVirtualWorkspace && !hasVirtualSupportType(extension, true) || inRestrictedWorkspace && !hasRestrictedSupportType(extension, true));
		}
		return this.sortExtensions(local, options);
	}

	private async filterDeprecatedExtensions(local: IExtension[], query: Query, options: IQueryOptions): Promise<IExtension[]> {
		const value = query.value.replace(/@deprecated/g, '').replace(/@sort:(\w+)(-\w*)?/g, '').trim().toLowerCase();
		const extensionsControlManifest = await this.extensionManagementService.getExtensionsControlManifest();
		const deprecatedExtensionIds = Object.keys(extensionsControlManifest.deprecated);
		local = local.filter(e => deprecatedExtensionIds.includes(e.identifier.id) && (!value || e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1));
		return this.sortExtensions(local, options);
	}

	private filterRecentlyUpdatedExtensions(local: IExtension[], query: Query, options: IQueryOptions): IExtension[] {
		let { value, includedCategories, excludedCategories } = this.parseCategories(query.value);
		const currentTime = Date.now();
		local = local.filter(e => !e.isBuiltin && !e.outdated && e.local?.updated && e.local?.installedTimestamp !== undefined && currentTime - e.local.installedTimestamp < ExtensionsListView.RECENT_UPDATE_DURATION);

		value = value.replace(/@recentlyUpdated/g, '').replace(/@sort:(\w+)(-\w*)?/g, '').trim().toLowerCase();

		const result = local.filter(e =>
			(e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1)
			&& this.filterExtensionByCategory(e, includedCategories, excludedCategories));

		options.sortBy = options.sortBy ?? LocalSortBy.UpdateDate;

		return this.sortExtensions(result, options);
	}

	private filterExtensionsByFeature(local: IExtension[], query: Query, options: IQueryOptions): IExtension[] {
		const value = query.value.replace(/@feature:/g, '').trim();
		const featureId = value.split(' ')[0];
		const feature = Registry.as<IExtensionFeaturesRegistry>(Extensions.ExtensionFeaturesRegistry).getExtensionFeature(featureId);
		if (!feature) {
			return [];
		}
		const renderer = feature.renderer ? this.instantiationService.createInstance<IExtensionFeatureRenderer>(feature.renderer) : undefined;
		try {
			const result = local.filter(e => {
				if (!e.local) {
					return false;
				}
				return renderer?.shouldRender(e.local.manifest) || this.extensionFeaturesManagementService.getAccessData(new ExtensionIdentifier(e.identifier.id), featureId);
			});
			return this.sortExtensions(result, options);
		} finally {
			renderer?.dispose();
		}
	}

	private mergeAddedExtensions(extensions: IExtension[], newExtensions: IExtension[]): IExtension[] | undefined {
		const oldExtensions = [...extensions];
		const findPreviousExtensionIndex = (from: number): number => {
			let index = -1;
			const previousExtensionInNew = newExtensions[from];
			if (previousExtensionInNew) {
				index = oldExtensions.findIndex(e => areSameExtensions(e.identifier, previousExtensionInNew.identifier));
				if (index === -1) {
					return findPreviousExtensionIndex(from - 1);
				}
			}
			return index;
		};

		let hasChanged: boolean = false;
		for (let index = 0; index < newExtensions.length; index++) {
			const extension = newExtensions[index];
			if (extensions.every(r => !areSameExtensions(r.identifier, extension.identifier))) {
				hasChanged = true;
				extensions.splice(findPreviousExtensionIndex(index - 1) + 1, 0, extension);
			}
		}

		return hasChanged ? extensions : undefined;
	}

	private async queryGallery(query: Query, options: IGalleryQueryOptions, token: CancellationToken): Promise<IPagedModel<IExtension>> {
		const hasUserDefinedSortOrder = options.sortBy !== undefined;
		if (!hasUserDefinedSortOrder && !query.value.trim()) {
			options.sortBy = GallerySortBy.InstallCount;
		}

		if (this.isRecommendationsQuery(query)) {
			return this.queryRecommendations(query, options, token);
		}

		const text = query.value;

		if (/\bext:([^\s]+)\b/g.test(text)) {
			options.text = text;
			options.source = 'file-extension-tags';
			return this.extensionsWorkbenchService.queryGallery(options, token).then(pager => this.getPagedModel(pager));
		}

		let preferredResults: string[] = [];
		if (text) {
			options.text = text.substring(0, 350);
			options.source = 'searchText';
			if (!hasUserDefinedSortOrder) {
				const manifest = await this.extensionManagementService.getExtensionsControlManifest();
				const search = manifest.search;
				if (Array.isArray(search)) {
					for (const s of search) {
						if (s.query && s.query.toLowerCase() === text.toLowerCase() && Array.isArray(s.preferredResults)) {
							preferredResults = s.preferredResults;
							break;
						}
					}
				}
			}
		} else {
			options.source = 'viewlet';
		}

		const pager = await this.extensionsWorkbenchService.queryGallery(options, token);

		let positionToUpdate = 0;
		for (const preferredResult of preferredResults) {
			for (let j = positionToUpdate; j < pager.firstPage.length; j++) {
				if (areSameExtensions(pager.firstPage[j].identifier, { id: preferredResult })) {
					if (positionToUpdate !== j) {
						const preferredExtension = pager.firstPage.splice(j, 1)[0];
						pager.firstPage.splice(positionToUpdate, 0, preferredExtension);
						positionToUpdate++;
					}
					break;
				}
			}
		}
		return this.getPagedModel(pager);

	}

	private sortExtensions(extensions: IExtension[], options: IQueryOptions): IExtension[] {
		switch (options.sortBy) {
			case GallerySortBy.InstallCount:
				extensions = extensions.sort((e1, e2) => typeof e2.installCount === 'number' && typeof e1.installCount === 'number' ? e2.installCount - e1.installCount : NaN);
				break;
			case LocalSortBy.UpdateDate:
				extensions = extensions.sort((e1, e2) =>
					typeof e2.local?.installedTimestamp === 'number' && typeof e1.local?.installedTimestamp === 'number' ? e2.local.installedTimestamp - e1.local.installedTimestamp :
						typeof e2.local?.installedTimestamp === 'number' ? 1 :
							typeof e1.local?.installedTimestamp === 'number' ? -1 : NaN);
				break;
			case GallerySortBy.AverageRating:
			case GallerySortBy.WeightedRating:
				extensions = extensions.sort((e1, e2) => typeof e2.rating === 'number' && typeof e1.rating === 'number' ? e2.rating - e1.rating : NaN);
				break;
			default:
				extensions = extensions.sort((e1, e2) => e1.displayName.localeCompare(e2.displayName));
				break;
		}
		if (options.sortOrder === SortOrder.Descending) {
			extensions = extensions.reverse();
		}
		return extensions;
	}

	private isRecommendationsQuery(query: Query): boolean {
		return ExtensionsListView.isWorkspaceRecommendedExtensionsQuery(query.value)
			|| ExtensionsListView.isKeymapsRecommendedExtensionsQuery(query.value)
			|| ExtensionsListView.isLanguageRecommendedExtensionsQuery(query.value)
			|| ExtensionsListView.isExeRecommendedExtensionsQuery(query.value)
			|| ExtensionsListView.isRemoteRecommendedExtensionsQuery(query.value)
			|| /@recommended:all/i.test(query.value)
			|| ExtensionsListView.isSearchRecommendedExtensionsQuery(query.value)
			|| ExtensionsListView.isRecommendedExtensionsQuery(query.value);
	}

	private async queryRecommendations(query: Query, options: IQueryOptions, token: CancellationToken): Promise<IPagedModel<IExtension>> {
		// Workspace recommendations
		if (ExtensionsListView.isWorkspaceRecommendedExtensionsQuery(query.value)) {
			return this.getWorkspaceRecommendationsModel(query, options, token);
		}

		// Keymap recommendations
		if (ExtensionsListView.isKeymapsRecommendedExtensionsQuery(query.value)) {
			return this.getKeymapRecommendationsModel(query, options, token);
		}

		// Language recommendations
		if (ExtensionsListView.isLanguageRecommendedExtensionsQuery(query.value)) {
			return this.getLanguageRecommendationsModel(query, options, token);
		}

		// Exe recommendations
		if (ExtensionsListView.isExeRecommendedExtensionsQuery(query.value)) {
			return this.getExeRecommendationsModel(query, options, token);
		}

		// Remote recommendations
		if (ExtensionsListView.isRemoteRecommendedExtensionsQuery(query.value)) {
			return this.getRemoteRecommendationsModel(query, options, token);
		}

		// All recommendations
		if (/@recommended:all/i.test(query.value)) {
			return this.getAllRecommendationsModel(options, token);
		}

		// Search recommendations
		if (ExtensionsListView.isSearchRecommendedExtensionsQuery(query.value) ||
			(ExtensionsListView.isRecommendedExtensionsQuery(query.value) && options.sortBy !== undefined)) {
			return this.searchRecommendations(query, options, token);
		}

		// Other recommendations
		if (ExtensionsListView.isRecommendedExtensionsQuery(query.value)) {
			return this.getOtherRecommendationsModel(query, options, token);
		}

		return new PagedModel([]);
	}

	protected async getInstallableRecommendations(recommendations: Array<string | URI>, options: IQueryOptions, token: CancellationToken): Promise<IExtension[]> {
		const result: IExtension[] = [];
		if (recommendations.length) {
			const galleryExtensions: string[] = [];
			const resourceExtensions: URI[] = [];
			for (const recommendation of recommendations) {
				if (typeof recommendation === 'string') {
					galleryExtensions.push(recommendation);
				} else {
					resourceExtensions.push(recommendation);
				}
			}
			if (galleryExtensions.length) {
				try {
					const extensions = await this.extensionsWorkbenchService.getExtensions(galleryExtensions.map(id => ({ id })), { source: options.source }, token);
					for (const extension of extensions) {
						if (extension.gallery && !extension.deprecationInfo && (await this.extensionManagementService.canInstall(extension.gallery))) {
							result.push(extension);
						}
					}
				} catch (error) {
					if (!resourceExtensions.length || !this.isOfflineError(error)) {
						throw error;
					}
				}
			}
			if (resourceExtensions.length) {
				const extensions = await this.extensionsWorkbenchService.getResourceExtensions(resourceExtensions, true);
				for (const extension of extensions) {
					if (await this.extensionsWorkbenchService.canInstall(extension)) {
						result.push(extension);
					}
				}
			}
		}
		return result;
	}

	protected async getWorkspaceRecommendations(): Promise<Array<string | URI>> {
		const recommendations = await this.extensionRecommendationsService.getWorkspaceRecommendations();
		const { important } = await this.extensionRecommendationsService.getConfigBasedRecommendations();
		for (const configBasedRecommendation of important) {
			if (!recommendations.find(extensionId => extensionId === configBasedRecommendation)) {
				recommendations.push(configBasedRecommendation);
			}
		}
		return recommendations;
	}

	private async getWorkspaceRecommendationsModel(query: Query, options: IQueryOptions, token: CancellationToken): Promise<IPagedModel<IExtension>> {
		const recommendations = await this.getWorkspaceRecommendations();
		const installableRecommendations = (await this.getInstallableRecommendations(recommendations, { ...options, source: 'recommendations-workspace' }, token));
		return new PagedModel(installableRecommendations);
	}

	private async getKeymapRecommendationsModel(query: Query, options: IQueryOptions, token: CancellationToken): Promise<IPagedModel<IExtension>> {
		const value = query.value.replace(/@recommended:keymaps/g, '').trim().toLowerCase();
		const recommendations = this.extensionRecommendationsService.getKeymapRecommendations();
		const installableRecommendations = (await this.getInstallableRecommendations(recommendations, { ...options, source: 'recommendations-keymaps' }, token))
			.filter(extension => extension.identifier.id.toLowerCase().indexOf(value) > -1);
		return new PagedModel(installableRecommendations);
	}

	private async getLanguageRecommendationsModel(query: Query, options: IQueryOptions, token: CancellationToken): Promise<IPagedModel<IExtension>> {
		const value = query.value.replace(/@recommended:languages/g, '').trim().toLowerCase();
		const recommendations = this.extensionRecommendationsService.getLanguageRecommendations();
		const installableRecommendations = (await this.getInstallableRecommendations(recommendations, { ...options, source: 'recommendations-languages' }, token))
			.filter(extension => extension.identifier.id.toLowerCase().indexOf(value) > -1);
		return new PagedModel(installableRecommendations);
	}

	private async getRemoteRecommendationsModel(query: Query, options: IQueryOptions, token: CancellationToken): Promise<IPagedModel<IExtension>> {
		const value = query.value.replace(/@recommended:remotes/g, '').trim().toLowerCase();
		const recommendations = this.extensionRecommendationsService.getRemoteRecommendations();
		const installableRecommendations = (await this.getInstallableRecommendations(recommendations, { ...options, source: 'recommendations-remotes' }, token))
			.filter(extension => extension.identifier.id.toLowerCase().indexOf(value) > -1);
		return new PagedModel(installableRecommendations);
	}

	private async getExeRecommendationsModel(query: Query, options: IQueryOptions, token: CancellationToken): Promise<IPagedModel<IExtension>> {
		const exe = query.value.replace(/@exe:/g, '').trim().toLowerCase();
		const { important, others } = await this.extensionRecommendationsService.getExeBasedRecommendations(exe.startsWith('"') ? exe.substring(1, exe.length - 1) : exe);
		const installableRecommendations = await this.getInstallableRecommendations([...important, ...others], { ...options, source: 'recommendations-exe' }, token);
		return new PagedModel(installableRecommendations);
	}

	private async getOtherRecommendationsModel(query: Query, options: IQueryOptions, token: CancellationToken): Promise<IPagedModel<IExtension>> {
		const otherRecommendations = await this.getOtherRecommendations();
		const installableRecommendations = await this.getInstallableRecommendations(otherRecommendations, { ...options, source: 'recommendations-other', sortBy: undefined }, token);
		const result = coalesce(otherRecommendations.map(id => installableRecommendations.find(i => areSameExtensions(i.identifier, { id }))));
		return new PagedModel(result);
	}

	private async getOtherRecommendations(): Promise<string[]> {
		const local = (await this.extensionsWorkbenchService.queryLocal(this.options.server))
			.map(e => e.identifier.id.toLowerCase());
		const workspaceRecommendations = (await this.getWorkspaceRecommendations())
			.map(extensionId => isString(extensionId) ? extensionId.toLowerCase() : extensionId);

		return distinct(
			(await Promise.all([
				// Order is important
				this.extensionRecommendationsService.getImportantRecommendations(),
				this.extensionRecommendationsService.getFileBasedRecommendations(),
				this.extensionRecommendationsService.getOtherRecommendations()
			])).flat().filter(extensionId => !local.includes(extensionId.toLowerCase()) && !workspaceRecommendations.includes(extensionId.toLowerCase())
			), extensionId => extensionId.toLowerCase());
	}

	// Get All types of recommendations, trimmed to show a max of 8 at any given time
	private async getAllRecommendationsModel(options: IQueryOptions, token: CancellationToken): Promise<IPagedModel<IExtension>> {
		const localExtensions = await this.extensionsWorkbenchService.queryLocal(this.options.server);
		const localExtensionIds = localExtensions.map(e => e.identifier.id.toLowerCase());

		const allRecommendations = distinct(
			(await Promise.all([
				// Order is important
				this.getWorkspaceRecommendations(),
				this.extensionRecommendationsService.getImportantRecommendations(),
				this.extensionRecommendationsService.getFileBasedRecommendations(),
				this.extensionRecommendationsService.getOtherRecommendations()
			])).flat().filter(extensionId => {
				if (isString(extensionId)) {
					return !localExtensionIds.includes(extensionId.toLowerCase());
				}
				return !localExtensions.some(localExtension => localExtension.local && this.uriIdentityService.extUri.isEqual(localExtension.local.location, extensionId));
			}));

		const installableRecommendations = await this.getInstallableRecommendations(allRecommendations, { ...options, source: 'recommendations-all', sortBy: undefined }, token);

		const result: IExtension[] = [];
		for (let i = 0; i < installableRecommendations.length && result.length < 8; i++) {
			const recommendation = allRecommendations[i];
			if (isString(recommendation)) {
				const extension = installableRecommendations.find(extension => areSameExtensions(extension.identifier, { id: recommendation }));
				if (extension) {
					result.push(extension);
				}
			} else {
				const extension = installableRecommendations.find(extension => extension.resourceExtension && this.uriIdentityService.extUri.isEqual(extension.resourceExtension.location, recommendation));
				if (extension) {
					result.push(extension);
				}
			}
		}

		return new PagedModel(result);
	}

	private async searchRecommendations(query: Query, options: IQueryOptions, token: CancellationToken): Promise<IPagedModel<IExtension>> {
		const value = query.value.replace(/@recommended/g, '').trim().toLowerCase();
		const recommendations = distinct([...await this.getWorkspaceRecommendations(), ...await this.getOtherRecommendations()]);
		const installableRecommendations = (await this.getInstallableRecommendations(recommendations, { ...options, source: 'recommendations', sortBy: undefined }, token))
			.filter(extension => extension.identifier.id.toLowerCase().indexOf(value) > -1);
		return new PagedModel(this.sortExtensions(installableRecommendations, options));
	}

	private setModel(model: IPagedModel<IExtension>, error?: any, donotResetScrollTop?: boolean) {
		if (this.list) {
			this.list.model = new DelayedPagedModel(model);
			if (!donotResetScrollTop) {
				this.list.scrollTop = 0;
			}
			this.updateBody(error);
		}
		if (this.badge) {
			this.badge.setCount(this.count());
		}
	}

	private updateModel(model: IPagedModel<IExtension>) {
		if (this.list) {
			this.list.model = new DelayedPagedModel(model);
			this.updateBody();
		}
		if (this.badge) {
			this.badge.setCount(this.count());
		}
	}

	private updateBody(error?: any): void {
		if (this.bodyTemplate) {

			const count = this.count();
			this.bodyTemplate.extensionsList.classList.toggle('hidden', count === 0);
			this.bodyTemplate.messageContainer.classList.toggle('hidden', count > 0);

			if (count === 0 && this.isBodyVisible()) {
				if (error) {
					if (this.isOfflineError(error)) {
						this.bodyTemplate.messageSeverityIcon.className = SeverityIcon.className(Severity.Warning);
						this.bodyTemplate.messageBox.textContent = localize('offline error', "Unable to search the Marketplace when offline, please check your network connection.");
					} else {
						this.bodyTemplate.messageSeverityIcon.className = SeverityIcon.className(Severity.Error);
						this.bodyTemplate.messageBox.textContent = localize('error', "Error while fetching extensions. {0}", getErrorMessage(error));
					}
				} else {
					this.bodyTemplate.messageSeverityIcon.className = '';
					this.bodyTemplate.messageBox.textContent = localize('no extensions found', "No extensions found.");
				}
				alert(this.bodyTemplate.messageBox.textContent);
			}
		}

		this.updateSize();
	}

	private isOfflineError(error: Error): boolean {
		if (error instanceof ExtensionGalleryError) {
			return error.code === ExtensionGalleryErrorCode.Offline;
		}
		return isOfflineError(error);
	}

	protected updateSize() {
		if (this.options.flexibleHeight) {
			this.maximumBodySize = this.list?.model.length ? Number.POSITIVE_INFINITY : 0;
			this.storageService.store(`${this.id}.size`, this.list?.model.length || 0, StorageScope.PROFILE, StorageTarget.MACHINE);
		}
	}

	private openExtension(extension: IExtension, options: { sideByside?: boolean; preserveFocus?: boolean; pinned?: boolean }): void {
		extension = this.extensionsWorkbenchService.local.filter(e => areSameExtensions(e.identifier, extension.identifier))[0] || extension;
		this.extensionsWorkbenchService.open(extension, options).then(undefined, err => this.onError(err));
	}

	private onError(err: any): void {
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

	private getPagedModel(arg: IPager<IExtension> | IExtension[]): IPagedModel<IExtension> {
		if (Array.isArray(arg)) {
			return new PagedModel(arg);
		}
		const pager = {
			total: arg.total,
			pageSize: arg.pageSize,
			firstPage: arg.firstPage,
			getPage: (pageIndex: number, cancellationToken: CancellationToken) => arg.getPage(pageIndex, cancellationToken)
		};
		return new PagedModel(pager);
	}

	override dispose(): void {
		super.dispose();
		if (this.queryRequest) {
			this.queryRequest.request.cancel();
			this.queryRequest = null;
		}
		if (this.queryResult) {
			this.queryResult.disposables.dispose();
			this.queryResult = undefined;
		}
		this.list = null;
	}

	static isLocalExtensionsQuery(query: string, sortBy?: string): boolean {
		return this.isInstalledExtensionsQuery(query)
			|| this.isSearchInstalledExtensionsQuery(query)
			|| this.isOutdatedExtensionsQuery(query)
			|| this.isEnabledExtensionsQuery(query)
			|| this.isDisabledExtensionsQuery(query)
			|| this.isBuiltInExtensionsQuery(query)
			|| this.isSearchBuiltInExtensionsQuery(query)
			|| this.isBuiltInGroupExtensionsQuery(query)
			|| this.isSearchDeprecatedExtensionsQuery(query)
			|| this.isSearchWorkspaceUnsupportedExtensionsQuery(query)
			|| this.isSearchRecentlyUpdatedQuery(query)
			|| this.isSearchExtensionUpdatesQuery(query)
			|| this.isSortInstalledExtensionsQuery(query, sortBy)
			|| this.isFeatureExtensionsQuery(query);
	}

	static isSearchBuiltInExtensionsQuery(query: string): boolean {
		return /@builtin\s.+/i.test(query);
	}

	static isBuiltInExtensionsQuery(query: string): boolean {
		return /^\s*@builtin$/i.test(query.trim());
	}

	static isBuiltInGroupExtensionsQuery(query: string): boolean {
		return /^\s*@builtin:.+$/i.test(query.trim());
	}

	static isSearchWorkspaceUnsupportedExtensionsQuery(query: string): boolean {
		return /^\s*@workspaceUnsupported(:(untrusted|virtual)(Partial)?)?(\s|$)/i.test(query);
	}

	static isInstalledExtensionsQuery(query: string): boolean {
		return /@installed$/i.test(query);
	}

	static isSearchInstalledExtensionsQuery(query: string): boolean {
		return /@installed\s./i.test(query) || this.isFeatureExtensionsQuery(query);
	}

	static isOutdatedExtensionsQuery(query: string): boolean {
		return /@outdated/i.test(query);
	}

	static isEnabledExtensionsQuery(query: string): boolean {
		return /@enabled/i.test(query);
	}

	static isDisabledExtensionsQuery(query: string): boolean {
		return /@disabled/i.test(query);
	}

	static isSearchDeprecatedExtensionsQuery(query: string): boolean {
		return /@deprecated\s?.*/i.test(query);
	}

	static isRecommendedExtensionsQuery(query: string): boolean {
		return /^@recommended$/i.test(query.trim());
	}

	static isSearchRecommendedExtensionsQuery(query: string): boolean {
		return /@recommended\s.+/i.test(query);
	}

	static isWorkspaceRecommendedExtensionsQuery(query: string): boolean {
		return /@recommended:workspace/i.test(query);
	}

	static isExeRecommendedExtensionsQuery(query: string): boolean {
		return /@exe:.+/i.test(query);
	}

	static isRemoteRecommendedExtensionsQuery(query: string): boolean {
		return /@recommended:remotes/i.test(query);
	}

	static isKeymapsRecommendedExtensionsQuery(query: string): boolean {
		return /@recommended:keymaps/i.test(query);
	}

	static isLanguageRecommendedExtensionsQuery(query: string): boolean {
		return /@recommended:languages/i.test(query);
	}

	static isSortInstalledExtensionsQuery(query: string, sortBy?: string): boolean {
		return (sortBy !== undefined && sortBy !== '' && query === '') || (!sortBy && /^@sort:\S*$/i.test(query));
	}

	static isSearchPopularQuery(query: string): boolean {
		return /@popular/i.test(query);
	}

	static isSearchRecentlyPublishedQuery(query: string): boolean {
		return /@recentlyPublished/i.test(query);
	}

	static isSearchRecentlyUpdatedQuery(query: string): boolean {
		return /@recentlyUpdated/i.test(query);
	}

	static isSearchExtensionUpdatesQuery(query: string): boolean {
		return /@updates/i.test(query);
	}

	static isSortUpdateDateQuery(query: string): boolean {
		return /@sort:updateDate/i.test(query);
	}

	static isFeatureExtensionsQuery(query: string): boolean {
		return /@feature:/i.test(query);
	}

	override focus(): void {
		super.focus();
		if (!this.list) {
			return;
		}

		if (!(this.list.getFocus().length || this.list.getSelection().length)) {
			this.list.focusNext();
		}
		this.list.domFocus();
	}
}

export class DefaultPopularExtensionsView extends ExtensionsListView {

	override async show(): Promise<IPagedModel<IExtension>> {
		const query = this.extensionManagementServerService.webExtensionManagementServer && !this.extensionManagementServerService.localExtensionManagementServer && !this.extensionManagementServerService.remoteExtensionManagementServer ? '@web' : '';
		return super.show(query);
	}

}

export class ServerInstalledExtensionsView extends ExtensionsListView {

	override async show(query: string): Promise<IPagedModel<IExtension>> {
		query = query ? query : '@installed';
		if (!ExtensionsListView.isLocalExtensionsQuery(query) || ExtensionsListView.isSortInstalledExtensionsQuery(query)) {
			query = query += ' @installed';
		}
		return super.show(query.trim());
	}

}

export class EnabledExtensionsView extends ExtensionsListView {

	override async show(query: string): Promise<IPagedModel<IExtension>> {
		query = query || '@enabled';
		return ExtensionsListView.isEnabledExtensionsQuery(query) ? super.show(query) :
			ExtensionsListView.isSortInstalledExtensionsQuery(query) ? super.show('@enabled ' + query) : this.showEmptyModel();
	}
}

export class DisabledExtensionsView extends ExtensionsListView {

	override async show(query: string): Promise<IPagedModel<IExtension>> {
		query = query || '@disabled';
		return ExtensionsListView.isDisabledExtensionsQuery(query) ? super.show(query) :
			ExtensionsListView.isSortInstalledExtensionsQuery(query) ? super.show('@disabled ' + query) : this.showEmptyModel();
	}
}

export class OutdatedExtensionsView extends ExtensionsListView {

	override async show(query: string): Promise<IPagedModel<IExtension>> {
		query = query ? query : '@outdated';
		if (ExtensionsListView.isSearchExtensionUpdatesQuery(query)) {
			query = query.replace('@updates', '@outdated');
		}
		return super.show(query.trim());
	}

	protected override updateSize() {
		super.updateSize();
		this.setExpanded(this.count() > 0);
	}

}

export class RecentlyUpdatedExtensionsView extends ExtensionsListView {

	override async show(query: string): Promise<IPagedModel<IExtension>> {
		query = query ? query : '@recentlyUpdated';
		if (ExtensionsListView.isSearchExtensionUpdatesQuery(query)) {
			query = query.replace('@updates', '@recentlyUpdated');
		}
		return super.show(query.trim());
	}

}

export interface StaticQueryExtensionsViewOptions extends ExtensionsListViewOptions {
	readonly query: string;
}

export class StaticQueryExtensionsView extends ExtensionsListView {

	constructor(
		protected override readonly options: StaticQueryExtensionsViewOptions,
		viewletViewOptions: IViewletViewOptions,
		@INotificationService notificationService: INotificationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThemeService themeService: IThemeService,
		@IExtensionService extensionService: IExtensionService,
		@IExtensionsWorkbenchService extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionRecommendationsService extensionRecommendationsService: IExtensionRecommendationsService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IHoverService hoverService: IHoverService,
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IExtensionManagementServerService extensionManagementServerService: IExtensionManagementServerService,
		@IExtensionManifestPropertiesService extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IWorkbenchExtensionManagementService extensionManagementService: IWorkbenchExtensionManagementService,
		@IWorkspaceContextService workspaceService: IWorkspaceContextService,
		@IProductService productService: IProductService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IViewDescriptorService viewDescriptorService: IViewDescriptorService,
		@IOpenerService openerService: IOpenerService,
		@IPreferencesService preferencesService: IPreferencesService,
		@IStorageService storageService: IStorageService,
		@IWorkspaceTrustManagementService workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IWorkbenchExtensionEnablementService extensionEnablementService: IWorkbenchExtensionEnablementService,
		@IWorkbenchLayoutService layoutService: IWorkbenchLayoutService,
		@IExtensionFeaturesManagementService extensionFeaturesManagementService: IExtensionFeaturesManagementService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@ILogService logService: ILogService
	) {
		super(options, viewletViewOptions, notificationService, keybindingService, contextMenuService, instantiationService, themeService, extensionService,
			extensionsWorkbenchService, extensionRecommendationsService, telemetryService, hoverService, configurationService, contextService, extensionManagementServerService,
			extensionManifestPropertiesService, extensionManagementService, workspaceService, productService, contextKeyService, viewDescriptorService, openerService,
			preferencesService, storageService, workspaceTrustManagementService, extensionEnablementService, layoutService, extensionFeaturesManagementService,
			uriIdentityService, logService);
	}

	override show(): Promise<IPagedModel<IExtension>> {
		return super.show(this.options.query);
	}
}

function toSpecificWorkspaceUnsupportedQuery(query: string, qualifier: string): string | undefined {
	if (!query) {
		return '@workspaceUnsupported:' + qualifier;
	}
	const match = query.match(new RegExp(`@workspaceUnsupported(:${qualifier})?(\\s|$)`, 'i'));
	if (match) {
		if (!match[1]) {
			return query.replace(/@workspaceUnsupported/gi, '@workspaceUnsupported:' + qualifier);
		}
		return query;
	}
	return undefined;
}


export class UntrustedWorkspaceUnsupportedExtensionsView extends ExtensionsListView {
	override async show(query: string): Promise<IPagedModel<IExtension>> {
		const updatedQuery = toSpecificWorkspaceUnsupportedQuery(query, 'untrusted');
		return updatedQuery ? super.show(updatedQuery) : this.showEmptyModel();
	}
}

export class UntrustedWorkspacePartiallySupportedExtensionsView extends ExtensionsListView {
	override async show(query: string): Promise<IPagedModel<IExtension>> {
		const updatedQuery = toSpecificWorkspaceUnsupportedQuery(query, 'untrustedPartial');
		return updatedQuery ? super.show(updatedQuery) : this.showEmptyModel();
	}
}

export class VirtualWorkspaceUnsupportedExtensionsView extends ExtensionsListView {
	override async show(query: string): Promise<IPagedModel<IExtension>> {
		const updatedQuery = toSpecificWorkspaceUnsupportedQuery(query, 'virtual');
		return updatedQuery ? super.show(updatedQuery) : this.showEmptyModel();
	}
}

export class VirtualWorkspacePartiallySupportedExtensionsView extends ExtensionsListView {
	override async show(query: string): Promise<IPagedModel<IExtension>> {
		const updatedQuery = toSpecificWorkspaceUnsupportedQuery(query, 'virtualPartial');
		return updatedQuery ? super.show(updatedQuery) : this.showEmptyModel();
	}
}

export class DeprecatedExtensionsView extends ExtensionsListView {
	override async show(query: string): Promise<IPagedModel<IExtension>> {
		return ExtensionsListView.isSearchDeprecatedExtensionsQuery(query) ? super.show(query) : this.showEmptyModel();
	}
}

export class SearchMarketplaceExtensionsView extends ExtensionsListView {

	private readonly reportSearchFinishedDelayer = this._register(new ThrottledDelayer(2000));
	private searchWaitPromise: Promise<void> = Promise.resolve();

	override async show(query: string): Promise<IPagedModel<IExtension>> {
		const queryPromise = super.show(query);
		this.reportSearchFinishedDelayer.trigger(() => this.reportSearchFinished());
		this.searchWaitPromise = queryPromise.then(null, null);
		return queryPromise;
	}

	private async reportSearchFinished(): Promise<void> {
		await this.searchWaitPromise;
		this.telemetryService.publicLog2('extensionsView:MarketplaceSearchFinished');
	}
}

export class DefaultRecommendedExtensionsView extends ExtensionsListView {
	private readonly recommendedExtensionsQuery = '@recommended:all';

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._register(this.extensionRecommendationsService.onDidChangeRecommendations(() => {
			this.show('');
		}));
	}

	override async show(query: string): Promise<IPagedModel<IExtension>> {
		if (query && query.trim() !== this.recommendedExtensionsQuery) {
			return this.showEmptyModel();
		}
		const model = await super.show(this.recommendedExtensionsQuery);
		if (!this.extensionsWorkbenchService.local.some(e => !e.isBuiltin)) {
			// This is part of popular extensions view. Collapse if no installed extensions.
			this.setExpanded(model.length > 0);
		}
		return model;
	}

}

export class RecommendedExtensionsView extends ExtensionsListView {
	private readonly recommendedExtensionsQuery = '@recommended';

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._register(this.extensionRecommendationsService.onDidChangeRecommendations(() => {
			this.show('');
		}));
	}

	override async show(query: string): Promise<IPagedModel<IExtension>> {
		return (query && query.trim() !== this.recommendedExtensionsQuery) ? this.showEmptyModel() : super.show(this.recommendedExtensionsQuery);
	}
}

export class WorkspaceRecommendedExtensionsView extends ExtensionsListView implements IWorkspaceRecommendedExtensionsView {
	private readonly recommendedExtensionsQuery = '@recommended:workspace';

	protected override renderBody(container: HTMLElement): void {
		super.renderBody(container);

		this._register(this.extensionRecommendationsService.onDidChangeRecommendations(() => this.show(this.recommendedExtensionsQuery)));
		this._register(this.contextService.onDidChangeWorkbenchState(() => this.show(this.recommendedExtensionsQuery)));
	}

	override async show(query: string): Promise<IPagedModel<IExtension>> {
		const shouldShowEmptyView = query && query.trim() !== '@recommended' && query.trim() !== '@recommended:workspace';
		const model = await (shouldShowEmptyView ? this.showEmptyModel() : super.show(this.recommendedExtensionsQuery));
		this.setExpanded(model.length > 0);
		return model;
	}

	private async getInstallableWorkspaceRecommendations(): Promise<IExtension[]> {
		const installed = (await this.extensionsWorkbenchService.queryLocal())
			.filter(l => l.enablementState !== EnablementState.DisabledByExtensionKind); // Filter extensions disabled by kind
		const recommendations = (await this.getWorkspaceRecommendations())
			.filter(recommendation => installed.every(local => isString(recommendation) ? !areSameExtensions({ id: recommendation }, local.identifier) : !this.uriIdentityService.extUri.isEqual(recommendation, local.local?.location)));
		return this.getInstallableRecommendations(recommendations, { source: 'install-all-workspace-recommendations' }, CancellationToken.None);
	}

	async installWorkspaceRecommendations(): Promise<void> {
		const installableRecommendations = await this.getInstallableWorkspaceRecommendations();
		if (installableRecommendations.length) {
			const galleryExtensions: InstallExtensionInfo[] = [];
			const resourceExtensions: IExtension[] = [];
			for (const recommendation of installableRecommendations) {
				if (recommendation.gallery) {
					galleryExtensions.push({ extension: recommendation.gallery, options: {} });
				} else {
					resourceExtensions.push(recommendation);
				}
			}
			await Promise.all([
				this.extensionManagementService.installGalleryExtensions(galleryExtensions),
				...resourceExtensions.map(extension => this.extensionsWorkbenchService.install(extension))
			]);
		} else {
			this.notificationService.notify({
				severity: Severity.Info,
				message: localize('no local extensions', "There are no extensions to install.")
			});
		}
	}

}

export function getAriaLabelForExtension(extension: IExtension | null): string {
	if (!extension) {
		return '';
	}
	const publisher = extension.publisherDomain?.verified ? localize('extension.arialabel.verifiedPublisher', "Verified Publisher {0}", extension.publisherDisplayName) : localize('extension.arialabel.publisher', "Publisher {0}", extension.publisherDisplayName);
	const deprecated = extension?.deprecationInfo ? localize('extension.arialabel.deprecated', "Deprecated") : '';
	const rating = extension?.rating ? localize('extension.arialabel.rating', "Rated {0} out of 5 stars by {1} users", extension.rating.toFixed(2), extension.ratingCount) : '';
	return `${extension.displayName}, ${deprecated ? `${deprecated}, ` : ''}${extension.version}, ${publisher}, ${extension.description} ${rating ? `, ${rating}` : ''}`;
}
