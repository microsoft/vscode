/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EventEmitter, Uri, workspace } from 'vscode';
import { Disposable } from '../../../../util/vs/base/common/lifecycle';

export class VirtualTextDocumentProvider extends Disposable {
	private static id = 0;

	private readonly _documents = new Map<string, VirtualDocument>();

	private readonly _didChangeEmitter = this._register(new EventEmitter<Uri>());

	constructor(
		public readonly scheme: string
	) {
		super();

		this._register(workspace.registerTextDocumentContentProvider(scheme, {
			provideTextDocumentContent: (uri, token) => {
				const doc = this._documents.get(uri.toString());
				if (!doc) { return '(document not found)'; }
				return doc.content;
			},
			onDidChange: this._didChangeEmitter.event,
		}));
	}

	createDocument(data: string = '', extension: string = 'txt'): VirtualDocument {
		const uri = Uri.parse(`${this.scheme}:///virtual-text-document/${VirtualTextDocumentProvider.id++}.${extension}`);
		const document = new VirtualDocument(uri, () => this._didChangeEmitter.fire(uri));
		document.setContent(data);
		this._documents.set(uri.toString(), document);
		return document;
	}

	createDocumentForUri(uri: Uri): VirtualDocument {
		if (uri.scheme !== this.scheme) {
			throw new Error(`Invalid scheme: ${uri.scheme}`);
		}
		const document = new VirtualDocument(uri, () => this._didChangeEmitter.fire(uri));
		this._documents.set(uri.toString(), document);
		return document;
	}
}

class VirtualDocument {
	private _content: string = '';

	public get content(): string {
		return this._content;
	}

	constructor(
		public readonly uri: Uri,
		private readonly _handleChanged: () => void,
	) { }

	public setContent(content: string): void {
		this._content = content;
		this._handleChanged();
	}
}
