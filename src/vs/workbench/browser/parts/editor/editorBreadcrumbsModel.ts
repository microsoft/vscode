/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { OutlineModel, OutlineGroup, OutlineElement } from 'vs/editor/contrib/documentSymbols/outlineModel';
import URI from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';
import * as paths from 'vs/base/common/paths';
import { isEqual } from 'vs/base/common/resources';
import { DocumentSymbolProviderRegistry } from 'vs/editor/common/modes';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { onUnexpectedError } from 'vs/base/common/errors';
import { debounceEvent, Event, Emitter } from 'vs/base/common/event';
import { size } from 'vs/base/common/collections';

export class FileElement {
	constructor(
		readonly uri: URI,
		readonly isFile: boolean
	) { }
}

export type BreadcrumbElement = FileElement | OutlineGroup | OutlineElement;

export class EditorBreadcrumbsModel {

	private readonly _disposables: IDisposable[] = [];
	private readonly _fileElements: FileElement[] = [];
	private _outlineDisposables: IDisposable[] = [];
	private _outlineModel: OutlineModel;

	private _onDidUpdate = new Emitter<this>();
	readonly onDidUpdate: Event<this> = this._onDidUpdate.event;

	constructor(
		private readonly _uri: URI,
		private readonly _editor: ICodeEditor | undefined,
		@IWorkspaceContextService workspaceService: IWorkspaceContextService,
	) {
		this._fileElements = EditorBreadcrumbsModel._getFileElements(this._uri, workspaceService);
		this._bindToEditor();
		this._onDidUpdate.fire(this);
	}

	dispose(): void {
		dispose(this._disposables);
	}

	getElements(): ReadonlyArray<BreadcrumbElement> {
		if (!this._editor || !this._outlineModel) {
			return this._fileElements;
		}

		let item: OutlineGroup | OutlineElement = this._outlineModel.getItemEnclosingPosition(this._editor.getPosition());
		let items: (OutlineGroup | OutlineElement)[] = [];
		while (item) {
			items.push(item);
			let parent = item.parent;
			if (parent instanceof OutlineModel) {
				break;
			}
			if (parent instanceof OutlineGroup && size(parent.parent.children) === 1) {
				break;
			}
			item = parent;
		}

		return (this._fileElements as BreadcrumbElement[]).concat(items.reverse());
	}

	private static _getFileElements(uri: URI, workspaceService: IWorkspaceContextService): FileElement[] {
		let result: FileElement[] = [];
		let workspace = workspaceService.getWorkspaceFolder(uri);
		let path = uri.path;
		while (path !== '/') {
			if (workspace && isEqual(workspace.uri, uri)) {
				break;
			}
			result.push(new FileElement(uri, result.length === 0));
			path = paths.dirname(path);
			uri = uri.with({ path });
		}
		return result.reverse();
	}

	private _bindToEditor(): void {
		if (!this._editor) {
			return;
		}
		this._updateOutline();
		this._disposables.push(DocumentSymbolProviderRegistry.onDidChange(_ => this._updateOutline()));
		this._disposables.push(this._editor.onDidChangeModel(_ => this._updateOutline()));
		this._disposables.push(this._editor.onDidChangeModelLanguage(_ => this._updateOutline()));
		this._disposables.push(debounceEvent(this._editor.onDidChangeModelContent, _ => _, 350)(_ => this._updateOutline()));
	}

	private _updateOutline(): void {

		this._outlineDisposables = dispose(this._outlineDisposables);

		const model = this._editor.getModel();
		if (!model || !DocumentSymbolProviderRegistry.has(model) || !isEqual(model.uri, this._uri)) {
			return;
		}

		const source = new CancellationTokenSource();

		this._outlineDisposables.push({
			dispose: () => {
				source.cancel();
				source.dispose();
			}
		});
		OutlineModel.create(model, source.token).then(model => {
			this._outlineModel = model;
			this._onDidUpdate.fire(this);
			this._outlineDisposables.push(debounceEvent(this._editor.onDidChangeCursorPosition, _ => _, 250)(_ => this._onDidUpdate.fire(this)));
		}).catch(err => {
			this._outlineModel = undefined;
			this._onDidUpdate.fire(this);
			onUnexpectedError(err);
		});
	}
}
