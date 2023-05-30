/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResizableHTMLElement } from 'vs/base/browser/ui/resizable/resizable';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import * as dom from 'vs/base/browser/dom';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { clamp } from 'vs/base/common/numbers';
import { ResourceMap } from 'vs/base/common/map';
import { IPosition, Position } from 'vs/editor/common/core/position';

abstract class ResizableContentWidget extends Disposable implements IContentWidget {

	allowEditorOverflow?: boolean | undefined;
	suppressMouseDown?: boolean | undefined;

	protected readonly _contentNode: HTMLDivElement;
	protected readonly _resizableNode = this._register(new ResizableHTMLElement());

	private _contentPosition: IContentWidgetPosition | null = null;
	private _resizing: boolean = false;

	constructor(
		protected readonly _editor: ICodeEditor,
		initialSize: dom.IDimension = new dom.Dimension(10, 10)
	) {
		super();
		this._contentNode = document.createElement('div');
		this._contentNode.style.width = `${initialSize.width}px`;
		this._contentNode.style.height = `${initialSize.height}px`;
		this._resizableNode.domNode.style.position = 'absolute';
		this._resizableNode.domNode.appendChild(this._contentNode);
		this._resizableNode.minSize = new dom.Dimension(10, 10);
		this._resizableNode.enableSashes(true, true, true, true);
		this._resizableNode.layout(initialSize.height, initialSize.width);
		this._register(this._resizableNode.onDidResize(e => {
			this._contentNode.style.width = `${e.dimension.width}px`;
			this._contentNode.style.height = `${e.dimension.height}px`;
			if (e.done) {
				this._resizing = false;
			}
		}));
		this._register(this._resizableNode.onDidWillResize(() => {
			this._resizing = true;
		}));
	}

	abstract getId(): string;

	getDomNode(): HTMLElement {
		return this._resizableNode.domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		return this._contentPosition;
	}

	findRenderingPreference(widgetHeight: number, showAtPosition: IPosition): ContentWidgetPositionPreference | undefined {
		const editorDomNode = this._editor.getDomNode();
		if (!editorDomNode) {
			return;
		}
		let height = widgetHeight;
		// The dimensions of the document in which we are displaying the hover
		const bodyBox = dom.getClientArea(document.body);
		// Hard-coded in the hover.css file as 1.5em or 24px
		const minHeight = 24;
		// The full height is already passed in as a parameter
		const fullHeight = widgetHeight;
		const editorBox = dom.getDomNodePagePosition(editorDomNode);
		const mouseBox = this._editor.getScrolledVisiblePosition(showAtPosition);
		if (!mouseBox) {
			return;
		}
		// Position where the editor box starts + the top of the mouse box relatve to the editor + mouse box height
		const mouseBottom = editorBox.top + mouseBox.top + mouseBox.height;
		// Total height of the box minus the position of the bottom of the mouse, this is the maximum height below the mouse position
		const availableSpaceBelow = bodyBox.height - mouseBottom;
		// Max height below is the minimum of the available space below and the full height of the widget
		const maxHeightBelow = Math.min(availableSpaceBelow, fullHeight);
		// The available space above the mouse position is the height of the top of the editor plus the top of the mouse box relative to the editor
		const availableSpaceAbove = editorBox.top + mouseBox.top - 30;
		const maxHeightAbove = Math.min(availableSpaceAbove, fullHeight);
		// We find the maximum height of the widget possible on the top or on the bottom
		const maxHeight = Math.min(Math.max(maxHeightAbove, maxHeightBelow), fullHeight);

		if (widgetHeight < minHeight) {
			height = minHeight;
		}
		if (height > maxHeight) {
			height = maxHeight;
		}
		// Determining whether we should render above or not ideally
		let renderingAbove: ContentWidgetPositionPreference;
		if (this._editor.getOption(EditorOption.hover).above) {
			renderingAbove = height <= maxHeightAbove ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW;
		} else {
			renderingAbove = height <= maxHeightBelow ? ContentWidgetPositionPreference.BELOW : ContentWidgetPositionPreference.ABOVE;
		}
		if (renderingAbove === ContentWidgetPositionPreference.ABOVE) {
			this.resizableNode.enableSashes(true, true, false, false);
		} else {
			this.resizableNode.enableSashes(false, true, true, false);
		}
		return renderingAbove;
	}

	setPosition(contentPosition: IContentWidgetPosition | null): void {
		this._contentPosition = contentPosition;
	}

	abstract resize(dimension: dom.Dimension): void;

	get resizing() {
		return this._resizing;
	}

	beforeOnDidWillResize() {
		return;
	}

	afterOnDidResize() {
		return;
	}

	get resizableNode(): ResizableHTMLElement {
		return this._resizableNode;
	}
}

/**
 * Class which is used in the single size persisting mechanism for resizable widgets.
 */
class PersistedWidgetSize {

	constructor(
		private readonly _key: string,
		private readonly _service: IStorageService
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

/**
 * Class which is used in the single size persisting mechanism for resizable widgets.
 */
class ResizeState {
	constructor(
		readonly persistedSize: dom.Dimension | undefined,
		readonly currentSize: dom.Dimension,
		public persistHeight = false,
		public persistWidth = false,
	) { }
}

export class SingleSizePersistingOptions {
	constructor(
		public readonly key: string,
		public readonly defaultSize: dom.Dimension,
		@IStorageService public readonly storageService: IStorageService
	) { }
}

export abstract class SinglePersistedSizeResizableContentWidget extends ResizableContentWidget {

	private readonly persistedWidgetSize: PersistedWidgetSize | null = null;
	private readonly disposables = new DisposableStore();

	constructor(
		private readonly editor: ICodeEditor,
		private readonly persistingOptions: SingleSizePersistingOptions,
		initialSize: dom.IDimension
	) {
		super(editor, initialSize);
		this.persistedWidgetSize = new PersistedWidgetSize(this.persistingOptions.key, this.persistingOptions.storageService);
		let state: ResizeState | undefined;
		this.disposables.add(this.resizableNode.onDidWillResize(() => {
			this.beforeOnDidWillResize();
			state = new ResizeState(this.persistedWidgetSize!.restore(), this.resizableNode.size);
		}));
		this.disposables.add(this.resizableNode.onDidResize(e => {
			this.resize(new dom.Dimension(e.dimension.width, e.dimension.height));
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
				let { width, height } = this.resizableNode.size;
				if (!state.persistHeight || Math.abs(state.currentSize.height - height) <= threshold) {
					height = state.persistedSize?.height ?? this.persistingOptions.defaultSize.height;
				}
				if (!state.persistWidth || Math.abs(state.currentSize.width - width) <= threshold) {
					width = state.persistedSize?.width ?? this.persistingOptions.defaultSize.width;
				}
				this.persistedWidgetSize!.store(new dom.Dimension(width, height));
			}
			state = undefined;
			this.afterOnDidResize();
		}));
	}

	findPersistedSize(): dom.Dimension | undefined {
		return this.persistedWidgetSize?.restore();
	}

	clearPersistedSize(): void {
		this.persistedWidgetSize?.reset();
	}

	override dispose(): void {
		super.dispose();
		this.disposables.dispose();
	}
}

export abstract class MultiplePersistedSizeResizableContentWidget extends ResizableContentWidget {

	private readonly _persistedWidgetSizes: ResourceMap<Map<string, dom.Dimension>> = new ResourceMap<Map<string, dom.Dimension>>();
	private readonly _disposables = new DisposableStore();
	protected _position: Position | undefined;

	constructor(
		public readonly editor: ICodeEditor,
		initialSize?: dom.IDimension
	) {
		super(editor, initialSize);
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
		this._disposables.add(this.resizableNode.onDidWillResize(() => {
			this.beforeOnDidWillResize();
		}));
		this._disposables.add(this.resizableNode.onDidResize(e => {
			const height = e.dimension.height;
			const width = e.dimension.width;
			this.resize(new dom.Dimension(width, height));
			if (e.done) {
				if (!this.editor.hasModel()) {
					return;
				}
				const uri = this.editor.getModel().uri;
				if (!uri || !this._position) {
					return;
				}
				const persistedSize = new dom.Dimension(width, height);
				const wordPosition = this.editor.getModel().getWordAtPosition(this._position);
				if (!wordPosition) {
					return;
				}
				const offset = this.editor.getModel().getOffsetAt({ lineNumber: this._position.lineNumber, column: wordPosition.startColumn });
				const length = wordPosition.word.length;

				if (!this._persistedWidgetSizes.get(uri)) {
					const persistedWidgetSizesForUri = new Map<string, dom.Dimension>([]);
					persistedWidgetSizesForUri.set(JSON.stringify([offset, length]), persistedSize);
					this._persistedWidgetSizes.set(uri, persistedWidgetSizesForUri);
				} else {
					const persistedWidgetSizesForUri = this._persistedWidgetSizes.get(uri)!;
					persistedWidgetSizesForUri.set(JSON.stringify([offset, length]), persistedSize);
				}
			}
			this.afterOnDidResize();
		}));
	}

	set position(position: Position | undefined) {
		this._position = position;
	}

	get position() {
		return this._position;
	}

	findPersistedSize(): dom.Dimension | undefined {
		if (!this._position || !this.editor.hasModel()) {
			return;
		}
		const wordPosition = this.editor.getModel().getWordAtPosition(this._position);
		if (!wordPosition) {
			return;
		}
		const offset = this.editor.getModel().getOffsetAt({ lineNumber: this._position.lineNumber, column: wordPosition.startColumn });
		const length = wordPosition.word.length;
		const uri = this.editor.getModel().uri;
		const persistedSizesForUri = this._persistedWidgetSizes.get(uri);
		if (!persistedSizesForUri) {
			return;
		}
		return persistedSizesForUri.get(JSON.stringify([offset, length]));
	}

	clearPersistedSizes(): void {
		this._persistedWidgetSizes.clear();
	}

	override dispose(): void {
		super.dispose();
		this._disposables.dispose();
	}
}
