/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResizableHTMLElement } from 'vs/base/browser/ui/resizable/resizable';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { clamp } from 'vs/base/common/numbers';
import { ResourceMap } from 'vs/base/common/map';
import { IPosition, Position } from 'vs/editor/common/core/position';
import * as dom from 'vs/base/browser/dom';

abstract class ResizableContentWidget extends Disposable implements IContentWidget {

	readonly allowEditorOverflow: boolean = true;
	readonly suppressMouseDown: boolean = false;

	protected readonly _contentNode: HTMLDivElement;
	protected readonly _resizableNode = this._register(new ResizableHTMLElement());
	protected _contentPosition: IContentWidgetPosition | null = null;

	private _resizing: boolean = false;

	constructor(
		protected readonly _editor: ICodeEditor,
		_initialSize: dom.IDimension = new dom.Dimension(10, 10)
	) {
		super();
		this._contentNode = document.createElement('div');
		this._contentNode.style.width = `${_initialSize.width}px`;
		this._contentNode.style.height = `${_initialSize.height}px`;
		this._resizableNode.domNode.style.position = 'absolute';
		this._resizableNode.domNode.appendChild(this._contentNode);
		this._resizableNode.minSize = new dom.Dimension(10, 10);
		this._resizableNode.enableSashes(true, true, true, true);
		this._resizableNode.layout(_initialSize.height, _initialSize.width);
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

	protected _findRenderingPreference(widgetHeight: number, showAtPosition: IPosition): ContentWidgetPositionPreference | undefined {
		const editorDomNode = this._editor.getDomNode();
		if (!editorDomNode) {
			return;
		}
		let height = widgetHeight;
		const bodyBox = dom.getClientArea(document.body);
		// Hard-coded in the hover.css file as 1.5em or 24px
		const minHeight = 24;
		const editorBox = dom.getDomNodePagePosition(editorDomNode);
		const mouseBox = this._editor.getScrolledVisiblePosition(showAtPosition);
		if (!mouseBox) {
			return;
		}
		const mouseBottom = editorBox.top + mouseBox.top + mouseBox.height;
		const availableSpaceBelow = bodyBox.height - mouseBottom;
		const maxHeightBelow = Math.min(availableSpaceBelow, widgetHeight);
		const availableSpaceAbove = editorBox.top + mouseBox.top - 30;
		const maxHeightAbove = Math.min(availableSpaceAbove, widgetHeight);
		const maxHeight = Math.min(Math.max(maxHeightAbove, maxHeightBelow), widgetHeight);
		if (widgetHeight < minHeight) {
			height = minHeight;
		}
		if (height > maxHeight) {
			height = maxHeight;
		}
		let renderingAbove: ContentWidgetPositionPreference;
		if (this._editor.getOption(EditorOption.hover).above) {
			renderingAbove = height <= maxHeightAbove ? ContentWidgetPositionPreference.ABOVE : ContentWidgetPositionPreference.BELOW;
		} else {
			renderingAbove = height <= maxHeightBelow ? ContentWidgetPositionPreference.BELOW : ContentWidgetPositionPreference.ABOVE;
		}
		if (renderingAbove === ContentWidgetPositionPreference.ABOVE) {
			this._resizableNode.enableSashes(true, true, false, false);
		} else {
			this._resizableNode.enableSashes(false, true, true, false);
		}
		return renderingAbove;
	}

	abstract _resize(dimension: dom.Dimension): void;

	get resizing() {
		return this._resizing;
	}

	beforeOnDidWillResize() {
		return;
	}

	afterOnDidResize() {
		return;
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

/**
 * TODO: Add another class for the resizable content widget, where using the idea that Alex had mentioned
 */


/**
 * Abstract class which defines a resizable widgets for which one single global size is persisted.
 */
export abstract class SinglePersistedSizeResizableContentWidget extends ResizableContentWidget {

	private readonly _persistedWidgetSize: PersistedWidgetSize | undefined;
	private readonly _persistingOptions: SingleSizePersistingOptions;
	private readonly _disposables = new DisposableStore();

	constructor(
		_editor: ICodeEditor,
		_persistingOptions: SingleSizePersistingOptions,
		_initialSize?: dom.IDimension
	) {
		super(_editor, _initialSize);
		this._persistingOptions = _persistingOptions;
		this._persistedWidgetSize = new PersistedWidgetSize(this._persistingOptions.key, this._persistingOptions.storageService);
		let state: ResizeState | undefined;
		this._disposables.add(this._resizableNode.onDidWillResize(() => {
			this.beforeOnDidWillResize();
			state = new ResizeState(this._persistedWidgetSize!.restore(), this._resizableNode.size);
		}));
		this._disposables.add(this._resizableNode.onDidResize(e => {
			this._resize(new dom.Dimension(e.dimension.width, e.dimension.height));
			if (!e.done) {
				return;
			}
			if (state) {
				state.persistHeight = state.persistHeight || !!e.north || !!e.south;
				state.persistWidth = state.persistWidth || !!e.east || !!e.west;
				const fontInfo = this._editor.getOption(EditorOption.fontInfo);
				const itemHeight = clamp(this._editor.getOption(EditorOption.suggestLineHeight) || fontInfo.lineHeight, 8, 1000);
				const threshold = Math.round(itemHeight / 2);
				let { width, height } = this._resizableNode.size;
				if (!state.persistHeight || Math.abs(state.currentSize.height - height) <= threshold) {
					height = state.persistedSize?.height ?? this._persistingOptions.defaultSize.height;
				}
				if (!state.persistWidth || Math.abs(state.currentSize.width - width) <= threshold) {
					width = state.persistedSize?.width ?? this._persistingOptions.defaultSize.width;
				}
				this._persistedWidgetSize!.store(new dom.Dimension(width, height));
			}
			state = undefined;
			this.afterOnDidResize();
		}));
	}

	findPersistedSize(): dom.Dimension | undefined {
		return this._persistedWidgetSize?.restore();
	}

	clearPersistedSize(): void {
		this._persistedWidgetSize?.reset();
	}

	override dispose(): void {
		super.dispose();
		this._disposables.dispose();
	}
}

/**
 * Abstract class which defines a resizable widgets for which a size is persisted on a per token basis. The persisted sizes are updated as the the model changes.
 */
export abstract class MultiplePersistedSizeResizableContentWidget extends ResizableContentWidget {

	private readonly _persistedWidgetSizes: ResourceMap<Map<string, dom.Dimension>> = new ResourceMap<Map<string, dom.Dimension>>();
	private readonly _disposables = new DisposableStore();
	protected _position: Position | undefined;

	constructor(
		_editor: ICodeEditor,
		_initialSize?: dom.IDimension
	) {
		super(_editor, _initialSize);
		this._disposables.add(this._editor.onDidChangeModelContent((e) => {
			const uri = this._editor.getModel()?.uri;
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
		this._disposables.add(this._resizableNode.onDidWillResize(() => {
			this.beforeOnDidWillResize();
		}));
		this._disposables.add(this._resizableNode.onDidResize(e => {
			const height = e.dimension.height;
			const width = e.dimension.width;
			this._resize(new dom.Dimension(width, height));
			if (e.done) {
				if (!this._editor.hasModel()) {
					return;
				}
				const uri = this._editor.getModel().uri;
				if (!uri || !this._position) {
					return;
				}
				const persistedSize = new dom.Dimension(width, height);
				const wordPosition = this._editor.getModel().getWordAtPosition(this._position);
				if (!wordPosition) {
					return;
				}
				const offset = this._editor.getModel().getOffsetAt({ lineNumber: this._position.lineNumber, column: wordPosition.startColumn });
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
		if (!this._position || !this._editor.hasModel()) {
			return;
		}
		const wordPosition = this._editor.getModel().getWordAtPosition(this._position);
		if (!wordPosition) {
			return;
		}
		const offset = this._editor.getModel().getOffsetAt({ lineNumber: this._position.lineNumber, column: wordPosition.startColumn });
		const length = wordPosition.word.length;
		const uri = this._editor.getModel().uri;
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
