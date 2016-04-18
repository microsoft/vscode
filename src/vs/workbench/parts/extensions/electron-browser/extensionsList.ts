/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/extensions2';
import { localize } from 'vs/nls';
import { append, emmet as $, addClass, removeClass } from 'vs/base/browser/dom';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IDelegate } from 'vs/base/browser/ui/list/list';
import { IPagedRenderer } from 'vs/base/browser/ui/list/listPaging';
import { IExtension } from '../common/extensions';

export interface ITemplateData {
	extension: IExtension;
	container: HTMLElement;
	element: HTMLElement;
	icon: HTMLImageElement;
	name: HTMLElement;
	version: HTMLElement;
	author: HTMLElement;
	description: HTMLElement;
}

export enum ExtensionState {
	Uninstalled,
	Installed,
	Outdated
}

export interface IExtensionEntry {
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

export class Delegate implements IDelegate<IExtension> {
	getHeight() { return 90; }
	getTemplateId() { return 'extension'; }
}

export class Renderer implements IPagedRenderer<IExtensionEntry, ITemplateData> {

	private _templates: ITemplateData[];
	get templates(): ITemplateData[] { return this._templates; }

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this._templates = [];
	}

	get templateId() { return 'extension'; }

	renderTemplate(root: HTMLElement): ITemplateData {
		const container = append(root, $('.extension-container'));
		const element = append(container, $('.extension'));
		const header = append(element, $('.header'));
		const icon = append(header, $<HTMLImageElement>('img.icon'));
		const details = append(header, $('.details'));
		const title = append(details, $('.title'));
		const subtitle = append(details, $('.subtitle'));
		const name = append(title, $('span.name'));
		const version = append(subtitle, $('span.version'));
		const author = append(subtitle, $('span.author'));
		const description = append(details, $('.description'));
		const result = { extension: null, container, element, icon, name, version, author, description };

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

	renderElement(entry: IExtensionEntry, index: number, data: ITemplateData): void {
		const extension = entry.extension;
		const publisher = extension.galleryInformation ? extension.galleryInformation.publisherDisplayName : extension.publisher;
		const version = extension.galleryInformation.versions[0];

		data.extension = extension;
		removeClass(data.element, 'loading');
		data.icon.src = version.iconUrl;
		data.name.textContent = extension.displayName;
		data.version.textContent = ` ${ extension.version }`;
		data.author.textContent = ` ${ localize('author', "by {0}", publisher)}`;
		data.description.textContent = extension.description;
	}

	disposeTemplate(data: ITemplateData): void {
		const index = this._templates.indexOf(data);

		if (index > -1) {
			this._templates.splice(index, 1);
		}
	}
}
