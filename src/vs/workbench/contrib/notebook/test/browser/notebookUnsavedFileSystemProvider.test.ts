/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { timeout } from '../../../../../base/common/async.js';
import { bufferToStream, VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../base/common/event.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileChangesEvent, FileChangeType } from '../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { SnapshotContext } from '../../../../services/workingCopy/common/fileWorkingCopy.js';
import { NotebookTextModel } from '../../common/model/notebookTextModel.js';
import { INotebookService } from '../../common/notebookService.js';
import { NotebookUnsavedFileSystemProvider } from '../../common/notebookUnsavedFileSystemProvider.js';

suite('NotebookUnsavedFileSystemProvider', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('serves an open notebook readonly as it would be saved, and reports its changes', async () => {
		const notebookUri = URI.file('/workspace/analysis.ipynb');
		const onDidChangeContent = disposables.add(new Emitter<void>());
		const onWillDispose = disposables.add(new Emitter<void>());
		let versionId = 1;
		let serialized = '{ "cells": ["unsaved edit"] }';
		const snapshotContexts: SnapshotContext[] = [];

		const notebook = { uri: notebookUri, get versionId() { return versionId; }, onDidChangeContent: onDidChangeContent.event, onWillDispose: onWillDispose.event } as unknown as NotebookTextModel;
		const notebookService = new class extends mock<INotebookService>() {
			override getNotebookTextModel(uri: URI) {
				return isEqual(uri, notebookUri) ? notebook : undefined;
			}
			override async createNotebookTextDocumentSnapshot(uri: URI, context: SnapshotContext) {
				snapshotContexts.push(context);
				return bufferToStream(VSBuffer.fromString(serialized));
			}
		};

		const fileService = disposables.add(new FileService(new NullLogService()));
		disposables.add(fileService.registerProvider(NotebookUnsavedFileSystemProvider.SCHEME, disposables.add(new NotebookUnsavedFileSystemProvider(notebookService))));

		const changes: FileChangesEvent[] = [];
		disposables.add(fileService.onDidFilesChange(e => changes.push(e)));

		const unsaved = NotebookUnsavedFileSystemProvider.toUnsaved(notebookUri);
		const stat = await fileService.stat(unsaved);
		assert.deepStrictEqual({
			name: basename(unsaved),
			notebook: NotebookUnsavedFileSystemProvider.fromUnsaved(unsaved).toString(),
			content: (await fileService.readFile(unsaved)).value.toString(),
			snapshotContexts,
			readonly: stat.readonly
		}, {
			name: 'analysis.ipynb',
			notebook: notebookUri.toString(),
			content: '{ "cells": ["unsaved edit"] }',
			snapshotContexts: [SnapshotContext.Save],
			readonly: true
		});
		await assert.rejects(() => fileService.writeFile(unsaved, VSBuffer.fromString('changed')));

		// a change of the notebook is reported, also without watching, and is served with a new version
		versionId = 2;
		serialized = '{ "cells": ["unsaved edit", "another edit"] }';
		onDidChangeContent.fire();
		await timeout(0);
		assert.deepStrictEqual(changes.map(e => e.contains(unsaved, FileChangeType.UPDATED)), [true]);
		assert.notStrictEqual((await fileService.stat(unsaved)).etag, stat.etag);
		assert.strictEqual((await fileService.readFile(unsaved)).value.toString(), '{ "cells": ["unsaved edit", "another edit"] }');

		// a notebook that is closed is no longer reported or served
		onWillDispose.fire();
		onDidChangeContent.fire();
		await timeout(0);
		assert.strictEqual(changes.length, 1);
		await assert.rejects(() => fileService.readFile(NotebookUnsavedFileSystemProvider.toUnsaved(URI.file('/workspace/other.ipynb'))));
	});
});
