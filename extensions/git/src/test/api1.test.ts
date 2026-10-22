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
	let generateRandomBranchName: sinon.SinonStub;
	let getConfiguration: sinon.SinonStub;

	setup(() => {
		generateRandomBranchName = sinon.stub().resolves('feature/calm-otter');
		repository = {
			root: root.fsPath,
			generateRandomBranchName
		} as Pick<Repository, 'root' | 'generateRandomBranchName'> as Repository;
		openRepository = sinon.stub().resolves(repository);
		extension = new GitExtensionImpl();
		extension.model = { openRepository } as Pick<Model, 'openRepository'> as Model;
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
			options: generateRandomBranchName.firstCall.args
		}, {
			result: { branchName: 'feature/calm-otter', branchPrefix: 'feature/' },
			open: [root.fsPath, true, true],
			options: [{ sanitize: true }]
		});
	});

	test('does not use an open parent when opening a nested repository is refused', async () => {
		openRepository.resolves(undefined);
		extension.model = {
			openRepository,
			getRepository: sinon.stub().returns({ ...repository, root: Uri.file('/git-api').fsPath })
		} as Pick<Model, 'openRepository' | 'getRepository'> as Model;
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

	test('propagates repository opening and generation failures', async () => {
		const error = new Error('Git failed');
		openRepository.rejects(error);
		await assert.rejects(generate(root.toString()), candidate => candidate === error);
		openRepository.resolves(repository);
		generateRandomBranchName.rejects(error);
		await assert.rejects(generate(root.toString()), candidate => candidate === error);
	});

	test('delegates disabled random names and repeated dictionary entries to the existing generator', async () => {
		const { getRefs, settings } = useRealRandomNameGenerator();
		settings['branchRandomName.enable'] = false;
		const disabled = await generate(root.toString());
		settings['branchRandomName.enable'] = true;
		const result = await generate(root.toString());
		assert.deepStrictEqual({
			disabled,
			prefix: result?.branchPrefix,
			matchesRepeatedDictionary: /^feature_\d{3}_\d{3}$/.test(result?.branchName ?? ''),
			refs: getRefs.firstCall.args
		}, {
			disabled: undefined,
			prefix: 'feature_',
			matchesRepeatedDictionary: true,
			refs: [{ pattern: `refs/heads/${result?.branchName}` }]
		});
	});

	test('sanitizes random names before checking collisions without changing the default generator', async () => {
		const { getRefs } = useRealRandomNameGenerator();
		const randomName = sinon.stub(randomNames, 'uniqueNamesGenerator').returns('quiet-fox');
		randomName.onFirstCall().returns('calm-otter');
		getRefs.callsFake(async ({ pattern }: { pattern: string }) =>
			pattern === 'refs/heads/feature_calm-otter' ? [{ name: 'feature_calm-otter' }] : []);

		const result = await generate(root.toString());
		const apiLookups = getRefs.getCalls().map(call => call.args);
		const defaultName = await repository.generateRandomBranchName();
		assert.deepStrictEqual({ result, apiLookups, defaultName }, {
			result: { branchName: 'feature_quiet-fox', branchPrefix: 'feature_' },
			apiLookups: [
				[{ pattern: 'refs/heads/feature_calm-otter' }],
				[{ pattern: 'refs/heads/feature_quiet-fox' }]
			],
			defaultName: 'feature quiet-fox'
		});
	});

	test('sanitizes prefixes in branch context, preserving trailing separators', async () => {
		const { settings } = useRealRandomNameGenerator();
		sinon.stub(randomNames, 'uniqueNamesGenerator').returns('calm-otter');
		const results = [];
		for (const prefix of ['feature/', 'feature.', '  --feature ', '']) {
			settings.branchPrefix = prefix;
			results.push(await generate(root.toString()));
		}
		assert.deepStrictEqual(results, [
			{ branchName: 'feature/calm-otter', branchPrefix: 'feature/' },
			{ branchName: 'feature.calm-otter', branchPrefix: 'feature.' },
			{ branchName: 'feature_calm-otter', branchPrefix: 'feature_' },
			{ branchName: 'calm-otter', branchPrefix: '' },
		]);
	});

	test('does not return a sanitized candidate that persistently collides', async () => {
		const { getRefs } = useRealRandomNameGenerator();
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

	function useRealRandomNameGenerator() {
		const getRefs = sinon.stub().resolves([]);
		repository = {
			root: root.fsPath,
			getRefs,
			generateRandomBranchName: Repository.prototype.generateRandomBranchName
		} as Pick<Repository, 'root' | 'getRefs' | 'generateRandomBranchName'> as Repository;
		openRepository.resolves(repository);
		const settings: Record<string, boolean | string | string[]> = {
			'branchRandomName.enable': true,
			'branchPrefix': 'feature ',
			'branchWhitespaceChar': '_',
			'branchRandomName.dictionary': ['numbers', 'numbers']
		};
		getConfiguration.returns({ get: (key: string) => settings[key] } as ReturnType<typeof workspace.getConfiguration>);
		return { getRefs, settings };
	}

	suite('repository resolution', () => {
		let directory: string;
		let model: IModelRepositoryHarness;
		let resolveRoot: sinon.SinonStub;
		let repositoryRoot: string;

		setup(async () => {
			directory = await fs.mkdtemp(path.join(os.tmpdir(), 'git-api-naming-'));
			const canonicalDirectory = path.join(directory, 'canonical');
			await fs.mkdir(canonicalDirectory);
			const workspaceDirectory = path.join(directory, 'workspace');
			await fs.symlink(canonicalDirectory, workspaceDirectory, process.platform === 'win32' ? 'junction' : 'dir');
			repositoryRoot = path.join(workspaceDirectory, 'repository');
			await fs.mkdir(path.join(repositoryRoot, 'src'), { recursive: true });
			repository = {
				root: repositoryRoot,
				rootRealPath: await fs.realpath(repositoryRoot)
			} as Pick<Repository, 'root' | 'rootRealPath'> as Repository;
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
