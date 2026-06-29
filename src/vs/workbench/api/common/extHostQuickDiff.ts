/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { Emitter } from '../../../base/common/event.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { ExtHostQuickDiffShape, IMainContext, IQuickDiffChangeDto, MainContext, MainThreadQuickDiffShape } from './extHost.protocol.js';
import { asPromise } from '../../../base/common/async.js';
import { DocumentSelector } from './extHostTypeConverters.js';
import { QuickDiffChangeKind } from './extHostTypes.js';
import { IURITransformer } from '../../../base/common/uriIpc.js';
import { ExtensionIdentifier, IExtensionDescription } from '../../../platform/extensions/common/extensions.js';

class ExtHostQuickDiffInformation implements vscode.QuickDiffInformation {

	private readonly _onDidChange = new Emitter<void>();
	readonly onDidChange = this._onDidChange.event;

	private _changes: readonly vscode.QuickDiffChange[] = [];
	get changes(): readonly vscode.QuickDiffChange[] { return this._changes; }

	private _documentVersion: number = 0;
	get documentVersion(): number { return this._documentVersion; }

	constructor(
		private readonly handle: number,
		private readonly proxy: MainThreadQuickDiffShape,
		private readonly onDispose: (handle: number) => void
	) { }

	$acceptChanges(version: number, changes: IQuickDiffChangeDto[]): void {
		this._documentVersion = version;
		this._changes = changes.map(change => ({
			kind: ExtHostQuickDiffInformation.toChangeKind(change),
			originalStartLineNumber: change.originalStartLineNumber,
			originalEndLineNumber: change.originalEndLineNumber,
			modifiedStartLineNumber: change.modifiedStartLineNumber,
			modifiedEndLineNumber: change.modifiedEndLineNumber,
		}));
		this._onDidChange.fire();
	}

	dispose(): void {
		this.proxy.$disposeQuickDiffInformation(this.handle);
		this._onDidChange.dispose();
		this.onDispose(this.handle);
	}

	private static toChangeKind(change: IQuickDiffChangeDto): QuickDiffChangeKind {
		if (change.originalEndLineNumber === 0) {
			return QuickDiffChangeKind.Added;
		} else if (change.modifiedEndLineNumber === 0) {
			return QuickDiffChangeKind.Deleted;
		}
		return QuickDiffChangeKind.Modified;
	}
}

export class ExtHostQuickDiff implements ExtHostQuickDiffShape {
	private static handlePool: number = 0;

	private proxy: MainThreadQuickDiffShape;
	private providers: Map<number, vscode.QuickDiffProvider> = new Map();
	private informations: Map<number, ExtHostQuickDiffInformation> = new Map();

	constructor(
		mainContext: IMainContext,
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

	$acceptQuickDiffInformation(handle: number, version: number, changes: IQuickDiffChangeDto[]): void {
		this.informations.get(handle)?.$acceptChanges(version, changes);
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

	createQuickDiffInformation(uri: vscode.Uri): vscode.QuickDiffInformation {
		const handle = ExtHostQuickDiff.handlePool++;
		const information = new ExtHostQuickDiffInformation(handle, this.proxy, h => this.informations.delete(h));
		this.informations.set(handle, information);
		this.proxy.$createQuickDiffInformation(handle, uri);
		return information;
	}
}
