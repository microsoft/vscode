/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { DisposableMap, DisposableStore, IDisposable, IReference } from '../../../base/common/lifecycle.js';
import { autorun, derived } from '../../../base/common/observable.js';
import { URI, UriComponents } from '../../../base/common/uri.js';
import { ExtHostContext, ExtHostQuickDiffShape, IDocumentFilterDto, ITextEditorChange, ITextEditorDiffInformation, MainContext, MainThreadQuickDiffShape } from '../common/extHost.protocol.js';
import { findChatEditingSessionEntry, IChatEditingService, ModifiedFileEntryState } from '../../contrib/chat/common/editing/chatEditingService.js';
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
		@IQuickDiffModelService private readonly quickDiffModelService: IQuickDiffModelService,
		@IChatEditingService private readonly chatEditingService: IChatEditingService,
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

	async $createSourceControlDiffInformation(handle: number, uri: UriComponents, includeChatEdits?: boolean): Promise<void> {
		const resource = URI.revive(uri);
		const reference = this.quickDiffModelService.createQuickDiffModelReference(resource);
		if (!reference) {
			return;
		}

		const store = new DisposableStore();
		store.add(reference);

		if (!includeChatEdits) {
			store.add(reference.object.onDidChange(() => this.sendSourceControlDiffInformation(handle, reference)));
			this.informationDisposables.set(handle, store);
			this.sendSourceControlDiffInformation(handle, reference);
			return;
		}

		const chatDiffObs = derived(r => {
			const sessions = this.chatEditingService.editingSessionsObs.read(r).filter(session => session.isGlobalEditingSession.read(r));
			const match = findChatEditingSessionEntry(sessions, resource, r);
			if (!match || match.entry.state.read(r) !== ModifiedFileEntryState.Modified || !match.entry.diffInfo) {
				return undefined;
			}
			const diff = match.entry.diffInfo.read(r);
			return { entry: match.entry, diff };
		});

		const publish = () => {
			const chatDiff = chatDiffObs.get();
			if (chatDiff) {
				if (chatDiff.diff.modifiedVersionId === undefined) {
					return;
				}
				const changes: ITextEditorChange[] = chatDiff.diff.changes.map(change => [
					change.original.startLineNumber,
					change.original.endLineNumberExclusive,
					change.modified.startLineNumber,
					change.modified.endLineNumberExclusive,
				]);
				const diffInformation: ITextEditorDiffInformation = {
					documentVersion: chatDiff.diff.modifiedVersionId,
					original: chatDiff.entry.originalURI,
					modified: chatDiff.entry.modifiedURI,
					changes,
				};
				this.proxy.$acceptSourceControlDiffInformation(handle, diffInformation);
				return;
			}
			this.sendSourceControlDiffInformation(handle, reference);
		};

		store.add(reference.object.onDidChange(publish));
		store.add(autorun(r => {
			chatDiffObs.read(r);
			publish();
		}));
		this.informationDisposables.set(handle, store);
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
