/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResizableHTMLElement } from 'vs/base/browser/ui/resizable/resizable';
import { DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ResourceMap } from 'vs/base/common/map';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { IPosition } from 'vs/editor/common/core/position';
import { PositionAffinity } from 'vs/editor/common/model';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { clamp } from 'vs/base/common/numbers';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import * as dom from 'vs/base/browser/dom';

export interface IResizableWidget extends IDisposable {

	/**
	 * This method returns a boolean indicating whether the widget is currently resizing.
	 */
	isResizing(): boolean;

	/**
	 * Abstract method called when the resizable element is resizing. Should be used to define the new size of the children of the resizable element.
	 * @param dimension The new dimension of the resizable element.
	 */
	resize(dimension: dom.Dimension): void;

	/**
	 * Method which returns the persisted size the resizable widget. It calls the findSize method of the persisting mechanism (whether single or multiple size persisting mechanism).
	 */
	findPersistedSize(): dom.Dimension | undefined;

	/**
	 * Method which is called first in the onDidWillResize call of the resizable element. By default it returns nothing.
	 */
	beforeOnDidWillResize(): void;

	/**
	 * Method which is called last in the onDidResize call of the resizable element. By default it returns nothing.
	 */
	afterOnDidResize(): void;

	/**
	 * Method which disposes the resizable widget.
	 */
	dispose(): void;
}

export abstract class ResizableWidget implements IResizableWidget {

	public readonly element: ResizableHTMLElement;
	protected readonly persistingMechanism: SingleSizePersistingMechanism | MultipleSizePersistingMechanism;
	private readonly disposables = new DisposableStore();
	private resizing: boolean = false;

	constructor(
		readonly editor: ICodeEditor,
		private readonly persistingOptions: IPersistingOptions,
	) {

		this.element = this.disposables.add(new ResizableHTMLElement());
		this.element.minSize = new dom.Dimension(10, 24);

		if (this.persistingOptions instanceof SingleSizePersistingOptions) {
			this.persistingMechanism = new SingleSizePersistingMechanism(this, this.editor, this.persistingOptions);
		} else if (this.persistingOptions instanceof MultipleSizePersistingOptions) {
			this.persistingMechanism = new MultipleSizePersistingMechanism(this, this.editor);
		} else {
			throw new Error('Please specify a valid persisting mechanism');
		}

		this.disposables.add(this.element.onDidWillResize(() => {
			this.resizing = true;
		}));
		this.disposables.add(this.element.onDidResize((e) => {
			if (e.done) {
				this.resizing = false;
			}
		}));
	}

	abstract resize(dimension: dom.Dimension): void;

	isResizing() {
		return this.resizing;
	}

	findPersistedSize(): dom.Dimension | undefined {
		return this.persistingMechanism.findSize();
	}

	beforeOnDidWillResize() {
		return;
	}

	afterOnDidResize() {
		return;
	}

	dispose(): void {
		this.disposables.dispose();
	}
}

export interface IResizableContentWidget extends IContentWidget {

	/**
	 * Abstract method which returns the ID of the content widget
	 */
	getId(): string;

	/**
	 * Method which returns the dom node of the resizable element of the resizable widget passed into the constructor
	 */
	getDomNode(): HTMLElement;

	/**
	 * Returns the position of the content widget.
	 */
	getPosition(): IContentWidgetPosition | null;

	/**
	 * Method which sets the position of the content widget.
	 */
	set position(position: IPosition | null);

	/**
	 * Method which sets the secondary position of the content widget.
	 */
	set secondaryPosition(position: IPosition | null);

	/**
	 * Method which sets the preferred position of the content widget.
	 */
	set preference(preference: ContentWidgetPositionPreference[]);

	/**
	 * Method which sets the position affinity of the content widget.
	 */
	set positionAffinity(affinity: PositionAffinity | undefined);
}

export abstract class ResizableContentWidget implements IResizableContentWidget {

	private _position: IPosition | null = null;
	private _secondaryPosition: IPosition | null = null;
	private _preference: ContentWidgetPositionPreference[] = [];
	private _positionAffinity: PositionAffinity | undefined = undefined;

	constructor(
		private readonly resizableWidget: ResizableWidget
	) { }

	// Method is to abstract because generally we return a static ID
	abstract getId(): string;

	getDomNode(): HTMLElement {
		return this.resizableWidget.element.domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		const contentWidgetPosition = {
			position: this._position,
			secondaryPosition: this._secondaryPosition,
			preference: (this._preference),
			positionAffinity: this._positionAffinity
		};
		return contentWidgetPosition;
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

	/**
	 * Method which returns the current appropriate persisted size of the widget.
	 */
	findSize(): dom.Dimension | undefined;

	/**
	 * Method which clears the persisted size(s) of the widget.
	 */
	clear(): void;

	/**
	 * Method which disposes the persisting mechanism.
	 */
	dispose(): void;
}

/**
 * Class which can be used to define a mechanism that persists the size of a resizable widget. The persisted size is stored using the storage service.
 */
export class SingleSizePersistingMechanism implements IPersistingMechanism {

	private readonly persistedWidgetSize: PersistedWidgetSize | null = null;
	private readonly disposables = new DisposableStore();

	constructor(
		private readonly resizableWidget: ResizableWidget,
		private readonly editor: ICodeEditor,
		private readonly persistingOptions: SingleSizePersistingOptions
	) {

		this.persistedWidgetSize = new PersistedWidgetSize(this.persistingOptions.key, this.persistingOptions.storageService);

		let state: ResizeState | undefined;
		this.disposables.add(this.resizableWidget.element.onDidWillResize(() => {
			this.resizableWidget.beforeOnDidWillResize();
			state = new ResizeState(this.persistedWidgetSize!.restore(), this.resizableWidget.element.size);
		}));
		this.disposables.add(this.resizableWidget.element.onDidResize(e => {
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
				let { width, height } = this.resizableWidget.element.size;
				if (!state.persistHeight || Math.abs(state.currentSize.height - height) <= threshold) {
					height = state.persistedSize?.height ?? this.persistingOptions.defaultSize.height;
				}
				if (!state.persistWidth || Math.abs(state.currentSize.width - width) <= threshold) {
					width = state.persistedSize?.width ?? this.persistingOptions.defaultSize.width;
				}
				this.persistedWidgetSize!.store(new dom.Dimension(width, height));
			}
			state = undefined;
			this.resizableWidget.afterOnDidResize();
		}));
	}

	findSize(): dom.Dimension | undefined {
		return this.persistedWidgetSize?.restore();
	}

	clear(): void {
		this.persistedWidgetSize?.reset();
	}

	dispose(): void {
		this.disposables.dispose();
	}
}

/**
 * Class which can be used to define a mechanism which persists the sizes of a resizable widget on a per token-basis.
 * The sizes are saved in a ResourceMap which maps the document URI to the token position and its dom.Dimension persisted size.
 */
export class MultipleSizePersistingMechanism implements IPersistingMechanism {

	private readonly persistedWidgetSizes: ResourceMap<Map<string, dom.Dimension>> = new ResourceMap<Map<string, dom.Dimension>>();
	private readonly disposables = new DisposableStore();
	private _position: IPosition | null = null;

	constructor(
		private readonly resizableWidget: ResizableWidget,
		public readonly editor: ICodeEditor
	) {
		this.disposables.add(this.editor.onDidChangeModelContent((e) => {
			const uri = this.editor.getModel()?.uri;
			if (!uri || !this.persistedWidgetSizes.has(uri)) {
				return;
			}
			const persistedSizesForUri = this.persistedWidgetSizes.get(uri)!;
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
			this.persistedWidgetSizes.set(uri, updatedPersistedSizesForUri);
		}));
		this.disposables.add(this.resizableWidget.element.onDidWillResize(() => {
			this.resizableWidget.beforeOnDidWillResize();
		}));
		this.disposables.add(this.resizableWidget.element.onDidResize(e => {
			const height = e.dimension.height;
			const width = e.dimension.width;
			this.resizableWidget.resize(new dom.Dimension(width, height));
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

				if (!this.persistedWidgetSizes.get(uri)) {
					const persistedWidgetSizesForUri = new Map<string, dom.Dimension>([]);
					persistedWidgetSizesForUri.set(JSON.stringify([offset, length]), persistedSize);
					this.persistedWidgetSizes.set(uri, persistedWidgetSizesForUri);
				} else {
					const persistedWidgetSizesForUri = this.persistedWidgetSizes.get(uri)!;
					persistedWidgetSizesForUri.set(JSON.stringify([offset, length]), persistedSize);
				}
			}
			this.resizableWidget.afterOnDidResize();
		}));
	}

	set position(position: IPosition) {
		this._position = position;
	}

	findSize(): dom.Dimension | undefined {
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
		const persistedSizesForUri = this.persistedWidgetSizes.get(uri);
		if (!persistedSizesForUri) {
			return;
		}
		return persistedSizesForUri.get(JSON.stringify([offset, length]));
	}

	clear(): void {
		this.persistedWidgetSizes.clear();
	}

	dispose(): void {
		this.disposables.dispose();
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
