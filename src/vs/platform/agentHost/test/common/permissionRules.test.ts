/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { type IUrlApprovalSettings } from '../../../url/common/urlApprovalPatterns.js';
import { AgentPermissionKind } from '../../common/agent.js';
import { IPermissionRequest, IPermissionRuleContext, isWebFetchRule, matchesPermissionRule, matchesShellCommandLine, matchesShellSubCommand, parsePermissionGrantOptionId, pathRule, permissionGrantOptionId, PermissionGrantScope, shellExactRule, shellPrefixRule, webFetchRule, webFetchRuleToUrlPattern, urlApprovalsToWebFetchRules } from '../../common/permissionRules.js';

suite('Permission rules', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const context: IPermissionRuleContext = { workingDirectory: '/project', homeDirectory: '/home/user' };

	test('grant option ids round-trip session and host grants with unchanged prefixes', () => {
		const cases = [
			{ scope: PermissionGrantScope.Session, rules: [], id: 'allow-session-rules:[]' },
			{ scope: PermissionGrantScope.Session, rules: ['Shell(npm run *)', 'Read(//repo/(nested)/file.ts)'], id: 'allow-session-rules:["Shell(npm run *)","Read(//repo/(nested)/file.ts)"]' },
			{ scope: PermissionGrantScope.Host, rules: ['WebFetch(*.example.com)'], id: 'allow-always-rules:["WebFetch(*.example.com)"]' },
			{ scope: PermissionGrantScope.Host, rules: [], id: 'allow-always-rules:[]' },
		];
		assert.deepStrictEqual(cases.map(({ scope, rules }) => {
			const id = permissionGrantOptionId(scope, rules);
			return { id, grant: parsePermissionGrantOptionId(id) };
		}), cases.map(({ scope, rules, id }) => ({ id, grant: { scope, rules } })));
	});

	test('foreign ids and malformed grant payloads are ignored', () => {
		const ids = [
			'allow-once', 'allow-session', 'skip', 'foreign:[]', 'allow-session-rules[]', 'allow-always-rules[]',
			...[PermissionGrantScope.Session, PermissionGrantScope.Host].flatMap(scope => {
				const prefix = permissionGrantOptionId(scope, []).slice(0, -2);
				return ['', '[', '[] trailing', 'null', '{}', 'true', '1', '"Shell"', '[null]', '[1]', '["Shell",false]', '[{}]', '[["Shell"]]'].map(payload => prefix + payload);
			}),
		];
		assert.deepStrictEqual(ids.map(id => [id, parsePermissionGrantOptionId(id)]), ids.map(id => [id, undefined]));
	});

	test('WebFetch rules convert to URL approval patterns with a default HTTPS scheme', () => {
		const cases: [string, string | undefined][] = [
			['WebFetch(peet.io)', 'https://peet.io'],
			[' WebFetch(EXAMPLE.COM) ', 'https://EXAMPLE.COM'],
			['WebFetch(*.example.com)', 'https://*.example.com'],
			['WebFetch(localhost)', 'https://localhost'],
			['WebFetch(127.0.0.1)', 'https://127.0.0.1'],
			['WebFetch([::1])', 'https://[::1]'],
			['WebFetch', '*'],
			['WebFetch(*)', '*'],
			['WebFetch(github.com/microsoft/vscode/wiki/*)', 'https://github.com/microsoft/vscode/wiki/*'],
			['WebFetch(https://github.com/microsoft/vscode/wiki/*)', 'https://github.com/microsoft/vscode/wiki/*'],
			['WebFetch(HTTPS://example.com)', 'HTTPS://example.com'],
			['WebFetch(http://localhost:3000/path?query)', 'http://localhost:3000/path?query'],
			['WebFetch(example.com:8443/path)', 'https://example.com:8443/path'],
			['WebFetch()', undefined],
			['WebFetch(example.com', undefined],
			['WebFetch(example.com))', undefined],
			['webfetch(example.com)', undefined],
			['Read(example.com)', undefined],
			['', undefined],
		];
		assert.deepStrictEqual(cases.map(([rule]) => [rule, webFetchRuleToUrlPattern(rule)]), cases);
	});

	test('URL request decisions convert to sorted and deduplicated WebFetch permissions', () => {
		const cases: { approvals: Record<string, boolean | IUrlApprovalSettings>; allow: string[]; ask: string[] }[] = [
			{ approvals: {}, allow: [], ask: [] },
			{ approvals: { '*': true }, allow: ['WebFetch'], ask: [] },
			{ approvals: { '*': { approveRequest: true, approveResponse: false } }, allow: ['WebFetch'], ask: [] },
			{
				approvals: { 'https://peet.io': true, 'HTTPS://peet.io': true, 'peet.io': true, 'http://example.com': { approveRequest: true }, 'https://*.example.com': true },
				allow: ['WebFetch(*.example.com)', 'WebFetch(http://example.com)', 'WebFetch(peet.io)'], ask: [],
			},
			{
				approvals: { 'https://github.com/microsoft/vscode/wiki/*': { approveRequest: true }, 'https://example.com/': true, 'https://example.com?query': true, 'https://example.com#fragment': true, 'http://localhost:3000': true },
				allow: ['WebFetch(example.com#fragment)', 'WebFetch(example.com/)', 'WebFetch(example.com?query)', 'WebFetch(github.com/microsoft/vscode/wiki/*)', 'WebFetch(http://localhost:3000)'], ask: [],
			},
			{
				approvals: { '*': false, 'https://denied.test': { approveRequest: false, approveResponse: true }, 'https://response.test': { approveResponse: true }, 'https://response-refused.test': { approveResponse: false }, 'https://unset.test': {} },
				allow: [], ask: ['WebFetch', 'WebFetch(denied.test)'],
			},
			{
				approvals: { 'https://api.example.com': { approveRequest: false }, 'https://*.example.com': true },
				allow: ['WebFetch(*.example.com)'], ask: ['WebFetch(api.example.com)'],
			},
			{
				approvals: { 'https://*.example.com': true, 'https://api.example.com': false, 'HTTPS://api.example.com': { approveRequest: false }, 'api.example.com': false, 'http://localhost': false },
				allow: ['WebFetch(*.example.com)'], ask: ['WebFetch(api.example.com)', 'WebFetch(http://localhost)'],
			},
		];
		assert.deepStrictEqual(cases.map(({ approvals }) => urlApprovalsToWebFetchRules(approvals)), cases.map(({ allow, ask }) => ({ allow, ask })));
	});

	test('identifies WebFetch rules independently of their specifier', () => {
		const cases: [string, boolean][] = [
			['WebFetch', true],
			[' WebFetch(*) ', true],
			['WebFetch(example.com)', true],
			['WebFetch(https://example.com/docs/*)', true],
			['WebFetch(unsupported)', true],
			['WebFetch()', false],
			['WebFetch(example.com', false],
			['WebFetch(example.com))', false],
			['webfetch', false],
			['Read', false],
			['', false],
		];
		assert.deepStrictEqual(cases.map(([rule]) => [rule, isWebFetchRule(rule)]), cases);
	});

	test('shell wildcard table and literal regular expression characters', () => {
		const cases: [string, string, boolean][] = [
			['Shell(npm run build)', 'npm run build', true],
			['Shell(npm run build)', '  npm run build  ', true],
			['Shell(npm run build)', 'npm run build --watch', false],
			['Shell(npm run *)', 'npm run build', true],
			['Shell(npm run *)', 'npm run test -- --watch', true],
			['Shell(npm run *)', 'npm run', true],
			['Shell(npm run *)', 'npm runner', false],
			['Shell(git log * main)', 'git log --oneline main', true],
			['Shell(git log * main)', 'git log -n 5 main', true],
			['Shell(git log * main)', 'git log main', false],
			['Shell(git log * main)', 'git log --oneline main --all', false],
			['Shell(* --version)', 'node --version', true],
			['Shell(* --version)', 'npm --version', true],
			['Shell(* --version)', 'node --versions', false],
			['Shell(ls *)', 'ls', true],
			['Shell(ls *)', 'ls -la', true],
			['Shell(ls *)', 'lsof', false],
			['Shell(ls*)', 'ls', true],
			['Shell(ls*)', 'lsof', true],
			['Shell(ls:*)', 'ls', true],
			['Shell(ls:*)', 'ls -la', true],
			['Shell(ls:*)', 'lsof', false],
			['Shell(git:* push)', 'git:origin push', true],
			['Shell(git:* push)', 'git: push', true],
			['Shell(git:* push)', 'git origin push', false],
			['Shell(git:* push)', 'git push', false],
			['Shell(echo *)', 'echo first\nsecond', true],
			['Shell(echo (nested (value)))', 'echo (nested (value))', true],
			['Shell(echo $HOME.[x]+?(ok)|^\\end{a})', 'echo $HOME.[x]+?(ok)|^\\end{a}', true],
			['Shell(echo file.txt)', 'echo fileXtxt', false],
			['Shell(echo [abc])', 'echo a', false],
		];
		assert.deepStrictEqual(cases.map(([rule, command]) => [rule, command, matchesShellSubCommand(rule, command, 'bash')]), cases);
	});

	test('shell regex specifiers validate expressions and ignore PowerShell casing', () => {
		const cases: [string, string, 'bash' | 'powershell', boolean][] = [
			['Shell(/^git\\s+(log|status)\\b/)', 'git status --short', 'bash', true],
			['Shell(/^git\\s+(log|status)\\b/)', 'git push', 'bash', false],
			['Shell(/^GET-CHILDITEM$/)', 'get-childitem', 'powershell', true],
			['Shell(/^GET-CHILDITEM$/)', 'get-childitem', 'bash', false],
			['Shell(/^GET-CHILDITEM$/i)', 'get-childitem', 'bash', true],
			['Shell(/^git/g)', 'git status', 'bash', true],
			['Shell(/^git/ii)', 'git status', 'bash', false],
			['Shell(/^git/gg)', 'git status', 'bash', false],
			['Shell(/^git/z)', 'git status', 'bash', false],
			['Shell(/[/)', 'git status', 'bash', false],
			['Shell(/(/)', 'git status', 'bash', false],
			['Shell(/a*/)', 'git status', 'bash', false],
			['Shell(/.*/)', 'custom --flag', 'bash', true],
			['Shell(/^echo \\(/)', 'echo (literal', 'bash', true],
			['Shell(/usr/bin/ls)', '/usr/bin/ls', 'bash', true],
		];
		assert.deepStrictEqual(cases.map(([rule, command, language]) => [rule, command, language, matchesShellSubCommand(rule, command, language)]), cases);
	});

	test('commandLine specifiers match only the full trimmed line', () => {
		const cases: [string, string, 'bash' | 'powershell', boolean][] = [
			['Shell(commandLine:npm run * && git status)', '  npm run build && git status  ', 'bash', true],
			['Shell(commandLine:npm run build)', 'npm run build && git status', 'bash', false],
			['Shell(commandLine:/^npm run build && git status$/)', 'npm run build && git status', 'bash', true],
			['Shell(commandLine:/^GET-CHILDITEM; WRITE-HOST ok$/)', 'get-childitem; write-host ok', 'powershell', true],
			['Shell(commandLine:/[/)', 'git status', 'bash', false],
			['Shell(commandLine:)', 'git status', 'bash', false],
			['Shell(git *)', 'git status', 'bash', false],
		];
		assert.deepStrictEqual({
			lines: cases.map(([rule, command, language]) => [rule, command, language, matchesShellCommandLine(rule, command, language)]),
			subCommand: matchesShellSubCommand('Shell(commandLine:git *)', 'git status', 'bash'),
		}, { lines: cases, subCommand: false });
	});

	test('shell rules cover both languages and only PowerShell ignores case', () => {
		const cases: [string, string, 'bash' | 'powershell', boolean][] = [
			['Shell(Get-ChildItem *)', 'get-childitem', 'powershell', true],
			['Shell(Get-ChildItem *)', 'GET-CHILDITEM -Force', 'powershell', true],
			['Shell(Get-ChildItem)', 'get-childitem', 'powershell', true],
			['Shell(Get-ChildItem)', 'Get-ChildItem -Force', 'powershell', false],
			['Shell(Get-ChildItem)', 'get-childitem', 'bash', false],
			['Shell(Git *)', 'git status', 'bash', false],
			['Shell(git *)', 'git status', 'powershell', true],
			['Shell(git *)', 'git status', 'bash', true],
			['shell', 'anything', 'bash', false],
			['Shell', 'anything', 'bash', true],
			['Shell', 'anything', 'powershell', true],
			['Shell(*)', 'anything', 'bash', true],
			['Shell(*)', 'anything', 'powershell', true],
			['Bash', 'anything', 'bash', false],
			['Bash(git *)', 'git status', 'bash', false],
			['PowerShell', 'anything', 'powershell', false],
			['PowerShell(git *)', 'git status', 'powershell', false],
		];
		assert.deepStrictEqual(cases.map(([rule, command, language]) => [rule, command, language, matchesShellSubCommand(rule, command, language)]), cases);
	});

	test('whole requests use canonical kinds and exact generic tool names', () => {
		const cases: [string, IPermissionRequest, boolean][] = [
			['Shell', { kind: AgentPermissionKind.Shell, toolName: 'run_in_terminal' }, true],
			['Shell(*)', { kind: AgentPermissionKind.Shell, toolName: 'bash', shellLanguage: 'bash' }, true],
			['Shell(ls *)', { kind: AgentPermissionKind.Shell, toolName: 'bash' }, false],
			['Shell', { kind: AgentPermissionKind.Shell, toolName: 'run_in_terminal', shellLanguage: 'powershell' }, true],
			['Shell(*)', { kind: AgentPermissionKind.Shell, toolName: 'powershell', shellLanguage: 'powershell' }, true],
			['Shell(Get-ChildItem *)', { kind: AgentPermissionKind.Shell, toolName: 'powershell', shellLanguage: 'powershell' }, false],
			['Shell', { kind: AgentPermissionKind.Read, toolName: 'Shell' }, false],
			['Bash', { kind: AgentPermissionKind.Shell, toolName: 'run_in_terminal' }, false],
			['Bash', { kind: AgentPermissionKind.Shell, toolName: 'Bash', shellLanguage: 'powershell' }, true],
			['Bash(*)', { kind: AgentPermissionKind.Read, toolName: 'Bash' }, true],
			['Bash(git *)', { kind: AgentPermissionKind.Shell, toolName: 'Bash' }, false],
			['PowerShell', { kind: AgentPermissionKind.Shell, toolName: 'PowerShell', shellLanguage: 'bash' }, true],
			['PowerShell(*)', { kind: AgentPermissionKind.Read, toolName: 'PowerShell' }, true],
			['PowerShell(git *)', { kind: AgentPermissionKind.Shell, toolName: 'PowerShell' }, false],
			['WebFetch', { kind: AgentPermissionKind.Url, toolName: 'web_fetch' }, true],
			['WebFetch(*)', { kind: AgentPermissionKind.Url, toolName: 'fetch' }, true],
			['WebFetch', { kind: AgentPermissionKind.Shell, toolName: 'WebFetch' }, false],
			['Read', { kind: AgentPermissionKind.Read, toolName: 'read_file' }, true],
			['Read(*)', { kind: AgentPermissionKind.Read, toolName: 'read_file' }, true],
			['Edit', { kind: AgentPermissionKind.Write, toolName: 'create_file' }, true],
			['Edit(*)', { kind: AgentPermissionKind.Write, toolName: 'delete_file' }, true],
			['Read', { kind: AgentPermissionKind.Write, toolName: 'Read' }, false],
			['Edit', { kind: AgentPermissionKind.Read, toolName: 'Edit' }, false],
			['bash', { kind: AgentPermissionKind.Shell, toolName: 'bash' }, true],
			['bash', { kind: AgentPermissionKind.Shell, toolName: 'run_in_terminal' }, false],
			['bash', { kind: AgentPermissionKind.CustomTool, toolName: 'BASH' }, false],
			['web_fetch', { kind: AgentPermissionKind.Url, toolName: 'web_fetch' }, true],
			['mcp__server__tool', { kind: AgentPermissionKind.Mcp, toolName: 'mcp__server__tool' }, true],
			['mcp__server__tool(*)', { kind: AgentPermissionKind.Mcp, toolName: 'mcp__server__tool' }, true],
			['mcp__server__tool(specific)', { kind: AgentPermissionKind.Mcp, toolName: 'mcp__server__tool' }, false],
			['bash(ls *)', { kind: AgentPermissionKind.Shell, toolName: 'bash' }, false],
			[' Shell(*) ', { kind: AgentPermissionKind.Shell, toolName: 'bash' }, true],
			['my_tool', { kind: undefined, toolName: 'my_tool' }, true],
		];
		assert.deepStrictEqual(cases.map(([rule, request]) => [rule, request, matchesPermissionRule(rule, request, context)]), cases);
	});

	test('path matching optionally ignores case for exact paths and globs', () => {
		const request: IPermissionRequest = { kind: AgentPermissionKind.Read, toolName: 'read_file', path: '/project/src/App.ts' };
		const rules = ['Read(./SRC/App.ts)', 'Read(./SRC/**)'];
		assert.deepStrictEqual(rules.map(rule => [
			matchesPermissionRule(rule, request, context),
			matchesPermissionRule(rule, request, { ...context, ignorePathCase: true }),
		]), [[false, true], [false, true]]);
	});

	test('malformed rules never match', () => {
		const rules = ['', '  ', '(ls)', 'Shell()', 'Shell( )', 'Shell(ls', 'Shell(ls))', 'Shell((ls)', 'Shell(ls)tail', 'Bash)', 'Bash ls', 'Shell(ls)(pwd)', 'Shell(ls) (pwd)', 'Shell(echo )()'];
		assert.deepStrictEqual(rules.map(rule => ({
			rule,
			wholeRequest: matchesPermissionRule(rule, { kind: AgentPermissionKind.Shell, toolName: rule }, context),
			subCommand: matchesShellSubCommand(rule, 'ls', 'bash'),
		})), rules.map(rule => ({ rule, wholeRequest: false, subCommand: false })));
	});

	test('WebFetch patterns default to HTTPS and use shared hostname and path matching', () => {
		const cases: [string, string | undefined, boolean][] = [
			['WebFetch(peet.io)', 'https://peet.io/x', true],
			['WebFetch(peet.io)', 'http://peet.io/x', false],
			['WebFetch(peet.io)', 'https://sub.peet.io', false],
			['WebFetch(peet.io)', 'https://peet.io.evil.test', false],
			['WebFetch(PEET.IO)', 'https://Peet.IO/path', true],
			['WebFetch(peet.io:8443)', 'https://peet.io:8443/path', true],
			['WebFetch(peet.io:8443)', 'https://peet.io/path', false],
			['WebFetch(*.peet.io)', 'https://sub.peet.io/path', true],
			['WebFetch(*.PEET.IO)', 'https://a.b.Peet.IO', true],
			['WebFetch(*.peet.io)', 'https://peet.io', true],
			['WebFetch(*.peet.io)', 'https://notpeet.io', false],
			['WebFetch(*.peet.io)', 'http://sub.peet.io/path', false],
			['WebFetch(http://example.com)', 'http://example.com/path', true],
			['WebFetch(http://example.com)', 'https://example.com/path', false],
			['WebFetch(github.com/microsoft/vscode/wiki/*)', 'https://github.com/microsoft/vscode/wiki/Home', true],
			['WebFetch(github.com/microsoft/vscode/wiki/*)', 'https://github.com/microsoft/vscode/issues/1', false],
			['WebFetch(peet.io)', 'not a URL', false],
			['WebFetch(peet.io)', undefined, false],
		];
		assert.deepStrictEqual(cases.map(([rule, url]) => [rule, url, matchesPermissionRule(rule, { kind: AgentPermissionKind.Url, toolName: 'fetch', url }, context)]), cases);
	});

	test('WebFetch URL patterns use VS Code URL approval semantics', () => {
		const cases: [string, string | undefined, boolean][] = [
			['https://github.com/microsoft/vscode/wiki/*', 'https://github.com/Microsoft/VSCode/wiki/Home', true],
			['https://github.com/microsoft/vscode/wiki/*', 'https://github.com/microsoft/vscode/issues/1', false],
			['https://github.com/microsoft/vscode/wiki/*', 'http://github.com/microsoft/vscode/wiki/Home', false],
			['https://github.com/microsoft/vscode/wiki/*', 'https://github.com/microsoft/vscode/wiki/../issues/1', false],
			['https://*.example.com', 'https://a.example.com/path', true],
			['https://*.example.com', 'https://example.com.evil.test', false],
			['https://example.com/docs/*', 'https://example.com/Docs/page', false],
			['https://example.com/docs/*', 'https://example.com/docs/page?query#fragment', true],
			['https://example.com/docs/*', 'https://user@example.com/docs/page', false],
			['https://example.com/docs/*', 'not a URL', false],
			['https://example.com/docs/*', undefined, false],
		];
		assert.deepStrictEqual(cases.map(([pattern, url]) => [pattern, url, matchesPermissionRule(`WebFetch(${pattern})`, { kind: AgentPermissionKind.Url, toolName: 'fetch', url }, context)]), cases);
	});

	test('Read and Edit resolve Claude path anchors and glob patterns', () => {
		const cases: [string, AgentPermissionKind.Read | AgentPermissionKind.Write, string | undefined, boolean][] = [
			['Read(//var/log/app.log)', AgentPermissionKind.Read, '/var/log/app.log', true],
			['Read(//var/log/app.log)', AgentPermissionKind.Read, '/project/var/log/app.log', false],
			['Read(~/notes/**)', AgentPermissionKind.Read, '/home/user/notes/today.md', true],
			['Read(~/notes/**)', AgentPermissionKind.Read, '/home/other/notes/today.md', false],
			['Read(/src/**)', AgentPermissionKind.Read, '/project/src/file.ts', true],
			['Read(/src/**)', AgentPermissionKind.Read, '/src/file.ts', false],
			['Read(./src/**)', AgentPermissionKind.Read, '/project/src/deep/file.ts', true],
			['Read(src/**)', AgentPermissionKind.Read, '/project/src/file.ts', true],
			['Read(src/**)', AgentPermissionKind.Read, '/project/src/deep/file.ts', true],
			['Read(src/**)', AgentPermissionKind.Read, '/project/src-other/file.ts', false],
			['Read(src/**/*.ts)', AgentPermissionKind.Read, '/project/src/file.ts', true],
			['Read(src/**/*.ts)', AgentPermissionKind.Read, '/project/src/deep/file.ts', true],
			['Read(src/**/*.ts)', AgentPermissionKind.Read, '/project/src/deep/file.js', false],
			['Read(src/*.ts)', AgentPermissionKind.Read, '/project/src/deep/file.ts', false],
			['Read(src/file.ts)', AgentPermissionKind.Read, '/project/src/file.ts', true],
			['Read(src/file.ts)', AgentPermissionKind.Read, '/project/src/fileXts', false],
			['Read(src/file )', AgentPermissionKind.Read, '/project/src/file ', true],
			['Read(src/file )', AgentPermissionKind.Read, '/project/src/file', false],
			['Read(src)', AgentPermissionKind.Read, '/project/src', true],
			['Read(src)', AgentPermissionKind.Read, '/project/src/file.ts', false],
			['Read(src/file.ts)', AgentPermissionKind.Read, '/project/src/../src/file.ts', true],
			['Read(./src/../README.md)', AgentPermissionKind.Read, '/project/README.md', true],
			['Read(src/**)', AgentPermissionKind.Read, '/project/SRC/file.ts', false],
			['Read(src/**)', AgentPermissionKind.Read, 'src/file.ts', false],
			['Read(src/**)', AgentPermissionKind.Read, undefined, false],
			['Edit(/src/**)', AgentPermissionKind.Write, '/project/src/file.ts', true],
			['Edit(/src/**)', AgentPermissionKind.Read, '/project/src/file.ts', false],
			['Read(/src/**)', AgentPermissionKind.Write, '/project/src/file.ts', false],
		];
		assert.deepStrictEqual(cases.map(([rule, kind, path]) => [rule, kind, path, matchesPermissionRule(rule, { kind, toolName: 'file_tool', path }, context)]), cases);
	});

	test('absolute and home patterns work without a project, relative patterns fail closed', () => {
		const cases: [string, IPermissionRuleContext, string, boolean][] = [
			['Read(//var/log/**)', { homeDirectory: '/home/user' }, '/var/log/app.log', true],
			['Read(~/notes/**)', { homeDirectory: '/home/user' }, '/home/user/notes/today.md', true],
			['Read(/src/**)', { homeDirectory: '/home/user' }, '/src/file.ts', false],
			['Read(./src/**)', { homeDirectory: '/home/user' }, '/src/file.ts', false],
			['Read(src/**)', { homeDirectory: '/home/user' }, '/src/file.ts', false],
			['Read(src/**)', { workingDirectory: 'relative', homeDirectory: '/home/user' }, '/src/file.ts', false],
			['Read(~/notes/**)', { homeDirectory: 'relative' }, '/notes/today.md', false],
		];
		assert.deepStrictEqual(cases.map(([rule, directories, path]) => [rule, directories, path, matchesPermissionRule(rule, { kind: AgentPermissionKind.Read, toolName: 'read_file', path }, directories)]), cases);
	});

	test('Windows paths use POSIX separators and remain case-sensitive', () => {
		const windows: IPermissionRuleContext = { workingDirectory: 'C:\\project', homeDirectory: 'C:\\Users\\user' };
		const cases: [string, string, boolean][] = [
			['Read(./src/**)', 'C:\\project\\src\\file.ts', true],
			['Read(/src/**)', 'C:/project/src/file.ts', true],
			['Read(src\\**)', 'C:\\project\\src\\deep\\file.ts', true],
			['Read(~/notes/**)', 'C:\\Users\\user\\notes\\today.md', true],
			['Read(//C:/external/**)', 'C:\\external\\file.ts', true],
			['Read(C:\\external\\**)', 'C:\\external\\file.ts', true],
			['Read(./src/**)', 'c:\\project\\src\\file.ts', false],
			['Read(./src/**)', 'C:\\project\\SRC\\file.ts', false],
		];
		assert.deepStrictEqual(cases.map(([rule, path]) => [rule, path, matchesPermissionRule(rule, { kind: AgentPermissionKind.Read, toolName: 'read_file', path }, windows)]), cases);
	});

	test('path rule builders produce absolute grants and refuse unsafe or relative paths', () => {
		const cases: ['Read' | 'Edit', string, boolean, string | undefined][] = [
			['Read', '/repo/a.ts', false, 'Read(//repo/a.ts)'],
			['Edit', '/repo', true, 'Edit(//repo/**)'],
			['Read', 'C:\\repo\\a.ts', false, 'Read(//C:/repo/a.ts)'],
			['Edit', 'C:\\repo\\a.ts', true, 'Edit(//C:/repo/a.ts/**)'],
			['Read', '/repo/(nested)/a.ts', false, 'Read(//repo/(nested)/a.ts)'],
			['Read', '/repo/*.ts', false, undefined],
			['Edit', '/repo/a?.ts', true, undefined],
			['Read', '/repo/[a].ts', false, undefined],
			['Edit', '/repo/a].ts', true, undefined],
			['Read', '/repo/{a,b}.ts', false, undefined],
			['Edit', '/repo/a}.ts', true, undefined],
			['Read', '/repo/(a.ts', false, undefined],
			['Edit', '/repo/a).ts', true, undefined],
			['Read', '/repo/)(/a.ts', false, undefined],
			['Read', 'repo/a.ts', false, undefined],
			['Edit', './repo', true, undefined],
			['Read', 'C:repo\\a.ts', false, undefined],
		];
		assert.deepStrictEqual(cases.map(([tool, path, recursive]) => [tool, path, recursive, pathRule(tool, path, recursive)]), cases);
	});

	test('generated path rules match their source files and recursive descendants', () => {
		const cases: ['Read' | 'Edit', string, boolean, string][] = [
			['Read', '/repo/a.ts', false, '/repo/a.ts'],
			['Edit', '/repo', true, '/repo/src/a.ts'],
			['Read', 'C:\\repo\\a.ts', false, 'C:\\repo\\a.ts'],
			['Edit', 'C:\\repo', true, 'C:\\repo\\src\\a.ts'],
			['Read', '/repo/(nested)/a.ts', false, '/repo/(nested)/a.ts'],
		];
		assert.deepStrictEqual(cases.map(([tool, path, recursive, candidate]) => {
			const rule = pathRule(tool, path, recursive);
			return rule !== undefined && matchesPermissionRule(rule, { kind: tool === 'Read' ? AgentPermissionKind.Read : AgentPermissionKind.Write, toolName: 'file_tool', path: candidate }, context);
		}), [true, true, true, true, true]);
	});

	test('shell builders preserve literal text that resembles a specifier', () => {
		const cases = [
			{ command: '/usr/bin/su', exact: 'Shell(/^\\/usr\\/bin\\/su$/)', prefix: 'Shell(/usr/bin/su *)' },
			{ command: '/usr/bin/ls', exact: 'Shell(/usr/bin/ls)', prefix: 'Shell(/usr/bin/ls *)' },
			{ command: '/^echo$/i', exact: 'Shell(/^\\/\\^echo\\$\\/i$/)', prefix: 'Shell(/^echo$/i *)' },
			{ command: 'commandLine:echo', exact: 'Shell(/^commandLine:echo$/)', prefix: 'Shell(/^commandLine:echo(?: .*)?$/s)' },
		];
		assert.deepStrictEqual(cases.map(({ command }) => ({
			command,
			exact: shellExactRule(command),
			prefix: shellPrefixRule(command),
			exactMatches: [command, `${command} argument`, '/usr/bin/touch /tmp/x'].map(candidate => matchesShellSubCommand(shellExactRule(command)!, candidate, 'bash')),
			prefixMatches: [command, `${command} argument`, '/usr/bin/touch /tmp/x'].map(candidate => matchesShellSubCommand(shellPrefixRule(command), candidate, 'bash')),
			commandLineMatches: matchesShellCommandLine(shellPrefixRule(command), command, 'bash'),
		})), cases.map(entry => ({ ...entry, exactMatches: [true, false, false], prefixMatches: [true, true, false], commandLineMatches: false })));
	});

	test('session rule builders preserve exact and prefix semantics', () => {
		assert.deepStrictEqual({
			prefix: shellPrefixRule(' git log '),
			powerShellPrefix: shellPrefixRule('Get-ChildItem'),
			exact: shellExactRule(' npm test '),
			powerShellExact: shellExactRule('Get-ChildItem'),
			parentheses: shellExactRule('echo (hello (world))'),
			refused: ['', '  ', 'npm *', 'echo "*"', 'git:*', 'echo (', 'echo )', 'echo )('].map(command => shellExactRule(command)),
			host: webFetchRule('example.com'),
			urlPattern: webFetchRule('github.com/microsoft/vscode/wiki/*'),
			http: webFetchRule('http://example.com'),
			subdomains: webFetchRule('*.example.com'),
			prefixMatches: ['git log', 'git log --oneline', 'git logger'].map(command => matchesShellSubCommand(shellPrefixRule('git log'), command, 'bash')),
			exactMatches: ['npm test', 'npm test --watch'].map(command => matchesShellSubCommand(shellExactRule('npm test')!, command, 'bash')),
		}, {
			prefix: 'Shell(git log *)',
			powerShellPrefix: 'Shell(Get-ChildItem *)',
			exact: 'Shell(npm test)',
			powerShellExact: 'Shell(Get-ChildItem)',
			parentheses: 'Shell(echo (hello (world)))',
			refused: [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined],
			host: 'WebFetch(example.com)',
			urlPattern: 'WebFetch(github.com/microsoft/vscode/wiki/*)',
			http: 'WebFetch(http://example.com)',
			subdomains: 'WebFetch(*.example.com)',
			prefixMatches: [true, true, false],
			exactMatches: [true, false],
		});
	});
});
