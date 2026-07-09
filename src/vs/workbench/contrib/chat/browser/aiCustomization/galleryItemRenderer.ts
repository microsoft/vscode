/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../../base/browser/dom.js';
import { Button } from '../../../../../base/browser/ui/button/button.js';
import { IListRenderer } from '../../../../../base/browser/ui/list/list.js';
import { DisposableStore, IDisposable } from '../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../nls.js';
import { defaultButtonStyles } from '../../../../../platform/theme/browser/defaultStyles.js';

const $ = DOM.$;

/**
 * Install state of a gallery item, used to drive the install button label and enablement.
 */
export const enum GalleryItemInstallState {
	Uninstalled,
	Installing,
	Installed,
}

/**
 * Adapts a list element to the data and actions a gallery row needs.
 */
export interface IGalleryItemProvider<TElement> {
	getLabel(element: TElement): string;
	getPublisherDisplayName(element: TElement): string | undefined;
	getDescription(element: TElement): string | undefined;
	getInstallState(element: TElement): GalleryItemInstallState;
	canInstall?(element: TElement): boolean;
	install(element: TElement): Promise<void>;
	onDidChangeInstallState?(element: TElement, listener: () => void): IDisposable;
}

interface IGalleryItemTemplateData {
	readonly name: HTMLElement;
	readonly publisher: HTMLElement;
	readonly description: HTMLElement;
	readonly installButton: Button;
	readonly elementDisposables: DisposableStore;
	readonly templateDisposables: DisposableStore;
}

/**
 * Reusable list renderer for a gallery row with an Install button. Shared by the Chat
 * Customizations tools, MCP server and plugin marketplace lists. All rows share a single set of
 * `.gallery-item*` styles; data and actions are supplied via {@link IGalleryItemProvider}.
 */
export class GalleryItemRenderer<TElement> implements IListRenderer<TElement, IGalleryItemTemplateData> {

	constructor(
		readonly templateId: string,
		private readonly _provider: IGalleryItemProvider<TElement>,
	) { }

	renderTemplate(container: HTMLElement): IGalleryItemTemplateData {
		container.classList.add('gallery-item');
		const details = DOM.append(container, $('.gallery-item-details'));
		const name = DOM.append(details, $('span.gallery-item-name'));
		const description = DOM.append(details, $('span.gallery-item-description'));
		const publisher = DOM.append(details, $('span.gallery-item-publisher'));
		const actionContainer = DOM.append(container, $('.gallery-item-action'));
		const installButton = new Button(actionContainer, { ...defaultButtonStyles, supportIcons: true });

		const templateDisposables = new DisposableStore();
		templateDisposables.add(installButton);

		return { name, publisher, description, installButton, elementDisposables: new DisposableStore(), templateDisposables };
	}

	renderElement(element: TElement, _index: number, templateData: IGalleryItemTemplateData): void {
		templateData.elementDisposables.clear();

		templateData.name.textContent = this._provider.getLabel(element);
		const publisher = this._provider.getPublisherDisplayName(element);
		templateData.publisher.textContent = publisher ? localize('galleryItemBy', "by {0}", publisher) : '';
		templateData.description.textContent = this._provider.getDescription(element) || '';

		this._updateInstallButton(templateData.installButton, element);

		templateData.elementDisposables.add(templateData.installButton.onDidClick(async () => {
			if (this._provider.getInstallState(element) !== GalleryItemInstallState.Uninstalled) {
				return;
			}
			if (this._provider.canInstall && !this._provider.canInstall(element)) {
				return;
			}
			templateData.installButton.label = localize('galleryItemInstalling', "Installing...");
			templateData.installButton.enabled = false;
			try {
				await this._provider.install(element);
			} finally {
				this._updateInstallButton(templateData.installButton, element);
			}
		}));

		const changeListener = this._provider.onDidChangeInstallState?.(element, () => this._updateInstallButton(templateData.installButton, element));
		if (changeListener) {
			templateData.elementDisposables.add(changeListener);
		}
	}

	private _updateInstallButton(button: Button, element: TElement): void {
		switch (this._provider.getInstallState(element)) {
			case GalleryItemInstallState.Installed:
				button.label = localize('galleryItemInstalled', "Installed");
				button.enabled = false;
				break;
			case GalleryItemInstallState.Installing:
				button.label = localize('galleryItemInstalling', "Installing...");
				button.enabled = false;
				break;
			default:
				button.label = localize('galleryItemInstall', "Install");
				button.enabled = true;
				break;
		}
	}

	disposeTemplate(templateData: IGalleryItemTemplateData): void {
		templateData.elementDisposables.dispose();
		templateData.templateDisposables.dispose();
	}
}
