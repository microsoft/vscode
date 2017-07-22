/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import fs = require('fs');
import path = require('path');
import assert = require('assert');

import { StatResolver } from 'vs/workbench/services/files/node/fileService';
import uri from 'vs/base/common/uri';
import { isLinux } from 'vs/base/common/platform';
import utils = require('vs/workbench/services/files/test/node/utils');

function create(relativePath: string): StatResolver {
	let basePath = require.toUrl('./fixtures/resolver');
	let absolutePath = relativePath ? path.join(basePath, relativePath) : basePath;
	let fsStat = fs.statSync(absolutePath);

	return new StatResolver(uri.file(absolutePath), fsStat.isDirectory(), fsStat.mtime.getTime(), fsStat.size, false);
}

function toResource(relativePath: string): uri {
	let basePath = require.toUrl('./fixtures/resolver');
	let absolutePath = relativePath ? path.join(basePath, relativePath) : basePath;

	return uri.file(absolutePath);
}

suite('Stat Resolver', () => {

	test('resolve file', function (done: () => void) {
		let resolver = create('/index.html');
		resolver.resolve(null).then(result => {
			assert.ok(!result.isDirectory);
			assert.equal(result.name, 'index.html');
			assert.ok(!!result.etag);

			resolver = create('examples');
			return resolver.resolve(null).then(result => {
				assert.ok(result.isDirectory);
			});
		})
			.done(() => done(), done);
	});

	test('resolve directory', function (done: () => void) {
		let testsElements = ['examples', 'other', 'index.html', 'site.css'];

		let resolver = create('/');

		resolver.resolve(null).then(result => {
			assert.ok(result);
			assert.ok(result.children);
			assert.ok(result.hasChildren);
			assert.ok(result.isDirectory);
			assert.equal(result.children.length, testsElements.length);

			assert.ok(result.children.every((entry) => {
				return testsElements.some((name) => {
					return path.basename(entry.resource.fsPath) === name;
				});
			}));

			result.children.forEach((value) => {
				assert.ok(path.basename(value.resource.fsPath));
				if (['examples', 'other'].indexOf(path.basename(value.resource.fsPath)) >= 0) {
					assert.ok(value.isDirectory);
					assert.ok(value.hasChildren);
				} else if (path.basename(value.resource.fsPath) === 'index.html') {
					assert.ok(!value.isDirectory);
					assert.ok(value.hasChildren === false);
				} else if (path.basename(value.resource.fsPath) === 'site.css') {
					assert.ok(!value.isDirectory);
					assert.ok(value.hasChildren === false);
				} else {
					assert.ok(!'Unexpected value ' + path.basename(value.resource.fsPath));
				}
			});
		})
			.done(() => done(), done);
	});

	test('resolve directory - resolveTo single directory', function (done: () => void) {
		let resolver = create('/');

		resolver.resolve({ resolveTo: [toResource('other/deep')] }).then(result => {
			assert.ok(result);
			assert.ok(result.children);
			assert.ok(result.hasChildren);
			assert.ok(result.isDirectory);

			let children = result.children;
			assert.equal(children.length, 4);

			let other = utils.getByName(result, 'other');
			assert.ok(other);
			assert.ok(other.hasChildren);

			let deep = utils.getByName(other, 'deep');
			assert.ok(deep);
			assert.ok(deep.hasChildren);
			assert.equal(deep.children.length, 4);
		})
			.done(() => done(), done);
	});

	test('resolve directory - resolveTo single directory - mixed casing', function (done: () => void) {
		let resolver = create('/');

		resolver.resolve({ resolveTo: [toResource('other/Deep')] }).then(result => {
			assert.ok(result);
			assert.ok(result.children);
			assert.ok(result.hasChildren);
			assert.ok(result.isDirectory);

			let children = result.children;
			assert.equal(children.length, 4);

			let other = utils.getByName(result, 'other');
			assert.ok(other);
			assert.ok(other.hasChildren);

			let deep = utils.getByName(other, 'deep');
			if (isLinux) { // Linux has case sensitive file system
				assert.ok(deep);
				assert.ok(deep.hasChildren);
				assert.ok(!deep.children); // not resolved because we got instructed to resolve other/Deep with capital D
			} else {
				assert.ok(deep);
				assert.ok(deep.hasChildren);
				assert.equal(deep.children.length, 4);
			}
		})
			.done(() => done(), done);
	});

	test('resolve directory - resolveTo multiple directories', function (done: () => void) {
		let resolver = create('/');

		resolver.resolve({ resolveTo: [toResource('other/deep'), toResource('examples')] }).then(result => {
			assert.ok(result);
			assert.ok(result.children);
			assert.ok(result.hasChildren);
			assert.ok(result.isDirectory);

			let children = result.children;
			assert.equal(children.length, 4);

			let other = utils.getByName(result, 'other');
			assert.ok(other);
			assert.ok(other.hasChildren);

			let deep = utils.getByName(other, 'deep');
			assert.ok(deep);
			assert.ok(deep.hasChildren);
			assert.equal(deep.children.length, 4);

			let examples = utils.getByName(result, 'examples');
			assert.ok(examples);
			assert.ok(examples.hasChildren);
			assert.equal(examples.children.length, 4);
		})
			.done(() => done(), done);
	});

	test('resolve directory - resolveSingleChildFolders', function (done: () => void) {
		let resolver = create('/other');

		resolver.resolve({ resolveSingleChildDescendants: true }).then(result => {
			assert.ok(result);
			assert.ok(result.children);
			assert.ok(result.hasChildren);
			assert.ok(result.isDirectory);

			let children = result.children;
			assert.equal(children.length, 1);

			let deep = utils.getByName(result, 'deep');
			assert.ok(deep);
			assert.ok(deep.hasChildren);
			assert.equal(deep.children.length, 4);
		})
			.done(() => done(), done);
	});
});