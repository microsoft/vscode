/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as sinon from 'sinon';
import { commands, Disposable, Uri, workspace } from 'vscode';
import { registerAPICommands } from '../api/api1';
import { GitExtensionImpl } from '../api/extension';
import type { Model } from '../model';
import { Repository } from '../repository';

suite('git.api.generateRandomBranchName', () => {
	const root = Uri.file('/git-api/repository');
	let extension: GitExtensionImpl;
	let registration: Disposable;
	let generate: (uri: string) => Promise<{ branchName: string; branchPrefix: string } | undefined>;
	let repository: Repository;
	let openRepository: sinon.SinonStub;
	let getRepository: sinon.SinonStub;
	let generateRandomBranchName: sinon.SinonStub;
	let getConfiguration: sinon.SinonStub;

	setup(() => {
		generateRandomBranchName = sinon.stub().resolves('feature/calm-otter');
		repository = {
			root: root.fsPath,
			generateRandomBranchName
		} as Pick<Repository, 'root' | 'generateRandomBranchName'> as Repository;
		openRepository = sinon.stub().resolves();
		getRepository = sinon.stub().returns(repository);
		extension = new GitExtensionImpl();
		extension.model = {
			openRepository,
			getRepository
		} as Pick<Model, 'openRepository' | 'getRepository'> as Model;
		const registerCommand = sinon.stub(commands, 'registerCommand').callsFake(() => new Disposable(() => { }));
		registration = registerAPICommands(extension);
		generate = registerCommand.getCalls().find(call => call.args[0] === 'git.api.generateRandomBranchName')!.args[1];
		getConfiguration = sinon.stub(workspace, 'getConfiguration').withArgs('git', sinon.match((resource: Uri) => resource.toString() === root.toString())).returns({
			get: (key: string, defaultValue: string) => key === 'branchPrefix' ? 'feature/' : defaultValue
		} as ReturnType<typeof workspace.getConfiguration>);
	});

	teardown(() => {
		registration.dispose();
		extension.model = undefined;
		sinon.restore();
	});

	test('opens the requested repository and returns the complete prefixed name with scoped prefix', async () => {
		const result = await generate(root.toString());
		assert.deepStrictEqual({
			result,
			open: openRepository.firstCall.args,
			lookup: getRepository.firstCall.args.map((uri: Uri) => uri.toString()),
			delegated: generateRandomBranchName.callCount,
			openedBeforeLookup: openRepository.calledBefore(getRepository)
		}, {
			result: { branchName: 'feature/calm-otter', branchPrefix: 'feature/' },
			open: [root.fsPath, true, true],
			lookup: [root.toString()],
			delegated: 1,
			openedBeforeLookup: true
		});
	});

	test('does not use an already open parent repository instead of opening the requested repository', async () => {
		getRepository.returns({ ...repository, root: Uri.file('/git-api').fsPath });
		openRepository.callsFake(async () => { getRepository.returns(repository); });
		assert.deepStrictEqual(await generate(root.toString()), {
			branchName: 'feature/calm-otter', branchPrefix: 'feature/'
		});
	});

	test('returns undefined when the repository cannot be opened', async () => {
		getRepository.returns(undefined);
		assert.deepStrictEqual({
			result: await generate(root.toString()),
			delegated: generateRandomBranchName.callCount
		}, { result: undefined, delegated: 0 });
	});

	test('returns undefined when Git is unavailable or the URI scheme is unsupported', async () => {
		const unsupported = await generate('vscode-remote://host/git-api/repository');
		extension.model = undefined;
		assert.deepStrictEqual({
			unsupported,
			unavailable: await generate(root.toString()),
			opened: openRepository.callCount
		}, { unsupported: undefined, unavailable: undefined, opened: 0 });
	});

	test('preserves an unavailable generated name', async () => {
		generateRandomBranchName.resolves(undefined);
		assert.strictEqual(await generate(root.toString()), undefined);
	});

	test('propagates repository opening and generation failures', async () => {
		const error = new Error('Git failed');
		openRepository.rejects(error);
		await assert.rejects(generate(root.toString()), candidate => candidate === error);
		openRepository.resolves();
		generateRandomBranchName.rejects(error);
		await assert.rejects(generate(root.toString()), candidate => candidate === error);
	});

	test('delegates disabled random names and repeated dictionary entries to the existing generator', async () => {
		let enabled = false;
		const getRefs = sinon.stub().resolves([]);
		repository = {
			root: root.fsPath,
			getRefs,
			generateRandomBranchName: Repository.prototype.generateRandomBranchName
		} as Pick<Repository, 'root' | 'getRefs' | 'generateRandomBranchName'> as Repository;
		getRepository.returns(repository);
		getConfiguration.callsFake((section: string, resource: Uri) => {
			assert.deepStrictEqual({ section, resource: resource?.toString() }, { section: 'git', resource: root.toString() });
			const values: Record<string, boolean | string | string[]> = {
				'branchRandomName.enable': enabled,
				'branchPrefix': 'feature/',
				'branchWhitespaceChar': '_',
				'branchRandomName.dictionary': ['numbers', 'numbers']
			};
			return {
				get: (key: string) => values[key]
			} as ReturnType<typeof workspace.getConfiguration>;
		});
		const disabled = await generate(root.toString());
		enabled = true;
		const result = await generate(root.toString());
		assert.deepStrictEqual({
			disabled,
			prefix: result?.branchPrefix,
			matchesRepeatedDictionary: /^feature\/\d{3}_\d{3}$/.test(result?.branchName ?? ''),
			refs: getRefs.firstCall.args
		}, {
			disabled: undefined,
			prefix: 'feature/',
			matchesRepeatedDictionary: true,
			refs: [{ pattern: `refs/heads/${result?.branchName}` }]
		});
	});
});
