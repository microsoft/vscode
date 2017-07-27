/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/extensionsViewlet';
import { localize } from 'vs/nls';
import { ThrottledDelayer, always } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { isPromiseCanceledError, onUnexpectedError, create as createError } from 'vs/base/common/errors';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Builder, Dimension } from 'vs/base/browser/builder';
import EventOf, { mapEvent, chain } from 'vs/base/common/event';
import { IAction } from 'vs/base/common/actions';
import { domEvent } from 'vs/base/browser/event';
import { Separator } from 'vs/base/browser/ui/actionbar/actionbar';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { IViewletService } from 'vs/workbench/services/viewlet/browser/viewlet';
import { append, $, addStandardDisposableListener, EventType, addClass, removeClass, toggleClass } from 'vs/base/browser/dom';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IExtensionsWorkbenchService, IExtensionsViewlet, VIEWLET_ID, ExtensionState } from '../common/extensions';
import {
	ShowEnabledExtensionsAction, ShowInstalledExtensionsAction, ShowRecommendedExtensionsAction, ShowWorkspaceRecommendedExtensionsAction, ShowPopularExtensionsAction, ShowDisabledExtensionsAction,
	ShowOutdatedExtensionsAction, ClearExtensionsInputAction, ChangeSortAction, UpdateAllAction, CheckForUpdatesAction, DisableAllAction, EnableAllAction,
	EnableAutoUpdateAction, DisableAutoUpdateAction
} from 'vs/workbench/parts/extensions/browser/extensionsActions';
import { LocalExtensionType, IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { InstallVSIXAction } from 'vs/workbench/parts/extensions/electron-browser/extensionsActions';
import { ExtensionsInput } from 'vs/workbench/parts/extensions/common/extensionsInput';
import { ExtensionsListView, InstalledExtensionsView, RecommendedExtensionsView } from './extensionsViews';
import { OpenGlobalSettingsAction } from 'vs/workbench/parts/preferences/browser/preferencesActions';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IMessageService, CloseAction } from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';
import { IActivityBarService, ProgressBadge, NumberBadge } from 'vs/workbench/services/activity/common/activityBarService';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { inputForeground, inputBackground, inputBorder } from 'vs/platform/theme/common/colorRegistry';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ViewsRegistry, ViewLocation, IViewDescriptor } from 'vs/workbench/parts/views/browser/viewsRegistry';
import { ComposedViewsViewlet, IView } from 'vs/workbench/parts/views/browser/views';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import { IContextKeyService, ContextKeyExpr, RawContextKey, IContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';

interface SearchInputEvent extends Event {
	target: HTMLInputElement;
	immediate?: boolean;
}

const ExtensionsViewletVisibleContext = new RawContextKey<boolean>('extensionsViewletVisible', false);
const SearchExtensionsContext = new RawContextKey<boolean>('searchExtensions', false);
const SearchInstalledExtensionsContext = new RawContextKey<boolean>('searchInstalledExtensions', false);
const SearchRecommendedExtensionsContext = new RawContextKey<boolean>('searchRecommendedExtensions', false);

export class ExtensionsViewlet extends ComposedViewsViewlet implements IExtensionsViewlet {

	private onSearchChange: EventOf<string>;
	private extensionsViewletVisibleContextKey: IContextKey<boolean>;
	private searchExtensionsContextKey: IContextKey<boolean>;
	private searchInstalledExtensionsContextKey: IContextKey<boolean>;
	private searchRecommendedExtensionsContextKey: IContextKey<boolean>;

	private searchDelayer: ThrottledDelayer<any>;
	private root: HTMLElement;

	private searchBox: HTMLInputElement;
	private extensionsBox: HTMLElement;
	private primaryActions: IAction[];
	private secondaryActions: IAction[];
	private disposables: IDisposable[] = [];

	private isAutoUpdateEnabled: boolean;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IProgressService private progressService: IProgressService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorInputService: IEditorGroupService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IExtensionManagementService private extensionManagementService: IExtensionManagementService,
		@IMessageService private messageService: IMessageService,
		@IViewletService private viewletService: IViewletService,
		@IThemeService themeService: IThemeService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IStorageService storageService: IStorageService,
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IExtensionService extensionService: IExtensionService
	) {
		super(VIEWLET_ID, ViewLocation.Extensions, `${VIEWLET_ID}.state`, true, telemetryService, storageService, instantiationService, themeService, contextService, contextKeyService, contextMenuService, extensionService);

		this.registerViews();
		this.searchDelayer = new ThrottledDelayer(500);
		this.extensionsViewletVisibleContextKey = ExtensionsViewletVisibleContext.bindTo(contextKeyService);
		this.searchExtensionsContextKey = SearchExtensionsContext.bindTo(contextKeyService);
		this.searchInstalledExtensionsContextKey = SearchInstalledExtensionsContext.bindTo(contextKeyService);
		this.searchRecommendedExtensionsContextKey = SearchRecommendedExtensionsContext.bindTo(contextKeyService);

		this.disposables.push(viewletService.onDidViewletOpen(this.onViewletOpen, this, this.disposables));
		this.isAutoUpdateEnabled = this.extensionsWorkbenchService.isAutoUpdateEnabled;

		this.configurationService.onDidUpdateConfiguration(() => {
			const isAutoUpdateEnabled = this.extensionsWorkbenchService.isAutoUpdateEnabled;
			if (this.isAutoUpdateEnabled !== isAutoUpdateEnabled) {
				this.isAutoUpdateEnabled = isAutoUpdateEnabled;
				this.secondaryActions = null;
				this.updateTitleArea();
			}
		}, this, this.disposables);
	}

	private registerViews(): void {
		let viewDescriptors = [];
		viewDescriptors.push(this.createMarketPlaceExtensionsListViewDescriptor());
		viewDescriptors.push(this.createInstalledExtensionsListViewDescriptor());
		viewDescriptors.push(this.createSearchInstalledExtensionsListViewDescriptor());
		viewDescriptors.push(this.createRecommendedExtensionsListViewDescriptor());
		ViewsRegistry.registerViews(viewDescriptors);
	}

	private createMarketPlaceExtensionsListViewDescriptor(): IViewDescriptor {
		return {
			id: 'extensions.listView',
			name: localize('marketPlace', "Marketplace"),
			location: ViewLocation.Extensions,
			ctor: ExtensionsListView,
			when: ContextKeyExpr.and(ContextKeyExpr.has('extensionsViewletVisible'), ContextKeyExpr.has('searchExtensions'), ContextKeyExpr.not('searchInstalledExtensions')),
			size: 100
		};
	}

	private createInstalledExtensionsListViewDescriptor(): IViewDescriptor {
		return {
			id: 'extensions.installedList',
			name: localize('installedExtensions', "Installed"),
			location: ViewLocation.Extensions,
			ctor: InstalledExtensionsView,
			when: ContextKeyExpr.and(ContextKeyExpr.has('extensionsViewletVisible'), ContextKeyExpr.not('searchExtensions')),
			size: 50
		};
	}

	private createSearchInstalledExtensionsListViewDescriptor(): IViewDescriptor {
		return {
			id: 'extensions.searchInstalledList',
			name: localize('searchInstalledExtensions', "Installed"),
			location: ViewLocation.Extensions,
			ctor: InstalledExtensionsView,
			when: ContextKeyExpr.and(ContextKeyExpr.has('extensionsViewletVisible'), ContextKeyExpr.has('searchInstalledExtensions')),
			size: 50
		};
	}

	private createRecommendedExtensionsListViewDescriptor(): IViewDescriptor {
		return {
			id: 'extensions.recommendedList',
			name: localize('recommendedExtensions', "Recommended"),
			location: ViewLocation.Extensions,
			ctor: RecommendedExtensionsView,
			when: ContextKeyExpr.and(ContextKeyExpr.has('extensionsViewletVisible'), ContextKeyExpr.not('searchExtensions')),
			size: 50,
			canToggleVisibility: true
		};
	}

	create(parent: Builder): TPromise<void> {
		parent.addClass('extensions-viewlet');
		this.root = parent.getHTMLElement();

		const header = append(this.root, $('.header'));

		this.searchBox = append(header, $<HTMLInputElement>('input.search-box'));
		this.searchBox.placeholder = localize('searchExtensions', "Search Extensions in Marketplace");
		this.disposables.push(addStandardDisposableListener(this.searchBox, EventType.FOCUS, () => addClass(this.searchBox, 'synthetic-focus')));
		this.disposables.push(addStandardDisposableListener(this.searchBox, EventType.BLUR, () => removeClass(this.searchBox, 'synthetic-focus')));

		this.extensionsBox = append(this.root, $('.extensions'));

		const onKeyDown = chain(domEvent(this.searchBox, 'keydown'))
			.map(e => new StandardKeyboardEvent(e));
		onKeyDown.filter(e => e.keyCode === KeyCode.Escape).on(this.onEscape, this, this.disposables);

		const onKeyDownForList = onKeyDown.filter(() => this.count() > 0);
		onKeyDownForList.filter(e => e.keyCode === KeyCode.Enter).on(this.onEnter, this, this.disposables);
		onKeyDownForList.filter(e => e.keyCode === KeyCode.UpArrow).on(this.onUpArrow, this, this.disposables);
		onKeyDownForList.filter(e => e.keyCode === KeyCode.DownArrow).on(this.onDownArrow, this, this.disposables);
		onKeyDownForList.filter(e => e.keyCode === KeyCode.PageUp).on(this.onPageUpArrow, this, this.disposables);
		onKeyDownForList.filter(e => e.keyCode === KeyCode.PageDown).on(this.onPageDownArrow, this, this.disposables);

		const onSearchInput = domEvent(this.searchBox, 'input') as EventOf<SearchInputEvent>;
		onSearchInput(e => this.triggerSearch(e.immediate), null, this.disposables);

		this.onSearchChange = mapEvent(onSearchInput, e => e.target.value);

		return this.extensionManagementService.getInstalled(LocalExtensionType.User)
			.then(installed => {
				if (installed.length === 0) {
					this.searchBox.value = '@sort:installs';
					this.searchExtensionsContextKey.set(true);
				}
				return super.create(new Builder(this.extensionsBox));
			});
	}

	public updateStyles(): void {
		super.updateStyles();

		this.searchBox.style.backgroundColor = this.getColor(inputBackground);
		this.searchBox.style.color = this.getColor(inputForeground);

		const inputBorderColor = this.getColor(inputBorder);
		this.searchBox.style.borderWidth = inputBorderColor ? '1px' : null;
		this.searchBox.style.borderStyle = inputBorderColor ? 'solid' : null;
		this.searchBox.style.borderColor = inputBorderColor;
	}

	setVisible(visible: boolean): TPromise<void> {
		const isVisibilityChanged = this.isVisible() !== visible;
		return super.setVisible(visible).then(() => {
			if (isVisibilityChanged) {
				this.extensionsViewletVisibleContextKey.set(visible);
				if (visible) {
					this.searchBox.focus();
					this.searchBox.setSelectionRange(0, this.searchBox.value.length);
				}
			}
		});
	}

	focus(): void {
		this.searchBox.focus();
	}

	layout(dimension: Dimension): void {
		toggleClass(this.root, 'narrow', dimension.width <= 300);
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
			this.secondaryActions = [
				this.instantiationService.createInstance(ShowInstalledExtensionsAction, ShowInstalledExtensionsAction.ID, ShowInstalledExtensionsAction.LABEL),
				this.instantiationService.createInstance(ShowOutdatedExtensionsAction, ShowOutdatedExtensionsAction.ID, ShowOutdatedExtensionsAction.LABEL),
				this.instantiationService.createInstance(ShowEnabledExtensionsAction, ShowEnabledExtensionsAction.ID, ShowEnabledExtensionsAction.LABEL),
				this.instantiationService.createInstance(ShowDisabledExtensionsAction, ShowDisabledExtensionsAction.ID, ShowDisabledExtensionsAction.LABEL),
				this.instantiationService.createInstance(ShowRecommendedExtensionsAction, ShowRecommendedExtensionsAction.ID, ShowRecommendedExtensionsAction.LABEL),
				this.instantiationService.createInstance(ShowWorkspaceRecommendedExtensionsAction, ShowWorkspaceRecommendedExtensionsAction.ID, ShowWorkspaceRecommendedExtensionsAction.LABEL),
				this.instantiationService.createInstance(ShowPopularExtensionsAction, ShowPopularExtensionsAction.ID, ShowPopularExtensionsAction.LABEL),
				new Separator(),
				this.instantiationService.createInstance(ChangeSortAction, 'extensions.sort.install', localize('sort by installs', "Sort By: Install Count"), this.onSearchChange, 'installs'),
				this.instantiationService.createInstance(ChangeSortAction, 'extensions.sort.rating', localize('sort by rating', "Sort By: Rating"), this.onSearchChange, 'rating'),
				this.instantiationService.createInstance(ChangeSortAction, 'extensions.sort.name', localize('sort by name', "Sort By: Name"), this.onSearchChange, 'name'),
				new Separator(),
				this.instantiationService.createInstance(CheckForUpdatesAction, CheckForUpdatesAction.ID, CheckForUpdatesAction.LABEL),
				...(this.isAutoUpdateEnabled ? [this.instantiationService.createInstance(DisableAutoUpdateAction, DisableAutoUpdateAction.ID, DisableAutoUpdateAction.LABEL)] : [this.instantiationService.createInstance(UpdateAllAction, UpdateAllAction.ID, UpdateAllAction.LABEL), this.instantiationService.createInstance(EnableAutoUpdateAction, EnableAutoUpdateAction.ID, EnableAutoUpdateAction.LABEL)]),
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

		this.searchBox.value = value;
		this.searchBox.dispatchEvent(event);
	}

	private triggerSearch(immediate = false): void {
		this.searchDelayer.trigger(() => this.doSearch(), immediate || !this.searchBox.value ? 0 : 500)
			.done(null, err => this.onError(err));
	}

	private async doSearch(): TPromise<any> {
		const value = this.searchBox.value || '';
		this.searchExtensionsContextKey.set(!!value);
		this.searchInstalledExtensionsContextKey.set(InstalledExtensionsView.isInsalledExtensionsQuery(value));
		this.searchRecommendedExtensionsContextKey.set(RecommendedExtensionsView.isRecommendedExtensionsQuery(value));

		await this.updateViews(!!value);
	}

	protected async updateViews(showAll?: boolean): TPromise<IView[]> {
		const created = await super.updateViews();
		const toShow = showAll ? this.views : created;
		if (toShow.length) {
			await this.progress(TPromise.join(toShow.map(view => (<ExtensionsListView>view).show(this.searchBox.value))));
		}
		return created;
	}

	private count(): number {
		return this.views.reduce((count, view) => (<ExtensionsListView>view).count() + count, 0);
	}

	private onEscape(): void {
		this.search('');
	}

	private onEnter(): void {
		(<ExtensionsListView>this.views[0]).select();
	}

	private onUpArrow(): void {
		(<ExtensionsListView>this.views[0]).showPrevious();
	}

	private onDownArrow(): void {
		(<ExtensionsListView>this.views[0]).showNext();
	}

	private onPageUpArrow(): void {
		(<ExtensionsListView>this.views[0]).showPreviousPage();
	}

	private onPageDownArrow(): void {
		(<ExtensionsListView>this.views[0]).showNextPage();
	}

	private onViewletOpen(viewlet: IViewlet): void {
		if (!viewlet || viewlet.getId() === VIEWLET_ID) {
			return;
		}

		const model = this.editorInputService.getStacksModel();

		const promises = model.groups.map(group => {
			const position = model.positionOfGroup(group);
			const inputs = group.getEditors().filter(input => input instanceof ExtensionsInput);
			const promises = inputs.map(input => this.editorService.closeEditor(position, input));

			return TPromise.join(promises);
		});

		TPromise.join(promises).done(null, onUnexpectedError);
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
					this.instantiationService.createInstance(OpenGlobalSettingsAction, OpenGlobalSettingsAction.ID, OpenGlobalSettingsAction.LABEL),
					CloseAction
				]
			});

			this.messageService.show(Severity.Error, error);
			return;
		}

		this.messageService.show(Severity.Error, err);
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
		@IActivityBarService private activityBarService: IActivityBarService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		extensionsWorkbenchService.onChange(this.onServiceChange, this, this.disposables);
	}

	getId(): string {
		return 'vs.extensions.statusupdater';
	}

	private onServiceChange(): void {

		dispose(this.badgeHandle);

		if (this.extensionsWorkbenchService.local.some(e => e.state === ExtensionState.Installing)) {
			this.badgeHandle = this.activityBarService.showActivity(VIEWLET_ID, new ProgressBadge(() => localize('extensions', "Extensions")), 'extensions-badge progress-badge');
			return;
		}

		const outdated = this.extensionsWorkbenchService.local.reduce((r, e) => r + (e.outdated ? 1 : 0), 0);
		if (outdated > 0) {
			const badge = new NumberBadge(outdated, n => localize('outdatedExtensions', '{0} Outdated Extensions', n));
			this.badgeHandle = this.activityBarService.showActivity(VIEWLET_ID, badge, 'extensions-badge count-badge');
		}
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		dispose(this.badgeHandle);
	}
}
