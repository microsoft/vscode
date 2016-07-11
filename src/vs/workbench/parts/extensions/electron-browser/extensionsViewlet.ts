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
import { onUnexpectedError } from 'vs/base/common/errors';
import { mapEvent, filterEvent } from 'vs/base/common/event';
import { IAction } from 'vs/base/common/actions';
import { domEvent } from 'vs/base/browser/event';
import { StandardKeyboardEvent } from 'vs/base/browser/keyboardEvent';
import { KeyCode } from 'vs/base/common/keyCodes';
import { Viewlet } from 'vs/workbench/browser/viewlet';
import { append, emmet as $, addStandardDisposableListener, EventType, addClass, removeClass, toggleClass } from 'vs/base/browser/dom';
import { IPager, PagedModel } from 'vs/base/common/paging';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { PagedList } from 'vs/base/browser/ui/list/listPaging';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Delegate, Renderer } from './extensionsList';
import { IExtensionsWorkbenchService, IExtension, IExtensionsViewlet, VIEWLET_ID } from './extensions';
import { ShowExtensionRecommendationsAction, ShowPopularExtensionsAction, ShowInstalledExtensionsAction, ListOutdatedExtensionsAction, ClearExtensionsInputAction } from './extensionsActions';
import { IExtensionManagementService, IExtensionGalleryService, SortBy } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionsInput } from './extensionsInput';
import { IProgressService } from 'vs/platform/progress/common/progress';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';

export class ExtensionsViewlet extends Viewlet implements IExtensionsViewlet {

	private searchDelayer: ThrottledDelayer<any>;
	private root: HTMLElement;
	private searchBox: HTMLInputElement;
	private extensionsBox: HTMLElement;
	private list: PagedList<IExtension>;
	private disposables: IDisposable[] = [];
	private focusInvokedByTab: boolean;
	private clearAction: ClearExtensionsInputAction;

	constructor(
		@ITelemetryService telemetryService: ITelemetryService,
		@IExtensionGalleryService private galleryService: IExtensionGalleryService,
		@IExtensionManagementService private extensionService: IExtensionManagementService,
		@IProgressService private progressService: IProgressService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IExtensionsWorkbenchService private extensionsWorkbenchService: IExtensionsWorkbenchService
	) {
		super(VIEWLET_ID, telemetryService);
		this.searchDelayer = new ThrottledDelayer(500);
	}

	create(parent: Builder): TPromise<void> {
		super.create(parent);
		parent.addClass('extensions-viewlet');
		this.root = parent.getHTMLElement();

		const header = append(this.root, $('.header'));

		this.searchBox = append(header, $<HTMLInputElement>('input.search-box'));
		this.searchBox.placeholder = localize('searchExtensions', "Search Extensions in Marketplace");
		this.disposables.push(addStandardDisposableListener(this.searchBox, EventType.FOCUS, () => addClass(this.searchBox, 'synthetic-focus')));
		this.disposables.push(addStandardDisposableListener(this.searchBox, EventType.BLUR, () => removeClass(this.searchBox, 'synthetic-focus')));
		this.extensionsBox = append(this.root, $('.extensions'));

		const delegate = new Delegate();
		const renderer = this.instantiationService.createInstance(Renderer);
		this.list = new PagedList(this.extensionsBox, delegate, [renderer]);

		const onRawKeyDown = domEvent(this.searchBox, 'keydown');
		const onKeyDown = mapEvent(onRawKeyDown, e => new StandardKeyboardEvent(e));
		const onEnter = filterEvent(onKeyDown, e => e.keyCode === KeyCode.Enter);
		const onEscape = filterEvent(onKeyDown, e => e.keyCode === KeyCode.Escape);
		const onUpArrow = filterEvent(onKeyDown, e => e.keyCode === KeyCode.UpArrow);
		const onDownArrow = filterEvent(onKeyDown, e => e.keyCode === KeyCode.DownArrow);
		const onTab = filterEvent(onKeyDown, e => e.keyCode === KeyCode.Tab);

		onEnter(this.onEnter, this, this.disposables);
		onEscape(this.onEscape, this, this.disposables);
		onUpArrow(this.onUpArrow, this, this.disposables);
		onDownArrow(this.onDownArrow, this, this.disposables);
		onTab(this.onTab, this, this.disposables);

		const onInput = domEvent(this.searchBox, 'input');
		onInput(() => this.triggerSearch(), null, this.disposables);

		this.list.onDOMFocus(focusEvent => {
			// Allow tab to move focus out of search box #7966
			if (!this.focusInvokedByTab) {
				this.searchBox.focus();
			}
			this.focusInvokedByTab = false;
		}, null, this.disposables);

		const onSelectedExtension = filterEvent(mapEvent(this.list.onSelectionChange, e => e.elements[0]), e => !!e);
		onSelectedExtension(this.onExtensionSelected, this, this.disposables);

		return TPromise.as(null);
	}

	setVisible(visible:boolean): TPromise<void> {
		return super.setVisible(visible).then(() => {
			if (visible) {
				this.searchBox.focus();
				this.searchBox.setSelectionRange(0,this.searchBox.value.length);
				this.triggerSearch(true, true);
			} else {
				this.list.model = new PagedModel([]);
			}
		});
	}

	focus(): void {
		this.searchBox.focus();
	}

	layout({ height, width }: Dimension):void {
		this.list.layout(height - 38);
		toggleClass(this.root, 'narrow', width <= 300);
	}

	getOptimalWidth(): number {
		return 400;
	}

	getActions(): IAction[] {
		if (!this.clearAction) {
			this.clearAction = this.instantiationService.createInstance(ClearExtensionsInputAction, ClearExtensionsInputAction.ID, ClearExtensionsInputAction.LABEL);
		}

		return [
			this.clearAction
		];
	}

	getSecondaryActions(): IAction[] {
		return [
			this.instantiationService.createInstance(ShowInstalledExtensionsAction, ShowInstalledExtensionsAction.ID, ShowInstalledExtensionsAction.LABEL),
			this.instantiationService.createInstance(ListOutdatedExtensionsAction, ListOutdatedExtensionsAction.ID, ListOutdatedExtensionsAction.LABEL),
			this.instantiationService.createInstance(ShowExtensionRecommendationsAction, ShowExtensionRecommendationsAction.ID, ShowExtensionRecommendationsAction.LABEL),
			this.instantiationService.createInstance(ShowPopularExtensionsAction, ShowPopularExtensionsAction.ID, ShowPopularExtensionsAction.LABEL)
		];
	}

	search(text: string, immediate = false): void {
		this.searchBox.value = text;
		this.triggerSearch(immediate);
	}

	private triggerSearch(immediate = false, suggestPopular = false): void {
		const text = this.searchBox.value;
		// Joao do not kill me for this hack -isidor
		this.clearAction.enabled = !!text;
		this.searchDelayer.trigger(() => this.doSearch(text, suggestPopular), immediate || !text ? 0 : 500);
	}

	private doSearch(text: string = '', suggestPopular = false): TPromise<any> {
		const progressRunner = this.progressService.show(true);
		let promise: TPromise<IPager<IExtension> | IExtension[]>;

		if (!text) {
			promise = this.extensionsWorkbenchService.queryLocal()
				.then(result => {
					if (result.length === 0 && suggestPopular) {
						this.search('@popular', true);
					}

					return result;
				});
		} else if (/@outdated/i.test(text)) {
			promise = this.extensionsWorkbenchService.queryLocal()
				.then(result => result.filter(e => e.outdated));
		} else if (/@popular/i.test(text)) {
			promise = this.extensionsWorkbenchService.queryGallery({ sortBy: SortBy.InstallCount });
		} else if (/@recommended/i.test(text)) {
			promise = this.extensionsWorkbenchService.getRecommendations();
		} else {
			promise = this.extensionsWorkbenchService.queryGallery({ text });
		}

		return always(promise, () => progressRunner.done())
			.then(result => new PagedModel<IExtension>(result))
			.then(model => this.list.model = model);
	}

	private onExtensionSelected(extension: IExtension): void {
		this.editorService.openEditor(this.instantiationService.createInstance(ExtensionsInput, extension))
			.done(null, onUnexpectedError);
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

	private onTab(): void {
		this.focusInvokedByTab = true;
	}

	dispose(): void {
		this.disposables = dispose(this.disposables);
		super.dispose();
	}
}
