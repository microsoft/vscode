/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ICodeEditor, IOverlayWidget, IOverlayWidgetPosition, OverlayWidgetPositionPreference } from 'vs/editor/browser/editorBrowser';
import { BreadcrumbsWidget, RenderedBreadcrumbsItem } from 'vs/workbench/parts/breadcrumbs/electron-browser/breadcrumbsWidget';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { Event, Emitter } from 'vs/base/common/event';
import URI from 'vs/base/common/uri';
import { posix } from 'path';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { FileKind } from 'vs/platform/files/common/files';
import { FileLabel } from 'vs/workbench/browser/labels';
import { IContextKeyService, IContextKey, RawContextKey } from 'vs/platform/contextkey/common/contextkey';

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
	}

	private _onUpdate(): void {
		if (!this._widget.ready || !this.editor.getModel()) {
			return;
		}
		let { uri } = this.editor.getModel();

		interface Element {
			name: string;
			uri: URI;
			kind: FileKind;
		}

		const render = (element: Element, target: HTMLElement, disposables: IDisposable[]) => {
			let label = this._instantiationService.createInstance(FileLabel, target, {});
			label.setFile(element.uri, { fileKind: element.kind, hidePath: true });
			disposables.push(label);
		};

		let items: RenderedBreadcrumbsItem<Element>[] = [];
		let path = uri.path;
		while (path !== '/') {
			let first = items.length === 0;
			let name = posix.basename(path);
			uri = uri.with({ path });
			path = posix.dirname(path);
			items.unshift(new RenderedBreadcrumbsItem<Element>(
				render,
				{ name, uri, kind: first ? FileKind.FILE : FileKind.FOLDER },
				!first
			));
		}

		this._widget.breadcrumb.replace(undefined, items);
	}

	private _onDidSelectItem(item: RenderedBreadcrumbsItem<any>): void {
		console.log(item);
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
