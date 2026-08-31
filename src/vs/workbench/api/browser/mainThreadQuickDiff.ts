/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { DisposableMap, DisposableStore, IDisposable, IReference } from '../../../base/common/lifecycle.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { ExtHostContext, ExtHostQuickDiffShape, IDocumentFilterDto, ITextEditorChange, ITextEditorDiffInformation, MainContext, MainThreadQuickDiffShape } from '../common/extHost.protocol.js';
import { IQuickDiffService, QuickDiffProvider } from '../../contrib/scm/common/quickDiff.js';
import { IQuickDiffModelService, QuickDiffModel } from '../../contrib/scm/browser/quickDiffModel.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';

@extHostNamedCustomer(MainContext.MainThreadQuickDiff)
export class MainThreadQuickDiff implements MainThreadQuickDiffShape {

	private readonly proxy: ExtHostQuickDiffShape;
	private providerDisposables = new DisposableMap<number, IDisposable>();
	private informationDisposables = new DisposableMap<number, IDisposable>();

	constructor(
		extHostContext: IExtHostContext,
		@IQuickDiffService private readonly quickDiffService: IQuickDiffService,
		@IQuickDiffModelService private readonly quickDiffModelService: IQuickDiffModelService
	) {
		this.proxy = extHostContext.getProxy(ExtHostContext.ExtHostQuickDiff);
	}

	async $registerQuickDiffProvider(handle: number, selector: IDocumentFilterDto[], id: string, label: string, rootUri: UriComponents | undefined): Promise<void> {
		const provider: QuickDiffProvider = {
			id,
			label,
			rootUri: URI.revive(rootUri),
			selector,
			kind: 'contributed',
			getOriginalResource: async (uri: URI) => {
				return URI.revive(await this.proxy.$provideOriginalResource(handle, uri, CancellationToken.None));
			}
		};
		const disposable = this.quickDiffService.addQuickDiffProvider(provider);
		this.providerDisposables.set(handle, disposable);
	}

	async $unregisterQuickDiffProvider(handle: number): Promise<void> {
		if (this.providerDisposables.has(handle)) {
			this.providerDisposables.deleteAndDispose(handle);
		}
	}

	async $createSourceControlDiffInformation(handle: number, uri: UriComponents): Promise<void> {
		const reference = this.quickDiffModelService.createQuickDiffModelReference(URI.revive(uri));
		if (!reference) {
			return;
		}

		const store = new DisposableStore();
		store.add(reference);
		store.add(reference.object.onDidChange(() => this.sendSourceControlDiffInformation(handle, reference)));
		this.informationDisposables.set(handle, store);

		// Push the current state so the extension host has an initial value.
		this.sendSourceControlDiffInformation(handle, reference);
	}

	async $disposeSourceControlDiffInformation(handle: number): Promise<void> {
		if (this.informationDisposables.has(handle)) {
			this.informationDisposables.deleteAndDispose(handle);
		}
	}

	private sendSourceControlDiffInformation(handle: number, reference: IReference<QuickDiffModel>): void {
		const model = reference.object;
		const primaryResult = model.getQuickDiffResults().find(result => result.providerKind === 'primary');
		if (!primaryResult) {
			this.proxy.$acceptSourceControlDiffInformation(handle, undefined);
			return;
		}

		const changes: ITextEditorChange[] = primaryResult.changes2.map(change => [
			change.original.startLineNumber,
			change.original.endLineNumberExclusive,
			change.modified.startLineNumber,
			change.modified.endLineNumberExclusive,
		]);

		const diffInformation: ITextEditorDiffInformation = {
			documentVersion: model.changesVersionId,
			original: primaryResult.original,
			modified: primaryResult.modified,
			changes,
		};
		this.proxy.$acceptSourceControlDiffInformation(handle, diffInformation);
	}

	dispose(): void {
		this.providerDisposables.dispose();
		this.informationDisposables.dispose();
	}
}
