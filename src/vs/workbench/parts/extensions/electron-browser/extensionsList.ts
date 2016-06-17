/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { append, emmet as $, addClass, removeClass } from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDelegate } from 'vs/base/browser/ui/list/list';
import { IPagedRenderer } from 'vs/base/browser/ui/list/listPaging';
import { ILocalExtension, IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';

export interface ITemplateData {
	extension: ILocalExtension | IGalleryExtension;
	element: HTMLElement;
	icon: HTMLImageElement;
	name: HTMLElement;
	version: HTMLElement;
	author: HTMLElement;
	description: HTMLElement;
}

export class Delegate implements IDelegate<ILocalExtension | IGalleryExtension> {
	getHeight() { return 62; }
	getTemplateId() { return 'extension'; }
}

export class Renderer implements IPagedRenderer<ILocalExtension | IGalleryExtension, ITemplateData> {

	private _templates: ITemplateData[];
	get templates(): ITemplateData[] { return this._templates; }

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this._templates = [];
	}

	get templateId() { return 'extension'; }

	renderTemplate(root: HTMLElement): ITemplateData {
		const element = append(root, $('.extension'));
		const icon = append(element, $<HTMLImageElement>('img.icon'));
		const details = append(element, $('.details'));
		const header = append(details, $('.header'));
		const name = append(header, $('span.name.ellipsis'));
		const version = append(header, $('span.version.ellipsis'));
		const author = append(header, $('span.author.ellipsis'));
		const description = append(details, $('.description.ellipsis'));
		const result = { extension: null, element, icon, name, version, author, description };

		this._templates.push(result);
		return result;
	}

	renderPlaceholder(index: number, data: ITemplateData): void {
		addClass(data.element, 'loading');
		data.extension = null;
		data.icon.src = '';
		data.name.textContent = '';
		data.version.textContent = '';
		data.author.textContent = '';
		data.description.textContent = '';
	}

	renderElement(extension: ILocalExtension | IGalleryExtension, index: number, data: ITemplateData): void {
		const local = extension as ILocalExtension;
		const galleryExtension = extension as IGalleryExtension;

		if (local.path) {
			return this.renderExtension(local, data);
		} else {
			return this.renderGalleryExtension(galleryExtension, data);
		}
	}

	private renderExtension(extension: ILocalExtension, data: ITemplateData): void {
		let iconUrl: string;
		let publisher = extension.manifest.publisher;

		if (extension.manifest.icon) {
			iconUrl = `file://${ extension.path }/${ extension.manifest.icon }`;
		}

		if (extension.metadata) {
			publisher = extension.metadata.publisherDisplayName || publisher;
		}

		data.extension = extension;
		removeClass(data.element, 'loading');
		data.icon.src = iconUrl || require.toUrl('./media/defaultIcon.png');
		data.name.textContent = extension.manifest.displayName || extension.manifest.name;
		data.version.textContent = ` ${ extension.manifest.version }`;
		data.author.textContent = ` ${ publisher }`;
		data.description.textContent = extension.manifest.description;
	}

	private renderGalleryExtension(extension: IGalleryExtension, data: ITemplateData): void {
		const version = extension.versions[0];
		const publisher = extension.publisherDisplayName || extension.publisher;
		const iconUrl = version.iconUrl;

		data.extension = extension;
		removeClass(data.element, 'loading');
		data.icon.src = iconUrl || require.toUrl('./media/defaultIcon.png');
		data.name.textContent = extension.displayName || extension.name;
		data.version.textContent = ` ${ version.version }`;
		data.author.textContent = ` ${ publisher }`;
		data.description.textContent = extension.description;
	}

	disposeTemplate(data: ITemplateData): void {
		const index = this._templates.indexOf(data);

		if (index > -1) {
			this._templates.splice(index, 1);
		}
	}
}
