/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/extensionEditor';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { marked } from 'vs/base/common/marked/marked';
import { IDisposable, empty, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { Builder } from 'vs/base/browser/builder';
import { append, emmet as $, addClass, removeClass, finalHandler } from 'vs/base/browser/dom';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IViewletService } from 'vs/workbench/services/viewlet/common/viewletService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IRequestService } from 'vs/platform/request/common/request';
import { IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IThemeService } from 'vs/workbench/services/themes/common/themeService';
import { ExtensionsInput } from './extensionsInput';
import { IExtensionsWorkbenchService, IExtensionsViewlet, VIEWLET_ID } from './extensions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITemplateData } from './extensionsList';
import { RatingsWidget, InstallWidget } from './extensionsWidgets';
import { EditorOptions } from 'vs/workbench/common/editor';
import { shell } from 'electron';
import product from 'vs/platform/product';
import { ActionBar } from 'vs/base/browser/ui/actionbar/actionbar';
import { CombinedInstallAction, UpdateAction, EnableAction } from './extensionsActions';
import WebView from 'vs/workbench/parts/html/browser/webview';

function renderBody(body: string): string {
	return `<!DOCTYPE html>
		<html>
			<head>
				<meta http-equiv="Content-type" content="text/html;charset=UTF-8">
				<link rel="stylesheet" type="text/css" href="${ require.toUrl('./media/markdown.css') }" >
			</head>
			<body>${ body }</body>
		</html>`;
}

export class ExtensionEditor extends BaseEditor {

	static ID: string = 'workbench.editor.extension';

	private icon: HTMLElement;
	private name: HTMLAnchorElement;
	private license: HTMLAnchorElement;
	private publisher: HTMLAnchorElement;
	private installCount: HTMLElement;
	private rating: HTMLAnchorElement;
	private description: HTMLElement;
	private actionBar: ActionBar;
	private body: HTMLElement;

	private _highlight: ITemplateData;
	private highlightDisposable: IDisposable;

	private transientDisposables: IDisposable[];
	private disposables: IDisposable[];

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IExtensionGalleryService private galleryService: IExtensionGalleryService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IRequestService private requestService: IRequestService,
		@IViewletService private viewletService: IViewletService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService,
		@IThemeService private themeService: IThemeService
	) {
		super(ExtensionEditor.ID, telemetryService);
		this._highlight = null;
		this.highlightDisposable = empty;
		this.disposables = [];
	}

	createEditor(parent: Builder): void {
		const container = parent.getHTMLElement();

		const root = append(container, $('.extension-editor'));
		const header = append(root, $('.header'));

		this.icon = append(header, $('.icon'));

		const details = append(header, $('.details'));
		const title = append(details, $('.title'));
		this.name = append(title, $<HTMLAnchorElement>('a.name'));
		this.name.href = '#';

		this.license = append(title, $<HTMLAnchorElement>('a.license'));
		this.license.href = '#';
		this.license.textContent = localize('license', 'License');

		const subtitle = append(details, $('.subtitle'));
		this.publisher = append(subtitle, $<HTMLAnchorElement>('a.publisher'));
		this.publisher.href = '#';

		this.installCount = append(subtitle, $('span.install'));

		this.rating = append(subtitle, $<HTMLAnchorElement>('a.rating'));
		this.rating.href = '#';

		this.description = append(details, $('.description'));

		const actions = append(details, $('.actions'));
		this.actionBar = new ActionBar(actions, { animated: false });
		this.disposables.push(this.actionBar);

		this.body = append(root, $('.body'));
	}

	setInput(input: ExtensionsInput, options: EditorOptions): TPromise<void> {
		this.transientDisposables = dispose(this.transientDisposables);

		let promise = TPromise.as(null);
		const extension = input.extension;

		this.icon.style.backgroundImage = `url("${ extension.iconUrl }")`;
		this.name.textContent = extension.displayName;
		this.publisher.textContent = extension.publisherDisplayName;
		this.description.textContent = extension.description;

		if (product.extensionsGallery) {
			const extensionUrl = `${ product.extensionsGallery.itemUrl }?itemName=${ extension.publisher }.${ extension.name }`;
			const licenseUrl = `${ product.extensionsGallery.itemUrl }/${ extension.publisher }.${ extension.name }/license`;

			this.name.onclick = finalHandler(() => shell.openExternal(extensionUrl));
			this.license.onclick = finalHandler(() => shell.openExternal(licenseUrl));
			this.rating.onclick = finalHandler(() => shell.openExternal(`${ extensionUrl }#review-details`));
			this.publisher.onclick = finalHandler(() => {
				this.viewletService.openViewlet(VIEWLET_ID, true)
					.then(viewlet => viewlet as IExtensionsViewlet)
					.done(viewlet => viewlet.search(`publisher:"${ extension.publisherDisplayName }"`, true));
			});
		}

		const install = this.instantiationService.createInstance(InstallWidget, this.installCount, extension, {});
		this.transientDisposables.push(install);

		const ratings = this.instantiationService.createInstance(RatingsWidget, this.rating, extension, {});
		this.transientDisposables.push(ratings);

		const installAction = this.instantiationService.createInstance(CombinedInstallAction, extension);
		const updateAction = this.instantiationService.createInstance(UpdateAction, extension);
		const enableAction = this.instantiationService.createInstance(EnableAction, extension);
		this.actionBar.clear();
		this.actionBar.push([enableAction, updateAction, installAction], { icon: true, label: true });
		this.transientDisposables.push(enableAction, updateAction, installAction);

		this.body.innerHTML = '';
		addClass(this.body, 'loading');

		if (extension.readmeUrl) {
			promise = super.setInput(input, options)
				.then(() => this.requestService.makeRequest({ url: extension.readmeUrl }))
				.then(response => response.responseText)
				.then(marked.parse)
				.then<void>(body => {
					const webview = new WebView(
						this.body,
						document.querySelector('.monaco-editor-background'),
						link => shell.openExternal(link.toString())
					);

					webview.style(this.themeService.getTheme());
					webview.contents = [renderBody(body)];

					const listener = this.themeService.onDidThemeChange(themeId => webview.style(themeId));
					this.transientDisposables.push(webview, listener);
				})
				.then(null, () => null)
				.then(() => removeClass(this.body, 'loading'));
		}

		this.transientDisposables.push(toDisposable(() => promise.cancel()));

		return TPromise.as(null);
	}

	layout(): void {
		return;
	}

	dispose(): void {
		this._highlight = null;
		this.transientDisposables = dispose(this.transientDisposables);
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}
