/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';


import assert = require('assert');
import Git = require('vs/workbench/parts/git/common/git');
import Model = require('vs/workbench/parts/git/common/gitModel');

suite('Git - StatusModel', () => {
	var model: Git.IStatusModel;

	setup(() => {
		model = new Model.StatusModel();
	});

	teardown(() => {
		model = null;
	});

	test('simple update', () => {
		model.update([
			{ path: 'hello', x: '?', y: '?', mimetype: 'application/octet-stream' }
		]);

		var index = model.getIndexStatus().all();
		var workingTree = model.getWorkingTreeStatus().all();
		var merge = model.getMergeStatus().all();

		assert.equal(index.length, 0);
		assert.equal(workingTree.length, 1);
		assert.equal(merge.length, 0);
	});

	test('simple update same file twice', () => {
		model.update([
			{ path: 'hello', x: '?', y: '?', mimetype: 'application/octet-stream' }
		]);

		var index = model.getIndexStatus().all();
		var workingTree = model.getWorkingTreeStatus().all();
		var merge = model.getMergeStatus().all();

		assert.equal(index.length, 0);
		assert.equal(workingTree.length, 1);
		assert.equal(merge.length, 0);

		model.update([
			{ path: 'hello', x: '?', y: '?', mimetype: 'application/octet-stream' }
		]);

		index = model.getIndexStatus().all();
		workingTree = model.getWorkingTreeStatus().all();
		merge = model.getMergeStatus().all();

		assert.equal(index.length, 0);
		assert.equal(workingTree.length, 1);
		assert.equal(merge.length, 0);
	});

	test('simple update same file twice, first untracked, then ignored', () => {
		model.update([
			{ path: 'hello', x: '?', y: '?', mimetype: 'application/octet-stream' }
		]);

		var index = model.getIndexStatus().all();
		var workingTree = model.getWorkingTreeStatus().all();
		var merge = model.getMergeStatus().all();

		assert.equal(index.length, 0);
		assert.equal(workingTree.length, 1);
		assert.equal(merge.length, 0);

		model.update([
			{ path: 'hello', x: '!', y: '!', mimetype: 'application/octet-stream' }
		]);

		index = model.getIndexStatus().all();
		workingTree = model.getWorkingTreeStatus().all();
		merge = model.getMergeStatus().all();

		assert.equal(index.length, 0);
		assert.equal(workingTree.length, 1);
		assert.equal(merge.length, 0);
	});

	test('same file, both modified in index, deleted in working tree', () => {
		model.update([
			{ path: 'hello', x: 'M', y: 'D', mimetype: 'application/octet-stream' }
		]);

		var index = model.getIndexStatus().all();
		var workingTree = model.getWorkingTreeStatus().all();
		var merge = model.getMergeStatus().all();

		assert.equal(index.length, 1);
		assert.equal(workingTree.length, 1);
		assert.equal(merge.length, 0);

		assert.equal(index[0].getPath(), 'hello');
		assert.equal(index[0].getStatus(), Git.Status.INDEX_MODIFIED);

		assert.equal(workingTree[0].getPath(), 'hello');
		assert.equal(workingTree[0].getStatus(), Git.Status.DELETED);
	});

	test('index and working tree matches', () => {
		model.update([
			{ path: 'f1', x: 'M', y: ' ', mimetype: 'application/octet-stream' },
			{ path: 'f2', x: 'A', y: ' ', mimetype: 'application/octet-stream' },
			{ path: 'f3', x: 'R', y: ' ', mimetype: 'application/octet-stream' },
			{ path: 'f4', x: 'C', y: ' ', mimetype: 'application/octet-stream' }
		]);

		var index = model.getIndexStatus().all();
		var workingTree = model.getWorkingTreeStatus().all();
		var merge = model.getMergeStatus().all();

		assert.equal(index.length, 4);
		assert.equal(workingTree.length, 0);
		assert.equal(merge.length, 0);

		assert.equal(index[0].getStatus(), Git.Status.INDEX_MODIFIED);
		assert.equal(index[1].getStatus(), Git.Status.INDEX_ADDED);
		assert.equal(index[2].getStatus(), Git.Status.INDEX_RENAMED);
		assert.equal(index[3].getStatus(), Git.Status.INDEX_COPIED);
	});

	test('work tree changed since index', () => {
		model.update([
			{ path: 'f1', x: ' ', y: 'M', mimetype: 'application/octet-stream' },
			{ path: 'f2', x: 'M', y: 'M', mimetype: 'application/octet-stream' },
			{ path: 'f3', x: 'A', y: 'M', mimetype: 'application/octet-stream' },
			{ path: 'f4', x: 'R', y: 'M', mimetype: 'application/octet-stream' },
			{ path: 'f5', x: 'C', y: 'M', mimetype: 'application/octet-stream' }
		]);

		var index = model.getIndexStatus().all();
		var workingTree = model.getWorkingTreeStatus().all();
		var merge = model.getMergeStatus().all();

		assert.equal(index.length, 4);
		assert.equal(workingTree.length, 5);
		assert.equal(merge.length, 0);

		assert.equal(index[0].getStatus(), Git.Status.INDEX_MODIFIED);
		assert.equal(index[1].getStatus(), Git.Status.INDEX_ADDED);
		assert.equal(index[2].getStatus(), Git.Status.INDEX_RENAMED);
		assert.equal(index[3].getStatus(), Git.Status.INDEX_COPIED);

		assert.equal(workingTree[0].getStatus(), Git.Status.MODIFIED);
		assert.equal(workingTree[1].getStatus(), Git.Status.MODIFIED);
		assert.equal(workingTree[2].getStatus(), Git.Status.MODIFIED);
		assert.equal(workingTree[3].getStatus(), Git.Status.MODIFIED);
		assert.equal(workingTree[3].getStatus(), Git.Status.MODIFIED);
	});

	test('deleted in work tree', () => {
		model.update([
			{ path: 'f1', x: ' ', y: 'D', mimetype: 'application/octet-stream' },
			{ path: 'f2', x: 'M', y: 'D', mimetype: 'application/octet-stream' },
			{ path: 'f3', x: 'A', y: 'D', mimetype: 'application/octet-stream' },
			{ path: 'f4', x: 'R', y: 'D', mimetype: 'application/octet-stream' },
			{ path: 'f5', x: 'C', y: 'D', mimetype: 'application/octet-stream' }
		]);

		var index = model.getIndexStatus().all();
		var workingTree = model.getWorkingTreeStatus().all();
		var merge = model.getMergeStatus().all();

		assert.equal(index.length, 4);
		assert.equal(workingTree.length, 5);
		assert.equal(merge.length, 0);

		assert.equal(index[0].getStatus(), Git.Status.INDEX_MODIFIED);
		assert.equal(index[1].getStatus(), Git.Status.INDEX_ADDED);
		assert.equal(index[2].getStatus(), Git.Status.INDEX_RENAMED);
		assert.equal(index[3].getStatus(), Git.Status.INDEX_COPIED);

		assert.equal(workingTree[0].getStatus(), Git.Status.DELETED);
		assert.equal(workingTree[1].getStatus(), Git.Status.DELETED);
		assert.equal(workingTree[2].getStatus(), Git.Status.DELETED);
		assert.equal(workingTree[3].getStatus(), Git.Status.DELETED);
		assert.equal(workingTree[3].getStatus(), Git.Status.DELETED);
	});
});
