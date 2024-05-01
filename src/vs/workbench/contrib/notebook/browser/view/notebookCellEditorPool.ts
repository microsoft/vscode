/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from 'vs/base/browser/dom';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { CodeEditorWidget } from 'vs/editor/browser/widget/codeEditor/codeEditorWidget';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { IContextKeyService, IScopedContextKeyService } from 'vs/platform/contextkey/common/contextkey';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { INotebookEditorCreationOptions } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { CellEditorOptions } from 'vs/workbench/contrib/notebook/browser/view/cellParts/cellEditorOptions';

class ResourcePool<T extends IDisposable> extends Disposable {
	private readonly pool: T[] = [];

	private _inUse = new Set<T>;
	public get inUse(): ReadonlySet<T> {
		return this._inUse;
	}

	constructor(
		private readonly _itemFactory: () => T,
	) {
		super();
	}

	get(): T {
		if (this.pool.length > 0) {
			const item = this.pool.pop()!;
			this._inUse.add(item);
			return item;
		}

		const item = this._register(this._itemFactory());
		this._inUse.add(item);
		return item;
	}

	release(item: T): void {
		this._inUse.delete(item);
		this.pool.push(item);
	}
}

export class CellCodeEditor extends Disposable {
	private _editor: CodeEditorWidget | undefined;
	public readonly element: HTMLElement;
	public readonly editor: CodeEditorWidget;
	constructor(
		readonly editorOptions: CellEditorOptions,
		readonly creationOptions: INotebookEditorCreationOptions,
		readonly contextKeyServiceProvider: (container: HTMLElement) => IScopedContextKeyService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		super();

		this.element = DOM.$('.cell-editor-part');

		const editorContainer = DOM.append(this.element, DOM.$('.cell-editor-container'));

		const editorContextKeyService = this._register(this.contextKeyServiceProvider(this.element));
		const editorInstaService = this._instantiationService.createChild(new ServiceCollection([IContextKeyService, editorContextKeyService]));
		EditorContextKeys.inCompositeEditor.bindTo(editorContextKeyService).set(true);
		this.editor = editorInstaService.createInstance(CodeEditorWidget, editorContainer, {
			...this.editorOptions.getDefaultValue(),
			dimension: {
				width: 0,
				height: 0
			},
		}, {
			contributions: creationOptions.cellEditorContributions
		});

		this._register(this.editor);
	}

	reset(): void {
		if (this._editor) {
			this._editor.dispose();
			this._editor = undefined;
		}
	}

	override dispose(): void {
		this.reset();
		super.dispose();
	}

}

interface IDisposableReference<T> extends IDisposable {
	object: T;
	isStale: () => boolean;
}

export class NotebookCellEditorPool extends Disposable {
	private readonly _pool: ResourcePool<CellCodeEditor>;

	public inUse(): Iterable<CellCodeEditor> {
		return this._pool.inUse;
	}

	constructor(
		readonly editorOptions: CellEditorOptions,
		readonly creationOptions: INotebookEditorCreationOptions,
		readonly contextKeyServiceProvider: (container: HTMLElement) => IScopedContextKeyService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this._pool = this._register(new ResourcePool(() => {
			return instantiationService.createInstance(CellCodeEditor, editorOptions, creationOptions, contextKeyServiceProvider);
		}));
	}

	get(): IDisposableReference<CellCodeEditor> {
		const codeBlock = this._pool.get();
		let stale = false;
		return {
			object: codeBlock,
			isStale: () => stale,
			dispose: () => {
				codeBlock.reset();
				stale = true;
				this._pool.release(codeBlock);
			}
		};
	}
}
