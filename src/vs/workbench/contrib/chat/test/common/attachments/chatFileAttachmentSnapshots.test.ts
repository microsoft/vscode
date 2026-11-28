/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { URI } from '../../../../../../base/common/uri.js';
import { upcastPartial } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { OffsetRange } from '../../../../../../editor/common/core/ranges/offsetRange.js';
import { ITextModel } from '../../../../../../editor/common/model.js';
import { IFileContent, IFileService } from '../../../../../../platform/files/common/files.js';
import { ITextFileEditorModel, ITextFileEditorModelManager, ITextFileService } from '../../../../../services/textfile/common/textfiles.js';
import { ChatFileAttachmentSnapshots } from '../../../common/attachments/chatFileAttachmentSnapshots.js';
import { IChatRequestFileEntry } from '../../../common/attachments/chatVariableEntries.js';
import { ILanguageModelIgnoredFilesService } from '../../../common/ignoredFiles.js';
import { ChatRequestDynamicVariablePart, getPromptText } from '../../../common/requestParser/chatParserTypes.js';

suite('Cloud file attachment snapshots', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function file(name: string): IChatRequestFileEntry {
		return { kind: 'file', id: name, name, value: URI.file(`/Downloads/${name}`) };
	}

	function create(readFile: IFileService['readFile'], model?: ITextModel, ignored = false): ChatFileAttachmentSnapshots {
		return new ChatFileAttachmentSnapshots(
			upcastPartial<IFileService>({ readFile }),
			upcastPartial<ITextFileService>({ files: upcastPartial<ITextFileEditorModelManager>({ get: () => model && upcastPartial<ITextFileEditorModel>({ textEditorModel: model }) }) }),
			upcastPartial<ILanguageModelIgnoredFilesService>({ fileIsIgnored: async () => ignored }),
		);
	}

	test('captures device files without an extension allowlist, leaving host files and images unchanged', async () => {
		const reads: string[] = [];
		const prepare = create(async uri => {
			reads.push(uri.path);
			return upcastPartial<IFileContent>({ value: uri.path.endsWith('.csv') ? VSBuffer.fromString('id\n7') : VSBuffer.wrap(Uint8Array.of(0, 255, 128)) });
		});
		const hostFile = { ...file('remote.txt'), value: URI.parse('vscode-agent-host://cloud.example/src/remote.txt') };
		const image = { kind: 'image' as const, id: 'image', name: 'screen.png', value: Uint8Array.of(137, 80) };
		const entries = [file('data.csv'), file('binary.custom'), hostFile, image];
		const first = await prepare.prepare(entries, CancellationToken.None);
		const followup = await prepare.prepare(first, CancellationToken.None);
		assert.deepStrictEqual({ reads, followup }, {
			reads: ['/Downloads/data.csv', '/Downloads/binary.custom'],
			followup: [
				{ ...entries[0], snapshot: { data: 'aWQKNw==', contentType: 'text/csv' } },
				{ ...entries[1], snapshot: { data: 'AP+A', contentType: 'application/octet-stream' } },
				hostFile, image,
			],
		});
	});

	test('captures only selected text and replaces only the generated inline file link', async () => {
		const uri = URI.file('/Downloads/note.txt');
		const range = new Range(2, 1, 2, 4);
		const prepare = create(async () => assert.fail('must not read the whole file'), upcastPartial<ITextModel>({
			getValueInRange: selected => { assert.deepStrictEqual(selected, range); return 'yes'; },
			getValueLengthInRange: () => 3,
		}));
		const entry = { ...file('note.txt'), value: { uri, range } };
		const entries = await prepare.prepare([entry], CancellationToken.None);
		const mention = '#attachment:note.txt';
		const part = new ChatRequestDynamicVariablePart(new OffsetRange(0, mention.length), range, mention, entry.id, undefined, entry.value, undefined, undefined, false, false, undefined, true, `[note.txt](${uri})`);
		assert.deepStrictEqual({ entries, prompt: getPromptText({ parts: [part], text: mention }, entries).message }, {
			entries: [{ ...entry, snapshot: { data: 'eWVz', contentType: 'text/plain', selection: range } }], prompt: 'note.txt',
		});
	});

	test('rejects excluded and unreadable files rather than submitting a local path', async () => {
		const entries = [file('note.txt')];
		await assert.rejects(create(async () => assert.fail('must not read an excluded file'), undefined, true).prepare(entries, CancellationToken.None), /Could not attach note.txt: This file is excluded/);
		await assert.rejects(create(async () => { throw new Error('read failed'); }).prepare(entries, CancellationToken.None), /Could not attach note.txt: read failed/);
	});

	test('honors the combined file size limit, including snapshots retained on resend', async () => {
		const maxBytes = 16 * 1024 * 1024;
		const snapshot = { data: 'AAAA'.repeat(Math.floor(maxBytes / 3)) + 'AA==', contentType: 'application/octet-stream' };
		const prepare = create(async (_uri, options) => {
			assert.strictEqual(options?.limits?.size, 0);
			return upcastPartial<IFileContent>({ value: VSBuffer.wrap(Uint8Array.of(1)) });
		});
		const limit = await prepare.prepare([{ ...file('large'), snapshot }], CancellationToken.None);
		await assert.rejects(prepare.prepare([...limit, file('extra')], CancellationToken.None), /Could not attach extra:.*16 MB/);
	});
});
