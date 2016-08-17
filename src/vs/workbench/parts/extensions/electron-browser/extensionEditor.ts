/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/extensionEditor';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { marked } from 'vs/base/common/marked/marked';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable, empty, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { Builder } from 'vs/base/browser/builder';
import { append, emmet as $, addClass, removeClass, finalHandler } from 'vs/base/browser/dom';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { IViewlet } from 'vs/workbench/common/viewlet';
import { IViewletService } from 'vs/workbench/services/viewlet/common/viewletService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { text } from 'vs/base/node/request';
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
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';

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
		@IThemeService private themeService: IThemeService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(ExtensionEditor.ID, telemetryService);
		this._highlight = null;
		this.highlightDisposable = empty;
		this.disposables = [];

		this.disposables.push(viewletService.onDidViewletOpen(this.onViewletOpen, this, this.disposables));
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

		const subtitle = append(details, $('.subtitle'));
		this.publisher = append(subtitle, $<HTMLAnchorElement>('a.publisher'));
		this.publisher.href = '#';

		this.installCount = append(subtitle, $('span.install'));

		this.rating = append(subtitle, $<HTMLAnchorElement>('a.rating'));
		this.rating.href = '#';

		this.license = append(subtitle, $<HTMLAnchorElement>('a.license'));
		this.license.href = '#';
		this.license.textContent = localize('license', 'License');
		this.license.style.display = 'none';

		this.description = append(details, $('.description'));

		const actions = append(details, $('.actions'));
		this.actionBar = new ActionBar(actions, { animated: false });
		this.disposables.push(this.actionBar);

		this.body = append(root, $('.body'));
	}

	setInput(input: ExtensionsInput, options: EditorOptions): TPromise<void> {
		this.transientDisposables = dispose(this.transientDisposables);

		const extension = input.extension;
		this.telemetryService.publicLog('extensionGallery:openExtension', extension.telemetryData);

		this.icon.style.backgroundImage = `url("${ extension.iconUrl }")`;
		this.name.textContent = extension.displayName;
		this.publisher.textContent = extension.publisherDisplayName;
		this.description.textContent = extension.description;

		if (product.extensionsGallery) {
			const extensionUrl = `${ product.extensionsGallery.itemUrl }?itemName=${ extension.publisher }.${ extension.name }`;

			this.name.onclick = finalHandler(() => shell.openExternal(extensionUrl));
			this.rating.onclick = finalHandler(() => shell.openExternal(`${ extensionUrl }#review-details`));
			this.publisher.onclick = finalHandler(() => {
				this.viewletService.openViewlet(VIEWLET_ID, true)
					.then(viewlet => viewlet as IExtensionsViewlet)
					.done(viewlet => viewlet.search(`publisher:"${ extension.publisherDisplayName }"`, true));
			});

			if (extension.licenseUrl) {
				this.license.onclick = finalHandler(() => shell.openExternal(extension.licenseUrl));
				this.license.style.display = 'initial';
			} else {
				this.license.onclick = null;
				this.license.style.display = 'none';
			}
		}

		const install = this.instantiationService.createInstance(InstallWidget, this.installCount, { extension });
		this.transientDisposables.push(install);

		const ratings = this.instantiationService.createInstance(RatingsWidget, this.rating, { extension });
		this.transientDisposables.push(ratings);

		const installAction = this.instantiationService.createInstance(CombinedInstallAction);
		const updateAction = this.instantiationService.createInstance(UpdateAction);
		const enableAction = this.instantiationService.createInstance(EnableAction);

		installAction.extension = extension;
		updateAction.extension = extension;
		enableAction.extension = extension;

		this.actionBar.clear();
		this.actionBar.push([enableAction, updateAction, installAction], { icon: true, label: true });
		this.transientDisposables.push(enableAction, updateAction, installAction);

		this.body.innerHTML = '';
		let promise: TPromise<any> = super.setInput(input, options);

		if (extension.readmeUrl) {
			promise = promise
				.then(() => addClass(this.body, 'loading'))
				.then(() => this.requestService.request({ url: extension.readmeUrl }))
				.then(text)
				.then(marked.parse)
				.then<void>(body => {
					const webview = new WebView(
						this.body,
						document.querySelector('.monaco-editor-background')
					);

					webview.style(this.themeService.getTheme());
					webview.contents = [renderBody(body)];

					const linkListener = webview.onDidClickLink(link => shell.openExternal(link.toString()));
					const themeListener = this.themeService.onDidThemeChange(themeId => webview.style(themeId));
					this.transientDisposables.push(webview, linkListener, themeListener);
				})
				.then(null, () => null)
				.then(() => removeClass(this.body, 'loading'));
		} else {
			promise = promise
				.then(() => append(this.body, $('p')))
				.then(p => p.textContent = localize('noReadme', "No README available."));
		}

		this.transientDisposables.push(toDisposable(() => promise.cancel()));

		return TPromise.as(null);
	}

	layout(): void {
		return;
	}

	private onViewletOpen(viewlet: IViewlet): void {
		if (!viewlet || viewlet.getId() === VIEWLET_ID) {
			return;
		}

		this.editorService.closeEditor(this.position, this.input).done(null, onUnexpectedError);
	}

	dispose(): void {
		this._highlight = null;
		this.transientDisposables = dispose(this.transientDisposables);
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}
