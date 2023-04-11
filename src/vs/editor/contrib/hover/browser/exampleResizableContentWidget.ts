/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ResizableHTMLElement } from 'vs/base/browser/ui/resizable/resizable';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { ContentWidgetPositionPreference, ICodeEditor, IContentWidget, IContentWidgetPosition } from 'vs/editor/browser/editorBrowser';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { clamp } from 'vs/base/common/numbers';
import { ResourceMap } from 'vs/base/common/map';
import { IPosition } from 'vs/editor/common/core/position';
import * as dom from 'vs/base/browser/dom';

export abstract class ExampleResizableContentWidget extends Disposable implements IContentWidget {

	allowEditorOverflow?: boolean | undefined;
	suppressMouseDown?: boolean | undefined;

	protected readonly _contentNode: HTMLDivElement;
	protected readonly _resizableNode = this._register(new ResizableHTMLElement());

	private _position: IContentWidgetPosition | null = null;
	protected readonly persistingMechanism: SingleSizePersistingMechanism | MultipleSizePersistingMechanism;
	private resizing: boolean = false;

	constructor(
		initalSize: dom.IDimension = new dom.Dimension(100, 100),
		private readonly persistingOptions: IPersistingOptions,
		protected readonly editor: ICodeEditor
	) {
		super();
		this._contentNode = document.createElement('div');
		this._contentNode.style.width = `${initalSize.width}px`;
		this._contentNode.style.height = `${initalSize.height}px`;
		this._resizableNode.domNode.appendChild(this._contentNode);
		this._resizableNode.minSize = new dom.Dimension(10, 10);
		this._resizableNode.enableSashes(true, true, true, true);
		this._resizableNode.layout(initalSize.height, initalSize.width);
		this._register(this._resizableNode.onDidResize(e => {
			this._contentNode.style.width = `${e.dimension.width}px`;
			this._contentNode.style.height = `${e.dimension.height}px`;
		}));

		if (this.persistingOptions instanceof SingleSizePersistingOptions) {
			this.persistingMechanism = new SingleSizePersistingMechanism(this, this.editor, this.persistingOptions);
		} else if (this.persistingOptions instanceof MultipleSizePersistingOptions) {
			this.persistingMechanism = new MultipleSizePersistingMechanism(this, this.editor);
		} else {
			throw new Error('Please specify a valid persisting mechanism');
		}

		this._register(this._resizableNode.onDidWillResize(() => {
			this.resizing = true;
		}));
		this._register(this._resizableNode.onDidResize((e) => {
			if (e.done) {
				this.resizing = false;
			}
		}));
	}

	abstract getId(): string;


	getDomNode(): HTMLElement {
		return this._resizableNode.domNode;
	}

	getPosition(): IContentWidgetPosition | null {
		return this._position;
	}

	setPosition(value: IContentWidgetPosition | null): void {
		// TODO
		// - compute boxed above/below if applicable
		this._position = value;
	}

	// abstract beforeRender?(): IDimension | null;

	afterRender(position: ContentWidgetPositionPreference | null): void {
		// TODO
		// - set max sizes that were computed above
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

	get resizableNode(): ResizableHTMLElement {
		return this._resizableNode;
	}
}

export class DummyResizeWidget extends ExampleResizableContentWidget {

	constructor(
		editor: ICodeEditor,
		persistingOptions: IPersistingOptions,
		initalSize: dom.IDimension = new dom.Dimension(100, 100)
	) {
		super(initalSize, persistingOptions, editor);
		this._contentNode.style.backgroundColor = 'red';
		this._contentNode.classList.add('dummy');
	}

	override getId(): string {
		return 'dummy';
	}

	override getPosition(): IContentWidgetPosition | null {
		return {
			position: { lineNumber: 1, column: 1 },
			preference: [ContentWidgetPositionPreference.BELOW]
		};
	}

	public resize(size: dom.Dimension) {
		this._contentNode.style.width = `${size.width}px`;
		this._contentNode.style.height = `${size.height}px`;
		this.editor.layoutContentWidget(this);
	}

	// override beforeRender?(): IDimension | null {
	// 	throw new Error('Method not implemented.');
	// }
	// override afterRender?(position: ContentWidgetPositionPreference | null): void {
	// 	throw new Error('Method not implemented.');
	// }
}




// --- OLD PERSISTING MECHANISM

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
		private readonly resizableWidget: ExampleResizableContentWidget,
		private readonly editor: ICodeEditor,
		private readonly persistingOptions: SingleSizePersistingOptions
	) {

		this.persistedWidgetSize = new PersistedWidgetSize(this.persistingOptions.key, this.persistingOptions.storageService);

		let state: ResizeState | undefined;
		this.disposables.add(this.resizableWidget.resizableNode.onDidWillResize(() => {
			this.resizableWidget.beforeOnDidWillResize();
			state = new ResizeState(this.persistedWidgetSize!.restore(), this.resizableWidget.resizableNode.size);
		}));
		this.disposables.add(this.resizableWidget.resizableNode.onDidResize(e => {
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
				let { width, height } = this.resizableWidget.resizableNode.size;
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
		private readonly resizableWidget: ExampleResizableContentWidget,
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
		this.disposables.add(this.resizableWidget.resizableNode.onDidWillResize(() => {
			this.resizableWidget.beforeOnDidWillResize();
		}));
		this.disposables.add(this.resizableWidget.resizableNode.onDidResize(e => {
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
