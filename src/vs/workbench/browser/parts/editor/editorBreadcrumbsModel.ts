/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { equals } from 'vs/base/common/arrays';
import { TimeoutTimer } from 'vs/base/common/async';
import { CancellationTokenSource } from 'vs/base/common/cancellation';
import { size } from 'vs/base/common/collections';
import { onUnexpectedError } from 'vs/base/common/errors';
import { debounceEvent, Emitter, Event } from 'vs/base/common/event';
import { dispose, IDisposable } from 'vs/base/common/lifecycle';
import * as paths from 'vs/base/common/paths';
import { isEqual } from 'vs/base/common/resources';
import URI from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IPosition } from 'vs/editor/common/core/position';
import { DocumentSymbolProviderRegistry } from 'vs/editor/common/modes';
import { OutlineElement, OutlineGroup, OutlineModel } from 'vs/editor/contrib/documentSymbols/outlineModel';
import { IWorkspaceContextService } from 'vs/platform/workspace/common/workspace';

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

	private _outlineElements: (OutlineGroup | OutlineElement)[] = [];
	private _outlineDisposables: IDisposable[] = [];

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
		return [].concat(this._fileElements, this._outlineElements);
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
		this._disposables.push(debounceEvent(this._editor.onDidChangeModelContent, _ => _, 350)(_ => this._updateOutline(true)));
	}

	private _updateOutline(didChangeContent?: boolean): void {

		this._outlineDisposables = dispose(this._outlineDisposables);
		if (!didChangeContent) {
			this._updateOutlineElements([]);
		}

		const buffer = this._editor.getModel();
		if (!buffer || !DocumentSymbolProviderRegistry.has(buffer) || !isEqual(buffer.uri, this._uri)) {
			return;
		}

		const source = new CancellationTokenSource();

		this._outlineDisposables.push({
			dispose: () => {
				source.cancel();
				source.dispose();
			}
		});
		OutlineModel.create(buffer, source.token).then(model => {
			this._updateOutlineElements(this._getOutlineElements(model, this._editor.getPosition()));
			const timeout = new TimeoutTimer();
			const lastVersionId = buffer.getVersionId();
			this._outlineDisposables.push(this._editor.onDidChangeCursorPosition(_ => {
				timeout.cancelAndSet(() => {
					if (lastVersionId === buffer.getVersionId()) {
						this._updateOutlineElements(this._getOutlineElements(model, this._editor.getPosition()));
					}
				}, 150);
			}));
			this._outlineDisposables.push(timeout);
		}).catch(err => {
			this._updateOutlineElements([]);
			onUnexpectedError(err);
		});
	}

	private _getOutlineElements(model: OutlineModel, position: IPosition): (OutlineGroup | OutlineElement)[] {
		if (!model) {
			return [];
		}
		let item: OutlineGroup | OutlineElement = model.getItemEnclosingPosition(position);
		let chain: (OutlineGroup | OutlineElement)[] = [];
		while (item) {
			chain.push(item);
			let parent = item.parent;
			if (parent instanceof OutlineModel) {
				break;
			}
			if (parent instanceof OutlineGroup && size(parent.parent.children) === 1) {
				break;
			}
			item = parent;
		}
		return chain.reverse();
	}

	private _updateOutlineElements(elements: (OutlineGroup | OutlineElement)[]): void {
		if (!equals(elements, this._outlineElements, EditorBreadcrumbsModel.outlineElementEquals)) {
			this._outlineElements = elements;
			this._onDidUpdate.fire(this);
		}
	}

	private static outlineElementEquals(a: OutlineGroup | OutlineElement, b: OutlineGroup | OutlineElement): boolean {
		if (a === b) {
			return true;
		} else if (!a || !b) {
			return false;
		} else {
			return a.id === b.id;
		}
	}
}
