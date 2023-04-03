/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IResizeEvent, ResizableHTMLElement } from 'vs/base/browser/ui/resizable/resizable';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { IPosition } from 'vs/editor/common/core/position';
import { PositionAffinity } from 'vs/editor/common/model';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import * as dom from 'vs/base/browser/dom';
import { clamp } from 'vs/base/common/numbers';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { Emitter, Event } from 'vs/base/common/event';

export abstract class ResizableWidget implements IDisposable {

	readonly element: ResizableHTMLElement;
	private readonly _disposables = new DisposableStore();
	private readonly _persistingMechanism: IPersistingMechanism;
	private resizing: boolean = false;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _persistingOptions: IPersistingOptions,
	) {

		console.log('Inside of ResizableWidget constructor');

		this.element = new ResizableHTMLElement();
		this.element.domNode.classList.add('editor-widget', 'resizable-widget');

		if (this._persistingOptions instanceof SingleSizePersistingOptions) {
			this._persistingMechanism = new SingleSizePersistingMechanism(this, this.element, this._editor, this._persistingOptions);
		} else if (this._persistingOptions instanceof MultipleSizePersistingOptions) {
			this._persistingMechanism = new MultipleSizePersistingMechanism(this, this.element, this._editor);
		} else {
			throw new Error('Please specify a valid persisting mechanism');
		}

		this._disposables.add(this.element.onDidWillResize(() => {
			this.resizing = true;
		}));
		this._disposables.add(this.element.onDidResize(() => {
			this.resizing = false;
		}));
	}

	public isResizing() {
		return this.resizing;
	}

	dispose(): void {
		this._disposables.dispose();
		this.element.dispose();
	}

	resize(dimension: dom.Dimension): void { }

	hide(): void {
		this.resizing = false;
		this.element.clearSashHoverState();
	}

	findMaximumRenderingHeight(): number | undefined {
		return Infinity;
	}

	findMaximumRenderingWidth(): number | undefined {
		return Infinity;
	}

	findPersistedSize(): dom.Dimension | undefined {
		return this._persistingMechanism.findSize();
	}
}

export abstract class ResizableContentWidget implements IContentWidget {

	abstract ID: string;
	private _position: IPosition | null = null;
	private _secondaryPosition: IPosition | null = null;
	private _preference: ContentWidgetPositionPreference[] = [];
	private _positionAffinity: PositionAffinity | undefined = undefined;

	constructor(private readonly resizableWidget: ResizableWidget, private readonly editor: ICodeEditor) {
		this.editor.addContentWidget(this);
		console.log('Inisde of ResizableContentWidget constructor');
	}

	findPersistedSize(): dom.Dimension | undefined {
		return this.resizableWidget.findPersistedSize();
	}

	getId(): string {
		console.log('this.ID : ', this.ID);
		return this.ID;
	}

	getDomNode(): HTMLElement {
		console.log('Inside of getDomNode of ResizableContentWidget');
		console.log('this.resizableWidget.element.domNode : ', this.resizableWidget.element.domNode);
		this.resizableWidget.element.domNode.style.zIndex = '49';
		this.resizableWidget.element.domNode.style.position = 'fixed';
		// this.resizableWidget.element.domNode.style.display = 'block';
		return this.resizableWidget.element.domNode;
	}

	getPosition(): IContentWidgetPosition | null {

		console.log('Inside of getPosition of ResizableContentWidget');
		const contentWidgetPosition = {
			position: this._position,
			secondaryPosition: this._secondaryPosition,
			preference: (this._preference),
			positionAffinity: this._positionAffinity
		};
		console.log('contentWidgetPosition: ', contentWidgetPosition);
		return contentWidgetPosition;
	}

	hide(): void {
		console.log('Inside of hide of the ResizableContentWidget');
		this.editor.layoutContentWidget(this);
	}

	set position(position: IPosition | null) {
		this._position = position;
	}

	set secondaryPosition(position: IPosition | null) {
		this._secondaryPosition = position;
	}

	set preference(preference: ContentWidgetPositionPreference[]) {
		this._preference = preference;
	}

	set positionAffinity(affinity: PositionAffinity | undefined) {
		this._positionAffinity = affinity;
	}
}

interface IPersistingOptions { }

export class SingleSizePersistingOptions implements IPersistingOptions {
	constructor(
		public readonly key: string,
		public readonly defaultSize: dom.Dimension,
		@IStorageService public readonly storageService: IStorageService
	) { }
}

export class MultipleSizePersistingOptions implements IPersistingOptions {
	constructor() { }
}

interface IPersistingMechanism extends IDisposable {
	findSize(): dom.Dimension | undefined;
}

// TODO: maybe need to make more generic, this is specific to the suggest widget
class SingleSizePersistingMechanism implements IPersistingMechanism {

	private readonly _persistedWidgetSize: PersistedWidgetSize | null = null;
	private readonly _disposables = new DisposableStore();

	constructor(
		private readonly resizableWidget: ResizableWidget,
		private readonly element: ResizableHTMLElement,
		private readonly editor: ICodeEditor,
		private readonly persistingOptions: SingleSizePersistingOptions
	) {

		this._persistedWidgetSize = new PersistedWidgetSize(this.persistingOptions.key, this.persistingOptions.storageService, this.editor);

		class ResizeState {
			constructor(
				readonly persistedSize: dom.Dimension | undefined,
				readonly currentSize: dom.Dimension,
				public persistHeight = false,
				public persistWidth = false,
			) { }
		}

		let state: ResizeState | undefined;
		this._disposables.add(this.element.onDidWillResize(() => {
			// TODO: add back, this._contentWidget.lockPreference();
			state = new ResizeState(this._persistedWidgetSize!.restore(), this.element.size);
		}));
		this._disposables.add(this.element.onDidResize(e => {

			this.resizableWidget.resize(new dom.Dimension(e.dimension.width, e.dimension.height));

			if (state) {
				state.persistHeight = state.persistHeight || !!e.north || !!e.south;
				state.persistWidth = state.persistWidth || !!e.east || !!e.west;
			}

			if (!e.done) {
				return;
			}

			if (state) {
				const fontInfo = this.editor.getOption(EditorOption.fontInfo);
				const itemHeight = clamp(this.editor.getOption(EditorOption.suggestLineHeight) || fontInfo.lineHeight, 8, 1000);
				const threshold = Math.round(itemHeight / 2);
				let { width, height } = this.element.size;
				if (!state.persistHeight || Math.abs(state.currentSize.height - height) <= threshold) {
					height = state.persistedSize?.height ?? this.persistingOptions.defaultSize.height;
				}
				if (!state.persistWidth || Math.abs(state.currentSize.width - width) <= threshold) {
					width = state.persistedSize?.width ?? this.persistingOptions.defaultSize.width;
				}
				this._persistedWidgetSize!.store(new dom.Dimension(width, height));
			}

			// TODO: add back, reset working state
			// this._contentWidget.unlockPreference();
			state = undefined;
		}));
	}

	findSize(): dom.Dimension | undefined {
		return undefined;
	}

	dispose(): void {
		this._disposables.dispose();
	}
}

class MultipleSizePersistingMechanism implements IPersistingMechanism {

	private readonly _persistedWidgetSizes: ResourceMap<Map<string, dom.Dimension>> = new ResourceMap<Map<string, dom.Dimension>>();
	private readonly _disposables = new DisposableStore();
	private _tooltipPosition: IPosition | null = null;

	// TODO: not sure if I need the following
	// private _initialHeight: number = 0;
	// private _initialTop: number = 0;

	private _resizing: boolean = false;
	private _size: dom.Dimension | undefined = undefined;
	private _maxRenderingHeight: number | undefined = Infinity;
	private _maxRenderingWidth: number | undefined = Infinity;

	private readonly _onDidResize = new Emitter<IResizeEvent>();
	readonly onDidResize: Event<IResizeEvent> = this._onDidResize.event;
	// private _renderingAbove: ContentWidgetPositionPreference | undefined = undefined;

	constructor(
		private readonly resizableWidget: ResizableWidget,
		private readonly element: ResizableHTMLElement,
		public readonly editor: ICodeEditor
	) {

		this.element.minSize = new dom.Dimension(10, 24);
		this._disposables.add(this.editor.onDidChangeModelContent((e) => {
			const uri = this.editor.getModel()?.uri;
			if (!uri || !this._persistedWidgetSizes.has(uri)) {
				return;
			}
			const persistedSizesForUri = this._persistedWidgetSizes.get(uri)!;
			const updatedPersistedSizesForUri = new Map<string, dom.Dimension>();
			for (const change of e.changes) {
				const changeOffset = change.rangeOffset;
				const rangeLength = change.rangeLength;
				const endOffset = changeOffset + rangeLength;
				const textLength = change.text.length;
				for (const key of persistedSizesForUri.keys()) {
					const parsedKey = JSON.parse(key);
					const tokenOffset = parsedKey[0];
					const tokenLength = parsedKey[1];
					if (endOffset < tokenOffset) {
						const oldSize = persistedSizesForUri.get(key)!;
						const newKey: [number, number] = [tokenOffset - rangeLength + textLength, tokenLength];
						updatedPersistedSizesForUri.set(JSON.stringify(newKey), oldSize);
					} else if (changeOffset >= tokenOffset + tokenLength) {
						updatedPersistedSizesForUri.set(key, persistedSizesForUri.get(key)!);
					}
				}
			}
			this._persistedWidgetSizes.set(uri, updatedPersistedSizesForUri);
		}));
		this._disposables.add(this.element.onDidWillResize(() => {
			this._resizing = true;
			// this._initialHeight = this.element.domNode.clientHeight;
			// this._initialTop = this.element.domNode.offsetTop;
		}));
		this._disposables.add(this.element.onDidResize(e => {

			let height = e.dimension.height;
			let width = e.dimension.width;
			const maxWidth = this.element.maxSize.width;
			const maxHeight = this.element.maxSize.height;

			width = Math.min(maxWidth, width);
			height = Math.min(maxHeight, height);
			if (!this._maxRenderingHeight) {
				return;
			}
			this._size = new dom.Dimension(width, height);
			this.element.layout(height, width);
			// Calling the resize function of the
			this.resizableWidget.resize(new dom.Dimension(width, height));

			// Update the top parameters only when we decided to render above
			// TODO: presumably do not need to resize the element
			// if (this._renderingAbove === ContentWidgetPositionPreference.ABOVE) {
			// 	this.element.domNode.style.top = this._initialTop - (height - this._initialHeight) + 'px';
			// }
			// const horizontalSashWidth = width - 2 * SASH_WIDTH + 2 * TOTAL_BORDER_WIDTH + 'px';
			// this.element.northSash.el.style.width = horizontalSashWidth;
			// this.element.southSash.el.style.width = horizontalSashWidth;
			// const verticalSashWidth = height - 2 * SASH_WIDTH + 2 * TOTAL_BORDER_WIDTH + 'px';
			// this.element.eastSash.el.style.height = verticalSashWidth;
			// this.element.westSash.el.style.height = verticalSashWidth;
			// this.element.eastSash.el.style.top = TOTAL_BORDER_WIDTH + 'px';

			// Fire the current dimension
			// TODO: probably don't need to listen on the firing event?
			// this._onDidResize.fire({ dimension: this._size, done: false });

			this._maxRenderingWidth = this.resizableWidget.findMaximumRenderingWidth();
			this._maxRenderingHeight = this.resizableWidget.findMaximumRenderingHeight();
			// this._maxRenderingHeight = this.resizableWidget.findMaximumRenderingHeight(this._renderingAbove);

			if (!this._maxRenderingHeight || !this._maxRenderingWidth) {
				return;
			}

			this.element.maxSize = new dom.Dimension(this._maxRenderingWidth, this._maxRenderingHeight);

			// Persist the height only when the resizing has stopped
			if (e.done) {
				if (!this.editor.hasModel()) {
					return;
				}
				const uri = this.editor.getModel().uri;
				if (!uri || !this._tooltipPosition) {
					return;
				}
				const persistedSize = new dom.Dimension(width, height);
				const wordPosition = this.editor.getModel().getWordAtPosition(this._tooltipPosition);
				if (!wordPosition) {
					return;
				}
				const offset = this.editor.getModel().getOffsetAt({ lineNumber: this._tooltipPosition.lineNumber, column: wordPosition.startColumn });
				const length = wordPosition.word.length;

				// Suppose that the uri does not exist in the persisted widget hover sizes, then create a map
				if (!this._persistedWidgetSizes.get(uri)) {
					const persistedWidgetSizesForUri = new Map<string, dom.Dimension>([]);
					persistedWidgetSizesForUri.set(JSON.stringify([offset, length]), persistedSize);
					this._persistedWidgetSizes.set(uri, persistedWidgetSizesForUri);
				} else {
					const persistedWidgetSizesForUri = this._persistedWidgetSizes.get(uri)!;
					persistedWidgetSizesForUri.set(JSON.stringify([offset, length]), persistedSize);
				}
				this._resizing = false;
			}

			// this.editor.layoutOverlayWidget(this);
			// this.editor.render();
		}));

	}

	set tooltipPosition(position: IPosition) {
		this._tooltipPosition = position;
	}

	findSize(): dom.Dimension | undefined {

		console.log('Inside of findSize of the MultiplePersistingMechanisms');

		if (!this._tooltipPosition || !this.editor.hasModel()) {
			return;
		}
		const wordPosition = this.editor.getModel().getWordAtPosition(this._tooltipPosition);
		if (!wordPosition) {
			return;
		}
		const offset = this.editor.getModel().getOffsetAt({ lineNumber: this._tooltipPosition.lineNumber, column: wordPosition.startColumn });
		const length = wordPosition.word.length;
		const uri = this.editor.getModel().uri;
		const persistedSizesForUri = this._persistedWidgetSizes.get(uri);
		if (!persistedSizesForUri) {
			return;
		}
		return persistedSizesForUri.get(JSON.stringify([offset, length]));
	}

	dispose(): void {
		this._disposables.dispose();
	}
}

class PersistedWidgetSize {

	constructor(
		private readonly _key: string,
		private readonly _service: IStorageService,
		editor: ICodeEditor
	) { }

	restore(): dom.Dimension | undefined {
		const raw = this._service.get(this._key, StorageScope.PROFILE) ?? '';
		try {
			const obj = JSON.parse(raw);
			if (dom.Dimension.is(obj)) {
				return dom.Dimension.lift(obj);
			}
		} catch {
			// ignore
		}
		return undefined;
	}

	store(size: dom.Dimension) {
		this._service.store(this._key, JSON.stringify(size), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	reset(): void {
		this._service.remove(this._key, StorageScope.PROFILE);
	}
}
