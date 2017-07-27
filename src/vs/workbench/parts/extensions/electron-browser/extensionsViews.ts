/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { assign } from 'vs/base/common/objects';
import { distinct } from 'vs/base/common/arrays';
import { chain } from 'vs/base/common/event';
import { isPromiseCanceledError, create as createError } from 'vs/base/common/errors';
import Severity from 'vs/base/common/severity';
import { PagedModel, IPagedModel, mergePagers, IPager } from 'vs/base/common/paging';
import { ViewSizing } from 'vs/base/browser/ui/splitview/splitview';
import { IMessageService, CloseAction } from 'vs/platform/message/common/message';
import { SortBy, SortOrder, IQueryOptions, LocalExtensionType, IExtensionTipsService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { IContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { append, $, toggleClass } from 'vs/base/browser/dom';
import { PagedList } from 'vs/base/browser/ui/list/listPaging';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Delegate, Renderer } from 'vs/workbench/parts/extensions/browser/extensionsList';
import { IExtension, IExtensionsWorkbenchService } from '../common/extensions';
import { Query } from '../common/extensionQuery';
import { IListService } from 'vs/platform/list/browser/listService';
import { IExtensionService } from 'vs/platform/extensions/common/extensions';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { attachListStyler, attachBadgeStyler } from 'vs/platform/theme/common/styler';
import { CollapsibleView, IViewletViewOptions, IViewOptions } from 'vs/workbench/parts/views/browser/views';
import { OpenGlobalSettingsAction } from 'vs/workbench/parts/preferences/browser/preferencesActions';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { CountBadge } from 'vs/base/browser/ui/countBadge/countBadge';

export class ExtensionsListView extends CollapsibleView {

	private messageBox: HTMLElement;
	private extensionsList: HTMLElement;
	private badge: CountBadge;

	private list: PagedList<IExtension>;
	private disposables: IDisposable[] = [];

	constructor(
		private options: IViewletViewOptions,
		@IMessageService private messageService: IMessageService,
		@IKeybindingService keybindingService: IKeybindingService,
		@IContextMenuService contextMenuService: IContextMenuService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IListService private listService: IListService,
		@IThemeService private themeService: IThemeService,
		@IContextKeyService private contextKeyService: IContextKeyService,
		@IExtensionService private extensionService: IExtensionService,
		@ICommandService private commandService: ICommandService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEditorGroupService private editorInputService: IEditorGroupService,
		@IExtensionTipsService private tipsService: IExtensionTipsService,
		@IModeService private modeService: IModeService,
		@ITelemetryService private telemetryService: ITelemetryService,
		@IProgressService private progressService: IProgressService
	) {
		super({ ...(options as IViewOptions), ariaHeaderLabel: options.name, sizing: ViewSizing.Flexible, collapsed: !!options.collapsed, initialBodySize: 1 * 62 }, keybindingService, contextMenuService);
	}

	renderHeader(container: HTMLElement): void {
		const titleDiv = append(container, $('div.title'));
		append(titleDiv, $('span')).textContent = this.options.name;
		this.badge = new CountBadge(append(container, $('.count-badge-wrapper')));
		this.disposables.push(attachBadgeStyler(this.badge, this.themeService));
	}

	renderBody(container: HTMLElement): void {
		this.extensionsList = append(container, $('.extensions-list'));
		this.messageBox = append(container, $('.message'));
		const delegate = new Delegate();
		const renderer = this.instantiationService.createInstance(Renderer);
		this.list = new PagedList(this.extensionsList, delegate, [renderer], {
			ariaLabel: localize('extensions', "Extensions"),
			keyboardSupport: false
		});

		this.disposables.push(attachListStyler(this.list.widget, this.themeService));
		this.disposables.push(this.listService.register(this.list.widget));

		chain(this.list.onSelectionChange)
			.map(e => e.elements[0])
			.filter(e => !!e)
			.on(this.openExtension, this, this.disposables);

		chain(this.list.onPin)
			.map(e => e.elements[0])
			.filter(e => !!e)
			.on(this.pin, this, this.disposables);
	}

	setVisible(visible: boolean): TPromise<void> {
		return super.setVisible(visible).then(() => {
			if (!visible) {
				this.setModel(new PagedModel([]));
			}
		});
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

		if (!value || ExtensionsListView.isInstalledExtensionsQuery(value)) {
			// Show installed extensions
			value = value ? value.replace(/@installed/g, '').replace(/@sort:(\w+)(-\w*)?/g, '').trim().toLowerCase() : '';

			let result = await this.extensionsWorkbenchService.queryLocal();

			switch (options.sortBy) {
				case SortBy.InstallCount:
					result = result.sort((e1, e2) => e2.installCount - e1.installCount);
					break;
				case SortBy.AverageRating:
				case SortBy.WeightedRating:
					result = result.sort((e1, e2) => e2.rating - e1.rating);
					break;
				default:
					result = result.sort((e1, e2) => e1.displayName.localeCompare(e2.displayName));
					break;
			}

			if (options.sortOrder === SortOrder.Descending) {
				result = result.reverse();
			}

			result = result
				.filter(e => e.type === LocalExtensionType.User && e.name.toLowerCase().indexOf(value) > -1);

			return new PagedModel(result);
		}

		if (/@outdated/i.test(value)) {
			value = value.replace(/@outdated/g, '').trim().toLowerCase();

			const local = await this.extensionsWorkbenchService.queryLocal();
			const result = local
				.sort((e1, e2) => e1.displayName.localeCompare(e2.displayName))
				.filter(extension => extension.outdated && extension.name.toLowerCase().indexOf(value) > -1);

			return new PagedModel(result);
		}

		if (/@disabled/i.test(value)) {
			value = value.replace(/@disabled/g, '').trim().toLowerCase();

			const local = await this.extensionsWorkbenchService.queryLocal();
			const runningExtensions = await this.extensionService.getExtensions();

			const result = local
				.sort((e1, e2) => e1.displayName.localeCompare(e2.displayName))
				.filter(e => runningExtensions.every(r => !areSameExtensions(r, e)) && e.name.toLowerCase().indexOf(value) > -1);

			return new PagedModel(result);
		}

		if (/@enabled/i.test(value)) {
			value = value ? value.replace(/@enabled/g, '').trim().toLowerCase() : '';

			const local = await this.extensionsWorkbenchService.queryLocal();

			const result = local
				.sort((e1, e2) => e1.displayName.localeCompare(e2.displayName))
				.filter(e => e.type === LocalExtensionType.User &&
					!(e.disabledForWorkspace || e.disabledGlobally) &&
					e.name.toLowerCase().indexOf(value) > -1
				);

			return new PagedModel(result);
		}

		if (ExtensionsListView.isWorkspaceRecommendedExtensionsQuery(query.value)) {
			return this.getWorkspaceRecommendationsModel(query, options);
		} else if (ExtensionsListView.isKeymapsRecommendedExtensionsQuery(query.value)) {
			return this.getKeymapRecommendationsModel(query, options);
		} else if (/@recommended:all/i.test(query.value)) {
			return this.getAllRecommendationsModel(query, options);
		} else if (ExtensionsListView.isRecommendedExtensionsQuery(query.value)) {
			return this.getRecommendationsModel(query, options);
		}

		const pagerPromises: TPromise<IPager<IExtension>>[] = [];
		let text = query.value;
		const extensionRegex = /\bext:([^\s]+)\b/g;

		if (extensionRegex.test(query.value)) {
			let names: string[] = [];

			text = query.value.replace(extensionRegex, (m, ext) => {
				names.push(...this.tipsService.getRecommendationsForExtension(ext));

				// Get curated keywords
				const keywords = this.tipsService.getKeywordsForExtension(ext);

				// Get mode name
				const modeId = this.modeService.getModeIdByFilenameOrFirstLine(`.${ext}`);
				const languageName = modeId && this.modeService.getLanguageName(modeId);
				const languageTag = languageName ? ` tag:"${languageName}"` : '';

				// Construct a rich query
				return `tag:"__ext_${ext}"${keywords.map(tag => ` tag:${tag}`)}${languageTag}`;
			});

			if (names.length) {
				const namesOptions = assign({}, options, { names });
				pagerPromises.push(this.extensionsWorkbenchService.queryGallery(namesOptions));
			}
		}

		if (text) {
			options = assign(options, { text: text.substr(0, 350) });
		}

		pagerPromises.push(this.extensionsWorkbenchService.queryGallery(options));

		const pagers = await TPromise.join(pagerPromises);
		const pager = pagers.length === 2 ? mergePagers(pagers[0], pagers[1]) : pagers[0];

		return new PagedModel(pager);
	}

	private getAllRecommendationsModel(query: Query, options: IQueryOptions): TPromise<IPagedModel<IExtension>> {
		const value = query.value.replace(/@recommended:all/g, '').trim().toLowerCase();

		return this.extensionsWorkbenchService.queryLocal()
			.then(result => result.filter(e => e.type === LocalExtensionType.User))
			.then(local => {
				return TPromise.join([TPromise.as(this.tipsService.getRecommendations()), this.tipsService.getWorkspaceRecommendations()])
					.then(([recommendations, workspaceRecommendations]) => {
						const names = distinct([...recommendations, ...workspaceRecommendations])
							.filter(name => local.every(ext => `${ext.publisher}.${ext.name}` !== name))
							.filter(name => name.toLowerCase().indexOf(value) > -1);

						if (!names.length) {
							return TPromise.as(new PagedModel([]));
						}

						return this.extensionsWorkbenchService.queryGallery(assign(options, { names, pageSize: names.length }))
							.then(pager => new PagedModel(pager || []));
					});
			});
	}

	private getRecommendationsModel(query: Query, options: IQueryOptions): TPromise<IPagedModel<IExtension>> {
		const value = query.value.replace(/@recommended/g, '').trim().toLowerCase();

		return this.extensionsWorkbenchService.queryLocal()
			.then(result => result.filter(e => e.type === LocalExtensionType.User))
			.then(local => {
				const names = this.tipsService.getRecommendations()
					.filter(name => local.every(ext => `${ext.publisher}.${ext.name}` !== name))
					.filter(name => name.toLowerCase().indexOf(value) > -1);

				this.telemetryService.publicLog('extensionRecommendations:open', { count: names.length });

				if (!names.length) {
					return TPromise.as(new PagedModel([]));
				}

				return this.extensionsWorkbenchService.queryGallery(assign(options, { names, pageSize: names.length }))
					.then(pager => new PagedModel(pager));
			});
	}

	private getWorkspaceRecommendationsModel(query: Query, options: IQueryOptions): TPromise<IPagedModel<IExtension>> {
		const value = query.value.replace(/@recommended:workspace/g, '').trim().toLowerCase();
		return this.tipsService.getWorkspaceRecommendations()
			.then(recommendations => {
				const names = recommendations.filter(name => name.toLowerCase().indexOf(value) > -1);
				this.telemetryService.publicLog('extensionWorkspaceRecommendations:open', { count: names.length });

				if (!names.length) {
					return TPromise.as(new PagedModel([]));
				}

				return this.extensionsWorkbenchService.queryGallery(assign(options, { names, pageSize: names.length }))
					.then(pager => new PagedModel(pager));
			});
	}

	private getKeymapRecommendationsModel(query: Query, options: IQueryOptions): TPromise<IPagedModel<IExtension>> {
		const value = query.value.replace(/@recommended:keymaps/g, '').trim().toLowerCase();
		const names = this.tipsService.getKeymapRecommendations()
			.filter(name => name.toLowerCase().indexOf(value) > -1);
		this.telemetryService.publicLog('extensionKeymapRecommendations:open', { count: names.length });

		if (!names.length) {
			return TPromise.as(new PagedModel([]));
		}

		return this.extensionsWorkbenchService.queryGallery(assign(options, { names, pageSize: names.length }))
			.then(result => new PagedModel(result));
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
		return /@recommended/i.test(query);
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

export class RecommendedExtensionsView extends ExtensionsListView {

	public static isRecommendedExtensionsQuery(query: string): boolean {
		return ExtensionsListView.isRecommendedExtensionsQuery(query)
			|| ExtensionsListView.isWorkspaceRecommendedExtensionsQuery(query);
	}

	async show(query: string): TPromise<IPagedModel<IExtension>> {
		if (RecommendedExtensionsView.isRecommendedExtensionsQuery(query)) {
			return super.show(query);
		}
		let searchInstalledQuery = '@recommended:all';
		searchInstalledQuery = query ? searchInstalledQuery + ' ' + query : searchInstalledQuery;
		return super.show(searchInstalledQuery);
	}

}