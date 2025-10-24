/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { ITreeSitterLibraryService } from '../../../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { TreeSitterLibraryService } from '../../../../../services/treeSitter/browser/treeSitterLibraryService.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { TestIPCFileSystemProvider } from '../../../../../test/electron-browser/workbenchTestServices.js';
import { TreeSitterCommandParser, TreeSitterCommandParserLanguage } from '../../browser/treeSitterCommandParser.js';

suite('TreeSitterCommandParser', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let parser: TreeSitterCommandParser;

	setup(() => {
		const logService = new NullLogService();
		const fileService = store.add(new FileService(logService));
		const fileSystemProvider = new TestIPCFileSystemProvider();
		store.add(fileService.registerProvider(Schemas.file, fileSystemProvider));

		instantiationService = workbenchInstantiationService({
			fileService: () => fileService,
		}, store);

		const treeSitterLibraryService = store.add(instantiationService.createInstance(TreeSitterLibraryService));
		treeSitterLibraryService.isTest = true;
		instantiationService.stub(ITreeSitterLibraryService, treeSitterLibraryService);

		parser = instantiationService.createInstance(TreeSitterCommandParser);
	});

	suite('Bash command parsing', () => {
		async function t(commandLine: string, expectedCommands: string[]) {
			const result = await parser.extractSubCommands(TreeSitterCommandParserLanguage.Bash, commandLine);
			deepStrictEqual(result, expectedCommands);
		}

		test('simple commands', () => t('ls -la', ['ls -la']));
		test('commands with &&', () => t('echo hello && ls -la', ['echo hello', 'ls -la']));
		test('commands with ||', () => t('test -f file.txt || touch file.txt', ['test -f file.txt', 'touch file.txt']));
		test('commands with semicolons', () => t('cd /tmp; ls; pwd', ['cd /tmp', 'ls', 'pwd']));
		test('pipe chains', () => t('cat file.txt | grep pattern | sort | uniq', ['cat file.txt', 'grep pattern', 'sort', 'uniq']));
		test('commands with subshells', () => t('echo $(date +%Y) && ls', ['echo $(date +%Y)', 'date +%Y', 'ls']));
		test('complex quoting', () => t('echo "hello && world" && echo \'test\'', ['echo "hello && world"', 'echo \'test\'']));
		test('escaped characters', () => t('echo hello\\ world && ls', ['echo hello\\ world', 'ls']));
		test('background commands', () => t('sleep 10 & echo done', ['sleep 10', 'echo done']));
		test('variable assignments', () => t('VAR=value command1 && echo $VAR', ['VAR=value command1', 'echo $VAR']));
		test('redirections', () => t('echo hello > file.txt && cat < file.txt', ['echo hello', 'cat']));
		test('arithmetic expansion', () => t('echo $((1 + 2)) && ls', ['echo $((1 + 2))', 'ls']));

		suite('control flow and structures', () => {
			test('if-then-else', () => t('if [ -f file.txt ]; then cat file.txt; else echo "not found"; fi', ['cat file.txt', 'echo "not found"']));
			test('simple iteration', () => t('for file in *.txt; do cat "$file"; done', ['cat "$file"']));
			test('function declaration and call', () => t('function test_func() { echo "inside function"; } && test_func', ['echo "inside function"', 'test_func']));
			test('heredoc with commands', () => t('cat << EOF\nhello\nworld\nEOF\necho done', ['cat', 'echo done']));
		});

		suite('edge cases', () => {
			test('malformed syntax', () => t('echo "unclosed quote && ls', ['echo']));
			test('unmatched parentheses', () => t('echo $(missing closing && ls', ['echo $(missing closing && ls', 'missing closing', 'ls']));
			test('very long command lines', () => t('echo ' + 'a'.repeat(10000) + ' && ls', ['echo ' + 'a'.repeat(10000), 'ls']));
			test('special characters', () => t('echo "πλαςε 测试 🚀" && ls', ['echo "πλαςε 测试 🚀"', 'ls']));
			test('multiline with continuations', () => t('echo hello \\\n&& echo world \\\n&& ls', ['echo hello', 'echo world', 'ls']));
			test('commands with comments', () => t('echo hello # this is a comment\nls # another comment', ['echo hello', 'ls']));
		});

		// TODO: These should be common but the pwsh grammar doesn't handle && yet https://github.com/microsoft/vscode/issues/272704
		suite('real-world scenarios', () => {
			test('complex Docker commands', () => t('docker run -it --rm -v $(pwd):/app ubuntu:latest bash -c "cd /app && npm install && npm test"', ['docker run -it --rm -v $(pwd):/app ubuntu:latest bash -c "cd /app && npm install && npm test"', 'pwd']));
			test('Git workflow commands', () => t('git add . && git commit -m "Update feature" && git push origin main', [
				'git add .',
				'git commit -m "Update feature"',
				'git push origin main'
			]));
			test('npm/yarn workflow commands', () => t('npm ci && npm run build && npm test && npm run lint', [
				'npm ci',
				'npm run build',
				'npm test',
				'npm run lint'
			]));
			test('build system commands', () => t('make clean && make -j$(nproc) && make install PREFIX=/usr/local', [
				'make clean',
				'make -j$(nproc)',
				'nproc',
				'make install PREFIX=/usr/local'
			]));
		});
	});

	suite('PowerShell command parsing', () => {
		async function t(commandLine: string, expectedCommands: string[]) {
			const result = await parser.extractSubCommands(TreeSitterCommandParserLanguage.PowerShell, commandLine);
			deepStrictEqual(result, expectedCommands);
		}

		test('simple commands', () => t('Get-ChildItem -Path C:\\', ['Get-ChildItem -Path C:\\']));
		test('commands with semicolons', () => t('Get-Date; Get-Location; Write-Host "done"', ['Get-Date', 'Get-Location', 'Write-Host "done"']));
		test('pipeline commands', () => t('Get-Process | Where-Object {$_.CPU -gt 100} | Sort-Object CPU', ['Get-Process ', 'Where-Object {$_.CPU -gt 100} ', 'Sort-Object CPU']));
		test('command substitution', () => t('Write-Host $(Get-Date) ; Get-Location', ['Write-Host $(Get-Date)', 'Get-Date', 'Get-Location']));
		test('complex parameters', () => t('Get-ChildItem -Path "C:\\Program Files" -Recurse -Include "*.exe"', ['Get-ChildItem -Path "C:\\Program Files" -Recurse -Include "*.exe"']));
		test('splatting', () => t('$params = @{Path="C:\\"; Recurse=$true}; Get-ChildItem @params', ['Get-ChildItem @params']));
		test('here-strings', () => t('Write-Host @"\nhello\nworld\n"@ ; Get-Date', ['Write-Host @"\nhello\nworld\n"@', 'Get-Date']));
		test('method calls', () => t('"hello".ToUpper() ; Get-Date', ['Get-Date']));
		test('complex quoting', () => t('Write-Host "She said `"Hello`"" ; Write-Host \'Single quotes\'', ['Write-Host "She said `"Hello`""', 'Write-Host \'Single quotes\'']));

		suite('Control flow and structures', () => {
			test('logical and', () => t('Test-Path "file.txt" -and Get-Content "file.txt"', ['Test-Path "file.txt" -and Get-Content "file.txt"']));
			test('foreach with script block', () => t('ForEach-Object { Write-Host $_.Name } ; Get-Date', ['ForEach-Object { Write-Host $_.Name }', 'Write-Host $_.Name', 'Get-Date']));
			test('if-else', () => t('if (Test-Path "file.txt") { Get-Content "file.txt" } else { Write-Host "not found" }', ['Test-Path "file.txt"', 'Get-Content "file.txt"', 'Write-Host "not found"']));
			test('error handling', () => t('try { Get-Content "file.txt" } catch { Write-Error "failed" }', ['Get-Content "file.txt"', 'Write-Error "failed"']));
		});
	});

	suite('all shell command parsing', () => {
		async function t(commandLine: string, expectedCommands: string[]) {
			for (const shell of [TreeSitterCommandParserLanguage.Bash, TreeSitterCommandParserLanguage.PowerShell]) {
				const result = await parser.extractSubCommands(shell, commandLine);
				deepStrictEqual(result, expectedCommands);
			}
		}

		suite('edge cases', () => {
			test('empty strings', () => t('', []));
			test('whitespace-only strings', () => t('   \n\t  ', []));
		});
	});
});
