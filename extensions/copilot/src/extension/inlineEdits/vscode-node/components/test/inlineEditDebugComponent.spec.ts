/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, suite, test } from 'vitest';
import { LogEntry } from '../../../../../platform/workspaceRecorder/common/workspaceLog';
import { filterLogForSensitiveFiles } from '../inlineEditDebugComponent';

suite('filter recording for sensitive files', () => {
	test('should filter out settings.json files', () => {
		const log: LogEntry[] = [
			{
				documentType: 'workspaceRecording@1.0',
				kind: 'header',
				repoRootUri: 'file:///path/to/repo',
				time: 1733253792609,
				uuid: '233d78f2-202a-4d3e-9b90-0f1acc058125'
			},
			{
				kind: 'documentEncountered',
				id: 1,
				relativePath: 'package.json',
				time: 1733253735332
			},
			{
				kind: 'documentEncountered',
				id: 2,
				relativePath: '.vscode/settings.json',
				time: 1733253735340
			},
			{
				kind: 'setContent',
				id: 1,
				v: 1,
				content: '{ "name": "example" }',
				time: 1733253735332
			},
			{
				kind: 'setContent',
				id: 2,
				v: 1,
				content: '{ "sensitive": "data" }',
				time: 1733253735340
			}
		];

		const result = filterLogForSensitiveFiles(log);

		expect(result).toMatchInlineSnapshot(`
			[
			  {
			    "documentType": "workspaceRecording@1.0",
			    "kind": "header",
			    "repoRootUri": "file:///path/to/repo",
			    "time": 1733253792609,
			    "uuid": "233d78f2-202a-4d3e-9b90-0f1acc058125",
			  },
			  {
			    "id": 1,
			    "kind": "documentEncountered",
			    "relativePath": "package.json",
			    "time": 1733253735332,
			  },
			  {
			    "content": "{ "name": "example" }",
			    "id": 1,
			    "kind": "setContent",
			    "time": 1733253735332,
			    "v": 1,
			  },
			]
		`);
	});

	test('should filter out .env files and variants', () => {
		const log: LogEntry[] = [
			{ documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: 'file:///repo', time: 0, uuid: 'test' },
			{ kind: 'documentEncountered', id: 1, relativePath: '.env', time: 0 },
			{ kind: 'documentEncountered', id: 2, relativePath: '.env.local', time: 0 },
			{ kind: 'documentEncountered', id: 3, relativePath: '.env.production', time: 0 },
			{ kind: 'documentEncountered', id: 4, relativePath: 'app.env', time: 0 },
			{ kind: 'documentEncountered', id: 5, relativePath: 'src/index.ts', time: 0 },
			{ kind: 'setContent', id: 1, v: 1, content: 'SECRET=xyz', time: 0 },
			{ kind: 'setContent', id: 5, v: 1, content: 'console.log(\'hello\')', time: 0 },
		];

		const result = filterLogForSensitiveFiles(log);

		// Only header and src/index.ts should remain
		expect(result.filter(e => e.kind === 'documentEncountered')).toHaveLength(1);
		expect(result.find(e => e.kind === 'documentEncountered')).toMatchObject({
			relativePath: 'src/index.ts'
		});
	});

	test('should filter out private key files', () => {
		const log: LogEntry[] = [
			{ documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: 'file:///repo', time: 0, uuid: 'test' },
			{ kind: 'documentEncountered', id: 1, relativePath: 'server.pem', time: 0 },
			{ kind: 'documentEncountered', id: 2, relativePath: 'private.key', time: 0 },
			{ kind: 'documentEncountered', id: 3, relativePath: 'cert.p12', time: 0 },
			{ kind: 'documentEncountered', id: 4, relativePath: 'cert.pfx', time: 0 },
			{ kind: 'documentEncountered', id: 5, relativePath: 'readme.md', time: 0 },
		];

		const result = filterLogForSensitiveFiles(log);

		expect(result.filter(e => e.kind === 'documentEncountered')).toHaveLength(1);
		expect(result.find(e => e.kind === 'documentEncountered')).toMatchObject({
			relativePath: 'readme.md'
		});
	});

	test('should filter out files in sensitive directories', () => {
		const log: LogEntry[] = [
			{ documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: 'file:///repo', time: 0, uuid: 'test' },
			{ kind: 'documentEncountered', id: 1, relativePath: '.aws/credentials', time: 0 },
			{ kind: 'documentEncountered', id: 2, relativePath: '.ssh/id_rsa', time: 0 },
			{ kind: 'documentEncountered', id: 3, relativePath: '.gnupg/private-keys-v1.d/key.gpg', time: 0 },
			{ kind: 'documentEncountered', id: 4, relativePath: '.docker/config.json', time: 0 },
			{ kind: 'documentEncountered', id: 5, relativePath: 'src/aws/client.ts', time: 0 },
		];

		const result = filterLogForSensitiveFiles(log);

		// Only src/aws/client.ts should remain (it's not in .aws directory)
		expect(result.filter(e => e.kind === 'documentEncountered')).toHaveLength(1);
		expect(result.find(e => e.kind === 'documentEncountered')).toMatchObject({
			relativePath: 'src/aws/client.ts'
		});
	});

	test('should filter out files with sensitive name patterns', () => {
		const log: LogEntry[] = [
			{ documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: 'file:///repo', time: 0, uuid: 'test' },
			{ kind: 'documentEncountered', id: 1, relativePath: 'id_rsa', time: 0 },
			{ kind: 'documentEncountered', id: 2, relativePath: 'id_ed25519.pub', time: 0 },
			{ kind: 'documentEncountered', id: 3, relativePath: 'app.secret.yaml', time: 0 },
			{ kind: 'documentEncountered', id: 4, relativePath: 'normal_file.ts', time: 0 },
		];

		const result = filterLogForSensitiveFiles(log);

		expect(result.filter(e => e.kind === 'documentEncountered')).toHaveLength(1);
		expect(result.find(e => e.kind === 'documentEncountered')).toMatchObject({
			relativePath: 'normal_file.ts'
		});
	});

	test('should filter exact password/token data files but not code files with those words', () => {
		const log: LogEntry[] = [
			{ documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: 'file:///repo', time: 0, uuid: 'test' },
			// These should be filtered (exact sensitive data files)
			{ kind: 'documentEncountered', id: 1, relativePath: 'password.txt', time: 0 },
			{ kind: 'documentEncountered', id: 2, relativePath: 'passwords.json', time: 0 },
			{ kind: 'documentEncountered', id: 3, relativePath: 'token.json', time: 0 },
			{ kind: 'documentEncountered', id: 4, relativePath: 'tokens.txt', time: 0 },
			// These should NOT be filtered (code files that deal with passwords/tokens)
			{ kind: 'documentEncountered', id: 5, relativePath: 'passwordValidator.ts', time: 0 },
			{ kind: 'documentEncountered', id: 6, relativePath: 'tokenAnalyzer.ts', time: 0 },
			{ kind: 'documentEncountered', id: 7, relativePath: 'auth/refreshToken.service.ts', time: 0 },
			{ kind: 'documentEncountered', id: 8, relativePath: 'utils/passwordStrength.ts', time: 0 },
		];

		const result = filterLogForSensitiveFiles(log);

		const remainingPaths = result
			.filter((e): e is LogEntry & { kind: 'documentEncountered' } => e.kind === 'documentEncountered')
			.map(e => e.relativePath);

		// Only code files should remain
		expect(remainingPaths).toEqual([
			'passwordValidator.ts',
			'tokenAnalyzer.ts',
			'auth/refreshToken.service.ts',
			'utils/passwordStrength.ts',
		]);
	});

	test('should filter out other sensitive config files', () => {
		const log: LogEntry[] = [
			{ documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: 'file:///repo', time: 0, uuid: 'test' },
			{ kind: 'documentEncountered', id: 1, relativePath: '.vscode/launch.json', time: 0 },
			{ kind: 'documentEncountered', id: 2, relativePath: '.npmrc', time: 0 },
			{ kind: 'documentEncountered', id: 3, relativePath: '.gitconfig', time: 0 },
			{ kind: 'documentEncountered', id: 4, relativePath: 'credentials.json', time: 0 },
			{ kind: 'documentEncountered', id: 5, relativePath: 'tsconfig.json', time: 0 },
		];

		const result = filterLogForSensitiveFiles(log);

		// Only tsconfig.json should remain
		expect(result.filter(e => e.kind === 'documentEncountered')).toHaveLength(1);
		expect(result.find(e => e.kind === 'documentEncountered')).toMatchObject({
			relativePath: 'tsconfig.json'
		});
	});

	test('should handle Windows-style backslash paths', () => {
		// Windows paths with backslashes are normalized to forward slashes before processing
		// This ensures the function works correctly even when processing logs recorded on Windows
		const log: LogEntry[] = [
			{ documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: 'file:///repo', time: 0, uuid: 'test' },
			{ kind: 'documentEncountered', id: 1, relativePath: '.vscode\\settings.json', time: 0 },
			{ kind: 'documentEncountered', id: 2, relativePath: 'src\\index.ts', time: 0 },
			{ kind: 'documentEncountered', id: 3, relativePath: 'config\\.env.local', time: 0 },
			{ kind: 'documentEncountered', id: 4, relativePath: '.aws\\credentials', time: 0 },
		];

		const result = filterLogForSensitiveFiles(log);

		// Only src\index.ts should remain - others are sensitive
		expect(result.filter(e => e.kind === 'documentEncountered')).toHaveLength(1);
		expect(result.find(e => e.kind === 'documentEncountered')).toMatchObject({
			relativePath: 'src\\index.ts'
		});
	});

	test('should preserve non-document log entries', () => {
		const log: LogEntry[] = [
			{ documentType: 'workspaceRecording@1.0', kind: 'header', repoRootUri: 'file:///repo', time: 0, uuid: 'test' },
			{ kind: 'meta', data: { key: 'value' } },
			{ kind: 'applicationStart', time: 0 },
			{ kind: 'event', time: 0, data: {} },
			{ kind: 'bookmark', time: 0 },
		];

		const result = filterLogForSensitiveFiles(log);

		expect(result).toHaveLength(5);
	});

});
