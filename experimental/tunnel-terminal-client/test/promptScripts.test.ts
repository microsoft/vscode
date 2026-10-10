/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createBashPromptScript, createPowerShellPromptScript } from '../src/promptScripts.js';

const execute = promisify(execFile);
const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const bash = process.platform === 'win32' ? 'C:\\Program Files\\Git\\bin\\bash.exe' : '/bin/bash';
const powerShells = process.platform === 'win32' ? ['powershell.exe', 'pwsh.exe'] : ['pwsh'];

async function available(executable: string): Promise<boolean> {
	try {
		await execute(executable, executable === bash ? ['--version'] : ['-NoProfile', '-Command', 'exit 0'], { timeout: 10000 });
		return true;
	} catch {
		return false;
	}
}

function shell(executable: string, args: string[], input: string, directory: string, environment: NodeJS.ProcessEnv = process.env): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const env = executable === bash ? { ...environment, BASH_ENV: '', ENV: '' } : environment;
		const child = execFile(executable, args, { cwd: directory, env, timeout: 20000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
			if (error) {
				reject(new Error(`${executable} failed: ${error.message}\n${stdout}\n${stderr}`));
			} else {
				resolve({ stdout, stderr });
			}
		});
		child.stdin?.end(input);
	});
}

async function powerShell(executable: string, script: string, directory: string, environment: NodeJS.ProcessEnv = process.env, input = ''): Promise<{ stdout: string; stderr: string }> {
	const scriptPath = join(directory, `${randomUUID()}.ps1`);
	await writeFile(scriptPath, `\ufeff$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);\n${script}`);
	return shell(executable, ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', scriptPath], input, directory, environment);
}

function quotePowerShell(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

async function doesNotExist(path: string): Promise<boolean> {
	try {
		await access(path);
		return false;
	} catch {
		return true;
	}
}

test('prompt labels reject controls, terminal escapes, invisible formatting, and empty names', () => {
	for (const name of ['', 'line\nbreak', 'terminal\x1b[31m', 'nul\0', 'delete\x7f', 'c1\u009b', 'bidi\u202e', 'line\u2028']) {
		for (const factory of [createBashPromptScript, createPowerShellPromptScript]) {
			assert.throws(() => factory(name), /printable/);
		}
	}
});

for (const executable of powerShells) {
	test(`${executable}: separates the prefix from the default prompt with a literal ASCII space`, async t => {
		if (!await available(executable)) {
			t.skip('PowerShell is not installed.');
			return;
		}
		const directory = await mkdtemp(join(packageRoot, '.prompt-scripts-test-'));
		t.after(() => rm(directory, { recursive: true, force: true }));
		const { stdout } = await powerShell(executable, `
$original = prompt
${createPowerShellPromptScript('tunnel-smoke')}
$prefixed = prompt
@{ original=$original; prefixed=$prefixed } | ConvertTo-Json -Compress
`, directory);
		const result: { original: string; prefixed: string } = JSON.parse(stdout);
		assert.deepEqual({
			prompt: result.prefixed,
			separator: result.prefixed.codePointAt('[tunnel-smoke]'.length),
		}, {
			prompt: `[tunnel-smoke] ${result.original}`,
			separator: 0x20,
		});
	});

	test(`${executable}: retains the separator before leading shell-integration controls`, async t => {
		if (!await available(executable)) {
			t.skip('PowerShell is not installed.');
			return;
		}
		const directory = await mkdtemp(join(packageRoot, '.prompt-scripts-test-'));
		t.after(() => rm(directory, { recursive: true, force: true }));
		const { stdout } = await powerShell(executable, `
function global:prompt { ([char]27) + ']633;A' + ([char]7) + 'PS fixture> ' }
${createPowerShellPromptScript('tunnel-smoke')}
@{ prompt=(prompt) } | ConvertTo-Json -Compress
`, directory);
		assert.deepEqual(JSON.parse(stdout), { prompt: '[tunnel-smoke] \x1b]633;A\x07PS fixture> ' });
	});

	test(`${executable}: preserves the original prompt, status, exit code and literal labels across reinitialization`, async t => {
		if (!await available(executable)) {
			t.skip('PowerShell is not installed.');
			return;
		}
		const directory = await mkdtemp(join(packageRoot, '.prompt-scripts-test-'));
		t.after(() => rm(directory, { recursive: true, force: true }));
		const name = `O'Hare-日本語-"$([IO.File]::WriteAllText('injected','oops'))"-\`\\`;
		const encoded = Buffer.from(createPowerShellPromptScript(name), 'utf8').toString('base64');
		const { stdout } = await powerShell(executable, `
function global:prompt {
	$ok = $?
	$exitCode = $global:LASTEXITCODE
	$global:LASTEXITCODE = 99
	"theme:$ok/$exitCode> "
}
. ([scriptblock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))))
${createPowerShellPromptScript(name)}
$global:LASTEXITCODE = 7
Write-Error 'test failure' -ErrorAction Ignore
$failed = prompt
$afterFailure = $global:LASTEXITCODE
$global:LASTEXITCODE = 0
$succeeded = prompt
$afterSuccess = $global:LASTEXITCODE
${createPowerShellPromptScript('updated')}
$updated = prompt
@{ failed=$failed; succeeded=$succeeded; updated=$updated; afterFailure=$afterFailure; afterSuccess=$afterSuccess } | ConvertTo-Json -Compress
`, directory);
		assert.deepEqual(JSON.parse(stdout), {
			failed: `[${name}] theme:False/7> `,
			succeeded: `[${name}] theme:True/0> `,
			updated: '[updated] theme:True/0> ',
			afterFailure: 7,
			afterSuccess: 0,
		});
		assert.equal(await doesNotExist(join(directory, 'injected')), true);
	});

	test(`${executable}: adopts a replacement theme and works without native WSL`, async t => {
		if (!await available(executable)) {
			t.skip('PowerShell is not installed.');
			return;
		}
		const directory = await mkdtemp(join(packageRoot, '.prompt-scripts-test-'));
		t.after(() => rm(directory, { recursive: true, force: true }));
		const { stdout } = await powerShell(executable, `
$env:PATH = ''
function global:prompt { 'first> ' }
${createPowerShellPromptScript('first')}
function global:prompt { 'second> ' }
${createPowerShellPromptScript('second')}
@{ prompt=(prompt); wsl=[bool](Get-Command wsl -CommandType Function -ErrorAction Ignore) } | ConvertTo-Json -Compress
`, directory);
		assert.deepEqual(JSON.parse(stdout), { prompt: '[second] second> ', wsl: false });
	});
}

test('Bash preserves literal prompt text, avoids duplicate prefixes, and supports disabled promptvars', async t => {
	if (!await available(bash)) {
		t.skip('Bash is not installed.');
		return;
	}
	const directory = await mkdtemp(join(packageRoot, '.prompt-scripts-test-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const name = 'O\'Hare-日本語-"$(touch "$HOME/injected")"-`touch "$HOME/injected"`-\\u';
	const encoded = Buffer.from(createBashPromptScript(name), 'utf8').toString('base64');
	const { stdout } = await shell(bash, ['--noprofile', '--norc'], `
PS1='original> '
if decoded=$(printf %s '${encoded}' | base64 -d) && . <(printf '%s' "$decoded"); then
	:
else
	exit "$?"
fi
${createBashPromptScript(name)}
printf '%s\\n' "\${PS1@P}"
shopt -u promptvars
eval "$PROMPT_COMMAND"
printf '%s\\n' "\${PS1@P}"
${createBashPromptScript('updated')}
printf '%s\\n' "\${PS1@P}"
`, directory, { ...process.env, HOME: directory });
	assert.deepEqual(stdout.trimEnd().split(/\r?\n/).map(line => line.trimEnd()), [
		`[${name}] original>`,
		`[${name}] original>`,
		'[updated] original>',
	]);
	assert.equal(await doesNotExist(join(directory, 'injected')), true);
});

for (const kind of ['string', 'array'] as const) {
	test(`Bash ${kind} PROMPT_COMMAND hooks retain status and may rebuild the prompt`, async t => {
		if (!await available(bash)) {
			t.skip('Bash is not installed.');
			return;
		}
		const directory = await mkdtemp(join(packageRoot, '.prompt-scripts-test-'));
		t.after(() => rm(directory, { recursive: true, force: true }));
		const hooks = kind === 'array'
			? `PROMPT_COMMAND=('printf "HOOK:%s\\\\n" "$?"' 'PS1="theme> "')`
			: `PROMPT_COMMAND='printf "HOOK:%s\\n" "$?"; PS1="theme> "'`;
		const { stdout, stderr } = await shell(bash, ['--noprofile', '--norc', '--noediting', '-i'], `
PS1='original> '
${hooks}
${createBashPromptScript('machine')}
${createBashPromptScript('machine')}
false
printf 'CONTENT:%s\\n' "\${PS1@P}"
declare -p PROMPT_COMMAND
exit
`, directory, { ...process.env, HOME: directory, TERM: 'dumb' });
		assert.match(stdout, /HOOK:1/);
		assert.match(stdout, /CONTENT:\[machine\] theme> /);
		assert.doesNotMatch(stdout + stderr, /\[machine\] \[machine\]/);
		assert.match(stdout, kind === 'array' ? /declare -a PROMPT_COMMAND=/ : /declare -- PROMPT_COMMAND=/);
	});
}

test('Bash reports readonly prompt state instead of silently succeeding', async t => {
	if (!await available(bash)) {
		t.skip('Bash is not installed.');
		return;
	}
	const directory = await mkdtemp(join(packageRoot, '.prompt-scripts-test-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const encoded = Buffer.from(createBashPromptScript('machine'), 'utf8').toString('base64');
	const { stdout, stderr } = await shell(bash, ['--noprofile', '--norc'], `
readonly PS1='locked> '
if decoded=$(printf %s '${encoded}' | base64 -d) && . <(printf '%s' "$decoded"); then
	printf 'STATUS:0\\n'
else
	printf 'STATUS:%s\\n' "$?"
fi
`, directory, { ...process.env, HOME: directory });
	assert.match(stdout, /STATUS:1/);
	assert.match(stderr, /PS1 is readonly/);
});

test('Bash keeps the previous command status available to a prompt without existing hooks', async t => {
	if (!await available(bash)) {
		t.skip('Bash is not installed.');
		return;
	}
	const directory = await mkdtemp(join(packageRoot, '.prompt-scripts-test-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const { stderr } = await shell(bash, ['--noprofile', '--norc', '--noediting', '-i'], `
PS1='status:$?> '
${createBashPromptScript('machine')}
false
true
exit
`, directory, { ...process.env, HOME: directory, TERM: 'dumb' });
	assert.match(stderr, /\[machine\] status:1> /);
	assert.match(stderr, /\[machine\] status:0> /);
});

test('Bash separates the prefix from the rendered prompt with a literal ASCII space', async t => {
	if (!await available(bash)) {
		t.skip('Bash is not installed.');
		return;
	}
	const directory = await mkdtemp(join(packageRoot, '.prompt-scripts-test-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const { stdout } = await shell(bash, ['--noprofile', '--norc'], `
PS1='base> '
${createBashPromptScript('tunnel-smoke')}
printf '%s' "\${PS1@P}"
`, directory, { ...process.env, HOME: directory });
	assert.deepEqual({
		prompt: stdout,
		separator: stdout.codePointAt('[tunnel-smoke]'.length),
	}, {
		prompt: '[tunnel-smoke] base> ',
		separator: 0x20,
	});
});

test('PowerShell WSL wrapper classifies interactive calls and preserves native arguments, output and exit codes', { skip: process.platform !== 'win32' }, async t => {
	const directory = await mkdtemp(join(packageRoot, '.prompt-scripts-test-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const nativeWsl = join(directory, 'wsl.exe');
	// A real executable discovered through PATH exercises native PowerShell argument passing.
	await powerShell('powershell.exe', `
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
public class WslStub {
	public static int Main(string[] args) {
		Console.WriteLine(String.Join("|", Array.ConvertAll(args, value => Convert.ToBase64String(Encoding.UTF8.GetBytes(value)))));
		Console.Error.Write("native-stderr");
		return 23;
	}
}
'@ -OutputAssembly ${quotePowerShell(nativeWsl)} -OutputType ConsoleApplication
`, directory);
	for (const executable of powerShells) {
		if (!await available(executable)) {
			continue;
		}
		await t.test(executable, async () => {
			const invocations = [
				[],
				['-d', 'Ubuntu-22.04', '-u', 'root', '--cd', '/a path'],
				['--distribution', 'Ubuntu-22.04', '--user', 'alice'],
				['--list', '--verbose'],
				['--status'],
				['--shutdown'],
				['--install'],
				['--help'],
				['--exec', 'printf', '%s', 'a b'],
				['-e', 'printf', '%s', 'a b'],
				['echo', 'hello'],
				['-d'],
				['-D', 'Ubuntu'],
			];
			const { stdout, stderr } = await powerShell(executable, `
$env:PATH = ${quotePowerShell(directory)} + [IO.Path]::PathSeparator + $env:PATH
${createPowerShellPromptScript('machine')}
${createPowerShellPromptScript('machine')}
$ErrorActionPreference = 'Continue'
$results = @()
${invocations.map(args => `
$output = wsl ${args.map(quotePowerShell).join(' ')}
$results += @{ arguments=$output; exitCode=$LASTEXITCODE }
`).join('')}
$results | ConvertTo-Json -Compress
`, directory);
			const results: { arguments: string; exitCode: number }[] = JSON.parse(stdout);
			assert.match(stderr, /native-stderr/);
			assert.equal(results.length, invocations.length);
			for (const [index, result] of results.entries()) {
				const args = result.arguments.split('|').map(value => Buffer.from(value, 'base64').toString('utf8'));
				assert.equal(result.exitCode, 23);
				if (index < 3) {
					assert.deepEqual(args.slice(0, -6), invocations[index]);
					assert.deepEqual(args.slice(-6, -1), ['--exec', 'bash', '--noprofile', '--norc', '-c']);
					assert.match(args.at(-1)!, /^exec bash --rcfile <\(printf %s [A-Za-z0-9+/=]+ \| base64 -d\) -i$/);
					const startup = Buffer.from(args.at(-1)!.split(' ')[5], 'base64').toString('utf8');
					assert.match(startup, /\. "\$HOME\/\.bashrc"/);
					assert.match(startup, /vscode-tunnel-prompt-v1/);
				} else {
					assert.deepEqual(args, invocations[index]);
				}
			}
		});
		await t.test(`${executable} rejects user wsl functions and aliases`, async () => {
			for (const existing of ["function global:wsl { 'user wrapper' }", 'Set-Alias wsl Get-Location -Scope Global']) {
				const { stdout } = await powerShell(executable, `
$env:PATH = ${quotePowerShell(directory)} + [IO.Path]::PathSeparator + $env:PATH
${existing}
try {
${createPowerShellPromptScript('machine')}
	throw 'Initialization should have rejected the existing command.'
} catch { $_.Exception.Message }
`, directory);
				assert.match(stdout, /existing wsl alias or function would be overwritten/);
			}
		});
		await t.test(`${executable} matches direct native quoting for passthrough commands`, async () => {
			const args = ['--exec', 'printf', '%s', '', 'a"quoted"value', 'ends\\', '$literal', 'two words', '日本語'];
			const { stdout } = await powerShell(executable, `
$env:PATH = ${quotePowerShell(directory)} + [IO.Path]::PathSeparator + $env:PATH
${createPowerShellPromptScript('machine')}
$ErrorActionPreference = 'Continue'
$direct = wsl.exe ${args.map(quotePowerShell).join(' ')}
$wrapped = wsl ${args.map(quotePowerShell).join(' ')}
@{ direct=$direct; wrapped=$wrapped } | ConvertTo-Json -Compress
`, directory);
			const result: { direct: string; wrapped: string } = JSON.parse(stdout);
			assert.equal(result.wrapped, result.direct);
		});
	}
	assert.deepEqual(await readFile(nativeWsl).then(bytes => [...bytes.subarray(0, 2)]), [0x4d, 0x5a]);
});

test('real WSL interactive Bash loads only the isolated bashrc and inherits the prompt prefix', { skip: process.platform !== 'win32' }, async t => {
	const directory = await mkdtemp(join(packageRoot, '.prompt-scripts-test-'));
	t.after(() => rm(directory, { recursive: true, force: true }));
	const home = join(directory, 'home');
	await mkdir(home);
	const bashrc = `PS1='fixture> '\nPROMPT_COMMAND='PS1="hook> "'\nprintf 'BASHRC_LOADED\\n'\n`;
	await writeFile(join(home, '.bashrc'), bashrc);
	const linuxHome = '/mnt/' + home[0].toLowerCase() + home.slice(2).replaceAll('\\', '/');
	// WSL assigns HOME itself; isolate the outer noninteractive Bash before it starts the rcfile shell.
	await writeFile(join(home, 'wsl-test-env.sh'), `export HOME='${linuxHome.replaceAll("'", "'\\''")}'\nunset BASH_ENV\n`);
	const environment = { ...process.env, WSLENV: 'BASH_ENV/u:TERM/u', TERM: 'dumb', BASH_ENV: `${linuxHome}/wsl-test-env.sh`, ENV: '' };
	try {
		const { stdout } = await execute('wsl.exe', ['-d', 'Ubuntu-22.04', '--exec', 'bash', '--noprofile', '--norc', '-c', 'printenv HOME'], { env: environment, timeout: 20000 });
		if (stdout.trim() !== linuxHome) {
			t.skip('WSL cannot honor the isolated HOME.');
			return;
		}
	} catch {
		t.skip('WSL Ubuntu-22.04 is not available.');
		return;
	}
	for (const executable of powerShells) {
		if (!await available(executable)) {
			continue;
		}
		await t.test(executable, async () => {
			const name = 'wsl-\'"$(touch "$HOME/injected")"`touch "$HOME/injected"`';
			const { stdout, stderr } = await powerShell(executable, `
${createPowerShellPromptScript(name)}
$ErrorActionPreference = 'Continue'
wsl -d Ubuntu-22.04
[Console]::WriteLine("WSL_EXIT:$LASTEXITCODE")
`, directory, environment, `printf 'WSL_PROMPT:%s\\n' "\${PS1@P}"\nexit 23\n`);
			assert.match(stdout, /BASHRC_LOADED/);
			assert.ok(stdout.includes(`WSL_PROMPT:[${name}] hook> `));
			assert.match(stdout, /WSL_EXIT:23/);
			assert.ok(!(stdout + stderr).includes(`[${name}] [${name}]`));
			assert.equal(await doesNotExist(join(home, 'injected')), true);
		});
	}
	assert.equal(await readFile(join(home, '.bashrc'), 'utf8'), bashrc);
});
