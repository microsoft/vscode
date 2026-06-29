/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { ExtHostQuickDiffShape, IMainContext, ITextEditorDiffInformation, MainContext, MainThreadQuickDiffShape } from './extHost.protocol.js';
import { asPromise } from '../../../base/common/async.js';
import { DocumentSelector } from './extHostTypeConverters.js';
import { TextEditorChangeKind } from './extHostTypes.js';
import { ExtHostDocuments } from './extHostDocuments.js';
import { IURITransformer } from '../../../base/common/uriIpc.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../platform/extensions/common/extensions.js';

class ExtHostSourceControlDiffInformation implements vscode.SourceControlDiffInformationProvider {

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange = this._onDidChange.event;

	private _diffInformation: vscode.TextEditorDiffInformation | undefined;
	get diffInformation(): vscode.TextEditorDiffInformation | undefined { return this._diffInformation; }

	constructor(
		private readonly handle: number,
		private readonly proxy: MainThreadQuickDiffShape,
		private readonly documents: ExtHostDocuments,
		private readonly onDispose: (handle: number) => void
	) { }

	$acceptDiffInformation(diffInformation: ITextEditorDiffInformation | undefined): void {
		if (!diffInformation) {
			this._diffInformation = undefined;
			this._onDidChange.fire();
			return;
		}

		const documents = this.documents;
		const original = URI.revive(diffInformation.original);
		const modified = URI.revive(diffInformation.modified);

		const changes = diffInformation.changes.map(change => {
			const [originalStartLineNumber, originalEndLineNumberExclusive, modifiedStartLineNumber, modifiedEndLineNumberExclusive] = change;

			let kind: vscode.TextEditorChangeKind;
			if (originalStartLineNumber === originalEndLineNumberExclusive) {
				kind = TextEditorChangeKind.Addition;
			} else if (modifiedStartLineNumber === modifiedEndLineNumberExclusive) {
				kind = TextEditorChangeKind.Deletion;
			} else {
				kind = TextEditorChangeKind.Modification;
			}

			return {
				original: { startLineNumber: originalStartLineNumber, endLineNumberExclusive: originalEndLineNumberExclusive },
				modified: { startLineNumber: modifiedStartLineNumber, endLineNumberExclusive: modifiedEndLineNumberExclusive },
				kind
			} satisfies vscode.TextEditorChange;
		});

		this._diffInformation = Object.freeze({
			documentVersion: diffInformation.documentVersion,
			original,
			modified,
			changes,
			get isStale(): boolean {
				const document = documents.getDocumentData(modified);
				return document?.document.version !== diffInformation.documentVersion;
			}
		});
		this._onDidChange.fire();
	}

	dispose(): void {
		this.proxy.$disposeSourceControlDiffInformation(this.handle);
		this._onDidChange.dispose();
		this.onDispose(this.handle);
	}
}

export class ExtHostQuickDiff implements ExtHostQuickDiffShape {
	private static handlePool: number = 0;

	private proxy: MainThreadQuickDiffShape;
	private providers: Map<number, vscode.QuickDiffProvider> = new Map();
	private informations: Map<number, ExtHostSourceControlDiffInformation> = new Map();

	constructor(
		mainContext: IMainContext,
		private readonly documents: ExtHostDocuments,
		private readonly uriTransformer: IURITransformer | undefined
	) {
		this.proxy = mainContext.getProxy(MainContext.MainThreadQuickDiff);
	}

	$provideOriginalResource(handle: number, uriComponents: UriComponents, token: CancellationToken): Promise<UriComponents | null> {
		const uri = URI.revive(uriComponents);
		const provider = this.providers.get(handle);

		if (!provider) {
			return Promise.resolve(null);
		}

		return asPromise(() => provider.provideOriginalResource!(uri, token))
			.then<UriComponents | null>(r => r || null);
	}

	$acceptSourceControlDiffInformation(handle: number, diffInformation: ITextEditorDiffInformation | undefined): void {
		this.informations.get(handle)?.$acceptDiffInformation(diffInformation);
	}

	registerQuickDiffProvider(extension: IExtensionDescription, selector: vscode.DocumentSelector, quickDiffProvider: vscode.QuickDiffProvider, id: string, label: string, rootUri?: vscode.Uri): vscode.Disposable {
		const handle = ExtHostQuickDiff.handlePool++;
		this.providers.set(handle, quickDiffProvider);

		const extensionId = ExtensionIdentifier.toKey(extension.identifier);
		this.proxy.$registerQuickDiffProvider(handle, DocumentSelector.from(selector, this.uriTransformer), `${extensionId}.${id}`, label, rootUri);
		return {
			dispose: () => {
				this.proxy.$unregisterQuickDiffProvider(handle);
				this.providers.delete(handle);
			}
		};
	}

	createSourceControlDiffInformation(uri: vscode.Uri): vscode.SourceControlDiffInformationProvider {
		const handle = ExtHostQuickDiff.handlePool++;
		const information = new ExtHostSourceControlDiffInformation(handle, this.proxy, this.documents, h => this.informations.delete(h));
		this.informations.set(handle, information);
		this.proxy.$createSourceControlDiffInformation(handle, uri);
		return information;
	}
}
