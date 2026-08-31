/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { Selection } from '../../../../../editor/common/core/selection.js';
import { IResourceEditorInputIdentifier } from '../../../../../platform/editor/common/editor.js';
import { isLocation } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IFileService } from '../../../../../platform/files/common/files.js';
import { ISharedWebContentExtractorService } from '../../../../../platform/webContentExtractor/common/webContentExtractor.js';
import { IEditorIdentifier, IUntypedEditorInput } from '../../../../common/editor.js';
import { IEditorService, ISaveEditorsResult } from '../../../../services/editor/common/editorService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ChatAttachmentModel } from '../../../chat/browser/attachments/chatAttachmentModel.js';
import { IChatAttachmentResolveService } from '../../../chat/browser/attachments/chatAttachmentResolveService.js';
import { getAgentHostAttachmentRange, InlineChatUntitledSaveHandler } from '../../browser/inlineChatController.js';

suite('InlineChatController', () => {
	const store = new DisposableStore();
	let model: ITextModel;
	let attachmentModel: ChatAttachmentModel;

	setup(() => {
		model = store.add(createTextModel('first line\nsecond line\nthird line'));
		attachmentModel = store.add(new ChatAttachmentModel(
			new class extends mock<IFileService>() { },
			new class extends mock<ISharedWebContentExtractorService>() { },
			new class extends mock<IChatAttachmentResolveService>() { },
		));
	});

	teardown(() => {
		store.clear();
	});

	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses the cursor line for empty Agent Host attachment selections', () => {
		const uri = URI.file('/test/target.ts');
		const entry = attachmentModel.asFileVariableEntry(uri, getAgentHostAttachmentRange(model, new Selection(2, 10, 2, 10)));

		assert.deepStrictEqual({
			attachment: isLocation(entry.value) ? entry.value : undefined,
			noSelection: getAgentHostAttachmentRange(model, null),
		}, {
			attachment: {
				uri,
				range: new Range(2, 1, 2, 12),
			},
			noSelection: undefined,
		});
	});

	test('preserves non-empty Agent Host attachment selections', () => {
		const selection = new Selection(3, 4, 1, 2);
		const uri = URI.file('/test/target.ts');

		assert.deepStrictEqual(
			attachmentModel.asFileVariableEntry(uri, getAgentHostAttachmentRange(model, selection)).value,
			{ uri, range: selection },
		);
	});

	test('keeps an untitled prompt when saving for Agent Host is cancelled', async () => {
		const source = URI.from({ scheme: Schemas.untitled, path: '/test/untitled.ts' });
		const saves: URI[] = [];
		const disposedSessions: URI[] = [];
		const replays: { resource: URI; message: string }[] = [];
		const editor = new class extends mock<IEditorIdentifier>() { }();
		const handler = new InlineChatUntitledSaveHandler(
			() => true,
			new class extends mock<IEditorService>() {
				override findEditors(resource: URI | IResourceEditorInputIdentifier): readonly IEditorIdentifier[] {
					if (URI.isUri(resource)) {
						saves.push(resource);
					}
					return [editor];
				}

				override async save(_editor: IEditorIdentifier): Promise<ISaveEditorsResult> {
					return { success: false, editors: [] };
				}
			}(),
			async (source, target, message) => {
				disposedSessions.push(source);
				replays.push({ resource: target, message });
			},
			new class extends mock<ILogService>() { }(),
		);

		const handled = await handler.handle(source, 'Add a test');

		assert.deepStrictEqual({ handled, saves, disposedSessions, replays }, {
			handled: true,
			saves: [source],
			disposedSessions: [],
			replays: [],
		});
	});

	test('replays an untitled Agent Host prompt against the saved file', async () => {
		const source = URI.from({ scheme: Schemas.untitled, path: '/test/untitled.ts' });
		const target = URI.file('/test/saved.ts');
		const disposedSessions: URI[] = [];
		const replays: { resource: URI; message: string }[] = [];
		const editor = new class extends mock<IEditorIdentifier>() { }();
		const handler = new InlineChatUntitledSaveHandler(
			() => true,
			new class extends mock<IEditorService>() {
				override findEditors(_resource: URI | IResourceEditorInputIdentifier): readonly IEditorIdentifier[] {
					return [editor];
				}

				override async save(_editor: IEditorIdentifier): Promise<ISaveEditorsResult> {
					const savedEditor: IUntypedEditorInput = { resource: target };
					return { success: true, editors: [savedEditor] };
				}
			}(),
			async (source, target, message) => {
				disposedSessions.push(source);
				replays.push({ resource: target, message });
			},
			new class extends mock<ILogService>() { }(),
		);

		const handled = await handler.handle(source, 'Add a test');

		assert.deepStrictEqual({ handled, disposedSessions, replays }, {
			handled: true,
			disposedSessions: [source],
			replays: [{ resource: target, message: 'Add a test' }],
		});
	});

	test('leaves untitled input on the legacy path when Agent Host is disabled', async () => {
		const source = URI.from({ scheme: Schemas.untitled, path: '/test/untitled.ts' });
		const saves: URI[] = [];
		const handler = new InlineChatUntitledSaveHandler(
			() => false,
			new class extends mock<IEditorService>() {
				override findEditors(resource: URI | IResourceEditorInputIdentifier): readonly IEditorIdentifier[] {
					if (URI.isUri(resource)) {
						saves.push(resource);
					}
					return [];
				}
			}(),
			async () => { },
			new class extends mock<ILogService>() { }(),
		);

		const handled = await handler.handle(source, 'Add a test');

		assert.deepStrictEqual({ handled, saves }, { handled: false, saves: [] });
	});
});
