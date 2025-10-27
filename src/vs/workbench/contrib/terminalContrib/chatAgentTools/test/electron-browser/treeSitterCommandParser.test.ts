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
import { arch } from '../../../../../../base/common/process.js';

// TODO: The powershell grammar can cause an OOM crash on arm https://github.com/microsoft/vscode/issues/273177
(arch === 'arm' || arch === 'arm64' ? suite.skip : suite)('TreeSitterCommandParser', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let instantiationService: TestInstantiationService;
	let parser: TreeSitterCommandParser;

	setup(() => {
		const fileService = store.add(new FileService(new NullLogService()));
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
		test('nested command substitution', () => t('echo $(cat $(echo file.txt)) && ls', ['echo $(cat $(echo file.txt))', 'cat $(echo file.txt)', 'echo file.txt', 'ls']));
		test('mixed operators', () => t('cmd1 && cmd2 || cmd3; cmd4 | cmd5 & cmd6', ['cmd1', 'cmd2', 'cmd3', 'cmd4', 'cmd5', 'cmd6']));
		test('parameter expansion', () => t('echo ${VAR:-default} && echo ${#VAR}', ['echo ${VAR:-default}', 'echo ${#VAR}']));
		test('process substitution', () => t('diff <(sort file1) <(sort file2) && echo done', ['diff <(sort file1) <(sort file2)', 'sort file1', 'sort file2', 'echo done']));
		test('brace expansion', () => t('echo {a,b,c}.txt && ls', ['echo {a,b,c}.txt', 'ls']));
		test('tilde expansion', () => t('cd ~/Documents && ls ~/.bashrc', ['cd ~/Documents', 'ls ~/.bashrc']));

		suite('control flow and structures', () => {
			test('if-then-else', () => t('if [ -f file.txt ]; then cat file.txt; else echo "not found"; fi', ['cat file.txt', 'echo "not found"']));
			test('simple iteration', () => t('for file in *.txt; do cat "$file"; done', ['cat "$file"']));
			test('function declaration and call', () => t('function test_func() { echo "inside function"; } && test_func', ['echo "inside function"', 'test_func']));
			test('heredoc with commands', () => t('cat << EOF\nhello\nworld\nEOF\necho done', ['cat', 'echo done']));
			test('while loop', () => t('while read line; do echo "$line"; done < file.txt', ['read line', 'echo "$line"']));
			test('case statement', () => t('case $var in pattern1) echo "match1" ;; pattern2) echo "match2" ;; esac', ['echo "match1"', 'echo "match2"']));
			test('until loop', () => t('until [ -f ready.txt ]; do sleep 1; done && echo ready', ['sleep 1', 'echo ready']));
			test('nested conditionals', () => t('if [ -f file ]; then if [ -r file ]; then cat file; fi; fi', ['cat file']));
			test('test command alternatives', () => t('[[ -f file ]] && cat file || echo missing', ['cat file', 'echo missing']));
		});

		suite('edge cases', () => {
			test('malformed syntax', () => t('echo "unclosed quote && ls', ['echo']));
			test('unmatched parentheses', () => t('echo $(missing closing && ls', ['echo $(missing closing && ls', 'missing closing', 'ls']));
			test('very long command lines', () => t('echo ' + 'a'.repeat(10000) + ' && ls', ['echo ' + 'a'.repeat(10000), 'ls']));
			test('special characters', () => t('echo "πλαςε 测试 🚀" && ls', ['echo "πλαςε 测试 🚀"', 'ls']));
			test('multiline with continuations', () => t('echo hello \\\n&& echo world \\\n&& ls', ['echo hello', 'echo world', 'ls']));
			test('commands with comments', () => t('echo hello # this is a comment\nls # another comment', ['echo hello', 'ls']));
			test('empty command in chain', () => t('echo hello && && echo world', ['echo hello', 'echo world']));
			test('trailing operators', () => t('echo hello &&', ['echo hello', '']));
			test('only operators', () => t('&& || ;', []));
			test('nested quotes', () => t('echo "outer \"inner\" outer" && ls', ['echo "outer \"inner\" outer"', 'ls']));
			test('incomplete escape sequences', () => t('echo hello\\ && ls', ['echo hello\\ ', 'ls']));
			test('mixed quote types', () => t('echo "hello \`world\`" && echo \'test\'', ['echo "hello \`world\`"', 'world', 'echo \'test\'']));
			test('deeply nested structures', () => t('echo $(echo $(echo $(echo nested))) && ls', ['echo $(echo $(echo $(echo nested)))', 'echo $(echo $(echo nested))', 'echo $(echo nested)', 'echo nested', 'ls']));
			test('unicode command names', () => t('测试命令 && echo done', ['测试命令', 'echo done']));
			test('multi-line', () => t('echo a\necho b', ['echo a', 'echo b']));
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
			test('deployment script', () => t('rsync -avz --delete src/ user@server:/path/ && ssh user@server "systemctl restart service" && echo "Deployed successfully"', [
				'rsync -avz --delete src/ user@server:/path/',
				'ssh user@server "systemctl restart service"',
				'echo "Deployed successfully"'
			]));
			test('database backup script', () => t('mysqldump -u user -p database > backup_$(date +%Y%m%d).sql && gzip backup_$(date +%Y%m%d).sql && echo "Backup complete"', [
				'mysqldump -u user -p database',
				'date +%Y%m%d',
				'gzip backup_$(date +%Y%m%d).sql',
				'date +%Y%m%d',
				'echo "Backup complete"'
			]));
			test('log analysis pipeline', () => t('tail -f /var/log/app.log | grep ERROR | while read line; do echo "$(date): $line" >> error.log; done', [
				'tail -f /var/log/app.log',
				'grep ERROR',
				'read line',
				'echo "$(date): $line"',
				'date'
			]));
			test('conditional installation', () => t('which docker || (curl -fsSL https://get.docker.com | sh && systemctl enable docker) && docker --version', [
				'which docker',
				'curl -fsSL https://get.docker.com',
				'sh',
				'systemctl enable docker',
				'docker --version'
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
		test('array operations', () => t('$arr = @(1,2,3); $arr | ForEach-Object { $_ * 2 }', ['ForEach-Object { $_ * 2 }']));
		test('hashtable operations', () => t('$hash = @{key="value"}; Write-Host $hash.key', ['Write-Host $hash.key']));
		test('type casting', () => t('[int]"123" + [int]"456" ; Write-Host "done"', ['Write-Host "done"']));
		test('regex operations', () => t('"hello world" -match "w.*d" ; Get-Date', ['Get-Date']));
		test('comparison operators', () => t('5 -gt 3 -and "hello" -like "h*" ; Write-Host "true"', ['Write-Host "true"']));
		test('null-conditional operators', () => t('$obj?.Property?.SubProperty ; Get-Date', ['Get-Date']));
		test('string interpolation', () => t('$name="World"; "Hello $name" ; Get-Date', ['Get-Date']));
		test('expandable strings', () => t('$var="test"; "Value: $($var.ToUpper())" ; Get-Date', ['Get-Date']));

		suite('Control flow and structures', () => {
			test('logical and', () => t('Test-Path "file.txt" -and Get-Content "file.txt"', ['Test-Path "file.txt" -and Get-Content "file.txt"']));
			test('foreach with script block', () => t('ForEach-Object { Write-Host $_.Name } ; Get-Date', ['ForEach-Object { Write-Host $_.Name }', 'Write-Host $_.Name', 'Get-Date']));
			test('if-else', () => t('if (Test-Path "file.txt") { Get-Content "file.txt" } else { Write-Host "not found" }', ['Test-Path "file.txt"', 'Get-Content "file.txt"', 'Write-Host "not found"']));
			test('error handling', () => t('try { Get-Content "file.txt" } catch { Write-Error "failed" }', ['Get-Content "file.txt"', 'Write-Error "failed"']));
			test('switch statement', () => t('switch ($var) { 1 { "one" } 2 { "two" } default { "other" } } ; Get-Date', ['Get-Date']));
			test('do-while loop', () => t('do { Write-Host $i; $i++ } while ($i -lt 5) ; Get-Date', ['Write-Host $i', 'Get-Date']));
			test('for loop', () => t('for ($i=0; $i -lt 5; $i++) { Write-Host $i } ; Get-Date', ['Write-Host $i', 'Get-Date']));
			test('foreach loop with range', () => t('foreach ($i in 1..5) { Write-Host $i } ; Get-Date', ['1..5', 'Write-Host $i', 'Get-Date']));
			test('break and continue', () => t('while ($true) { if ($condition) { break } ; Write-Host "running" } ; Get-Date', ['Write-Host "running"', 'Get-Date']));
			test('nested try-catch-finally', () => t('try { try { Get-Content "file" } catch { throw } } catch { Write-Error "outer" } finally { Write-Host "cleanup" }', ['Get-Content "file"', 'Write-Error "outer"', 'Write-Host "cleanup"']));
			test('parallel processing', () => t('1..10 | ForEach-Object -Parallel { Start-Sleep 1; Write-Host $_ } ; Get-Date', ['1..10 ', 'ForEach-Object -Parallel { Start-Sleep 1; Write-Host $_ }', 'Start-Sleep 1', 'Write-Host $_', 'Get-Date']));
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
