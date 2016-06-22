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
import { mapEvent, filterEvent } from 'vs/base/common/event';
import { domEvent } from 'vs/base/browser/event';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Viewlet } from 'vs/workbench/browser/viewlet';
import { append, emmet as $ } from 'vs/base/browser/dom';
import { PagedModel, SinglePagePagedModel } from 'vs/base/common/paging';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { PagedList } from 'vs/base/browser/ui/list/listPaging';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Delegate, Renderer } from './extensionsList';
import { ExtensionsModel, IExtension } from './extensionsModel';
import { IExtensionsViewlet } from './extensions';
import { IExtensionManagementService, IExtensionGalleryService, SortBy } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionsInput } from '../common/extensionsInput';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';

export class ExtensionsViewlet extends Viewlet implements IExtensionsViewlet {

	static ID: string = 'workbench.viewlet.extensions';

	private searchDelayer: ThrottledDelayer<any>;
	private root: HTMLElement;
	private searchBox: HTMLInputElement;
	private extensionsBox: HTMLElement;
	private model: ExtensionsModel;
	private list: PagedList<IExtension>;
	private disposables: IDisposable[] = [];

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
		this.model = instantiationService.createInstance(ExtensionsModel);
	}

	create(parent: Builder): TPromise<void> {
		super.create(parent);
		parent.addClass('extensions-viewlet');
		this.root = parent.getHTMLElement();

		const header = append(this.root, $('.header'));

		this.searchBox = append(header, $<HTMLInputElement>('input.search-box'));
		this.searchBox.type = 'search';
		this.searchBox.placeholder = localize('searchExtensions', "Search Extensions in Marketplace");
		this.extensionsBox = append(this.root, $('.extensions'));

		const delegate = new Delegate();
		const renderer = this.instantiationService.createInstance(Renderer, this.model);
		this.list = new PagedList(this.extensionsBox, delegate, [renderer]);

		const onRawKeyDown = domEvent(this.searchBox, 'keydown');
		const onKeyDown = mapEvent(onRawKeyDown, e => new StandardKeyboardEvent(e));
		const onEnter = filterEvent(onKeyDown, e => e.keyCode === KeyCode.Enter);
		const onEscape = filterEvent(onKeyDown, e => e.keyCode === KeyCode.Escape);
		const onUpArrow = filterEvent(onKeyDown, e => e.keyCode === KeyCode.UpArrow);
		const onDownArrow = filterEvent(onKeyDown, e => e.keyCode === KeyCode.DownArrow);

		onEnter(() => this.onEnter(), null, this.disposables);
		onEscape(() => this.onEscape(), null, this.disposables);
		onUpArrow(() => this.onUpArrow(), null, this.disposables);
		onDownArrow(() => this.onDownArrow(), null, this.disposables);

		const onInput = domEvent(this.searchBox, 'input');
		onInput(() => this.triggerSearch(), null, this.disposables);

		this.list.onDOMFocus(() => this.searchBox.focus(), null, this.disposables);

		this.list.onSelectionChange(e => {
			const [extension] = e.elements;

			if (!extension) {
				return;
			}

			return this.editorService.openEditor(new ExtensionsInput(this.model, extension));
		}, null, this.disposables);

		return TPromise.as(null);
	}

	setVisible(visible:boolean): TPromise<void> {
		return super.setVisible(visible).then(() => {
			if (visible) {
				this.searchBox.focus();
				this.searchBox.setSelectionRange(0,this.searchBox.value.length);
				this.triggerSearch(true);
			} else {
				this.list.model = new SinglePagePagedModel([]);
			}
		});
	}

	focus(): void {
		this.searchBox.focus();
	}

	layout({ height }: Dimension):void {
		this.list.layout(height - 38);
	}

	search(text: string, immediate = false): void {
		this.searchBox.value = text;
		this.triggerSearch(immediate);
	}

	private triggerSearch(immediate = false): void {
		const text = this.searchBox.value;
		this.searchDelayer.trigger(() => this.doSearch(text), immediate || !text ? 0 : 500);
	}

	private doSearch(text: string = ''): TPromise<any> {
		const progressRunner = this.progressService.show(true);
		let promise: TPromise<PagedModel<IExtension>>;

		if (!text) {
			promise = this.model.getLocal()
				.then(result => new SinglePagePagedModel(result));
		} else if (/@outdated/i.test(text)) {
			promise = this.model.getLocal()
				.then(result => result.filter(e => e.outdated))
				.then(result => new SinglePagePagedModel(result));
		} else if (/@popular/i.test(text)) {
			promise = this.model.queryGallery({ sortBy: SortBy.InstallCount })
				.then(result => new PagedModel(result));
		} else {
			promise = this.model.queryGallery({ text })
				.then(result => new PagedModel(result));
		}

		return always(promise, () => progressRunner.done())
			.then(model => this.list.model = model);
	}

	private onEnter(): void {
		this.list.setSelection(...this.list.getFocus());
	}

	private onEscape(): void {
		this.searchBox.value = '';
		this.triggerSearch(true);
	}

	private onUpArrow(): void {
		this.list.focusPrevious();
	}

	private onDownArrow(): void {
		this.list.focusNext();
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}
