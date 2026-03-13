/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { Schemas } from '../../../../../../base/common/network.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ITreeSitterLibraryService } from '../../../../../../editor/common/services/treeSitter/treeSitterLibraryService.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import type { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { TreeSitterLibraryService } from '../../../../../services/treeSitter/browser/treeSitterLibraryService.js';
import { workbenchInstantiationService } from '../../../../../test/browser/workbenchTestServices.js';
import { TestIPCFileSystemProvider } from '../../../../../test/electron-browser/workbenchTestServices.js';
import { TreeSitterCommandParser, TreeSitterCommandParserLanguage } from '../../browser/treeSitterCommandParser.js';

suite('TreeSitterCommandParser', () => {
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

		parser = store.add(instantiationService.createInstance(TreeSitterCommandParser));
	});

	suite('extractSubCommands', () => {
		suite('bash', () => {
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

		suite('pwsh', () => {
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

		suite('all shells', () => {
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

	suite('extractPwshDoubleAmpersandChainOperators', () => {
		async function t(commandLine: string, expectedMatches: string[]) {
			const result = await parser.extractPwshDoubleAmpersandChainOperators(commandLine);
			const actualMatches = result.map(capture => capture.node.text);
			deepStrictEqual(actualMatches, expectedMatches);
		}

		test('simple command with &&', () => t('Get-Date && Get-Location', ['&&']));
		test('multiple && operators', () => t('echo first && echo second && echo third', ['&&', '&&']));
		test('mixed operators - && and ;', () => t('echo hello && echo world ; echo done', ['&&']));
		test('no && operators', () => t('Get-Date ; Get-Location', []));
		test('&& in string literal should not match', () => t('Write-Host "test && test"', []));
		test('&& in single quotes should not match', () => t('Write-Host \'test && test\'', []));
		test('&& with complex commands', () => t('Get-ChildItem -Path C:\\ && Set-Location C:\\Users', ['&&']));
		test('&& with parameters', () => t('Get-Process -Name notepad && Stop-Process -Name notepad', ['&&']));
		test('&& with pipeline inside', () => t('Get-Process | Where-Object {$_.Name -eq "notepad"} && Write-Host "Found"', ['&&']));
		test('nested && in script blocks', () => t('if ($true) { echo hello && echo world }', ['&&']));
		test('&& with method calls', () => t('"hello".ToUpper() && "world".ToLower()', ['&&']));
		test('&& with array operations', () => t('@(1,2,3) | ForEach-Object { $_ } && Write-Host "done"', ['&&']));
		test('&& with hashtable', () => t('@{key="value"} && Write-Host "created"', ['&&']));
		test('&& with type casting', () => t('[int]"123" && [string]456', ['&&']));
		test('&& with comparison operators', () => t('5 -gt 3 && "hello" -like "h*"', ['&&']));
		test('&& with variable assignment', () => t('$var = "test" && Write-Host $var', ['&&']));
		test('&& with expandable strings', () => t('$name="World" && "Hello $name"', ['&&']));
		test('&& with subexpressions', () => t('Write-Host $(Get-Date) && Get-Location', ['&&']));
		test('&& with here-strings', () => t('Write-Host @"\nhello\nworld\n"@ && Get-Date', ['&&']));
		test('&& with splatting', () => t('$params = @{Path="C:\\"}; Get-ChildItem @params && Write-Host "done"', ['&&']));

		suite('complex scenarios', () => {
			test('multiple && with different command types', () => t('Get-Service && Start-Service spooler && Get-Process', ['&&', '&&']));
			test('&& with error handling', () => t('try { Get-Content "file.txt" && Write-Host "success" } catch { Write-Error "failed" }', ['&&']));
			test('&& inside foreach', () => t('ForEach-Object { Write-Host $_.Name && Write-Host $_.Length }', ['&&']));
			test('&& with conditional logic', () => t('if (Test-Path "file.txt") { Get-Content "file.txt" && Write-Host "read" }', ['&&']));
			test('&& with switch statement', () => t('switch ($var) { 1 { "one" && "first" } 2 { "two" && "second" } }', ['&&', '&&']));
			test('&& in do-while', () => t('do { Write-Host $i && $i++ } while ($i -lt 5)', ['&&']));
			test('&& in for loop', () => t('for ($i=0; $i -lt 5; $i++) { Write-Host $i && Start-Sleep 1 }', ['&&']));
			test('&& with parallel processing', () => t('1..10 | ForEach-Object -Parallel { Write-Host $_ && Start-Sleep 1 }', ['&&']));
		});

		suite('edge cases', () => {
			test('empty string', () => t('', []));
			test('whitespace only', () => t('   \n\t  ', []));
			test('triple &&&', () => t('echo hello &&& echo world', ['&&']));
			test('spaced && operators', () => t('echo hello & & echo world', []));
			test('&& with unicode', () => t('Write-Host "测试" && Write-Host "🚀"', ['&&']));
			test('very long command with &&', () => t('Write-Host "' + 'a'.repeat(1000) + '" && Get-Date', ['&&']));
			test('deeply nested with &&', () => t('if ($true) { if ($true) { if ($true) { echo nested && echo deep } } }', ['&&']));
			test('&& with escaped characters', () => t('Write-Host "hello`"world" && Get-Date', ['&&']));
			test('&& with backticks', () => t('Write-Host `hello && Get-Date', ['&&']));
		});

		suite('real-world scenarios', () => {
			test('git workflow', () => t('git add . && git commit -m "message" && git push', ['&&', '&&']));
			test('build and test', () => t('dotnet build && dotnet test && dotnet publish', ['&&', '&&']));
			test('file operations', () => t('New-Item -Type File "test.txt" && Add-Content "test.txt" "hello" && Get-Content "test.txt"', ['&&', '&&']));
			test('service management', () => t('Stop-Service spooler && Set-Service spooler -StartupType Manual && Start-Service spooler', ['&&', '&&']));
			test('registry operations', () => t('New-Item -Path "HKCU:\\Software\\Test" && Set-ItemProperty -Path "HKCU:\\Software\\Test" -Name "Value" -Value "Data"', ['&&']));
			test('module import and usage', () => t('Import-Module ActiveDirectory && Get-ADUser -Filter *', ['&&']));
			test('remote operations', () => t('Enter-PSSession -ComputerName server && Get-Process && Exit-PSSession', ['&&', '&&']));
			test('scheduled task', () => t('Register-ScheduledTask -TaskName "MyTask" -Action (New-ScheduledTaskAction -Execute "powershell.exe") && Start-ScheduledTask "MyTask"', ['&&']));
		});
	});

	suite('getFileWrites', () => {
		suite('bash', () => {
			async function t(commandLine: string, expectedFiles: string[]) {
				const actualFiles = await parser.getFileWrites(TreeSitterCommandParserLanguage.Bash, commandLine);
				deepStrictEqual(actualFiles, expectedFiles);
			}

			test('simple output redirection', () => t('echo hello > file.txt', ['file.txt']));
			test('append redirection', () => t('echo hello >> file.txt', ['file.txt']));
			test('multiple redirections', () => t('echo hello > file1.txt && echo world > file2.txt', ['file1.txt', 'file2.txt']));
			test('error redirection', () => t('command 2> error.log', ['error.log']));
			test('combined stdout and stderr', () => t('command > output.txt 2>&1', ['output.txt']));
			test('here document', () => t('cat > file.txt << EOF\nhello\nworld\nEOF', ['file.txt']));
			test('quoted filenames', () => t('echo hello > "file with spaces.txt"', ['"file with spaces.txt"']));
			test('single quoted filenames', () => t('echo hello > \'file.txt\'', ['\'file.txt\'']));
			test('variable in filename', () => t('echo hello > $HOME/file.txt', ['$HOME/file.txt']));
			test('command substitution in filename', () => t('echo hello > $(date +%Y%m%d).log', ['$(date +%Y%m%d).log']));
			test('tilde expansion in filename', () => t('echo hello > ~/file.txt', ['~/file.txt']));
			test('absolute path', () => t('echo hello > /tmp/file.txt', ['/tmp/file.txt']));
			test('relative path', () => t('echo hello > ./output/file.txt', ['./output/file.txt']));
			test('file descriptor redirection', () => t('command 3> file.txt', ['file.txt']));
			test('redirection with numeric file descriptor', () => t('command 1> stdout.txt 2> stderr.txt', ['stdout.txt', 'stderr.txt']));
			test('append with error redirection', () => t('command >> output.log 2>> error.log', ['output.log', 'error.log']));

			suite('complex scenarios', () => {
				test('multiple commands with redirections', () => t('echo first > file1.txt; echo second > file2.txt; echo third > file3.txt', ['file1.txt', 'file2.txt', 'file3.txt']));
				test('pipeline with redirection', () => t('cat input.txt | grep pattern > output.txt', ['output.txt']));
				test('redirection in subshell', () => t('(echo hello; echo world) > combined.txt', ['combined.txt']));
				test('redirection with background job', () => t('long_command > output.txt &', ['output.txt']));
				test('conditional redirection', () => t('test -f input.txt && cat input.txt > output.txt || echo "not found" > error.txt', ['output.txt', 'error.txt']));
				test('loop with redirection', () => t('for file in *.txt; do cat "$file" >> combined.txt; done', ['combined.txt']));
				test('function with redirection', () => t('function backup() { cp "$1" > backup_"$1"; }', ['backup_"$1"']));
			});

			suite('edge cases', () => {
				test('no redirections', () => t('echo hello', []));
				test('input redirection only', () => t('sort < input.txt', ['input.txt']));
				test('pipe without redirection', () => t('echo hello | grep hello', []));
				test('redirection to /dev/null', () => t('command > /dev/null', ['/dev/null']));
				test('redirection to device', () => t('echo hello > /dev/tty', ['/dev/tty']));
				test('special characters in filename', () => t('echo hello > file-with_special.chars123.txt', ['file-with_special.chars123.txt']));
				test('unicode filename', () => t('echo hello > 测试文件.txt', ['测试文件.txt']));
				test('very long filename', () => t('echo hello > ' + 'a'.repeat(100) + '.txt', [Array(100).fill('a').join('') + '.txt']));
			});
		});

		suite('pwsh', () => {
			async function t(commandLine: string, expectedFiles: string[]) {
				const actualFiles = await parser.getFileWrites(TreeSitterCommandParserLanguage.PowerShell, commandLine);
				deepStrictEqual(actualFiles, expectedFiles);
			}

			test('simple output redirection', () => t('Write-Host "hello" > file.txt', ['file.txt']));
			test('append redirection', () => t('Write-Host "hello" >> file.txt', ['file.txt']));
			test('multiple redirections', () => t('Write-Host "hello" > file1.txt ; Write-Host "world" > file2.txt', ['file1.txt', 'file2.txt']));
			test('error redirection', () => t('Get-Content missing.txt 2> error.log', ['error.log']));
			test('warning redirection', () => t('Write-Warning "test" 3> warning.log', ['warning.log']));
			test('verbose redirection', () => t('Write-Verbose "test" 4> verbose.log', ['verbose.log']));
			test('debug redirection', () => t('Write-Debug "test" 5> debug.log', ['debug.log']));
			test('information redirection', () => t('Write-Information "test" 6> info.log', ['info.log']));
			test('all streams redirection', () => t('Get-Process *> all.log', ['all.log']));
			test('quoted filenames', () => t('Write-Host "hello" > "file with spaces.txt"', ['"file with spaces.txt"']));
			test('single quoted filenames', () => t('Write-Host "hello" > \'file.txt\'', ['\'file.txt\'']));
			test('variable in filename', () => t('Write-Host "hello" > $env:TEMP\\file.txt', ['$env:TEMP\\file.txt']));
			test('subexpression in filename', () => t('Write-Host "hello" > $(Get-Date -Format "yyyyMMdd").log', ['$(Get-Date -Format "yyyyMMdd").log']));
			test('Windows path', () => t('Write-Host "hello" > C:\\temp\\file.txt', ['C:\\temp\\file.txt']));
			test('UNC path', () => t('Write-Host "hello" > \\\\server\\share\\file.txt', ['\\\\server\\share\\file.txt']));
			test('relative path', () => t('Write-Host "hello" > .\\output\\file.txt', ['.\\output\\file.txt']));

			suite('complex scenarios', () => {
				test('pipeline with redirection', () => t('Get-Process | Where-Object {$_.CPU -gt 100} > processes.txt', ['processes.txt']));
				test('multiple streams to different files', () => t('Get-Content missing.txt > output.txt 2> error.txt 3> warning.txt', ['output.txt', 'error.txt', 'warning.txt']));
				test('redirection in script block', () => t('ForEach-Object { Write-Host $_.Name > names.txt }', ['names.txt']));
				test('conditional redirection', () => t('if (Test-Path "file.txt") { Get-Content "file.txt" > output.txt } else { Write-Host "not found" > error.txt }', ['output.txt', 'error.txt']));
				test('try-catch with redirection', () => t('try { Get-Content "file.txt" > output.txt } catch { $_.Exception.Message > error.txt }', ['output.txt', 'error.txt']));
				test('foreach loop with redirection', () => t('foreach ($file in Get-ChildItem) { $file.Name >> filelist.txt }', ['filelist.txt']));
				test('switch with redirection', () => t('switch ($var) { 1 { "one" > output1.txt } 2 { "two" > output2.txt } }', ['output1.txt', 'output2.txt']));
			});

			suite('edge cases', () => {
				test('no redirections', () => t('Write-Host "hello"', []));
				test('redirection to null', () => t('Write-Host "hello" > $null', ['$null']));
				test('redirection to console', () => t('Write-Host "hello" > CON', ['CON']));
				test('special characters in filename', () => t('Write-Host "hello" > file-with_special.chars123.txt', ['file-with_special.chars123.txt']));
				test('unicode filename', () => t('Write-Host "hello" > 测试文件.txt', ['测试文件.txt']));
				test('very long filename', () => t('Write-Host "hello" > ' + 'a'.repeat(100) + '.txt', [Array(100).fill('a').join('') + '.txt']));
				test('redirection operator in string', () => t('Write-Host "test > redirect" > file.txt', ['file.txt']));
				test('multiple redirection operators', () => t('Write-Host "hello" >> file.txt > otherfile.txt', ['file.txt', 'otherfile.txt']));
			});

			suite('real-world scenarios', () => {
				test('logging script output', () => t('Get-EventLog -LogName System -Newest 100 > system_events.log', ['system_events.log']));
				test('error logging', () => t('Start-Process -FilePath "nonexistent.exe" 2> process_errors.log', ['process_errors.log']));
				test('backup script with logging', () => t('Copy-Item -Path "source/*" -Destination "backup/" -Recurse > backup.log 2> backup_errors.log', ['backup.log', 'backup_errors.log']));
				test('system information export', () => t('Get-ComputerInfo | Out-String > system_info.txt', ['system_info.txt']));
				test('service status report', () => t('Get-Service | Where-Object {$_.Status -eq "Running"} | Select-Object Name, Status > running_services.csv', ['running_services.csv']));
				test('registry export', () => t('Get-ItemProperty -Path "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion" > registry_info.txt', ['registry_info.txt']));
				test('process monitoring', () => t('while ($true) { Get-Process | Measure-Object WorkingSet -Sum >> memory_usage.log; Start-Sleep 60 }', ['memory_usage.log']));
			});
		});
	});
});
