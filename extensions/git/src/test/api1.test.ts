/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'mocha';
import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as sinon from 'sinon';
import randomNames = require('@joaomoreno/unique-names-generator');
import { commands, Disposable, LogOutputChannel, Uri, workspace } from 'vscode';
import { registerAPICommands } from '../api/api1';
import { GitExtensionImpl } from '../api/extension';
import type { Git } from '../git';
import { Model } from '../model';
import { Repository } from '../repository';

interface IModelRepositoryHarness {
	git: Pick<Git, 'getRepositoryRoot'>;
	logger: Pick<LogOutputChannel, 'trace' | 'warn'>;
	openRepositories: { repository: Repository }[];
	getRepositoryExact(repoPath: string): Promise<Repository | undefined>;
	getRepositoryRoot(repoPath: string): Promise<{ repositoryRoot: string; unsafeRepositoryMatch: RegExpMatchArray | null }>;
	shouldRepositoryBeIgnored(repositoryRoot: string): boolean;
}

const openModelRepository = Reflect.get(Model.prototype, 'openRepository') as (
	this: IModelRepositoryHarness, repoPath: string, openIfClosed: boolean, openIfParent: boolean
) => Promise<Repository | undefined>;

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
		openRepository = sinon.stub().resolves(repository);
		getRepository = sinon.stub().returns(repository);
		extension = new GitExtensionImpl();
		extension.model = {
			openRepository,
			getRepository
		} as Pick<Model, 'openRepository' | 'getRepository'> as Model;
		const registerCommand = sinon.stub(commands, 'registerCommand').callsFake(() => new Disposable(() => { }));
		registration = registerAPICommands(extension);
		generate = registerCommand.getCalls().find(call => call.args[0] === 'git.api.generateRandomBranchName')!.args[1];
		getConfiguration = sinon.stub(workspace, 'getConfiguration').callsFake((section, resource) => {
			assert.deepStrictEqual({ section, resource: resource instanceof Uri ? resource.toString() : undefined }, { section: 'git', resource: root.toString() });
			return {
				get: (key: string, defaultValue: string) => key === 'branchPrefix' ? 'feature/' : defaultValue
			} as ReturnType<typeof workspace.getConfiguration>;
		});
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
			lookups: getRepository.callCount,
			delegated: generateRandomBranchName.callCount,
			options: generateRandomBranchName.firstCall.args
		}, {
			result: { branchName: 'feature/calm-otter', branchPrefix: 'feature/' },
			open: [root.fsPath, true, true],
			lookups: 0,
			delegated: 1,
			options: [{ sanitize: true }]
		});
	});

	test('does not use an already open parent repository instead of opening the requested repository', async () => {
		getRepository.returns({ ...repository, root: Uri.file('/git-api').fsPath });
		openRepository.callsFake(async () => {
			getRepository.returns(repository);
			return repository;
		});
		assert.deepStrictEqual(await generate(root.toString()), {
			branchName: 'feature/calm-otter', branchPrefix: 'feature/'
		});
	});

	test('does not use an open parent when opening a nested repository is refused', async () => {
		openRepository.resolves(undefined);
		getRepository.returns({ ...repository, root: Uri.file('/git-api').fsPath });
		getConfiguration.callsFake(() => ({
			get: (key: string, defaultValue: string) => key === 'branchPrefix' ? 'parent/' : defaultValue
		} as ReturnType<typeof workspace.getConfiguration>));
		assert.deepStrictEqual({
			result: await generate(root.toString()),
			delegated: generateRandomBranchName.callCount
		}, { result: undefined, delegated: 0 });
	});

	test('uses the opened repository for a subdirectory or an alternate path to its root', async () => {
		const resources = [Uri.joinPath(root, 'src'), Uri.file('/git-api/alias')];
		getRepository.returns(undefined);
		const results = [];
		for (const resource of resources) {
			results.push(await generate(resource.toString()));
		}
		assert.deepStrictEqual({
			results,
			open: openRepository.getCalls().map(call => call.args)
		}, {
			results: resources.map(() => ({ branchName: 'feature/calm-otter', branchPrefix: 'feature/' })),
			open: resources.map(resource => [resource.fsPath, true, true])
		});
	});

	test('returns undefined when the repository cannot be opened', async () => {
		openRepository.resolves(undefined);
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
		openRepository.resolves(repository);
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
		openRepository.resolves(repository);
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

	test('sanitizes random names before checking collisions without changing the default generator', async () => {
		const getRefs = useRealRandomNameGenerator();
		const randomName = sinon.stub(randomNames, 'uniqueNamesGenerator').returns('quiet-fox');
		randomName.onFirstCall().returns('calm-otter');
		getRefs.callsFake(async ({ pattern }: { pattern: string }) =>
			pattern === 'refs/heads/feature_calm-otter' ? [{ name: 'feature_calm-otter' }] : []);

		const result = await generate(root.toString());
		const apiLookups = getRefs.getCalls().map(call => call.args);
		const defaultName = await repository.generateRandomBranchName();
		assert.deepStrictEqual({ result, apiLookups, defaultName }, {
			result: { branchName: 'feature_quiet-fox', branchPrefix: 'feature ' },
			apiLookups: [
				[{ pattern: 'refs/heads/feature_calm-otter' }],
				[{ pattern: 'refs/heads/feature_quiet-fox' }]
			],
			defaultName: 'feature quiet-fox'
		});
	});

	test('does not return a sanitized candidate that persistently collides', async () => {
		const getRefs = useRealRandomNameGenerator();
		sinon.stub(randomNames, 'uniqueNamesGenerator').returns('calm-otter');
		getRefs.resolves([{ name: 'feature_calm-otter' }]);
		assert.deepStrictEqual({
			result: await generate(root.toString()),
			lookups: getRefs.getCalls().map(call => call.args)
		}, {
			result: undefined,
			lookups: Array.from({ length: 5 }, () => [{ pattern: 'refs/heads/feature_calm-otter' }])
		});
	});

	function useRealRandomNameGenerator(): sinon.SinonStub {
		const getRefs = sinon.stub().resolves([]);
		repository = {
			root: root.fsPath,
			getRefs,
			generateRandomBranchName: Repository.prototype.generateRandomBranchName
		} as Pick<Repository, 'root' | 'getRefs' | 'generateRandomBranchName'> as Repository;
		openRepository.resolves(repository);
		getRepository.returns(repository);
		getConfiguration.callsFake(() => {
			const values: Record<string, boolean | string | string[]> = {
				'branchRandomName.enable': true,
				'branchPrefix': 'feature ',
				'branchWhitespaceChar': '_',
				'branchRandomName.dictionary': ['numbers', 'numbers']
			};
			return { get: (key: string) => values[key] } as ReturnType<typeof workspace.getConfiguration>;
		});
		return getRefs;
	}

	suite('repository resolution', () => {
		let directory: string;
		let model: IModelRepositoryHarness;
		let resolveRoot: sinon.SinonStub;
		let repositoryRoot: string;

		setup(async () => {
			directory = await fs.mkdtemp(path.join(os.tmpdir(), 'git-api-naming-'));
			repositoryRoot = path.join(directory, 'repository');
			await fs.mkdir(path.join(repositoryRoot, 'src'), { recursive: true });
			repository = { root: repositoryRoot } as Pick<Repository, 'root'> as Repository;
			resolveRoot = sinon.stub().resolves(repositoryRoot);
			model = {
				git: { getRepositoryRoot: resolveRoot },
				logger: { trace: () => { }, warn: () => { } },
				openRepositories: [{ repository }],
				getRepositoryExact: Reflect.get(Model.prototype, 'getRepositoryExact') as IModelRepositoryHarness['getRepositoryExact'],
				getRepositoryRoot: Reflect.get(Model.prototype, 'getRepositoryRoot') as IModelRepositoryHarness['getRepositoryRoot'],
				shouldRepositoryBeIgnored: Reflect.get(Model.prototype, 'shouldRepositoryBeIgnored') as IModelRepositoryHarness['shouldRepositoryBeIgnored'],
			};
			getConfiguration.callsFake(() => ({
				get: (key: string, defaultValue: boolean | string[]) =>
					key === 'enabled' ? true : key === 'ignoredRepositories' ? [] : defaultValue
			} as ReturnType<typeof workspace.getConfiguration>));
		});

		teardown(async () => {
			await fs.rm(directory, { recursive: true, force: true });
		});

		test('returns an already-open exact repository without root discovery', async () => {
			assert.deepStrictEqual({
				result: await openModelRepository.call(model, repositoryRoot, true, true),
				discovered: resolveRoot.callCount
			}, { result: repository, discovered: 0 });
		});

		test('returns the resolved repository when opening a subdirectory', async () => {
			const subdirectory = path.join(repositoryRoot, 'src');
			assert.deepStrictEqual({
				result: await openModelRepository.call(model, subdirectory, true, true),
				discovered: resolveRoot.firstCall.args
			}, { result: repository, discovered: [subdirectory] });
		});

		test('returns an already-open repository through a filesystem alias', async () => {
			const alias = path.join(directory, 'alias');
			await fs.symlink(repositoryRoot, alias, process.platform === 'win32' ? 'junction' : 'dir');
			assert.deepStrictEqual({
				result: await openModelRepository.call(model, alias, true, true),
				discovered: resolveRoot.callCount
			}, { result: repository, discovered: 0 });
		});

		test('returns undefined for an ignored nested repository instead of its open parent', async () => {
			const nested = path.join(repositoryRoot, 'nested');
			await fs.mkdir(nested);
			resolveRoot.resolves(nested);
			getConfiguration.callsFake(() => ({
				get: (key: string, defaultValue: boolean | string[]) =>
					key === 'enabled' ? true : key === 'ignoredRepositories' ? [nested] : defaultValue
			} as ReturnType<typeof workspace.getConfiguration>));
			assert.deepStrictEqual({
				result: await openModelRepository.call(model, nested, true, true),
				discovered: resolveRoot.firstCall.args
			}, { result: undefined, discovered: [nested] });
		});
	});
});
