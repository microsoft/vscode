/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as sinon from 'sinon';
import { Repository } from 'vs/workbench/parts/git/node/git.lib';
import { RawGitService } from 'vs/workbench/parts/git/node/RawGitService';
import { TPromise } from 'vs/base/common/winjs.base';
import { IFileOperationResult, FileOperationResult } from 'vs/platform/files/common/files';

suite('Git - RawGitService', () => {
	let repo: Repository;
	let service: RawGitService;

	setup(() => {
		repo = sinon.createStubInstance(Repository) as any;
		service = new RawGitService(repo);
	});

	suite('show', () => {
		test('returns error description if file is binary', () => {
			(repo.buffer as sinon.SinonStub).withArgs(':some.gif')
				.returns(TPromise.wrapError<IFileOperationResult>({
					message: 'file is binary',
					fileOperationResult: FileOperationResult.FILE_IS_BINARY
				}));

			return service.show('some.gif').then(res => {
				// TODO: third duplication, maybe extract to some constant?
				assert.equal(res, 'The file will not be displayed in the editor because it is either binary, very large or uses an unsupported text encoding.');
			});
		});
	});
});
