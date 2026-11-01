/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as path from 'path';
import { Uri } from 'vscode';
import { getRepositoryForSCMCommand } from '../commands';
import type { Repository } from '../repository';

suite('git command repository routing', () => {
	const parentRoot = path.resolve('test-parent-repository');
	const submoduleRoot = path.join(parentRoot, 'deps', 'example');
	const parentRepository = { root: parentRoot } as Repository;
	const submoduleRepository = { root: submoduleRoot } as Repository;
	const submoduleUri = Uri.file(submoduleRoot);

	test('uses the parent for a closed submodule', () => {
		const repository = getRepositoryForSCMCommand({
			getRepository: () => undefined,
			getRepositoryForSubmodule: () => parentRepository
		}, submoduleUri);

		assert.strictEqual(repository, parentRepository);
	});

	test('uses the parent for an open submodule gitlink', () => {
		const repository = getRepositoryForSCMCommand({
			getRepository: () => submoduleRepository,
			getRepositoryForSubmodule: () => parentRepository
		}, submoduleUri);

		assert.strictEqual(repository, parentRepository);
	});

	test('keeps regular files in their owning repository', () => {
		const resource = Uri.file(path.join(submoduleRoot, 'src', 'index.ts'));
		let submoduleLookupCalled = false;

		const repository = getRepositoryForSCMCommand({
			getRepository: () => submoduleRepository,
			getRepositoryForSubmodule: () => {
				submoduleLookupCalled = true;
				return parentRepository;
			}
		}, resource);

		assert.strictEqual(repository, submoduleRepository);
		assert.strictEqual(submoduleLookupCalled, false);
	});

	test('keeps normal repository roots when there is no parent submodule', () => {
		const repository = getRepositoryForSCMCommand({
			getRepository: () => parentRepository,
			getRepositoryForSubmodule: () => undefined
		}, Uri.file(parentRoot));

		assert.strictEqual(repository, parentRepository);
	});

	test('does not route unrelated files to a repository', () => {
		const repository = getRepositoryForSCMCommand({
			getRepository: () => undefined,
			getRepositoryForSubmodule: () => undefined
		}, Uri.file(path.resolve('unrelated.txt')));

		assert.strictEqual(repository, undefined);
	});
});
