/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { VSBuffer } from '../../../../../../../base/common/buffer.js';
import { Schemas } from '../../../../../../../base/common/network.js';
import { OperatingSystem } from '../../../../../../../base/common/platform.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ITreeSitterLibraryService } from '../../../../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { IFileService } from '../../../../../../../platform/files/common/files.js';
import { InMemoryFileSystemProvider } from '../../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import type { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope } from '../../../../../../../platform/storage/common/storage.js';
import { IWorkspaceContextService, toWorkspaceFolder } from '../../../../../../../platform/workspace/common/workspace.js';
import { Workspace } from '../../../../../../../platform/workspace/test/common/testWorkspace.js';
import { TerminalToolConfirmationStorageKeys } from '../../../../../chat/browser/chatContentParts/toolInvocationParts/chatTerminalToolConfirmationSubPart.js';
import { TreeSitterLibraryService } from '../../../../../../services/treeSitter/browser/treeSitterLibraryService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { TestIPCFileSystemProvider } from '../../../../../../test/electron-browser/workbenchTestServices.js';
import { TestContextService, TestStorageService } from '../../../../../../test/common/workbenchTestServices.js';
import type { ICommandLineAnalyzerOptions } from '../../../browser/tools/commandLineAnalyzer/commandLineAnalyzer.js';
import { CommandLineNpmScriptAutoApproveAnalyzer } from '../../../browser/tools/commandLineAnalyzer/commandLineNpmScriptAutoApproveAnalyzer.js';
import { TreeSitterCommandParser, TreeSitterCommandParserLanguage } from '../../../browser/treeSitterCommandParser.js';
import { TerminalChatAgentToolsSettingId } from '../../../common/terminalChatAgentToolsConfiguration.js';

suite('CommandLineNpmScriptAutoApproveAnalyzer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let parser: TreeSitterCommandParser;
	let analyzer: CommandLineNpmScriptAutoApproveAnalyzer;
	let configurationService: TestConfigurationService;
	let workspaceContextService: TestContextService;
	let storageService: TestStorageService;
	let fileService: FileService;
	let fileSystemProvider: InMemoryFileSystemProvider;

	const mockLog = (..._args: unknown[]) => { };

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
		storageService = store.add(new TestStorageService());

		instantiationService = workbenchInstantiationService({
			fileService: () => fileService,
			configurationService: () => configurationService
		}, store);

		instantiationService.stub(IWorkspaceContextService, workspaceContextService);
		instantiationService.stub(IStorageService, storageService);
		instantiationService.stub(IFileService, fileService);

		const treeSitterLibraryService = store.add(instantiationService.createInstance(TreeSitterLibraryService));
		treeSitterLibraryService.isTest = true;
		instantiationService.stub(ITreeSitterLibraryService, treeSitterLibraryService);

		parser = store.add(instantiationService.createInstance(TreeSitterCommandParser));

		analyzer = store.add(instantiationService.createInstance(
			CommandLineNpmScriptAutoApproveAnalyzer,
			parser,
			mockLog
		));

		// Enable auto-approve by default for tests
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.EnableAutoApprove, true);
		configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AutoApproveWorkspaceNpmScripts, true);
		storageService.store(TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted, true, StorageScope.APPLICATION, 0);

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

	async function t(commandLine: string, scripts: Record<string, string>, expectedAutoApproved: boolean | undefined) {
		const packageJsonUri = URI.joinPath(cwd, 'package.json');
		await writePackageJson(packageJsonUri, scripts);

		const options: ICommandLineAnalyzerOptions = {
			commandLine,
			cwd,
			shell: 'bash',
			os: OperatingSystem.Linux,
			treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
			terminalToolSessionId: 'test',
			chatSessionId: 'test',
		};

		const result = await analyzer.analyze(options);
		strictEqual(result.isAutoApproved, expectedAutoApproved, `Expected isAutoApproved to be ${expectedAutoApproved} for: ${commandLine}`);
		strictEqual(result.isAutoApproveAllowed, true, 'isAutoApproveAllowed should always be true');
	}

	suite('npm run commands', () => {
		test('npm run build - script exists', () => t('npm run build', { build: 'tsc' }, true));
		test('npm run test - script exists', () => t('npm run test', { test: 'jest' }, true));
		test('npm run dev - script exists', () => t('npm run dev', { dev: 'vite' }, true));
		test('npm run start - script exists', () => t('npm run start', { start: 'node index.js' }, true));
		test('npm run lint - script exists', () => t('npm run lint', { lint: 'eslint .' }, true));
		test('npm run-script build - script exists', () => t('npm run-script build', { build: 'tsc' }, true));

		// Scripts with colons (namespaced scripts)
		test('npm run build:prod - script with colon exists', () => t('npm run build:prod', { 'build:prod': 'tsc --build' }, true));
		test('npm run test:unit - script with colon exists', () => t('npm run test:unit', { 'test:unit': 'jest --testPathPattern=unit' }, true));
		test('npm run lint:fix - script with colon exists', () => t('npm run lint:fix', { 'lint:fix': 'eslint . --fix' }, true));

		test('npm run missing - script does not exist', () => t('npm run missing', { build: 'tsc' }, undefined));
		test('npm run build - no scripts section', async () => {
			const packageJsonUri = URI.joinPath(cwd, 'package.json');
			await fileService.writeFile(packageJsonUri, VSBuffer.fromString(JSON.stringify({ name: 'test' })));

			const options: ICommandLineAnalyzerOptions = {
				commandLine: 'npm run build',
				cwd,
				shell: 'bash',
				os: OperatingSystem.Linux,
				treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
				terminalToolSessionId: 'test',
				chatSessionId: 'test',
			};

			const result = await analyzer.analyze(options);
			strictEqual(result.isAutoApproved, undefined);
		});
	});

	suite('yarn commands', () => {
		test('yarn run build - script exists', () => t('yarn run build', { build: 'tsc' }, true));
		test('yarn run test - script exists', () => t('yarn run test', { test: 'jest' }, true));

		// Yarn shorthand (yarn <script>)
		test('yarn build - script exists (shorthand)', () => t('yarn build', { build: 'tsc' }, true));
		test('yarn test - script exists (shorthand)', () => t('yarn test', { test: 'jest' }, true));

		// Yarn built-in commands should not match
		test('yarn install - built-in command, not a script', () => t('yarn install', { install: 'echo should not match' }, undefined));
		test('yarn add - built-in command, not a script', () => t('yarn add lodash', { add: 'echo should not match' }, undefined));

		test('yarn run missing - script does not exist', () => t('yarn run missing', { build: 'tsc' }, undefined));
	});

	suite('pnpm commands', () => {
		test('pnpm run build - script exists', () => t('pnpm run build', { build: 'tsc' }, true));
		test('pnpm run test - script exists', () => t('pnpm run test', { test: 'jest' }, true));

		// pnpm shorthand (pnpm <script>)
		test('pnpm build - script exists (shorthand)', () => t('pnpm build', { build: 'tsc' }, true));
		test('pnpm test - script exists (shorthand)', () => t('pnpm test', { test: 'jest' }, true));

		// pnpm built-in commands should not match
		test('pnpm install - built-in command, not a script', () => t('pnpm install', { install: 'echo should not match' }, undefined));
		test('pnpm add - built-in command, not a script', () => t('pnpm add lodash', { add: 'echo should not match' }, undefined));

		test('pnpm run missing - script does not exist', () => t('pnpm run missing', { build: 'tsc' }, undefined));
	});

	suite('chained commands', () => {
		test('npm install && npm run build - both scripts exist', () => t('npm install && npm run build', { build: 'tsc' }, true));
		test('npm run lint && npm run test - both scripts exist', () => t('npm run lint && npm run test', { lint: 'eslint .', test: 'jest' }, true));
		test('npm run build && npm run missing - one script missing', () => t('npm run build && npm run missing', { build: 'tsc' }, undefined));
	});

	suite('no package.json', () => {
		test('npm run build - no package.json file', async () => {
			const options: ICommandLineAnalyzerOptions = {
				commandLine: 'npm run build',
				cwd: URI.from({ scheme: Schemas.inMemory, path: '/nonexistent/path' }),
				shell: 'bash',
				os: OperatingSystem.Linux,
				treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
				terminalToolSessionId: 'test',
				chatSessionId: 'test',
			};

			const result = await analyzer.analyze(options);
			strictEqual(result.isAutoApproved, undefined);
			strictEqual(result.isAutoApproveAllowed, true);
		});
	});

	suite('non-npm commands', () => {
		test('git status - not an npm command', () => t('git status', { build: 'tsc' }, undefined));
		test('ls -la - not an npm command', () => t('ls -la', { build: 'tsc' }, undefined));
		test('echo hello - not an npm command', () => t('echo hello', { build: 'tsc' }, undefined));
	});

	suite('auto-approve disabled', () => {
		test('npm run build - npm script auto-approve setting disabled', async () => {
			configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AutoApproveWorkspaceNpmScripts, false);

			const packageJsonUri = URI.joinPath(cwd, 'package.json');
			await writePackageJson(packageJsonUri, { build: 'tsc' });

			const options: ICommandLineAnalyzerOptions = {
				commandLine: 'npm run build',
				cwd,
				shell: 'bash',
				os: OperatingSystem.Linux,
				treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
				terminalToolSessionId: 'test',
				chatSessionId: 'test',
			};

			const result = await analyzer.analyze(options);
			strictEqual(result.isAutoApproved, undefined);
			strictEqual(result.isAutoApproveAllowed, true);
		});

		test('npm run build - auto-approve setting disabled', async () => {
			configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.EnableAutoApprove, false);

			const packageJsonUri = URI.joinPath(cwd, 'package.json');
			await writePackageJson(packageJsonUri, { build: 'tsc' });

			const options: ICommandLineAnalyzerOptions = {
				commandLine: 'npm run build',
				cwd,
				shell: 'bash',
				os: OperatingSystem.Linux,
				treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
				terminalToolSessionId: 'test',
				chatSessionId: 'test',
			};

			const result = await analyzer.analyze(options);
			strictEqual(result.isAutoApproved, undefined);
			strictEqual(result.isAutoApproveAllowed, true);
		});

		test('npm run build - warning not accepted', async () => {
			storageService.store(TerminalToolConfirmationStorageKeys.TerminalAutoApproveWarningAccepted, false, StorageScope.APPLICATION, 0);

			const packageJsonUri = URI.joinPath(cwd, 'package.json');
			await writePackageJson(packageJsonUri, { build: 'tsc' });

			const options: ICommandLineAnalyzerOptions = {
				commandLine: 'npm run build',
				cwd,
				shell: 'bash',
				os: OperatingSystem.Linux,
				treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
				terminalToolSessionId: 'test',
				chatSessionId: 'test',
			};

			const result = await analyzer.analyze(options);
			strictEqual(result.isAutoApproved, undefined);
			strictEqual(result.isAutoApproveAllowed, true);
		});
	});

	suite('autoApproveInfo message', () => {
		test('single script - message contains script name', async () => {
			const packageJsonUri = URI.joinPath(cwd, 'package.json');
			await writePackageJson(packageJsonUri, { build: 'tsc' });

			const options: ICommandLineAnalyzerOptions = {
				commandLine: 'npm run build',
				cwd,
				shell: 'bash',
				os: OperatingSystem.Linux,
				treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
				terminalToolSessionId: 'test',
				chatSessionId: 'test',
			};

			const result = await analyzer.analyze(options);
			strictEqual(result.isAutoApproved, true);
			strictEqual(result.autoApproveInfo?.value.includes('build'), true, 'Should mention script name');
			strictEqual(result.autoApproveInfo?.value.includes('package.json'), true, 'Should mention package.json');
		});

		test('multiple scripts - message contains all script names', async () => {
			const packageJsonUri = URI.joinPath(cwd, 'package.json');
			await writePackageJson(packageJsonUri, { lint: 'eslint .', test: 'jest' });

			const options: ICommandLineAnalyzerOptions = {
				commandLine: 'npm run lint && npm run test',
				cwd,
				shell: 'bash',
				os: OperatingSystem.Linux,
				treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
				terminalToolSessionId: 'test',
				chatSessionId: 'test',
			};

			const result = await analyzer.analyze(options);
			strictEqual(result.isAutoApproved, true);
			strictEqual(result.autoApproveInfo?.value.includes('lint'), true, 'Should mention lint script');
			strictEqual(result.autoApproveInfo?.value.includes('test'), true, 'Should mention test script');
		});
	});

	suite('workspace folder fallback', () => {
		test('no cwd - falls back to workspace folder root', async () => {
			const packageJsonUri = URI.joinPath(cwd, 'package.json');
			await writePackageJson(packageJsonUri, { build: 'tsc' });

			const options: ICommandLineAnalyzerOptions = {
				commandLine: 'npm run build',
				cwd: undefined, // No cwd
				shell: 'bash',
				os: OperatingSystem.Linux,
				treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
				terminalToolSessionId: 'test',
				chatSessionId: 'test',
			};

			const result = await analyzer.analyze(options);
			strictEqual(result.isAutoApproved, true);
		});
	});
});
