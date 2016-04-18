/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/extensions2';
import { localize } from 'vs/nls';
import { TPromise } from 'vs/base/common/winjs.base';
import { ThrottledDelayer, always } from 'vs/base/common/async';
import { marked } from 'vs/base/common/marked/marked';
import { assign } from 'vs/base/common/objects';
import { IDisposable, toDisposable, empty, dispose } from 'vs/base/common/lifecycle';
import { Builder } from 'vs/base/browser/builder';
import { append, emmet as $, addClass, removeClass, getDomNodePosition, addDisposableListener } from 'vs/base/browser/dom';
import { BaseEditor } from 'vs/workbench/browser/parts/editor/baseEditor';
import { Position } from 'vs/platform/editor/common/editor';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { PagedList } from 'vs/base/browser/ui/list/listPaging';
import { IGalleryService } from '../common/extensions';
import { getExtensionId } from '../common/extensionsUtil';
import { PagedModel, mapPager } from 'vs/base/common/paging';
import { text as downloadText, IRequestOptions } from 'vs/base/node/request';
import { UserSettings } from 'vs/workbench/node/userSettings';
import { IWorkspaceContextService } from 'vs/workbench/services/workspace/common/contextService';
import { getProxyAgent } from 'vs/base/node/proxy';
import { IExtensionEntry, ITemplateData, Delegate, Renderer, ExtensionState } from './extensionsList';

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
	private root: HTMLElement;
	private searchBox: HTMLInputElement;
	private extensionsBox: HTMLElement;
	private overlay: HTMLElement;

	private _highlight: ITemplateData;
	private highlightDisposable: IDisposable;

	private toDispose: IDisposable[];

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IGalleryService private galleryService: IGalleryService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		super(ExtensionsPart.ID, telemetryService);
		this.searchDelayer = new ThrottledDelayer(500);
		this._highlight = null;
		this.highlightDisposable = empty;
		this.toDispose = [];
	}

	createEditor(parent: Builder): void {
		const container = parent.getHTMLElement();
		this.root = append(container, $('.extension-manager'));

		this.toDispose.push(addDisposableListener(this.root, 'click', e => {
			if (e.target === this.root && this.highlight) {
				this.highlight = null;
			}
		}));

		const search = append(this.root, $('.search'));
		this.searchBox = append(search, $<HTMLInputElement>('input.search-box'));
		this.searchBox.placeholder = localize('searchExtensions', "Search Extensions");
		this.extensionsBox = append(this.root, $('.extensions'));

		const delegate = new Delegate();
		const renderer = this.instantiationService.createInstance(Renderer);
		this.list = new PagedList(this.extensionsBox, delegate, [renderer]);

		this.overlay = append(this.extensionsBox, $('.overlay'));

		this.searchBox.oninput = () => this.triggerSearch(this.searchBox.value);

		this.list.onSelectionChange(({ elements }) => {
			if (this.highlightDisposable) {
				removeClass(this.root, 'animated');
				this.highlightDisposable.dispose();
				this.highlightDisposable = empty;
			}

			const [selected] = elements;

			if (!selected) {
				return;
			}

			const id = getExtensionId(selected.extension);
			const [data] = renderer.templates.filter(t => t.extension && getExtensionId(t.extension) === id);

			if (!data) {
				return;
			}

			this.highlight = data;
		});
	}

	setVisible(visible: boolean, position?: Position): TPromise<void> {
		return super.setVisible(visible, position).then(() => {
			if (visible) {
				this.highlight = null;
				this.searchBox.value = '';
				this.triggerSearch('', 0);
			}
		});
	}

	layout({ height }): void {
		height -= 72;
		this.extensionsBox.style.height = `${ height }px`;
		this.list.layout(height);

		if (this.highlight) {
			this.overlay.style.height = this.extensionsBox.style.height;
		}
	}

	focus(): void {
		this.searchBox.focus();
	}

	private triggerSearch(text: string = '', delay = 500): void {
		this.highlight = null;
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

	private get highlight(): ITemplateData {
		return this._highlight;
	}

	private set highlight(data: ITemplateData) {
		this._highlight = data;

		if (!data) {
			removeClass(this.root, 'highlighted');
			removeClass(this.root, 'animated');
			removeClass(this.root, 'highlight-in');
			this.highlightDisposable.dispose();
			this.highlightDisposable = empty;
			return;
		}

		const position = getDomNodePosition(data.container);
		const rootPosition = getDomNodePosition(this.extensionsBox);

		this.overlay.style.top = `${ position.top - rootPosition.top - this.list.scrollTop }px`;
		this.overlay.style.height = `${ position.height }px`;
		let _ = this.overlay.offsetHeight; _++; // trigger reflow

		addClass(this.root, 'animated highlight-in');
		this.overlay.style.top = '0';
		this.overlay.style.height = this.extensionsBox.style.height;

		// swap parents
		const container = data.container.parentElement;
		this.overlay.appendChild(data.container);

		// transition end event
		const listener = addDisposableListener(this.overlay, 'transitionend', e => {
			listener.dispose();
			removeClass(this.root, 'animated');
			removeClass(this.root, 'highlight-in');
			addClass(this.root, 'highlighted');
		});

		const [version] = data.extension.galleryInformation.versions;
		const headers = version.downloadHeaders;

		// TODO
		this.request(version.readmeUrl)
			.then(opts => assign(opts, { headers }))
			.then(opts => downloadText(opts))
			.then(marked.parse)
			.then(html => data.body.innerHTML = html);

		// set up disposable for later
		this.highlightDisposable = toDisposable(() => {
			listener.dispose();
			container.appendChild(data.container);
			this.overlay.style.height = '0';
			data.body.innerHTML = '';
		});
	}

	// Helper for proxy business... shameful.
	// This should be pushed down and not rely on the context service
	private request(url: string): TPromise<IRequestOptions> {
		const settings = TPromise.join([
			UserSettings.getValue(this.contextService, 'http.proxy'),
			UserSettings.getValue(this.contextService, 'http.proxyStrictSSL')
		]);

		return settings.then(settings => {
			const proxyUrl: string = settings[0];
			const strictSSL: boolean = settings[1];
			const agent = getProxyAgent(url, { proxyUrl, strictSSL });

			return { url, agent, strictSSL };
		});
	}

	dispose(): void {
		this._highlight = null;
		this.toDispose = dispose(this.toDispose);
		super.dispose();
	}
}
