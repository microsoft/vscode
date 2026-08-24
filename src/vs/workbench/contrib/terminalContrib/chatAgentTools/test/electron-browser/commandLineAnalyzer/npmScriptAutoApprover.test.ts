/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import type { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { IWorkspaceContextService, toWorkspaceFolder } from '../../../../../../../platform/workspace/common/workspace.js';
import { Workspace } from '../../../../../../../platform/workspace/test/common/testWorkspace.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { TestIPCFileSystemProvider } from '../../../../../../test/electron-browser/workbenchTestServices.js';
import { TestContextService } from '../../../../../../test/common/workbenchTestServices.js';
import { TerminalChatAgentToolsSettingId } from '../../../common/terminalChatAgentToolsConfiguration.js';
import { NpmScriptAutoApprover } from '../../../browser/tools/commandLineAnalyzer/autoApprove/npmScriptAutoApprover.js';

suite('NpmScriptAutoApprover', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let approver: NpmScriptAutoApprover;
	let configurationService: TestConfigurationService;
	let workspaceContextService: TestContextService;
	let fileService: FileService;
	let fileSystemProvider: InMemoryFileSystemProvider;

	// Use inMemory scheme to avoid platform-specific path issues
	const cwd = URI.from({ scheme: Schemas.inMemory, path: '/workspace/project' });

	setup(async () => {
		fileService = store.add(new FileService(new NullLogService()));

		// Register file: scheme provider for tree-sitter WASM grammar loading
		store.add(fileService.registerProvider(Schemas.file, new TestIPCFileSystemProvider()));

		// Register inMemory: scheme provider for test package.json files
		fileSystemProvider = store.add(new InMemoryFileSystemProvider());
		store.add(fileService.registerProvider(Schemas.inMemory, fileSystemProvider));

		// Create workspace directory structure
		await fileService.createFolder(cwd);

		configurationService = new TestConfigurationService();
		workspaceContextService = new TestContextService();

		instantiationService = workbenchInstantiationService({
			fileService: () => fileService,
			configurationService: () => configurationService
		}, store);

		instantiationService.stub(IWorkspaceContextService, workspaceContextService);
		instantiationService.stub(IFileService, fileService);

		approver = store.add(instantiationService.createInstance(NpmScriptAutoApprover));

		// Enable npm script auto-approve by default for tests
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AutoApproveWorkspaceNpmScripts, true);

		// Setup workspace
		const workspace = new Workspace('test', [toWorkspaceFolder(cwd)]);
		workspaceContextService.setWorkspace(workspace);
	});

	async function writePackageJson(uri: URI, scripts: Record<string, string>) {
		const packageJson = {
			name: 'test-project',
			version: '1.0.0',
			scripts
		};
		await fileService.writeFile(uri, VSBuffer.fromString(JSON.stringify(packageJson, null, 2)));
	}

	async function t(command: string, scripts: Record<string, string>, expectedAutoApproved: boolean) {
		const packageJsonUri = URI.joinPath(cwd, 'package.json');
		await writePackageJson(packageJsonUri, scripts);

		const result = await approver.isCommandAutoApproved(command, cwd);
		strictEqual(result.isAutoApproved, expectedAutoApproved, `Expected isAutoApproved to be ${expectedAutoApproved} for: ${command}`);
	}

	suite('npm run commands', () => {
		test('npm run build - script exists', () => t('npm run build', { build: 'tsc' }, true));
		test('npm run test - script exists', () => t('npm run test', { test: 'jest' }, true));
		test('npm run dev - script exists', () => t('npm run dev', { dev: 'vite' }, true));
		test('npm run start - script exists', () => t('npm run start', { start: 'node index.js' }, true));
		test('npm run lint - script exists', () => t('npm run lint', { lint: 'eslint .' }, true));
		test('npm run-script build - script exists', () => t('npm run-script build', { build: 'tsc' }, true));

		// npm shorthand commands (npm test, npm start, npm stop, npm restart)
		test('npm test - shorthand script exists', () => t('npm test', { test: 'jest' }, true));
		test('npm start - shorthand script exists', () => t('npm start', { start: 'node index.js' }, true));
		test('npm stop - shorthand script exists', () => t('npm stop', { stop: 'pkill node' }, true));
		test('npm restart - shorthand script exists', () => t('npm restart', { restart: 'npm stop && npm start' }, true));
		test('npm test - shorthand script does not exist', () => t('npm test', { build: 'tsc' }, false));
		test('npm test -- --watch - shorthand with args', () => t('npm test -- --watch', { test: 'jest' }, true));
		test('npm startevil - word boundary prevents match', () => t('npm startevil', { start: 'node index.js', startevil: 'evil' }, false));
		test('npm install - built-in command, not a script', () => t('npm install', { install: 'echo should not match' }, false));

		// Scripts with colons (namespaced scripts)
		test('npm run build:prod - script with colon exists', () => t('npm run build:prod', { 'build:prod': 'tsc --build' }, true));
		test('npm run test:unit - script with colon exists', () => t('npm run test:unit', { 'test:unit': 'jest --testPathPattern=unit' }, true));
		test('npm run lint:fix - script with colon exists', () => t('npm run lint:fix', { 'lint:fix': 'eslint . --fix' }, true));

		test('npm run missing - script does not exist', () => t('npm run missing', { build: 'tsc' }, false));
		test('npm run build - no scripts section', async () => {
			const packageJsonUri = URI.joinPath(cwd, 'package.json');
			await fileService.writeFile(packageJsonUri, VSBuffer.fromString(JSON.stringify({ name: 'test' })));

			const result = await approver.isCommandAutoApproved('npm run build', cwd);
			strictEqual(result.isAutoApproved, false);
		});
	});

	suite('yarn commands', () => {
		test('yarn run build - script exists', () => t('yarn run build', { build: 'tsc' }, true));
		test('yarn run test - script exists', () => t('yarn run test', { test: 'jest' }, true));

		// Yarn shorthand (yarn <script>)
		test('yarn build - script exists (shorthand)', () => t('yarn build', { build: 'tsc' }, true));
		test('yarn test - script exists (shorthand)', () => t('yarn test', { test: 'jest' }, true));

		// Yarn built-in commands should not match
		test('yarn install - built-in command, not a script', () => t('yarn install', { install: 'echo should not match' }, false));
		test('yarn add - built-in command, not a script', () => t('yarn add lodash', { add: 'echo should not match' }, false));

		test('yarn run missing - script does not exist', () => t('yarn run missing', { build: 'tsc' }, false));
	});

	suite('pnpm commands', () => {
		test('pnpm run build - script exists', () => t('pnpm run build', { build: 'tsc' }, true));
		test('pnpm run test - script exists', () => t('pnpm run test', { test: 'jest' }, true));

		// pnpm shorthand (pnpm <script>)
		test('pnpm build - script exists (shorthand)', () => t('pnpm build', { build: 'tsc' }, true));
		test('pnpm test - script exists (shorthand)', () => t('pnpm test', { test: 'jest' }, true));

		// pnpm built-in commands should not match
		test('pnpm install - built-in command, not a script', () => t('pnpm install', { install: 'echo should not match' }, false));
		test('pnpm add - built-in command, not a script', () => t('pnpm add lodash', { add: 'echo should not match' }, false));

		test('pnpm run missing - script does not exist', () => t('pnpm run missing', { build: 'tsc' }, false));
	});

	suite('no package.json', () => {
		test('npm run build - no package.json file', async () => {
			const result = await approver.isCommandAutoApproved('npm run build', URI.from({ scheme: Schemas.inMemory, path: '/nonexistent/path' }));
			strictEqual(result.isAutoApproved, false);
		});
	});

	suite('non-npm commands', () => {
		test('git status - not an npm command', () => t('git status', { build: 'tsc' }, false));
		test('ls -la - not an npm command', () => t('ls -la', { build: 'tsc' }, false));
		test('echo hello - not an npm command', () => t('echo hello', { build: 'tsc' }, false));
	});

	suite('auto-approve disabled', () => {
		test('npm run build - npm script auto-approve setting disabled', async () => {
			configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AutoApproveWorkspaceNpmScripts, false);

			const packageJsonUri = URI.joinPath(cwd, 'package.json');
			await writePackageJson(packageJsonUri, { build: 'tsc' });

			const result = await approver.isCommandAutoApproved('npm run build', cwd);
			strictEqual(result.isAutoApproved, false);
		});
	});

	suite('autoApproveInfo message', () => {
		test('single script - message contains script name', async () => {
			const packageJsonUri = URI.joinPath(cwd, 'package.json');
			await writePackageJson(packageJsonUri, { build: 'tsc' });

			const result = await approver.isCommandAutoApproved('npm run build', cwd);
			strictEqual(result.isAutoApproved, true);
			strictEqual(result.scriptName, 'build', 'Should return script name');
			strictEqual(result.autoApproveInfo?.value.includes('build'), true, 'Should mention script name');
			strictEqual(result.autoApproveInfo?.value.includes('package.json'), true, 'Should mention package.json');
		});
	});

	suite('workspace folder security', () => {
		test('cwd outside workspace - does not auto-approve', async () => {
			// Create package.json outside workspace
			const outsideCwd = URI.from({ scheme: Schemas.inMemory, path: '/outside/project' });
			await fileService.createFolder(outsideCwd);
			const outsidePackageJsonUri = URI.joinPath(outsideCwd, 'package.json');
			await writePackageJson(outsidePackageJsonUri, { build: 'tsc' });

			const result = await approver.isCommandAutoApproved('npm run build', outsideCwd);
			strictEqual(result.isAutoApproved, false, 'Should not auto-approve when cwd is outside workspace');
		});
	});
});
