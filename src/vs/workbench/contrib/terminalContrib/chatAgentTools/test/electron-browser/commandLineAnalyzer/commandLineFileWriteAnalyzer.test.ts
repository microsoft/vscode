/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { Schemas } from '../../../../../../../base/common/network.js';
import { isWindows, OperatingSystem } from '../../../../../../../base/common/platform.js';
import { URI } from '../../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { ITreeSitterLibraryService } from '../../../../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { FileService } from '../../../../../../../platform/files/common/fileService.js';
import { FileOperationError, FileOperationResult, IFileStatWithPartialMetadata } from '../../../../../../../platform/files/common/files.js';
import type { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../../../platform/log/common/log.js';
import { IWorkspaceContextService, toWorkspaceFolder } from '../../../../../../../platform/workspace/common/workspace.js';
import { Workspace } from '../../../../../../../platform/workspace/test/common/testWorkspace.js';
import { TreeSitterLibraryService } from '../../../../../../services/treeSitter/browser/treeSitterLibraryService.js';
import { workbenchInstantiationService } from '../../../../../../test/browser/workbenchTestServices.js';
import { TestContextService } from '../../../../../../test/common/workbenchTestServices.js';
import { TestIPCFileSystemProvider } from '../../../../../../test/electron-browser/workbenchTestServices.js';
import type { ICommandLineAnalyzerOptions } from '../../../browser/tools/commandLineAnalyzer/commandLineAnalyzer.js';
import { CommandLineFileWriteAnalyzer } from '../../../browser/tools/commandLineAnalyzer/commandLineFileWriteAnalyzer.js';
import { TreeSitterCommandParser, TreeSitterCommandParserLanguage } from '../../../browser/treeSitterCommandParser.js';
import { TerminalChatAgentToolsSettingId } from '../../../common/terminalChatAgentToolsConfiguration.js';

type RealpathResult = URI | 'missing' | Error;

class TestFileService extends FileService {
	readonly realpathResults = new Map<string, RealpathResult>();
	readonly symbolicLinks = new Set<string>();

	override async realpath(resource: URI): Promise<URI | undefined> {
		const result = this.realpathResults.get(resource.toString());
		if (!result) {
			return resource;
		}
		if (result === 'missing') {
			throw new FileOperationError('File not found', FileOperationResult.FILE_NOT_FOUND);
		}
		if (result instanceof Error) {
			throw result;
		}
		return result;
	}

	override async stat(resource: URI): Promise<IFileStatWithPartialMetadata> {
		if (this.symbolicLinks.has(resource.toString())) {
			return {
				resource,
				name: resource.path.split('/').at(-1) ?? '',
				size: 0,
				mtime: 0,
				ctime: 0,
				etag: '',
				readonly: false,
				locked: false,
				executable: false,
				isFile: false,
				isDirectory: false,
				isSymbolicLink: true,
			};
		}
		if (this.realpathResults.get(resource.toString()) === 'missing') {
			throw new FileOperationError('File not found', FileOperationResult.FILE_NOT_FOUND);
		}
		return super.stat(resource);
	}
}

suite('CommandLineFileWriteAnalyzer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let parser: TreeSitterCommandParser;
	let analyzer: CommandLineFileWriteAnalyzer;
	let configurationService: TestConfigurationService;
	let fileService: TestFileService;
	let workspaceContextService: TestContextService;

	const mockLog = (..._args: unknown[]) => { };

	setup(() => {
		fileService = store.add(new TestFileService(new NullLogService()));
		const fileSystemProvider = new TestIPCFileSystemProvider();
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));

		configurationService = new TestConfigurationService();
		workspaceContextService = new TestContextService();

		instantiationService = workbenchInstantiationService({
			fileService: () => fileService,
			configurationService: () => configurationService
		}, store);

		instantiationService.stub(IWorkspaceContextService, workspaceContextService);

		const treeSitterLibraryService = store.add(instantiationService.createInstance(TreeSitterLibraryService));
		treeSitterLibraryService.isTest = true;
		instantiationService.stub(ITreeSitterLibraryService, treeSitterLibraryService);

		parser = store.add(instantiationService.createInstance(TreeSitterCommandParser));

		analyzer = store.add(instantiationService.createInstance(
			CommandLineFileWriteAnalyzer,
			parser,
			mockLog
		));
	});

	(isWindows ? suite.skip : suite)('bash', () => {
		const cwd = URI.file('/workspace/project');

		async function t(commandLine: string, blockDetectedFileWrites: 'never' | 'outsideWorkspace' | 'all', expectedAutoApprove: boolean, expectedDisclaimers: number = 0, workspaceFolders: URI[] = [cwd]) {
			configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, blockDetectedFileWrites);

			// Setup workspace folders
			const workspace = new Workspace('test', workspaceFolders.map(uri => toWorkspaceFolder(uri)));
			workspaceContextService.setWorkspace(workspace);

			const options: ICommandLineAnalyzerOptions = {
				commandLine,
				cwd,
				shell: 'bash',
				os: OperatingSystem.Linux,
				treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
				terminalToolSessionId: 'test',
				chatSessionResource: undefined,
			};

			const result = await analyzer.analyze(options);
			strictEqual(result.isAutoApproveAllowed, expectedAutoApprove, `Expected auto approve to be ${expectedAutoApprove} for: ${commandLine}`);
			strictEqual((result.disclaimers || []).length, expectedDisclaimers, `Expected ${expectedDisclaimers} disclaimers for: ${commandLine}`);
		}

		suite('blockDetectedFileWrites: never', () => {
			test('relative path - simple output redirection', () => t('echo hello > file.txt', 'never', true, 1));
			test('relative path - append redirection', () => t('echo hello >> file.txt', 'never', true, 1));
			test('relative paths - multiple redirections', () => t('echo hello > file1.txt && echo world > file2.txt', 'never', true, 1));
			test('relative path - error redirection', () => t('cat missing.txt 2> error.log', 'never', true, 1));
			test('no redirections', () => t('echo hello', 'never', true, 0));
			test('absolute path - /dev/null allowed with never', () => t('echo hello > /dev/null', 'never', true, 1));
		});

		suite('blockDetectedFileWrites: outsideWorkspace', () => {
			// Relative paths (joined with cwd)
			test('relative path - file in workspace root - allow', () => t('echo hello > file.txt', 'outsideWorkspace', true, 1));
			test('relative path - file in subdirectory - allow', () => t('echo hello > subdir/file.txt', 'outsideWorkspace', true, 1));
			test('relative path - parent directory - block', () => t('echo hello > ../file.txt', 'outsideWorkspace', false, 1));
			test('relative path - grandparent directory - block', () => t('echo hello > ../../file.txt', 'outsideWorkspace', false, 1));

			// Absolute paths (parsed as-is)
			test('absolute path - /tmp - block', () => t('echo hello > /tmp/file.txt', 'outsideWorkspace', false, 1));
			test('absolute path - /etc - block', () => t('echo hello > /etc/config.txt', 'outsideWorkspace', false, 1));
			test('absolute path - /home - block', () => t('echo hello > /home/user/file.txt', 'outsideWorkspace', false, 1));
			test('absolute path - root - block', () => t('echo hello > /file.txt', 'outsideWorkspace', false, 1));
			test('absolute path - /dev/null - allow (null device)', () => t('echo hello > /dev/null', 'outsideWorkspace', true, 1));
			test('absolute path traversal outside workspace - block', () => t('echo hello > /workspace/project/test/../../../tmp/file.txt', 'outsideWorkspace', false, 1));
			test('absolute path traversal to settings path outside workspace - block', () => t('echo "{}" > "/workspace/project/test/../../../../.config/Code/User/settings.json"', 'outsideWorkspace', false, 1));
			test('absolute path traversal that remains inside workspace - allow', () => t('echo hello > /workspace/project/test/../file.txt', 'outsideWorkspace', true, 1));
			test('triple-quoted absolute path outside workspace - block', () => t('echo hello > \'\'\'/tmp/file.txt\'\'\'', 'outsideWorkspace', false, 1));
			test('triple-quoted settings path outside workspace - block', () => t('echo "{}" > \'\'\'/home/user/.config/Code/User/settings.json\'\'\'', 'outsideWorkspace', false, 1));
			test('triple double-quoted absolute path outside workspace - block', () => t('echo hello > """/tmp/file.txt"""', 'outsideWorkspace', false, 1));

			// Special cases
			test('no workspace folders - block', () => t('echo hello > file.txt', 'outsideWorkspace', false, 1, []));
			test('no workspace folders - /dev/null allowed', () => t('echo hello > /dev/null', 'outsideWorkspace', true, 1, []));
			test('no redirections - allow', () => t('echo hello', 'outsideWorkspace', true, 0));
			test('variable in filename - block', () => t('echo hello > $HOME/file.txt', 'outsideWorkspace', false, 1));
			test('command substitution - block', () => t('echo hello > $(pwd)/file.txt', 'outsideWorkspace', false, 1));
			test('brace expansion - block', () => t('echo hello > {a,b}.txt', 'outsideWorkspace', false, 1));
			test('tilde expansion - block', () => t('echo hello > ~/file.txt', 'outsideWorkspace', false, 1));
			test('percent-style variable - block', () => t('echo hello > %HOME%/file.txt', 'outsideWorkspace', false, 1));
			test('cmd delayed-expansion variable - block', () => t('echo hello > !APPDATA!\\file.txt', 'outsideWorkspace', false, 1));
			test('unescaped exclamation mark - block', () => t('echo hello > important!.txt', 'outsideWorkspace', false, 1));
			test('escaped literal exclamation mark - allow', () => t('echo hello > important\\!.txt', 'outsideWorkspace', true, 1));
			test('double-quoted Bash history designator - block', () =>
				t('echo \'malicious-command;#\' /outside/file.txt > "!#:2"', 'outsideWorkspace', false, 1));
			test('single-quoted Bash history text remains literal - allow', () =>
				t('echo hello > \'!#:2\'', 'outsideWorkspace', true, 1));
			test('unquoted pathname expansion that can match an outside symlink - block', async () => {
				fileService.realpathResults.set(URI.file('/workspace/project/safe-link').toString(), URI.file('/outside/file.txt'));
				await t('echo hello > safe-lin?', 'outsideWorkspace', false, 1);
			});
			test('double-quoted literal wildcard filename - allow', () => t('echo hello > "safe-lin?"', 'outsideWorkspace', true, 1));
			test('single-quoted literal wildcard filename - allow', () => t('echo hello > \'safe-*\'', 'outsideWorkspace', true, 1));
			test('escaped literal wildcard resolves before canonicalization - block outside symlink', async () => {
				fileService.realpathResults.set(URI.file('/workspace/project/safe-*').toString(), URI.file('/outside/file.txt'));
				await t('echo hello > safe-\\*', 'outsideWorkspace', false, 1);
			});
			test('concatenated quoted wildcard resolves before canonicalization - block outside symlink', async () => {
				fileService.realpathResults.set(URI.file('/workspace/project/safe-*').toString(), URI.file('/outside/file.txt'));
				await t('echo hello > safe-"*"', 'outsideWorkspace', false, 1);
			});

			test('symlink resolving outside workspace - block', async () => {
				fileService.realpathResults.set(URI.file('/workspace/project/link/file.txt').toString(), URI.file('/outside/file.txt'));
				await t('echo hello > link/file.txt', 'outsideWorkspace', false, 1);
			});

			test('symlink followed by parent traversal resolving outside workspace - block', async () => {
				const rawTarget = URI.from({ scheme: Schemas.file, path: '/workspace/project/link/../file.txt' });
				fileService.realpathResults.set(rawTarget.toString(), URI.file('/outside/file.txt'));
				await t('echo hello > link/../file.txt', 'outsideWorkspace', false, 1);
			});

			test('nonexistent file below symlink resolving outside workspace - block', async () => {
				fileService.realpathResults.set(URI.file('/workspace/project/link/file.txt').toString(), 'missing');
				fileService.realpathResults.set(URI.file('/workspace/project/link').toString(), URI.file('/outside'));
				await t('echo hello > link/file.txt', 'outsideWorkspace', false, 1);
			});

			test('multiple nonexistent segments below symlink resolving outside workspace - block', async () => {
				fileService.realpathResults.set(URI.file('/workspace/project/link/new/file.txt').toString(), 'missing');
				fileService.realpathResults.set(URI.file('/workspace/project/link/new').toString(), 'missing');
				fileService.realpathResults.set(URI.file('/workspace/project/link').toString(), URI.file('/outside'));
				await t('echo hello > link/new/file.txt', 'outsideWorkspace', false, 1);
			});

			test('nonexistent segments below an inside workspace ancestor - allow', async () => {
				fileService.realpathResults.set(URI.file('/workspace/project/new/file.txt').toString(), 'missing');
				await t('echo hello > new/file.txt', 'outsideWorkspace', true, 1);
			});

			test('multiple nonexistent segments below an inside workspace ancestor - block', async () => {
				fileService.realpathResults.set(URI.file('/workspace/project/new/sub/file.txt').toString(), 'missing');
				fileService.realpathResults.set(URI.file('/workspace/project/new/sub').toString(), 'missing');
				await t('echo hello > new/sub/file.txt', 'outsideWorkspace', false, 1);
			});

			test('symlink resolving elsewhere in the same workspace - allow', async () => {
				fileService.realpathResults.set(URI.file('/workspace/project/link/file.txt').toString(), URI.file('/workspace/project/target/file.txt'));
				await t('echo hello > link/file.txt', 'outsideWorkspace', true, 1);
			});

			test('literal path in one workspace resolving into another workspace - block', async () => {
				const workspaceA = URI.file('/workspace/a');
				const workspaceB = URI.file('/workspace/b');
				fileService.realpathResults.set(URI.file('/workspace/a/link/file.txt').toString(), URI.file('/workspace/b/file.txt'));
				await t('echo hello > /workspace/a/link/file.txt', 'outsideWorkspace', false, 1, [workspaceA, workspaceB]);
			});

			test('workspace root opened through a symlink - allow', async () => {
				const workspaceRoot = URI.file('/workspace/link');
				fileService.realpathResults.set(workspaceRoot.toString(), URI.file('/real/project'));
				fileService.realpathResults.set(URI.file('/workspace/link/file.txt').toString(), URI.file('/real/project/file.txt'));
				await t('echo hello > /workspace/link/file.txt', 'outsideWorkspace', true, 1, [workspaceRoot]);
			});

			test('dangling symlink - block', async () => {
				const target = URI.file('/workspace/project/link');
				fileService.realpathResults.set(target.toString(), 'missing');
				fileService.symbolicLinks.add(target.toString());
				await t('echo hello > link', 'outsideWorkspace', false, 1);
			});

			test('unexpected realpath failure - block', async () => {
				fileService.realpathResults.set(URI.file('/workspace/project/file.txt').toString(), new Error('realpath failed'));
				await t('echo hello > file.txt', 'outsideWorkspace', false, 1);
			});

			test('sequential commands writing inside workspace - block', () => t('echo hello > file1.txt && echo world > file2.txt', 'outsideWorkspace', false, 1));
			test('sequential command creating the destination symlink - block', () => t('ln -s /outside/file.txt link && echo hello > link', 'outsideWorkspace', false, 1));
			test('command substitution replacing the destination symlink - block', () =>
				t('echo "$(ln -sfn /outside link)" > link/file.txt', 'outsideWorkspace', false, 1));
			test('newline command replacing the destination symlink before a bare redirection - block', () =>
				t('ln -sfn /outside link\n> link/file.txt', 'outsideWorkspace', false, 1));
			test('newline command creating the destination symlink before a redirection-only pipeline stage - block', () =>
				t('ln -s /outside/target link\nprintf payload | cat > link | > /dev/null', 'outsideWorkspace', false, 1));
		});

		suite('tilde and environment-variable expansion', () => {
			test('tilde home expansion - block', () => t('echo hello > ~/file.txt', 'outsideWorkspace', false, 1));
			test('windows-style env-var expansion - block', () => t('echo hello > %HOME%/file.txt', 'outsideWorkspace', false, 1));
			test('cmd delayed environment-variable expansion - block', () => t('echo hello > !APPDATA!\\file.txt', 'outsideWorkspace', false, 1));
		});

		suite('blockDetectedFileWrites: all', () => {
			test('inside workspace - block', () => t('echo hello > file.txt', 'all', false, 1));
			test('outside workspace - block', () => t('echo hello > /tmp/file.txt', 'all', false, 1));
			test('no redirections - allow', () => t('echo hello', 'all', true, 0));
			test('multiple inside workspace - block', () => t('echo hello > file1.txt && echo world > file2.txt', 'all', false, 1));
		});

		suite('hasSessionAutoApproval', () => {
			async function tWithAutoApproval(commandLine: string, blockDetectedFileWrites: 'never' | 'outsideWorkspace' | 'all', hasSessionAutoApproval: boolean, expectedAutoApprove: boolean, expectedDisclaimers: number = 1) {
				configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, blockDetectedFileWrites);

				const workspace = new Workspace('test', [toWorkspaceFolder(cwd)]);
				workspaceContextService.setWorkspace(workspace);

				const options: ICommandLineAnalyzerOptions = {
					commandLine,
					cwd,
					shell: 'bash',
					os: OperatingSystem.Linux,
					treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
					terminalToolSessionId: 'test',
					chatSessionResource: undefined,
					hasSessionAutoApproval,
				};

				const result = await analyzer.analyze(options);
				strictEqual(result.isAutoApproveAllowed, expectedAutoApprove, `Expected auto approve to be ${expectedAutoApprove} for: ${commandLine}`);
				strictEqual((result.disclaimers || []).length, expectedDisclaimers, `Expected ${expectedDisclaimers} disclaimers for: ${commandLine}`);
			}

			suite('blockDetectedFileWrites: outsideWorkspace', () => {
				// /tmp writes are allowed only when session auto-approval is enabled
				test('/tmp - allow when auto-approval enabled', () => tWithAutoApproval('echo hello > /tmp/file.txt', 'outsideWorkspace', true, true));
				test('/tmp subdirectory - allow when auto-approval enabled', () => tWithAutoApproval('echo hello > /tmp/sub/file.txt', 'outsideWorkspace', true, true));
				test('triple-quoted /tmp - allow when auto-approval enabled', () => tWithAutoApproval('echo hello > \'\'\'/tmp/file.txt\'\'\'', 'outsideWorkspace', true, true));
				test('/tmp - block when auto-approval disabled', () => tWithAutoApproval('echo hello > /tmp/file.txt', 'outsideWorkspace', false, false));

				// Other outside-workspace paths remain blocked even with auto-approval enabled
				test('/etc - block even when auto-approval enabled', () => tWithAutoApproval('echo hello > /etc/config.txt', 'outsideWorkspace', true, false));
				test('/home - block even when auto-approval enabled', () => tWithAutoApproval('echo hello > /home/user/file.txt', 'outsideWorkspace', true, false));
				test('root - block even when auto-approval enabled', () => tWithAutoApproval('echo hello > /file.txt', 'outsideWorkspace', true, false));

				// Mixed writes: /tmp allowed, but other outside paths still block
				test('mixed /tmp and /etc - block even when auto-approval enabled', () => tWithAutoApproval('echo hello > /tmp/a.txt && echo world > /etc/b.txt', 'outsideWorkspace', true, false));
				test('mixed inside-workspace and /tmp - block when auto-approval enabled', () => tWithAutoApproval('echo hello > file.txt && echo world > /tmp/b.txt', 'outsideWorkspace', true, false));
				test('/tmp symlink resolving outside temp - block when auto-approval enabled', async () => {
					fileService.realpathResults.set(URI.file('/tmp/link/file.txt').toString(), URI.file('/outside/file.txt'));
					await tWithAutoApproval('echo hello > /tmp/link/file.txt', 'outsideWorkspace', true, false);
				});
				test('/tmp symlink followed by parent traversal resolving outside temp - block when auto-approval enabled', async () => {
					const rawTarget = URI.from({ scheme: Schemas.file, path: '/tmp/link/../file.txt' });
					fileService.realpathResults.set(rawTarget.toString(), URI.file('/outside/file.txt'));
					await tWithAutoApproval('echo hello > /tmp/link/../file.txt', 'outsideWorkspace', true, false);
				});
			});

			suite('blockDetectedFileWrites: all', () => {
				// `all` setting still blocks /tmp writes regardless of session auto-approval
				test('/tmp - block when auto-approval enabled', () => tWithAutoApproval('echo hello > /tmp/file.txt', 'all', true, false));
			});
		});

		suite('complex scenarios', () => {
			test('pipeline with redirection inside workspace - block', () => t('cat file.txt | grep "test" > output.txt', 'outsideWorkspace', false, 1));
			test('pipeline with in-place file write inside workspace - block', () => t('printf foo | sed -i \'s/foo/bar/\' file.txt', 'outsideWorkspace', false, 1));
			test('multiple redirections mixed inside/outside', () => t('echo hello > file.txt && echo world > /tmp/file.txt', 'outsideWorkspace', false, 1));
			test('here-document', () => t('cat > file.txt << EOF\nhello\nEOF', 'outsideWorkspace', true, 1));
			test('error output to /dev/null - allow', () => t('cat missing.txt 2> /dev/null', 'outsideWorkspace', true, 1));
		});

		suite('sed in-place editing', () => {
			// Basic -i flag variants (inside workspace)
			test('sed -i inside workspace - allow', () => t('sed -i \'s/foo/bar/\' file.txt', 'outsideWorkspace', true, 1));
			test('sed -I (uppercase) inside workspace - allow', () => t('sed -I \'s/foo/bar/\' file.txt', 'outsideWorkspace', true, 1));
			test('sed --in-place inside workspace - allow', () => t('sed --in-place \'s/foo/bar/\' file.txt', 'outsideWorkspace', true, 1));

			// Backup suffix variants (inside workspace)
			test('sed -i.bak inside workspace - allow', () => t('sed -i.bak \'s/foo/bar/\' file.txt', 'outsideWorkspace', true, 1));
			test('sed --in-place=.bak inside workspace - allow', () => t('sed --in-place=.bak \'s/foo/bar/\' file.txt', 'outsideWorkspace', true, 1));
			test('sed -i with empty backup (macOS) inside workspace - allow', () => t('sed -i \'\' \'s/foo/bar/\' file.txt', 'outsideWorkspace', true, 1));

			// Combined flags (inside workspace)
			test('sed -ni inside workspace - allow', () => t('sed -ni \'s/foo/bar/\' file.txt', 'outsideWorkspace', true, 1));
			test('sed -n -i inside workspace - allow', () => t('sed -n -i \'s/foo/bar/\' file.txt', 'outsideWorkspace', true, 1));

			// Multiple files (inside workspace)
			test('sed -i multiple files inside workspace - allow', () => t('sed -i \'s/foo/bar/\' file1.txt file2.txt', 'outsideWorkspace', true, 1));

			// Outside workspace
			test('sed -i outside workspace - block', () => t('sed -i \'s/foo/bar/\' /tmp/file.txt', 'outsideWorkspace', false, 1));
			test('sed -i absolute path outside workspace - block', () => t('sed -i \'s/foo/bar/\' /etc/config', 'outsideWorkspace', false, 1));
			test('sed -i mixed inside/outside - block', () => t('sed -i \'s/foo/bar/\' file.txt /tmp/other.txt', 'outsideWorkspace', false, 1));
			test('sed escaped literal wildcard canonicalizes the literal filename', async () => {
				fileService.realpathResults.set(URI.file('/workspace/project/safe-\\*').toString(), URI.file('/outside/file.txt'));
				await t('sed --follow-symlinks -i \'s/x/y/\' \'safe-\\*\'', 'outsideWorkspace', false, 1);
			});
			test('sed concatenated quoted filename canonicalizes the runtime path', async () => {
				fileService.realpathResults.set(URI.file('/workspace/project/safe-link').toString(), URI.file('/outside/file.txt'));
				await t('sed --follow-symlinks -i \'s/x/y/\' safe-"link"', 'outsideWorkspace', false, 1);
			});
			test('sed backup path outside workspace - block', () =>
				t('sed --in-place=../outside/* \'s/x/y/\' file.txt', 'outsideWorkspace', false, 1));
			test('sed quoted in-place option with backup path outside workspace - block', () =>
				t('sed \'--in-place=../outside/*\' \'s/x/y/\' file.txt', 'outsideWorkspace', false, 1));
			test('sed abbreviated in-place option with outside file - block', () =>
				t('sed --in-plac \'s/x/y/\' /outside/file.txt', 'outsideWorkspace', false, 1));
			test('sed shortest GNU in-place abbreviations with outside file - block', async () => {
				for (const option of ['--i', '--in', '--in-']) {
					await t(`sed ${option} 's/x/y/' /outside/file.txt`, 'outsideWorkspace', false, 1);
				}
			});
			test('sed final repeated in-place suffix outside workspace - block', () =>
				t('sed --in-place=.bak --in-p=../outside/* \'s/x/y/\' file.txt', 'outsideWorkspace', false, 1));
			test('sed option-shaped file after terminator does not replace backup suffix - block', () =>
				t('sed --in-place=../outside/* -e \'s/x/y/\' -- --in-place=.bak file.txt', 'outsideWorkspace', false, 1));
			test('sed command-substituted in-place option with outside file - block', () =>
				t('sed "$(echo -i)" \'s/x/y/\' /outside/file.txt', 'outsideWorkspace', false, 1));
			test('sed history-expanded in-place option with outside file - block', () =>
				t('sed !!:1 \'s/x/y/\' /outside/file.txt', 'outsideWorkspace', false, 1));
			test('sed partially expanded short in-place option with outside file - block', () =>
				t('sed -"$(echo i)" \'s/x/y/\' /outside/file.txt', 'outsideWorkspace', false, 1));
			test('sed dynamic backup option - block', () =>
				t('sed "${HOME:+--in-place=$HOME/*}" \'s/x/y/\' .bashrc', 'outsideWorkspace', false, 1));
			test('sed brace-expanded in-place option with outside file - block', () =>
				t('sed -{i,n} \'s/x/y/\' /outside/file.txt', 'outsideWorkspace', false, 1));
			test('sed dynamic in-place option after line-length operand - block', () =>
				t('sed -l 70 -{i,n} \'s/x/y/\' /outside/file.txt', 'outsideWorkspace', false, 1));

			// With blockDetectedFileWrites: all
			test('sed -i with all setting - block', () => t('sed -i \'s/foo/bar/\' file.txt', 'all', false, 1));

			// With blockDetectedFileWrites: never
			test('sed -i with never setting - allow', () => t('sed -i \'s/foo/bar/\' file.txt', 'never', true, 1));

			// Without -i flag (should not detect as file write)
			test('sed without -i - no file write detected', () => t('sed \'s/foo/bar/\' file.txt', 'outsideWorkspace', true, 0));
			test('sed with pipe - no file write detected', () => t('cat file.txt | sed \'s/foo/bar/\'', 'outsideWorkspace', true, 0));
		});

		suite('no cwd provided', () => {
			async function tNoCwd(commandLine: string, blockDetectedFileWrites: 'never' | 'outsideWorkspace' | 'all', expectedAutoApprove: boolean, expectedDisclaimers: number = 0) {
				configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, blockDetectedFileWrites);

				const workspace = new Workspace('test', [toWorkspaceFolder(cwd)]);
				workspaceContextService.setWorkspace(workspace);

				const options: ICommandLineAnalyzerOptions = {
					commandLine,
					cwd: undefined,
					shell: 'bash',
					os: OperatingSystem.Linux,
					treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
					terminalToolSessionId: 'test',
					chatSessionResource: undefined,
				};

				const result = await analyzer.analyze(options);
				strictEqual(result.isAutoApproveAllowed, expectedAutoApprove, `Expected auto approve to be ${expectedAutoApprove} for: ${commandLine}`);
				strictEqual((result.disclaimers || []).length, expectedDisclaimers, `Expected ${expectedDisclaimers} disclaimers for: ${commandLine}`);
			}

			// When cwd is undefined, relative paths remain as strings and are blocked
			test('relative path - never setting - allow', () => tNoCwd('echo hello > file.txt', 'never', true, 1));
			test('relative path - outsideWorkspace setting - block (unknown cwd)', () => tNoCwd('echo hello > file.txt', 'outsideWorkspace', false, 1));
			test('relative path - all setting - block', () => tNoCwd('echo hello > file.txt', 'all', false, 1));

			// Absolute paths are converted to URIs and checked normally
			test('absolute path inside workspace - outsideWorkspace setting - allow', () => tNoCwd('echo hello > /workspace/project/file.txt', 'outsideWorkspace', true, 1));
			test('absolute path outside workspace - outsideWorkspace setting - block', () => tNoCwd('echo hello > /tmp/file.txt', 'outsideWorkspace', false, 1));
			test('absolute path - all setting - block', () => tNoCwd('echo hello > /tmp/file.txt', 'all', false, 1));
		});
	});

	(isWindows ? suite : suite.skip)('pwsh', () => {
		const cwd = URI.file('C:/workspace/project');

		async function t(commandLine: string, blockDetectedFileWrites: 'never' | 'outsideWorkspace' | 'all', expectedAutoApprove: boolean, expectedDisclaimers: number = 0, workspaceFolders: URI[] = [cwd]) {
			configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, blockDetectedFileWrites);

			// Setup workspace folders
			const workspace = new Workspace('test', workspaceFolders.map(uri => toWorkspaceFolder(uri)));
			workspaceContextService.setWorkspace(workspace);

			const options: ICommandLineAnalyzerOptions = {
				commandLine,
				cwd,
				shell: 'pwsh',
				os: OperatingSystem.Windows,
				treeSitterLanguage: TreeSitterCommandParserLanguage.PowerShell,
				terminalToolSessionId: 'test',
				chatSessionResource: undefined,
			};

			const result = await analyzer.analyze(options);
			strictEqual(result.isAutoApproveAllowed, expectedAutoApprove, `Expected auto approve to be ${expectedAutoApprove} for: ${commandLine}`);
			strictEqual((result.disclaimers || []).length, expectedDisclaimers, `Expected ${expectedDisclaimers} disclaimers for: ${commandLine}`);
		}

		suite('blockDetectedFileWrites: never', () => {
			test('simple output redirection', () => t('Write-Host "hello" > file.txt', 'never', true, 1));
			test('append redirection', () => t('Write-Host "hello" >> file.txt', 'never', true, 1));
			test('multiple redirections', () => t('Write-Host "hello" > file1.txt ; Write-Host "world" > file2.txt', 'never', true, 1));
			test('error redirection', () => t('Get-Content missing.txt 2> error.log', 'never', true, 1));
			test('no redirections', () => t('Write-Host "hello"', 'never', true, 0));
		});

		suite('blockDetectedFileWrites: outsideWorkspace', () => {
			// Relative paths (joined with cwd)
			test('relative path - file in workspace root - allow', () => t('Write-Host "hello" > file.txt', 'outsideWorkspace', true, 1));
			test('relative path - file in subdirectory - allow', () => t('Write-Host "hello" > subdir\\file.txt', 'outsideWorkspace', true, 1));
			test('relative path - parent directory - block', () => t('Write-Host "hello" > ..\\file.txt', 'outsideWorkspace', false, 1));
			test('relative path - grandparent directory - block', () => t('Write-Host "hello" > ..\\..\\file.txt', 'outsideWorkspace', false, 1));

			// Absolute paths - Windows drive letters (parsed as-is)
			test('absolute path - C: drive - block', () => t('Write-Host "hello" > C:\\temp\\file.txt', 'outsideWorkspace', false, 1));
			test('absolute path - D: drive - block', () => t('Write-Host "hello" > D:\\data\\config.txt', 'outsideWorkspace', false, 1));
			test('absolute path - different drive than workspace - block', () => t('Write-Host "hello" > E:\\external\\file.txt', 'outsideWorkspace', false, 1));
			test('absolute path traversal outside workspace - block', () => t('Write-Host "hello" > C:\\workspace\\project\\test\\..\\..\\other\\file.txt', 'outsideWorkspace', false, 1));
			test('absolute path traversal to settings path outside workspace - block', () => t('Write-Host "{}" > C:\\workspace\\project\\test\\..\\..\\..\\Users\\user\\AppData\\Roaming\\Code\\User\\settings.json', 'outsideWorkspace', false, 1));
			test('absolute path traversal that remains inside workspace - allow', () => t('Write-Host "hello" > C:\\workspace\\project\\test\\..\\file.txt', 'outsideWorkspace', true, 1));

			// Absolute paths - UNC paths
			test('absolute path - UNC path - block', () => t('Write-Host "hello" > \\\\server\\share\\file.txt', 'outsideWorkspace', false, 1));

			// Special cases
			test('no workspace folders - block', () => t('Write-Host "hello" > file.txt', 'outsideWorkspace', false, 1, []));
			test('no redirections - allow', () => t('Write-Host "hello"', 'outsideWorkspace', true, 0));
			test('variable in filename - block', () => t('Write-Host "hello" > $env:TEMP\\file.txt', 'outsideWorkspace', false, 1));
			test('subexpression - block', () => t('Write-Host "hello" > $(Get-Date).log', 'outsideWorkspace', false, 1));
			test('percent-style variable - block', () => t('Write-Host "hello" > %APPDATA%\\file.txt', 'outsideWorkspace', false, 1));
			test('tilde expansion - block', () => t('Write-Host "hello" > ~\\file.txt', 'outsideWorkspace', false, 1));
			test('relative symlink traversal with a missing target - block', async () => {
				const rawTarget = cwd.with({ path: `${cwd.path}/link/../new.txt` });
				fileService.realpathResults.set(rawTarget.toString(), 'missing');
				fileService.realpathResults.set(cwd.with({ path: `${cwd.path}/link/..` }).toString(), URI.file('C:/outside'));
				await t('Write-Host "hello" > link\\..\\new.txt', 'outsideWorkspace', false, 1);
			});
			test('static method expression before a redirected command - block', () =>
				t('[System.IO.File]::CreateSymbolicLink("link", "C:\\outside\\file.txt")\nWrite-Host payload > link', 'outsideWorkspace', false, 1));
			test('quoted static method text remains literal - allow', () =>
				t('Write-Host \'[System.IO.File]::CreateSymbolicLink("link", "C:\\outside\\file.txt")\' > file.txt', 'outsideWorkspace', true, 1));
			test('single-quoted escaped quote canonicalizes the runtime filename', async () => {
				fileService.realpathResults.set(URI.file('C:/workspace/project/safe\'link').toString(), URI.file('C:/outside/file.txt'));
				await t('Write-Host payload > \'safe\'\'link\'', 'outsideWorkspace', false, 1);
			});
			test('double-quoted path with backtick escape - block', () =>
				t('Write-Host payload > "safe`nlink"', 'outsideWorkspace', false, 1));
			test('drive-relative destination - block', () => t('Write-Host payload > C:settings.json', 'outsideWorkspace', false, 1));
		});

		suite('tilde and environment-variable expansion', () => {
			test('tilde home expansion - block', () => t('Write-Host "hello" > ~\\file.txt', 'outsideWorkspace', false, 1));
			test('windows env-var expansion - block', () => t('Write-Host "hello" > %APPDATA%\\file.txt', 'outsideWorkspace', false, 1));
		});

		suite('blockDetectedFileWrites: all', () => {
			test('inside workspace - block', () => t('Write-Host "hello" > file.txt', 'all', false, 1));
			test('outside workspace - block', () => t('Write-Host "hello" > C:\\temp\\file.txt', 'all', false, 1));
			test('no redirections - allow', () => t('Write-Host "hello"', 'all', true, 0));
			test('multiple inside workspace - block', () => t('Write-Host "hello" > file1.txt ; Write-Host "world" > file2.txt', 'all', false, 1));
		});

		suite('complex scenarios', () => {
			test('pipeline with redirection inside workspace - block', () => t('Get-Process | Where-Object {$_.CPU -gt 100} > processes.txt', 'outsideWorkspace', false, 1));
			test('multiple redirections mixed inside/outside', () => t('Write-Host "hello" > file.txt ; Write-Host "world" > C:\\temp\\file.txt', 'outsideWorkspace', false, 1));
			test('all streams redirection', () => t('Get-Process *> all.log', 'outsideWorkspace', true, 1));
			test('multiple stream redirections', () => t('Get-Content missing.txt > output.txt 2> error.txt 3> warning.txt', 'outsideWorkspace', true, 1));
		});

		suite('edge cases', () => {
			test('redirection to $null (PowerShell null device) - allow', () => t('Write-Host "hello" > $null', 'outsideWorkspace', true, 1));
			test('relative path with backslashes - allow', () => t('Write-Host "hello" > server\\share\\file.txt', 'outsideWorkspace', true, 1));
			test('forward slashes on Windows (relative) - allow', () => t('Write-Host "hello" > subdir/file.txt', 'outsideWorkspace', true, 1));
		});

		suite('quoted file paths', () => {
			// Double-quoted paths
			test('double-quoted relative path inside workspace - allow', () => t('Write-Host "hello" > "file.txt"', 'outsideWorkspace', true, 1));
			test('double-quoted relative path with spaces inside workspace - allow', () => t('Write-Host "hello" > "file with spaces.txt"', 'outsideWorkspace', true, 1));
			test('double-quoted absolute path outside workspace - block', () => t('Write-Host "hello" > "C:\\temp\\file.txt"', 'outsideWorkspace', false, 1));
			test('double-quoted absolute path to different drive - block', () => t('Write-Host "hello" > "D:\\data\\file.txt"', 'outsideWorkspace', false, 1));

			// Single-quoted paths
			test('single-quoted relative path inside workspace - allow', () => t('Write-Host \'hello\' > \'file.txt\'', 'outsideWorkspace', true, 1));
			test('single-quoted relative path with spaces inside workspace - allow', () => t('Write-Host \'hello\' > \'file with spaces.txt\'', 'outsideWorkspace', true, 1));
			test('single-quoted absolute path outside workspace - block', () => t('Write-Host \'hello\' > \'C:\\temp\\file.txt\'', 'outsideWorkspace', false, 1));
			test('single-quoted absolute path to different drive - block', () => t('Write-Host \'hello\' > \'D:\\data\\file.txt\'', 'outsideWorkspace', false, 1));
		});

		suite('hasSessionAutoApproval', () => {
			async function tWithAutoApproval(commandLine: string, blockDetectedFileWrites: 'never' | 'outsideWorkspace' | 'all', hasSessionAutoApproval: boolean, expectedAutoApprove: boolean, expectedDisclaimers: number = 1) {
				configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, blockDetectedFileWrites);

				const workspace = new Workspace('test', [toWorkspaceFolder(cwd)]);
				workspaceContextService.setWorkspace(workspace);

				const options: ICommandLineAnalyzerOptions = {
					commandLine,
					cwd,
					shell: 'pwsh',
					os: OperatingSystem.Windows,
					treeSitterLanguage: TreeSitterCommandParserLanguage.PowerShell,
					terminalToolSessionId: 'test',
					chatSessionResource: undefined,
					hasSessionAutoApproval,
				};

				const result = await analyzer.analyze(options);
				strictEqual(result.isAutoApproveAllowed, expectedAutoApprove, `Expected auto approve to be ${expectedAutoApprove} for: ${commandLine}`);
				strictEqual((result.disclaimers || []).length, expectedDisclaimers, `Expected ${expectedDisclaimers} disclaimers for: ${commandLine}`);
			}

			suite('blockDetectedFileWrites: outsideWorkspace', () => {
				// User TEMP (AppData\Local\Temp) - allow only when auto-approval is enabled
				test('user TEMP - allow when auto-approval enabled', () => tWithAutoApproval('Write-Host "hello" > C:\\Users\\foo\\AppData\\Local\\Temp\\file.txt', 'outsideWorkspace', true, true));
				test('user TEMP subdirectory - allow when auto-approval enabled', () => tWithAutoApproval('Write-Host "hello" > C:\\Users\\foo\\AppData\\Local\\Temp\\sub\\file.txt', 'outsideWorkspace', true, true));
				test('user TEMP - block when auto-approval disabled', () => tWithAutoApproval('Write-Host "hello" > C:\\Users\\foo\\AppData\\Local\\Temp\\file.txt', 'outsideWorkspace', false, false));

				// System Windows\Temp - allow only when auto-approval is enabled
				test('Windows\\Temp - allow when auto-approval enabled', () => tWithAutoApproval('Write-Host "hello" > C:\\Windows\\Temp\\file.txt', 'outsideWorkspace', true, true));
				test('Windows\\Temp - block when auto-approval disabled', () => tWithAutoApproval('Write-Host "hello" > C:\\Windows\\Temp\\file.txt', 'outsideWorkspace', false, false));

				// Top-level \tmp\ - allow only when auto-approval is enabled
				test('\\tmp - allow when auto-approval enabled', () => tWithAutoApproval('Write-Host "hello" > C:\\tmp\\file.txt', 'outsideWorkspace', true, true));
				test('\\tmp - block when auto-approval disabled', () => tWithAutoApproval('Write-Host "hello" > C:\\tmp\\file.txt', 'outsideWorkspace', false, false));

				// Top-level \Temp\ (common dev convention) - allow only when auto-approval is enabled
				test('\\Temp - allow when auto-approval enabled', () => tWithAutoApproval('Write-Host "hello" > C:\\Temp\\file.txt', 'outsideWorkspace', true, true));

				// Case-insensitive matching (Windows paths are case-insensitive)
				test('user TEMP lowercase - allow when auto-approval enabled', () => tWithAutoApproval('Write-Host "hello" > C:\\users\\foo\\appdata\\local\\temp\\file.txt', 'outsideWorkspace', true, true));

				// Other outside-workspace paths remain blocked even with auto-approval enabled
				test('C:\\Windows\\System32 - block even when auto-approval enabled', () => tWithAutoApproval('Write-Host "hello" > C:\\Windows\\System32\\config.txt', 'outsideWorkspace', true, false));
				test('different drive - block even when auto-approval enabled', () => tWithAutoApproval('Write-Host "hello" > D:\\data\\file.txt', 'outsideWorkspace', true, false));

				// Mixed writes: TEMP allowed, but other outside paths still block
				test('mixed TEMP and System32 - block even when auto-approval enabled', () => tWithAutoApproval('Write-Host "hello" > C:\\Users\\foo\\AppData\\Local\\Temp\\a.txt ; Write-Host "world" > C:\\Windows\\System32\\b.txt', 'outsideWorkspace', true, false));
				test('mixed inside-workspace and TEMP - block when auto-approval enabled', () => tWithAutoApproval('Write-Host "hello" > file.txt ; Write-Host "world" > C:\\Users\\foo\\AppData\\Local\\Temp\\b.txt', 'outsideWorkspace', true, false));
				test('TEMP symlink traversal with a missing target - block when auto-approval enabled', async () => {
					const rawTarget = cwd.with({ path: 'C:/Users/foo/AppData/Local/Temp/link/../file.txt' });
					fileService.realpathResults.set(rawTarget.toString(), 'missing');
					fileService.realpathResults.set(cwd.with({ path: 'C:/Users/foo/AppData/Local/Temp/link/..' }).toString(), URI.file('C:/outside'));
					await tWithAutoApproval('Write-Host "hello" > C:\\Users\\foo\\AppData\\Local\\Temp\\link\\..\\file.txt', 'outsideWorkspace', true, false);
				});
			});

			suite('blockDetectedFileWrites: all', () => {
				// `all` setting still blocks TEMP writes regardless of session auto-approval
				test('user TEMP - block when auto-approval enabled', () => tWithAutoApproval('Write-Host "hello" > C:\\Users\\foo\\AppData\\Local\\Temp\\file.txt', 'all', true, false));
			});
		});
	});

	suite('cmd paths', () => {
		test('backslash-separated destination requires confirmation', async () => {
			const cwd = URI.file('C:/workspace/project');
			configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, 'outsideWorkspace');
			workspaceContextService.setWorkspace(new Workspace('test', [toWorkspaceFolder(cwd)]));

			const result = await analyzer.analyze({
				commandLine: 'echo payload > link\\file.txt',
				cwd,
				shell: 'cmd.exe',
				os: OperatingSystem.Windows,
				treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
				terminalToolSessionId: 'test',
				chatSessionResource: undefined,
			});

			strictEqual(result.isAutoApproveAllowed, false);
		});
	});

	suite('disclaimer messages', () => {
		const cwd = URI.file('/workspace/project');

		async function checkDisclaimer(commandLine: string, blockDetectedFileWrites: 'never' | 'outsideWorkspace' | 'all', expectedContains: string) {
			configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, blockDetectedFileWrites);

			const workspace = new Workspace('test', [toWorkspaceFolder(cwd)]);
			workspaceContextService.setWorkspace(workspace);

			const options: ICommandLineAnalyzerOptions = {
				commandLine,
				cwd,
				shell: 'bash',
				os: OperatingSystem.Linux,
				treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
				terminalToolSessionId: 'test',
				chatSessionResource: undefined,
			};

			const result = await analyzer.analyze(options);
			const disclaimers = result.disclaimers || [];
			strictEqual(disclaimers.length > 0, true, 'Expected at least one disclaimer');
			const combinedDisclaimers = disclaimers.join(' ');
			strictEqual(combinedDisclaimers.includes(expectedContains), true, `Expected disclaimer to contain "${expectedContains}" but got: ${combinedDisclaimers}`);
		}

		test('blocked disclaimer - absolute path outside workspace', () => checkDisclaimer('echo hello > /tmp/file.txt', 'outsideWorkspace', 'cannot be auto approved'));
		test('allowed disclaimer - relative path inside workspace', () => checkDisclaimer('echo hello > file.txt', 'outsideWorkspace', 'File write operations detected'));
		test('blocked disclaimer - all setting blocks everything', () => checkDisclaimer('echo hello > file.txt', 'all', 'cannot be auto approved'));
	});

	suite('multiple workspace folders', () => {
		const workspace1 = URI.file('/workspace/project1');
		const workspace2 = URI.file('/workspace/project2');

		async function t(cwd: URI, commandLine: string, expectedAutoApprove: boolean, expectedDisclaimers: number = 0) {
			configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, 'outsideWorkspace');

			const workspace = new Workspace('test', [workspace1, workspace2].map(uri => toWorkspaceFolder(uri)));
			workspaceContextService.setWorkspace(workspace);

			const options: ICommandLineAnalyzerOptions = {
				commandLine,
				cwd,
				shell: 'bash',
				os: OperatingSystem.Linux,
				treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
				terminalToolSessionId: 'test',
				chatSessionResource: undefined,
			};

			const result = await analyzer.analyze(options);
			strictEqual(result.isAutoApproveAllowed, expectedAutoApprove, `Expected auto approve to be ${expectedAutoApprove} for: ${commandLine}`);
			strictEqual((result.disclaimers || []).length, expectedDisclaimers, `Expected ${expectedDisclaimers} disclaimers for: ${commandLine}`);
		}

		test('relative path in same workspace - allow', () => t(workspace1, 'echo hello > file.txt', true, 1));
		test('absolute path to other workspace - allow', () => t(workspace1, 'echo hello > /workspace/project2/file.txt', true, 1));
		test('absolute path outside all workspaces - block', () => t(workspace1, 'echo hello > /tmp/file.txt', false, 1));
		test('relative path to parent of workspace - block', () => t(workspace1, 'echo hello > ../file.txt', false, 1));
	});

	suite('uri schemes', () => {
		async function t(cwdScheme: string, cwdAuthority: string | undefined, filePath: string, expectedAutoApprove: boolean) {
			configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, 'outsideWorkspace');

			const cwd = URI.from({ scheme: cwdScheme, authority: cwdAuthority, path: '/workspace/project' });
			const workspace = new Workspace('test', [toWorkspaceFolder(cwd)]);
			workspaceContextService.setWorkspace(workspace);

			const options: ICommandLineAnalyzerOptions = {
				commandLine: `echo hello > ${filePath}`,
				cwd,
				shell: 'bash',
				os: OperatingSystem.Linux,
				treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
				terminalToolSessionId: 'test',
				chatSessionResource: undefined,
			};

			const result = await analyzer.analyze(options);
			strictEqual(result.isAutoApproveAllowed, expectedAutoApprove);
		}

		test('file scheme - relative path inside workspace', () => t('file', undefined, 'file.txt', true));
		test('vscode-remote scheme - relative path inside workspace', () => t('vscode-remote', 'wsl+debian', 'file.txt', true));
		test('vscode-remote scheme - absolute path inside workspace', () => t('vscode-remote', 'wsl+debian', '/workspace/project/file.txt', true));
		test('vscode-remote scheme - absolute path outside workspace', () => t('vscode-remote', 'wsl+debian', '/tmp/file.txt', false));
		test('vscode-remote scheme - absolute path to home directory outside workspace', () => t('vscode-remote', 'wsl+debian', '/home/user/file.txt', false));
	});

	suite('quoted file paths', () => {
		const cwd = URI.file('/workspace/project');

		async function t(commandLine: string, blockDetectedFileWrites: 'never' | 'outsideWorkspace' | 'all', expectedAutoApprove: boolean, expectedDisclaimers: number = 0) {
			configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, blockDetectedFileWrites);

			const workspace = new Workspace('test', [toWorkspaceFolder(cwd)]);
			workspaceContextService.setWorkspace(workspace);

			const options: ICommandLineAnalyzerOptions = {
				commandLine,
				cwd,
				shell: 'bash',
				os: OperatingSystem.Linux,
				treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
				terminalToolSessionId: 'test',
				chatSessionResource: undefined,
			};

			const result = await analyzer.analyze(options);
			strictEqual(result.isAutoApproveAllowed, expectedAutoApprove, `Expected auto approve to be ${expectedAutoApprove} for: ${commandLine}`);
			strictEqual((result.disclaimers || []).length, expectedDisclaimers, `Expected ${expectedDisclaimers} disclaimers for: ${commandLine}`);
		}

		// Double-quoted paths
		test('double-quoted relative path inside workspace - allow', () => t('echo hello > "file.txt"', 'outsideWorkspace', true, 1));
		test('double-quoted relative path with spaces inside workspace - allow', () => t('echo hello > "file with spaces.txt"', 'outsideWorkspace', true, 1));
		test('double-quoted absolute path outside workspace - block', () => t('echo hello > "/tmp/file.txt"', 'outsideWorkspace', false, 1));
		test('double-quoted absolute path to home - block', () => t('echo hello > "/home/user/foo.txt"', 'outsideWorkspace', false, 1));

		// Single-quoted paths
		test('single-quoted relative path inside workspace - allow', () => t('echo hello > \'file.txt\'', 'outsideWorkspace', true, 1));
		test('single-quoted relative path with spaces inside workspace - allow', () => t('echo hello > \'file with spaces.txt\'', 'outsideWorkspace', true, 1));
		test('single-quoted absolute path outside workspace - block', () => t('echo hello > \'/tmp/file.txt\'', 'outsideWorkspace', false, 1));
		test('single-quoted absolute path to home - block', () => t('echo hello > \'/home/user/foo.txt\'', 'outsideWorkspace', false, 1));

		// Note: Backticks in bash are command substitution, not quoting, so no tests for backtick-quoted paths
	});

	suite('remote workspace with quoted absolute paths', () => {
		async function t(commandLine: string, expectedAutoApprove: boolean, expectedDisclaimers: number = 0) {
			configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.BlockDetectedFileWrites, 'outsideWorkspace');

			// Simulate a remote workspace (e.g., WSL)
			const cwd = URI.from({ scheme: 'vscode-remote', authority: 'wsl+debian', path: '/home/user/workspace' });
			const workspace = new Workspace('test', [toWorkspaceFolder(cwd)]);
			workspaceContextService.setWorkspace(workspace);

			const options: ICommandLineAnalyzerOptions = {
				commandLine,
				cwd,
				shell: 'bash',
				os: OperatingSystem.Linux,
				treeSitterLanguage: TreeSitterCommandParserLanguage.Bash,
				terminalToolSessionId: 'test',
				chatSessionResource: undefined,
			};

			const result = await analyzer.analyze(options);
			strictEqual(result.isAutoApproveAllowed, expectedAutoApprove, `Expected auto approve to be ${expectedAutoApprove} for: ${commandLine}`);
			strictEqual((result.disclaimers || []).length, expectedDisclaimers, `Expected ${expectedDisclaimers} disclaimers for: ${commandLine}`);
		}

		// These tests verify that absolute paths preserve the remote scheme/authority
		// and are correctly compared against workspace folders
		test('quoted absolute path inside remote workspace - allow', () => t('echo hello > "/home/user/workspace/file.txt"', true, 1));
		test('quoted absolute path outside remote workspace - block', () => t('echo hello > "/home/user/other/file.txt"', false, 1));
		test('quoted absolute path to different home dir - block', () => t('echo hello > "/home/otheruser/file.txt"', false, 1));
		test('quoted absolute path to settings.json - block', () => t('echo hello > "/home/user/.vscode/settings.json"', false, 1));
		test('unquoted absolute path inside remote workspace - allow', () => t('echo hello > /home/user/workspace/file.txt', true, 1));
		test('unquoted absolute path outside remote workspace - block', () => t('echo hello > /home/user/other/file.txt', false, 1));
		test('unquoted absolute path traversal outside remote workspace - block', () => t('echo hello > /home/user/workspace/test/../../other/file.txt', false, 1));
		test('relative path in remote workspace - allow', () => t('echo hello > file.txt', true, 1));
		test('relative path with subdirectory in remote workspace - allow', () => t('echo hello > subdir/file.txt', true, 1));
	});
});
