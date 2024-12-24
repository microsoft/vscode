/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IWorkspaceTextEditDto } from '../../common/extHost.protocol.js';
import { mock } from '../../../../base/test/common/mock.js';
import { Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { FileSystemProviderCapabilities, IFileService } from '../../../../platform/files/common/files.js';
import { reviveWorkspaceEditDto } from '../../browser/mainThreadBulkEdits.js';
import { UriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentityService.js';
import { IWorkspaceTextEdit } from '../../../../editor/common/languages.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('MainThreadBulkEdits', function () {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('"Rename failed to apply edits" in monorepo with pnpm #158845', function () {


		const fileService = new class extends mock<IFileService>() {
			override onDidChangeFileSystemProviderCapabilities = Event.None;
			override onDidChangeFileSystemProviderRegistrations = Event.None;

			override hasProvider(uri: URI) {
				return true;
			}

			override hasCapability(resource: URI, capability: FileSystemProviderCapabilities): boolean {
				// if (resource.scheme === 'case' && capability === FileSystemProviderCapabilities.PathCaseSensitive) {
				// 	return false;
				// }
				// NO capabilities, esp not being case-sensitive
				return false;
			}
		};

		const uriIdentityService = new UriIdentityService(fileService);

		const edits: IWorkspaceTextEditDto[] = [
			{ resource: URI.from({ scheme: 'case', path: '/hello/WORLD/foo.txt' }), textEdit: { range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: 'sss' }, versionId: undefined },
			{ resource: URI.from({ scheme: 'case', path: '/heLLO/world/fOO.txt' }), textEdit: { range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: 'sss' }, versionId: undefined },
			{ resource: URI.from({ scheme: 'case', path: '/other/path.txt' }), textEdit: { range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: 'sss' }, versionId: undefined },
			{ resource: URI.from({ scheme: 'foo', path: '/other/path.txt' }), textEdit: { range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 }, text: 'sss' }, versionId: undefined },
		];


		const out = reviveWorkspaceEditDto({ edits }, uriIdentityService);

		assert.strictEqual((<IWorkspaceTextEdit>out.edits[0]).resource.path, '/hello/WORLD/foo.txt');
		assert.strictEqual((<IWorkspaceTextEdit>out.edits[1]).resource.path, '/hello/WORLD/foo.txt'); // the FIRST occurrence defined the shape!
		assert.strictEqual((<IWorkspaceTextEdit>out.edits[2]).resource.path, '/other/path.txt');
		assert.strictEqual((<IWorkspaceTextEdit>out.edits[3]).resource.path, '/other/path.txt');

		uriIdentityService.dispose();

	});
});
