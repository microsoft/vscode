/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/extensionEditor';
import { TPromise } from 'vs/base/common/winjs.base';
import { marked } from 'vs/base/common/marked/marked';
import { assign } from 'vs/base/common/objects';
import { IDisposable, empty, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { Builder } from 'vs/base/browser/builder';
import { append, emmet as $, addClass, removeClass } from 'vs/base/browser/dom';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtension, IGalleryExtension, IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionsInput } from '../common/extensionsInput';
import { text as downloadText, IRequestOptions } from 'vs/base/node/request';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { getProxyAgent } from 'vs/base/node/proxy';
import { ITemplateData } from './extensionsList';
import { EditorOptions } from 'vs/workbench/common/editor';

export class ExtensionEditor extends BaseEditor {

	static ID: string = 'workbench.editor.extension';

	private body: HTMLElement;

	private _highlight: ITemplateData;
	private highlightDisposable: IDisposable;

	private transientDisposables: IDisposable[];
	private disposables: IDisposable[];

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IExtensionGalleryService private galleryService: IExtensionGalleryService,
		@IConfigurationService private configurationService: IConfigurationService,
		@IInstantiationService private instantiationService: IInstantiationService
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
		header.innerText = 'here goes description, author name, links, ratings, install buttons, etc';
		this.body = append(root, $('.body'));
	}

	setInput(input: ExtensionsInput, options: EditorOptions): TPromise<void> {
		this.transientDisposables = dispose(this.transientDisposables);

		this.body.innerHTML = '';

		let promise = TPromise.as<void>(null);
		const extension = input.extension;
		const local = extension as IExtension;
		const gallery = extension as IGalleryExtension;

		if (local.path) {


		} else {
			const [version] = gallery.versions;
			const headers = version.downloadHeaders;

			addClass(this.body, 'loading');

			promise = super.setInput(input, options)
				.then(() => this.request(version.readmeUrl))
				.then(opts => assign(opts, { headers }))
				.then(opts => downloadText(opts))
				.then(marked.parse)
				.then(html => {
					removeClass(this.body, 'loading');
					this.body.innerHTML = html;
				});
		}

		this.transientDisposables.push(toDisposable(() => promise.cancel()));

		return TPromise.as(null);
	}

	layout(): void {
		return;
	}

	// Helper for proxy business... shameful.
	// This should be pushed down and not rely on the configuration service
	private request(url: string): IRequestOptions {
		const http = this.configurationService.getConfiguration<{ proxy?: string; proxyStrictSSL?: boolean; }>('http');
		const proxyUrl: string = http.proxy;
		const strictSSL: boolean = http.proxyStrictSSL;
		const agent = getProxyAgent(url, { proxyUrl, strictSSL });

		return { url, agent, strictSSL };
	}

	dispose(): void {
		this._highlight = null;
		this.transientDisposables = dispose(this.transientDisposables);
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}
