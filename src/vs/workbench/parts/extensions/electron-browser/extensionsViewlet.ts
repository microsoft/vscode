/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import 'vs/css!./media/extensionsViewlet';
import { localize } from 'vs/nls';
import { ThrottledDelayer, always } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Builder, Dimension } from 'vs/base/browser/builder';
import { Viewlet } from 'vs/workbench/browser/viewlet';
import { append, emmet as $ } from 'vs/base/browser/dom';
import { PagedModel, SinglePagePagedModel } from 'vs/base/common/paging';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { PagedList } from 'vs/base/browser/ui/list/listPaging';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Delegate, Renderer } from './extensionsList';
import { IExtensionManagementService, IExtensionGalleryService, ILocalExtension, IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionsInput } from '../common/extensionsInput';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';

export class ExtensionsViewlet extends Viewlet {

	static ID: string = 'workbench.viewlet.extensions';

	private disposables: IDisposable[];
	private searchDelayer: ThrottledDelayer<any>;
	private root: HTMLElement;
	private searchBox: HTMLInputElement;
	private extensionsBox: HTMLElement;
	private list: PagedList<ILocalExtension | IGalleryExtension>;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IExtensionGalleryService private galleryService: IExtensionGalleryService,
		@IExtensionManagementService private extensionService: IExtensionManagementService,
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

		const header = append(this.root, $('.header'));

		this.searchBox = append(header, $<HTMLInputElement>('input.search-box'));
		this.searchBox.placeholder = localize('searchExtensions', "Search Extensions in Marketplace");
		this.extensionsBox = append(this.root, $('.extensions'));

		const delegate = new Delegate();
		const renderer = this.instantiationService.createInstance(Renderer);
		this.list = new PagedList(this.extensionsBox, delegate, [renderer]);

		this.searchBox.oninput = () => this.triggerSearch(this.searchBox.value);

		this.list.onSelectionChange(e => {
			const [extension] = e.elements;

			if (!extension) {
				return;
			}

			return this.editorService.openEditor(new ExtensionsInput(extension));
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
		this.searchDelayer.trigger(() => this.doSearch(text), text ? delay : 0);
	}

	private doSearch(text: string = ''): TPromise<any> {
		const progressRunner = this.progressService.show(true);
		let promise: TPromise<PagedModel<ILocalExtension | IGalleryExtension>>;

		if (text) {
			promise = this.galleryService.query({ text })
				.then(result => new PagedModel(result));
		} else {
			promise = this.extensionService.getInstalled()
				.then(result => new SinglePagePagedModel(result));
		}

		return always(promise, () => progressRunner.done())
			.then(model => this.list.model = model);
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}
