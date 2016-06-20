/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/extensionEditor';
import { TPromise } from 'vs/base/common/winjs.base';
import { marked } from 'vs/base/common/marked/marked';
import { IDisposable, empty, dispose, toDisposable } from 'vs/base/common/lifecycle';
import { Builder } from 'vs/base/browser/builder';
import { append, emmet as $, addClass, removeClass } from 'vs/base/browser/dom';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IRequestService } from 'vs/platform/request/common/request';
// import { IExtension } from './extensionsModel';
import { IExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionsInput } from '../common/extensionsInput';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ITemplateData } from './extensionsList';
import { EditorOptions } from 'vs/workbench/common/editor';

export class ExtensionEditor extends BaseEditor {

	static ID: string = 'workbench.editor.extension';

	private icon: HTMLElement;
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
		@IRequestService private requestService: IRequestService
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
		// const details = append(header, $('.details'));

		// header.innerText = 'here goes description, author name, links, ratings, install buttons, etc';
		this.body = append(root, $('.body'));
	}

	setInput(input: ExtensionsInput, options: EditorOptions): TPromise<void> {
		this.transientDisposables = dispose(this.transientDisposables);

		this.body.innerHTML = '';

		let promise = TPromise.as<void>(null);
		const extension = input.extension;

		this.icon.style.backgroundImage = `url("${ extension.iconUrl }")`;

		if (!extension.readmeUrl) {
			this.body.innerHTML = 'no readme :(';
		} else {
			addClass(this.body, 'loading');

			promise = super.setInput(input, options)
				.then(() => this.requestService.makeRequest({ url: extension.readmeUrl }))
				.then(response => response.responseText)
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

	dispose(): void {
		this._highlight = null;
		this.transientDisposables = dispose(this.transientDisposables);
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}
