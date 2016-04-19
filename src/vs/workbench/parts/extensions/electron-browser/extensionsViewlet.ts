/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/extensions-viewlet';
import { localize } from 'vs/nls';
import { ThrottledDelayer, always } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { Viewlet } from 'vs/workbench/browser/viewlet';
import { append, emmet as $ } from 'vs/base/browser/dom';
import { PagedModel, mapPager } from 'vs/base/common/paging';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { PagedList } from 'vs/base/browser/ui/list/listPaging';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IExtensionEntry, Delegate, Renderer, ExtensionState } from './extensionsList';
import { IGalleryService } from '../common/extensions';
import { ExtensionsInput } from '../common/extensionsInput';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';

const EmptyModel = new PagedModel({
	firstPage: [],
	total: 0,
	pageSize: 0,
	getPage: null
});

export class ExtensionsViewlet extends Viewlet {

	static ID: string = 'workbench.viewlet.extensions';

	private disposables: IDisposable[];
	private searchDelayer: ThrottledDelayer<any>;
	private root: HTMLElement;
	private searchBox: HTMLInputElement;
	private extensionsBox: HTMLElement;
	private list: PagedList<IExtensionEntry>;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IGalleryService private galleryService: IGalleryService,
		@IProgressService private progressService: IProgressService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(ExtensionsViewlet.ID, telemetryService);
		this.searchDelayer = new ThrottledDelayer(500);
		this.disposables = [];
	}

	create(parent: Builder): TPromise<void> {
		super.create(parent);
		parent.addClass('extensions-viewlet');
		this.root = parent.getHTMLElement();

		const search = append(this.root, $('.search'));
		this.searchBox = append(search, $<HTMLInputElement>('input.search-box'));
		this.searchBox.placeholder = localize('searchExtensions', "Search Extensions");
		this.extensionsBox = append(this.root, $('.extensions'));

		const delegate = new Delegate();
		const renderer = this.instantiationService.createInstance(Renderer);
		this.list = new PagedList(this.extensionsBox, delegate, [renderer]);

		this.searchBox.oninput = () => this.triggerSearch(this.searchBox.value);

		this.list.onSelectionChange(e => {
			const [entry] = e.elements;

			if (!entry) {
				return;
			}

			return this.editorService.openEditor(new ExtensionsInput(entry.extension));
		}, null, this.disposables);

		return TPromise.as(null);
	}

	setVisible(visible:boolean): TPromise<void> {
		return super.setVisible(visible).then(() => {
			if (visible) {
				this.searchBox.value = '';
				this.triggerSearch('', 0);
			}
		});
	}

	focus(): void {
		this.searchBox.focus();
	}

	layout({ height }: Dimension):void {
		this.list.layout(height - 38);
	}

	private triggerSearch(text: string = '', delay = 500): void {
		this.list.model = EmptyModel;

		const promise = this.searchDelayer.trigger(() => this.doSearch(text), delay);

		const progressRunner = this.progressService.show(true);
		always(promise, () => progressRunner.done());
	}

	private doSearch(text: string = ''): TPromise<any> {
		return this.galleryService.query({ text })
			.then(result => new PagedModel(mapPager(result, extension => ({ extension, state: ExtensionState.Installed }))))
			.then(model => this.list.model = model);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}
