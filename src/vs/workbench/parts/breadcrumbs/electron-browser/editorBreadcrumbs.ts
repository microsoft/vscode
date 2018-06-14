/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import { BreadcrumbsWidget, RenderedBreadcrumbsItem } from 'vs/base/browser/ui/breadcrumbs/breadcrumbsWidget';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { posix } from 'path';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { FileKind } from 'vs/platform/files/common/files';
import { FileLabel } from 'vs/workbench/browser/labels';
import { IContextKeyService, IContextKey, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IContextViewService } from 'vs/platform/contextview/browser/contextView';
import { BreadcrumbsFilePicker } from 'vs/workbench/parts/breadcrumbs/electron-browser/breadcrumbsPicker';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

class Widget implements IOverlayWidget {

	breadcrumb: BreadcrumbsWidget;
	ready: boolean;

	constructor(private _onFirstRender: Function) {

	}

	getId(): string {
		return 'EditorBreadcrumbs.Widget';
	}

	getDomNode(): HTMLElement {
		setTimeout(() => this._onFirstRender());
		let container = document.createElement('div');
		container.style.backgroundColor = 'white';
		let widget = new BreadcrumbsWidget(container);
		this.breadcrumb = widget;
		this.ready = true;
		return container;
	}

	getPosition(): IOverlayWidgetPosition {
		return {
			preference: OverlayWidgetPositionPreference.BOTTOM_RIGHT_CORNER
		};
	}
}

class BreadcrumbsUpdateEvent {

	private readonly _disposables = new Array<IDisposable>();
	private readonly _emitter = new Emitter<void>();

	readonly event: Event<void> = this._emitter.event;

	constructor(private readonly _editor: ICodeEditor) {
		this._disposables.push(this._editor.onDidChangeModel(_ => this._emitter.fire()));
	}
}

interface FileElement {
	name: string;
	uri: URI;
	kind: FileKind;
}

export class EditorBreadcrumbs implements IEditorContribution {

	static CK_Focused = new RawContextKey('breadcrumbFocused', false);

	static get(editor: ICodeEditor): EditorBreadcrumbs {
		return editor.getContribution<EditorBreadcrumbs>('EditorBreadcrumbs');
	}

	private readonly _disposables = new Array<IDisposable>();
	private readonly _widget: Widget;
	private readonly _update: BreadcrumbsUpdateEvent;

	private _ckFocused: IContextKey<boolean>;

	constructor(
		readonly editor: ICodeEditor,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IContextViewService private readonly _contextViewService: IContextViewService,
		@IEditorService private readonly _editorService: IEditorService,
	) {
		this._widget = new Widget(() => this._onWidgetReady());
		this._update = new BreadcrumbsUpdateEvent(this.editor);
		this.editor.addOverlayWidget(this._widget);
	}

	getId(): string {
		return 'EditorBreadcrumbs';
	}

	dispose(): void {
		dispose(this._disposables);
		this.editor.removeOverlayWidget(this._widget);
		this._ckFocused.reset();
	}

	private _onWidgetReady(): void {
		this._ckFocused = EditorBreadcrumbs.CK_Focused.bindTo(this._contextKeyService);
		this._disposables.push(this._widget.breadcrumb.onDidChangeFocus(value => this._ckFocused.set(value)));
		this._disposables.push(this._widget.breadcrumb.onDidSelectItem(this._onDidSelectItem, this));
		this._update.event(this._onUpdate, this, this._disposables);
		this._onUpdate();
	}

	private _onUpdate(): void {
		if (!this._widget.ready || !this.editor.getModel()) {
			return;
		}
		let { uri } = this.editor.getModel();

		const render = (element: FileElement, target: HTMLElement, disposables: IDisposable[]) => {
			let label = this._instantiationService.createInstance(FileLabel, target, {});
			label.setFile(element.uri, { fileKind: element.kind, hidePath: true });
			disposables.push(label);
		};

		let items: RenderedBreadcrumbsItem<FileElement>[] = [];
		let path = uri.path;
		while (path !== '/') {
			let first = items.length === 0;
			let name = posix.basename(path);
			uri = uri.with({ path });
			path = posix.dirname(path);
			items.unshift(new RenderedBreadcrumbsItem<FileElement>(
				render,
				{ name, uri, kind: first ? FileKind.FILE : FileKind.FOLDER },
				!first
			));
		}

		this._widget.breadcrumb.replace(undefined, items);
	}

	private _onDidSelectItem(item: RenderedBreadcrumbsItem<FileElement>): void {

		this._contextViewService.showContextView({
			getAnchor() {
				return item.node;
			},
			render: (container: HTMLElement) => {
				let res = this._instantiationService.createInstance(BreadcrumbsFilePicker, container);
				res.layout({ width: 300, height: 450 });
				res.setInput(item.element.uri.with({ path: posix.dirname(item.element.uri.path) }));
				res.onDidPickElement(data => {
					this._contextViewService.hideContextView();
					if (!data) {
						return;
					}
					if (URI.isUri(data)) {
						this._editorService.openEditor({ resource: data });
					}
				});
				return res;
			},
		});
	}

	focus(): void {
		this._widget.breadcrumb.focus();
	}

	focusNext(): void {
		this._widget.breadcrumb.focusNext();
	}

	focusPrev(): void {
		this._widget.breadcrumb.focusPrev();
	}

	select(): void {
		this._widget.breadcrumb.select();
	}

	// saveViewState?() {
	// 	throw new Error('Method not implemented.');
	// }
	// restoreViewState?(state: any): void {
	// 	throw new Error('Method not implemented.');
	// }
}
