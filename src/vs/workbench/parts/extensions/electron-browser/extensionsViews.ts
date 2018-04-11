/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { dispose } from 'vs/base/common/lifecycle';
import { assign } from 'vs/base/common/objects';
import { chain } from 'vs/base/common/event';
import { isPromiseCanceledError, create as createError } from 'vs/base/common/errors';
import { PagedModel, IPagedModel, IPager } from 'vs/base/common/paging';
import { SortBy, SortOrder, IQueryOptions, LocalExtensionType, IExtensionTipsService, EnablementState } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { append, $, toggleClass } from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Delegate, Renderer } from 'vs/workbench/parts/extensions/browser/extensionsList';
import { IExtension, IExtensionsWorkbenchService } from '../common/extensions';
import { Query } from '../common/extensionQuery';
import { IExtensionService } from 'vs/workbench/services/extensions/common/extensions';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { attachBadgeStyler } from 'vs/platform/theme/common/styler';
import { IViewletViewOptions, IViewOptions, ViewsViewletPanel } from 'vs/workbench/browser/parts/views/viewsViewlet';
import { OpenGlobalSettingsAction } from 'vs/workbench/parts/preferences/browser/preferencesActions';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { InstallWorkspaceRecommendedExtensionsAction, ConfigureWorkspaceFolderRecommendedExtensionsAction } from 'vs/workbench/parts/extensions/browser/extensionsActions';
import { WorkbenchPagedList } from 'vs/platform/list/browser/listService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { INotificationService } from 'vs/platform/notification/common/notification';

export class ExtensionsListView extends ViewsViewletPanel {

	private messageBox: HTMLElement;
	private extensionsList: HTMLElement;
	private badge: CountBadge;
	protected badgeContainer: HTMLElement;
	private list: WorkbenchPagedList<IExtension>;

	constructor(
		private options: IViewletViewOptions,
		@INotificationService protected notificationService: INotificationService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService protected instantiationService: IInstantiationService,
		@IThemeService private themeService: IThemeService,
		@IExtensionService private extensionService: IExtensionService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorInputService: IEditorGroupService,
		@IExtensionTipsService private tipsService: IExtensionTipsService,
		@IModeService private modeService: IModeService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IConfigurationService configurationService: IConfigurationService
	) {
		super({ ...(options as IViewOptions), ariaHeaderLabel: options.name }, keybindingService, contextMenuService, configurationService);
	}

	renderHeader(container: HTMLElement): void {
		const titleDiv = append(container, $('div.title'));
		append(titleDiv, $('span')).textContent = this.options.name;

		this.badgeContainer = append(container, $('.count-badge-wrapper'));
		this.badge = new CountBadge(this.badgeContainer);
		this.disposables.push(attachBadgeStyler(this.badge, this.themeService));
	}

	renderBody(container: HTMLElement): void {
		this.extensionsList = append(container, $('.extensions-list'));
		this.messageBox = append(container, $('.message'));
		const delegate = new Delegate();
		const renderer = this.instantiationService.createInstance(Renderer);
		this.list = this.instantiationService.createInstance(WorkbenchPagedList, this.extensionsList, delegate, [renderer], {
			ariaLabel: localize('extensions', "Extensions")
		}) as WorkbenchPagedList<IExtension>;

		chain(this.list.onOpen)
			.map(e => e.elements[0])
			.filter(e => !!e)
			.on(this.openExtension, this, this.disposables);

		chain(this.list.onPin)
			.map(e => e.elements[0])
			.filter(e => !!e)
			.on(this.pin, this, this.disposables);
	}

	layoutBody(size: number): void {
		this.extensionsList.style.height = size + 'px';
		this.list.layout(size);
	}

	async show(query: string): TPromise<IPagedModel<IExtension>> {
		const model = await this.query(query);
		this.setModel(model);
		return model;
	}

	select(): void {
		this.list.setSelection(this.list.getFocus());
	}

	showPrevious(): void {
		this.list.focusPrevious();
		this.list.reveal(this.list.getFocus()[0]);
	}

	showPreviousPage(): void {
		this.list.focusPreviousPage();
		this.list.reveal(this.list.getFocus()[0]);
	}

	showNext(): void {
		this.list.focusNext();
		this.list.reveal(this.list.getFocus()[0]);
	}

	showNextPage(): void {
		this.list.focusNextPage();
		this.list.reveal(this.list.getFocus()[0]);
	}

	count(): number {
		return this.list.length;
	}

	private async query(value: string): TPromise<IPagedModel<IExtension>> {
		const query = Query.parse(value);

		let options: IQueryOptions = {
			sortOrder: SortOrder.Default
		};

		switch (query.sortBy) {
			case 'installs': options = assign(options, { sortBy: SortBy.InstallCount }); break;
			case 'rating': options = assign(options, { sortBy: SortBy.WeightedRating }); break;
			case 'name': options = assign(options, { sortBy: SortBy.Title }); break;
		}

		if (/@builtin/i.test(value)) {
			const showThemesOnly = /@builtin:themes/i.test(value);
			if (showThemesOnly) {
				value = value.replace(/@builtin:themes/g, '');
			}
			const showBasicsOnly = /@builtin:basics/i.test(value);
			if (showBasicsOnly) {
				value = value.replace(/@builtin:basics/g, '');
			}
			const showFeaturesOnly = /@builtin:features/i.test(value);
			if (showFeaturesOnly) {
				value = value.replace(/@builtin:features/g, '');
			}

			value = value.replace(/@builtin/g, '').replace(/@sort:(\w+)(-\w*)?/g, '').trim().toLowerCase();
			let result = await this.extensionsWorkbenchService.queryLocal();

			result = result
				.filter(e => e.type === LocalExtensionType.System && (e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1));

			if (showThemesOnly) {
				const themesExtensions = result.filter(e => {
					return e.local.manifest
						&& e.local.manifest.contributes
						&& Array.isArray(e.local.manifest.contributes.themes)
						&& e.local.manifest.contributes.themes.length;
				});
				return new PagedModel(this.sortExtensions(themesExtensions, options));
			}
			if (showBasicsOnly) {
				const basics = result.filter(e => {
					return e.local.manifest
						&& e.local.manifest.contributes
						&& Array.isArray(e.local.manifest.contributes.languages)
						&& e.local.manifest.contributes.languages.length
						&& e.local.identifier.id !== 'git';
				});
				return new PagedModel(this.sortExtensions(basics, options));
			}
			if (showFeaturesOnly) {
				const others = result.filter(e => {
					return e.local.manifest
						&& e.local.manifest.contributes
						&& (!Array.isArray(e.local.manifest.contributes.languages) || e.local.identifier.id === 'git')
						&& !Array.isArray(e.local.manifest.contributes.themes);
				});
				return new PagedModel(this.sortExtensions(others, options));
			}

			return new PagedModel(this.sortExtensions(result, options));
		}

		if (!value || ExtensionsListView.isInstalledExtensionsQuery(value)) {
			// Show installed extensions
			value = value ? value.replace(/@installed/g, '').replace(/@sort:(\w+)(-\w*)?/g, '').trim().toLowerCase() : '';

			let result = await this.extensionsWorkbenchService.queryLocal();

			result = result
				.filter(e => e.type === LocalExtensionType.User && (e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1));

			return new PagedModel(this.sortExtensions(result, options));
		}

		const idMatch = /@id:([a-z0-9][a-z0-9\-]*\.[a-z0-9][a-z0-9\-]*)/.exec(value);

		if (idMatch) {
			const name = idMatch[1];

			return this.extensionsWorkbenchService.queryGallery({ names: [name], source: 'queryById' })
				.then(pager => new PagedModel(pager));
		}

		if (/@outdated/i.test(value)) {
			value = value.replace(/@outdated/g, '').replace(/@sort:(\w+)(-\w*)?/g, '').trim().toLowerCase();

			const local = await this.extensionsWorkbenchService.queryLocal();
			const result = local
				.sort((e1, e2) => e1.displayName.localeCompare(e2.displayName))
				.filter(extension => extension.outdated && (extension.name.toLowerCase().indexOf(value) > -1 || extension.displayName.toLowerCase().indexOf(value) > -1));

			return new PagedModel(this.sortExtensions(result, options));
		}

		if (/@disabled/i.test(value)) {
			value = value.replace(/@disabled/g, '').replace(/@sort:(\w+)(-\w*)?/g, '').trim().toLowerCase();

			const local = await this.extensionsWorkbenchService.queryLocal();
			const runningExtensions = await this.extensionService.getExtensions();

			const result = local
				.sort((e1, e2) => e1.displayName.localeCompare(e2.displayName))
				.filter(e => runningExtensions.every(r => !areSameExtensions(r, e)) && (e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1));

			return new PagedModel(this.sortExtensions(result, options));
		}

		if (/@enabled/i.test(value)) {
			value = value ? value.replace(/@enabled/g, '').replace(/@sort:(\w+)(-\w*)?/g, '').trim().toLowerCase() : '';

			const local = await this.extensionsWorkbenchService.queryLocal();

			let result = local
				.sort((e1, e2) => e1.displayName.localeCompare(e2.displayName))
				.filter(e => e.type === LocalExtensionType.User &&
					(e.enablementState === EnablementState.Enabled || e.enablementState === EnablementState.WorkspaceEnabled) &&
					(e.name.toLowerCase().indexOf(value) > -1 || e.displayName.toLowerCase().indexOf(value) > -1)
				);

			return new PagedModel(this.sortExtensions(result, options));
		}

		if (ExtensionsListView.isWorkspaceRecommendedExtensionsQuery(query.value)) {
			return this.getWorkspaceRecommendationsModel(query, options);
		} else if (ExtensionsListView.isKeymapsRecommendedExtensionsQuery(query.value)) {
			return this.getKeymapRecommendationsModel(query, options);
		} else if (/@recommended:all/i.test(query.value) || ExtensionsListView.isSearchRecommendedExtensionsQuery(query.value)) {
			return this.getAllRecommendationsModel(query, options);
		} else if (ExtensionsListView.isRecommendedExtensionsQuery(query.value)) {
			return this.getRecommendationsModel(query, options);
		}

		let text = query.value;
		const extensionRegex = /\bext:([^\s]+)\b/g;

		if (extensionRegex.test(query.value)) {
			text = query.value.replace(extensionRegex, (m, ext) => {

				// Get curated keywords
				const keywords = this.tipsService.getKeywordsForExtension(ext);

				// Get mode name
				const modeId = this.modeService.getModeIdByFilenameOrFirstLine(`.${ext}`);
				const languageName = modeId && this.modeService.getLanguageName(modeId);
				const languageTag = languageName ? ` tag:"${languageName}"` : '';

				// Construct a rich query
				return `tag:"__ext_${ext}" tag:"__ext_.${ext}" ${keywords.map(tag => `tag:"${tag}"`).join(' ')}${languageTag} tag:"${ext}"`;
			});

			if (text !== query.value) {
				options = assign(options, { text: text.substr(0, 350), source: 'file-extension-tags' });
				const pager = await this.extensionsWorkbenchService.queryGallery(options);
				return new PagedModel(pager);
			}
		}

		if (text) {
			options = assign(options, { text: text.substr(0, 350), source: 'searchText' });
		} else {
			options.source = 'viewlet';
		}

		const pager = await this.extensionsWorkbenchService.queryGallery(options);
		return new PagedModel(pager);
	}

	private sortExtensions(extensions: IExtension[], options: IQueryOptions): IExtension[] {
		switch (options.sortBy) {
			case SortBy.InstallCount:
				extensions = extensions.sort((e1, e2) => e2.installCount - e1.installCount);
				break;
			case SortBy.AverageRating:
			case SortBy.WeightedRating:
				extensions = extensions.sort((e1, e2) => e2.rating - e1.rating);
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

	private getAllRecommendationsModel(query: Query, options: IQueryOptions): TPromise<IPagedModel<IExtension>> {
		const value = query.value.replace(/@recommended:all/g, '').replace(/@recommended/g, '').trim().toLowerCase();

		return this.extensionsWorkbenchService.queryLocal()
			.then(result => result.filter(e => e.type === LocalExtensionType.User))
			.then(local => {
				const installedExtensions = local.map(x => `${x.publisher}.${x.name}`);
				let fileBasedRecommendations = this.tipsService.getFileBasedRecommendations();
				const othersPromise = this.tipsService.getOtherRecommendations();
				const workspacePromise = this.tipsService.getWorkspaceRecommendations();

				return TPromise.join([othersPromise, workspacePromise])
					.then(([others, workspaceRecommendations]) => {
						const names = this.getTrimmedRecommendations(installedExtensions, value, fileBasedRecommendations, others, workspaceRecommendations);

						/* __GDPR__
							"extensionAllRecommendations:open" : {
								"count" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
							}
						*/
						this.telemetryService.publicLog('extensionAllRecommendations:open', { count: names.length });
						if (!names.length) {
							return TPromise.as(new PagedModel([]));
						}
						options.source = 'recommendations-all';
						return this.extensionsWorkbenchService.queryGallery(assign(options, { names, pageSize: names.length }))
							.then(pager => {
								this.sortFirstPage(pager, names);
								return new PagedModel(pager || []);
							});
					});
			});
	}

	private getRecommendationsModel(query: Query, options: IQueryOptions): TPromise<IPagedModel<IExtension>> {
		const value = query.value.replace(/@recommended/g, '').trim().toLowerCase();

		return this.extensionsWorkbenchService.queryLocal()
			.then(result => result.filter(e => e.type === LocalExtensionType.User))
			.then(local => {
				const installedExtensions = local.map(x => `${x.publisher}.${x.name}`);
				let fileBasedRecommendations = this.tipsService.getFileBasedRecommendations();
				const othersPromise = this.tipsService.getOtherRecommendations();
				const workspacePromise = this.tipsService.getWorkspaceRecommendations();

				return TPromise.join([othersPromise, workspacePromise])
					.then(([others, workspaceRecommendations]) => {
						workspaceRecommendations = workspaceRecommendations.map(x => x.toLowerCase());
						fileBasedRecommendations = fileBasedRecommendations.filter(x => workspaceRecommendations.indexOf(x.toLowerCase()) === -1);
						others = others.filter(x => workspaceRecommendations.indexOf(x.toLowerCase()) === -1);

						const names = this.getTrimmedRecommendations(installedExtensions, value, fileBasedRecommendations, others, []);

						/* __GDPR__
							"extensionRecommendations:open" : {
								"count" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
							}
						*/
						this.telemetryService.publicLog('extensionRecommendations:open', { count: names.length });

						if (!names.length) {
							return TPromise.as(new PagedModel([]));
						}
						options.source = 'recommendations';
						return this.extensionsWorkbenchService.queryGallery(assign(options, { names, pageSize: names.length }))
							.then(pager => {
								this.sortFirstPage(pager, names);
								return new PagedModel(pager || []);
							});
					});
			});
	}

	// Given all recommendations, trims and returns recommendations in the relevant order after filtering out installed extensions
	private getTrimmedRecommendations(installedExtensions: string[], value: string, fileBasedRecommendations: string[], otherRecommendations: string[], workpsaceRecommendations: string[], ) {
		const totalCount = 8;
		workpsaceRecommendations = workpsaceRecommendations
			.filter(name => {
				return installedExtensions.indexOf(name) === -1
					&& name.toLowerCase().indexOf(value) > -1;
			});
		fileBasedRecommendations = fileBasedRecommendations.filter(x => {
			return installedExtensions.indexOf(x) === -1
				&& workpsaceRecommendations.indexOf(x) === -1
				&& x.toLowerCase().indexOf(value) > -1;
		});
		otherRecommendations = otherRecommendations.filter(x => {
			return installedExtensions.indexOf(x) === -1
				&& fileBasedRecommendations.indexOf(x) === -1
				&& workpsaceRecommendations.indexOf(x) === -1
				&& x.toLowerCase().indexOf(value) > -1;
		});

		let otherCount = Math.min(2, otherRecommendations.length);
		let fileBasedCount = Math.min(fileBasedRecommendations.length, totalCount - workpsaceRecommendations.length - otherCount);
		let names = workpsaceRecommendations;
		names.push(...fileBasedRecommendations.splice(0, fileBasedCount));
		names.push(...otherRecommendations.splice(0, otherCount));

		return names;
	}

	private getWorkspaceRecommendationsModel(query: Query, options: IQueryOptions): TPromise<IPagedModel<IExtension>> {
		const value = query.value.replace(/@recommended:workspace/g, '').trim().toLowerCase();
		return this.tipsService.getWorkspaceRecommendations()
			.then(recommendations => {
				const names = recommendations.filter(name => name.toLowerCase().indexOf(value) > -1);
				/* __GDPR__
			"extensionWorkspaceRecommendations:open" : {
				"count" : { "classification": "SystemMetaData", "purpose": "FeatureInsight", "isMeasurement": true }
			}
		*/
				this.telemetryService.publicLog('extensionWorkspaceRecommendations:open', { count: names.length });

				if (!names.length) {
					return TPromise.as(new PagedModel([]));
				}
				options.source = 'recommendations-workspace';
				return this.extensionsWorkbenchService.queryGallery(assign(options, { names, pageSize: names.length }))
					.then(pager => new PagedModel(pager || []));
			});
	}

	private getKeymapRecommendationsModel(query: Query, options: IQueryOptions): TPromise<IPagedModel<IExtension>> {
		const value = query.value.replace(/@recommended:keymaps/g, '').trim().toLowerCase();
		const names = this.tipsService.getKeymapRecommendations()
			.filter(name => name.toLowerCase().indexOf(value) > -1);

		if (!names.length) {
			return TPromise.as(new PagedModel([]));
		}
		options.source = 'recommendations-keymaps';
		return this.extensionsWorkbenchService.queryGallery(assign(options, { names, pageSize: names.length }))
			.then(result => new PagedModel(result));
	}

	// Sorts the firsPage of the pager in the same order as given array of extension ids
	private sortFirstPage(pager: IPager<IExtension>, ids: string[]) {
		ids = ids.map(x => x.toLowerCase());
		pager.firstPage.sort((a, b) => {
			return ids.indexOf(a.id.toLowerCase()) < ids.indexOf(b.id.toLowerCase()) ? -1 : 1;
		});
	}

	private setModel(model: IPagedModel<IExtension>) {
		this.list.model = model;
		this.list.scrollTop = 0;
		const count = this.count();

		toggleClass(this.extensionsList, 'hidden', count === 0);
		toggleClass(this.messageBox, 'hidden', count > 0);
		this.badge.setCount(count);

		if (count === 0 && this.isVisible()) {
			this.messageBox.textContent = localize('no extensions found', "No extensions found.");
		} else {
			this.messageBox.textContent = '';
		}
	}

	private openExtension(extension: IExtension): void {
		this.extensionsWorkbenchService.open(extension).done(null, err => this.onError(err));
	}

	private pin(): void {
		const activeEditor = this.editorService.getActiveEditor();
		const activeEditorInput = this.editorService.getActiveEditorInput();

		this.editorInputService.pinEditor(activeEditor.position, activeEditorInput);
		activeEditor.focus();
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

	static isBuiltInExtensionsQuery(query: string): boolean {
		return /^\s*@builtin\s*$/i.test(query);
	}

	static isInstalledExtensionsQuery(query: string): boolean {
		return /@installed/i.test(query);
	}

	static isOutdatedExtensionsQuery(query: string): boolean {
		return /@outdated/i.test(query);
	}

	static isDisabledExtensionsQuery(query: string): boolean {
		return /@disabled/i.test(query);
	}

	static isEnabledExtensionsQuery(query: string): boolean {
		return /@enabled/i.test(query);
	}

	static isRecommendedExtensionsQuery(query: string): boolean {
		return /^@recommended$/i.test(query.trim());
	}

	static isSearchRecommendedExtensionsQuery(query: string): boolean {
		return /@recommended/i.test(query) && !ExtensionsListView.isRecommendedExtensionsQuery(query);
	}

	static isWorkspaceRecommendedExtensionsQuery(query: string): boolean {
		return /@recommended:workspace/i.test(query);
	}

	static isKeymapsRecommendedExtensionsQuery(query: string): boolean {
		return /@recommended:keymaps/i.test(query);
	}
}

export class InstalledExtensionsView extends ExtensionsListView {

	public static isInsalledExtensionsQuery(query: string): boolean {
		return ExtensionsListView.isInstalledExtensionsQuery(query)
			|| ExtensionsListView.isOutdatedExtensionsQuery(query)
			|| ExtensionsListView.isDisabledExtensionsQuery(query)
			|| ExtensionsListView.isEnabledExtensionsQuery(query);
	}

	async show(query: string): TPromise<IPagedModel<IExtension>> {
		if (InstalledExtensionsView.isInsalledExtensionsQuery(query)) {
			return super.show(query);
		}
		let searchInstalledQuery = '@installed';
		searchInstalledQuery = query ? searchInstalledQuery + ' ' + query : searchInstalledQuery;
		return super.show(searchInstalledQuery);
	}
}

export class BuiltInExtensionsView extends ExtensionsListView {

	async show(query: string): TPromise<IPagedModel<IExtension>> {
		return super.show(query.replace('@builtin', '@builtin:features'));
	}

}

export class BuiltInThemesExtensionsView extends ExtensionsListView {

	async show(query: string): TPromise<IPagedModel<IExtension>> {
		return super.show(query.replace('@builtin', '@builtin:themes'));
	}
}

export class BuiltInBasicsExtensionsView extends ExtensionsListView {

	async show(query: string): TPromise<IPagedModel<IExtension>> {
		return super.show(query.replace('@builtin', '@builtin:basics'));
	}
}

export class RecommendedExtensionsView extends ExtensionsListView {

	async show(query: string): TPromise<IPagedModel<IExtension>> {
		return super.show(!query.trim() ? '@recommended:all' : '@recommended');
	}
}

export class WorkspaceRecommendedExtensionsView extends ExtensionsListView {

	renderHeader(container: HTMLElement): void {
		super.renderHeader(container);

		const listActionBar = $('.list-actionbar-container');
		container.insertBefore(listActionBar, this.badgeContainer);

		const actionbar = new ActionBar(listActionBar, {
			animated: false
		});
		actionbar.onDidRun(({ error }) => error && this.notificationService.error(error));
		const installAllAction = this.instantiationService.createInstance(InstallWorkspaceRecommendedExtensionsAction, InstallWorkspaceRecommendedExtensionsAction.ID, InstallWorkspaceRecommendedExtensionsAction.LABEL);
		const configureWorkspaceFolderAction = this.instantiationService.createInstance(ConfigureWorkspaceFolderRecommendedExtensionsAction, ConfigureWorkspaceFolderRecommendedExtensionsAction.ID, ConfigureWorkspaceFolderRecommendedExtensionsAction.LABEL);

		installAllAction.class = 'octicon octicon-cloud-download';
		configureWorkspaceFolderAction.class = 'octicon octicon-pencil';

		actionbar.push([installAllAction], { icon: true, label: false });
		actionbar.push([configureWorkspaceFolderAction], { icon: true, label: false });

		this.disposables.push(actionbar);
	}

	async show(query: string): TPromise<IPagedModel<IExtension>> {
		let model = await super.show('@recommended:workspace');
		this.setExpanded(model.length > 0);
		return model;
	}

}