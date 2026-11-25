/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Event } from '../../../../base/common/event.js';
import { constObservable } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { LineRange } from '../../../../editor/common/core/ranges/lineRange.js';
import { DetailedLineRangeMapping } from '../../../../editor/common/diff/rangeMapping.js';
import { IChatEditingService, IChatEditingSession, IModifiedFileEntry, ModifiedFileEntryState } from '../../../contrib/chat/common/editing/chatEditingService.js';
import { IQuickDiffModelService, QuickDiffModel } from '../../../contrib/scm/browser/quickDiffModel.js';
import { IQuickDiffService } from '../../../contrib/scm/common/quickDiff.js';
import { IExtHostContext } from '../../../services/extensions/common/extHostCustomers.js';
import { MainThreadQuickDiff } from '../../browser/mainThreadQuickDiff.js';
import { ExtHostQuickDiffShape, ITextEditorDiffInformation } from '../../common/extHost.protocol.js';

suite('MainThreadQuickDiff', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves primary SCM diff by default and overlays chat diffs only when opted in', async () => {
		const modifiedUri = URI.file('/workspace/scm.md');
		const scmOriginalUri = URI.parse('git:/workspace/scm.md');
		const chatOriginalUri = URI.parse('chat-editing-snapshot-text-model:/scm.md');

		const scmChange = new DetailedLineRangeMapping(new LineRange(1, 2), new LineRange(1, 2), undefined);
		const chatChange = new DetailedLineRangeMapping(new LineRange(5, 6), new LineRange(5, 6), undefined);

		const quickDiffModel = upcastPartial<QuickDiffModel>({
			changesVersionId: 7,
			onDidChange: Event.None,
			getQuickDiffResults: () => [{
				providerKind: 'primary',
				original: scmOriginalUri,
				modified: modifiedUri,
				changes2: [scmChange],
			}] as unknown as ReturnType<QuickDiffModel['getQuickDiffResults']>,
		});
		const quickDiffModelService = new class extends mock<IQuickDiffModelService>() {
			override createQuickDiffModelReference() {
				return { object: quickDiffModel, dispose: () => { } };
			}
		}();
		const quickDiffService = new class extends mock<IQuickDiffService>() { }();

		const chatEntry = new class extends mock<IModifiedFileEntry>() {
			override readonly originalURI = chatOriginalUri;
			override readonly modifiedURI = modifiedUri;
			override readonly state = constObservable(ModifiedFileEntryState.Modified);
			override readonly diffInfo = constObservable({
				identical: false,
				quitEarly: false,
				changes: [chatChange],
				moves: [],
				modifiedVersionId: 9,
			});
		}();
		const chatSession = new class extends mock<IChatEditingSession>() {
			override readonly isGlobalEditingSession = constObservable(true);
			override readonly entries = constObservable<readonly IModifiedFileEntry[]>([chatEntry]);
			override readEntry(uri: URI) {
				return uri.toString() === modifiedUri.toString() ? chatEntry : undefined;
			}
		}();
		const chatEditingService = new class extends mock<IChatEditingService>() {
			override readonly editingSessionsObs = constObservable([chatSession]);
		}();

		const received = new Map<number, ITextEditorDiffInformation | undefined>();
		const proxy = new class extends mock<ExtHostQuickDiffShape>() {
			override $acceptSourceControlDiffInformation(handle: number, diffInformation: ITextEditorDiffInformation | undefined): void {
				received.set(handle, diffInformation);
			}
		}();
		const extHostContext = upcastPartial<IExtHostContext>({
			getProxy: () => proxy as never,
		});

		const mainThreadQuickDiff = store.add(new MainThreadQuickDiff(
			extHostContext,
			quickDiffService,
			quickDiffModelService,
			chatEditingService,
		));

		// Default subscriber (includeChatEdits omitted) receives primary SCM diff.
		await mainThreadQuickDiff.$createSourceControlDiffInformation(1, modifiedUri);
		const scmInfo = received.get(1);
		assert.ok(scmInfo);
		assert.strictEqual(URI.revive(scmInfo.original)?.toString(), scmOriginalUri.toString());
		assert.strictEqual(scmInfo.documentVersion, 7);
		assert.deepStrictEqual(scmInfo.changes, [[1, 2, 1, 2]]);

		// Opt-in subscriber (includeChatEdits: true) receives active chat editing diff with its exact version.
		await mainThreadQuickDiff.$createSourceControlDiffInformation(2, modifiedUri, true);
		const chatInfo = received.get(2);
		assert.ok(chatInfo);
		assert.strictEqual(URI.revive(chatInfo.original)?.toString(), chatOriginalUri.toString());
		assert.strictEqual(chatInfo.documentVersion, 9);
		assert.deepStrictEqual(chatInfo.changes, [[5, 6, 5, 6]]);
	});
});
