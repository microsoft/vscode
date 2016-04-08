/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { ThrottledDelayer, always } from 'vs/base/common/async';
import { Dimension, Builder } from 'vs/base/browser/builder';
import { append, emmet as $, addClass, removeClass } from 'vs/base/browser/dom';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { Position } from 'vs/platform/editor/common/editor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDelegate } from 'vs/base/browser/ui/list/list';
import { IPagedRenderer, PagedList } from 'vs/base/browser/ui/list/listPaging';
import { IExtension, IGalleryService } from '../common/extensions';
import { PagedModel, mapPager } from 'vs/base/common/paging';

interface ITemplateData {
	root: HTMLElement;
	extension: HTMLElement;
	icon: HTMLImageElement;
	name: HTMLElement;
	version: HTMLElement;
	author: HTMLElement;
	description: HTMLElement;
}

enum ExtensionState {
	Uninstalled,
	Installed,
	Outdated
}

interface IExtensionEntry {
	extension: IExtension;
	state: ExtensionState;
}

// function extensionEntryCompare(one: IExtensionEntry, other: IExtensionEntry): number {
// 	const oneInstallCount = one.extension.galleryInformation ? one.extension.galleryInformation.installCount : 0;
// 	const otherInstallCount = other.extension.galleryInformation ? other.extension.galleryInformation.installCount : 0;
// 	const diff = otherInstallCount - oneInstallCount;

// 	if (diff !== 0) {
// 		return diff;
// 	}

// 	return one.extension.displayName.localeCompare(other.extension.displayName);
// }

class Delegate implements IDelegate<IExtension> {
	getHeight() { return 90; }
	getTemplateId() { return 'extension'; }
}

class Renderer implements IPagedRenderer<IExtensionEntry, ITemplateData> {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService
	) {}

	get templateId() { return 'extension'; }

	renderTemplate(container: HTMLElement): ITemplateData {
		const root = append(container, $('.extension-container'));
		const extension = append(root, $('.extension'));
		const icon = append(extension, $<HTMLImageElement>('img.icon'));
		const body = append(extension, $('.body'));
		const title = append(body, $('.title'));
		const subtitle = append(body, $('.subtitle'));
		const name = append(title, $('span.name'));
		const version = append(subtitle, $('span.version'));
		const author = append(subtitle, $('span.author'));
		const description = append(body, $('.description'));

		return {
			root, extension, icon,
			name, version, author, description
		};
	}

	renderPlaceholder(index: number, data: ITemplateData): void {
		addClass(data.extension, 'loading');
		data.icon.style.display = 'none';
		data.name.textContent = '';
		data.version.textContent = '';
		data.author.textContent = '';
		data.description.textContent = '';
	}

	renderElement(entry: IExtensionEntry, index: number, data: ITemplateData): void {
		const extension = entry.extension;
		const publisher = extension.galleryInformation ? extension.galleryInformation.publisherDisplayName : extension.publisher;
		const version = extension.galleryInformation.versions[0];

		removeClass(data.extension, 'loading');
		data.icon.style.display = 'block';
		data.icon.src = version.iconUrl;
		data.name.textContent = extension.displayName;
		data.version.textContent = ` ${ extension.version }`;
		data.author.textContent = ` ${ localize('author', "by {0}", publisher)}`;
		data.description.textContent = extension.description;
	}

	disposeTemplate(data: ITemplateData): void {
		// TODO
	}
}

const EmptyModel = new PagedModel({
	firstPage: [],
	total: 0,
	pageSize: 0,
	getPage: null
});

export class ExtensionsPart extends BaseEditor {

	static ID: string = 'workbench.editor.extensionsPart';

	private list: PagedList<IExtensionEntry>;
	private searchDelayer: ThrottledDelayer<any>;
	private searchBox: HTMLInputElement;
	private extensionsBox: HTMLElement;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IGalleryService private galleryService: IGalleryService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(ExtensionsPart.ID, telemetryService);
		this.searchDelayer = new ThrottledDelayer(500);
	}

	createEditor(parent: Builder): void {
		const container = parent.getHTMLElement();
		const root = append(container, $('.extension-manager'));
		const search = append(root, $('.search'));
		this.searchBox = append(search, $<HTMLInputElement>('input.search-box'));
		this.searchBox.placeholder = localize('searchExtensions', "Search Extensions");
		this.extensionsBox = append(root, $('.extensions'));

		const delegate = new Delegate();
		const renderer = this.instantiationService.createInstance(Renderer);
		this.list = new PagedList(this.extensionsBox, delegate, [renderer]);

		this.searchBox.oninput = () => this.triggerSearch(this.searchBox.value);
	}

	setVisible(visible: boolean, position?: Position): TPromise<void> {
		return super.setVisible(visible, position).then(() => {
			if (visible) {
				this.searchBox.value = '';
				this.triggerSearch('', 0);
			}
		});
	}

	layout(dimension: Dimension): void {
		const height = dimension.height - 72;

		this.extensionsBox.style.height = `${ height }px`;
		this.list.layout(height);
	}

	focus(): void {
		this.searchBox.focus();
	}

	private triggerSearch(text: string = '', delay = 500): void {
		this.list.model = EmptyModel;

		const promise = this.searchDelayer.trigger(() => this.doSearch(text), delay);

		addClass(this.extensionsBox, 'loading');
		always(promise, () => removeClass(this.extensionsBox, 'loading'));
	}

	private doSearch(text: string = ''): TPromise<any> {
		return this.galleryService.query({ text })
			.then(result => new PagedModel(mapPager(result, extension => ({ extension, state: ExtensionState.Installed }))))
			.then(model => this.list.model = model);
	}

	dispose(): void {
		super.dispose();
	}
}
