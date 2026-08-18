/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import type * as proto from '../client/protocol';
import { getAbsoluteUri, MdLinkOpener } from '../util/openDocumentLink';

const sourceResource = vscode.Uri.file('/workspace/source.md');

suite('Open Markdown document link', () => {
	test('recognizes absolute links without treating relative links as URIs', () => {
		assert.deepStrictEqual({
			github: getAbsoluteUri('https://github.com/microsoft/vscode/issues/123')?.toString(),
			session: getAbsoluteUri('agent-host-session://copilotcli/session-id?chat=chat-id')?.toString(),
			file: getAbsoluteUri('file:///workspace/readme.md')?.toString(),
			windowsForwardSlash: getAbsoluteUri('C:/workspace/readme.md'),
			windowsBackslash: getAbsoluteUri('C:\\workspace\\readme.md'),
			relative: getAbsoluteUri('./readme.md'),
		}, {
			github: 'https://github.com/microsoft/vscode/issues/123',
			session: 'agent-host-session://copilotcli/session-id?chat%3Dchat-id',
			file: 'file:///workspace/readme.md',
			windowsForwardSlash: undefined,
			windowsBackslash: undefined,
			relative: undefined,
		});
	});

	test('prefers an existing normally resolved target over an absolute file path', async () => {
		const absoluteTarget = vscode.Uri.file('/absolute/target.md');
		const resolvedTarget = vscode.Uri.file('/workspace/absolute/target.md');
		const opener = createLinkOpener(
			{ kind: 'file', uri: resolvedTarget },
			[resolvedTarget, absoluteTarget],
		);

		const result = await opener.resolveDocumentLink('/absolute/target.md', sourceResource);

		assert.ok(result);
		assert.strictEqual(vscode.Uri.from(result.uri).toString(), resolvedTarget.toString());
	});

	test('falls back to an existing absolute file path when normal resolution is missing', async () => {
		const absoluteTarget = vscode.Uri.file('/absolute/target.md');
		const resolvedTarget = vscode.Uri.file('/workspace/absolute/target.md');
		const opener = createLinkOpener(
			{ kind: 'file', uri: resolvedTarget },
			[absoluteTarget],
		);

		const result = await opener.resolveDocumentLink('/absolute/target.md#L3', sourceResource);

		assert.ok(result);
		assert.strictEqual(result.kind, 'file');
		assert.strictEqual(vscode.Uri.from(result.uri).toString(), absoluteTarget.toString());
	});

	test('falls back to Windows absolute file paths with either slash style', async () => {
		const forwardSlashTarget = vscode.Uri.file('C:/absolute/forward.md');
		const backslashTarget = vscode.Uri.file('C:\\absolute\\backward.md');
		const resolvedTarget = vscode.Uri.file('/workspace/missing.md');
		const opener = createLinkOpener(
			{ kind: 'file', uri: resolvedTarget },
			[forwardSlashTarget, backslashTarget],
		);

		const forwardSlashResult = await opener.resolveDocumentLink('C:/absolute/forward.md', sourceResource);
		const backslashResult = await opener.resolveDocumentLink('C:\\absolute\\backward.md', sourceResource);

		assert.ok(forwardSlashResult);
		assert.ok(backslashResult);
		assert.strictEqual(vscode.Uri.from(forwardSlashResult.uri).toString(), forwardSlashTarget.toString());
		assert.strictEqual(vscode.Uri.from(backslashResult.uri).toString(), backslashTarget.toString());
	});

	test('preserves the source scheme and authority for remote absolute paths', async () => {
		const source = vscode.Uri.parse('vscode-remote://ssh-remote+test/workspace/source.md');
		const absoluteTarget = source.with({ path: '/absolute/target.md' });
		const resolvedTarget = source.with({ path: '/workspace/absolute/target.md' });
		const opener = createLinkOpener(
			{ kind: 'file', uri: resolvedTarget },
			[absoluteTarget],
		);

		const result = await opener.resolveDocumentLink('/absolute/target.md', source);

		assert.ok(result);
		assert.strictEqual(vscode.Uri.from(result.uri).toString(), absoluteTarget.toString());
	});

	test('does not reinterpret an absolute directory as a file', async () => {
		const absoluteTarget = vscode.Uri.file('/absolute/folder');
		const resolvedTarget = vscode.Uri.file('/workspace/absolute/folder');
		const opener = createLinkOpener(
			{ kind: 'file', uri: resolvedTarget },
			[absoluteTarget],
			{ fileType: vscode.FileType.Directory },
		);

		const result = await opener.resolveDocumentLink('/absolute/folder', sourceResource);

		assert.ok(result);
		assert.strictEqual(vscode.Uri.from(result.uri).toString(), resolvedTarget.toString());
	});

	test('preserves normal resolution when the absolute file path is also missing', async () => {
		const resolvedTarget = vscode.Uri.file('/workspace/absolute/missing.md');
		const opener = createLinkOpener(
			{ kind: 'file', uri: resolvedTarget },
			[],
		);

		const result = await opener.resolveDocumentLink('/absolute/missing.md', sourceResource);

		assert.ok(result);
		assert.strictEqual(vscode.Uri.from(result.uri).toString(), resolvedTarget.toString());
	});

	test('does not fall back to an absolute file path unless explicitly enabled', async () => {
		const absoluteTarget = vscode.Uri.file('/absolute/target.md');
		const resolvedTarget = vscode.Uri.file('/workspace/absolute/target.md');
		const opener = createLinkOpener(
			{ kind: 'file', uri: resolvedTarget },
			[absoluteTarget],
			{ allowAbsoluteFilePathFallback: false },
		);

		const result = await opener.resolveDocumentLink('/absolute/target.md', sourceResource);

		assert.ok(result);
		assert.strictEqual(vscode.Uri.from(result.uri).toString(), resolvedTarget.toString());
	});

	test('resolves an existing file URI when normal resolution has no target', async () => {
		const absoluteTarget = vscode.Uri.file('/absolute/target.md');
		const opener = createLinkOpener(undefined, [absoluteTarget]);

		const result = await opener.resolveDocumentLink(absoluteTarget.toString(), sourceResource);

		assert.ok(result);
		assert.strictEqual(result.kind, 'file');
		assert.strictEqual(vscode.Uri.from(result.uri).toString(), absoluteTarget.toString());
	});

	test('preserves normal resolution when stat is unavailable', async () => {
		const absoluteTarget = vscode.Uri.file('/absolute/target.md');
		const resolvedTarget = vscode.Uri.file('/workspace/absolute/target.md');
		const normalTargetUnavailable = createLinkOpener(
			{ kind: 'file', uri: resolvedTarget },
			[absoluteTarget],
			{ unavailableResources: [resolvedTarget] },
		);
		const absoluteTargetUnavailable = createLinkOpener(
			{ kind: 'file', uri: resolvedTarget },
			[],
			{ unavailableResources: [absoluteTarget] },
		);

		const normalTargetResult = await normalTargetUnavailable.resolveDocumentLink('/absolute/target.md', sourceResource);
		const absoluteTargetResult = await absoluteTargetUnavailable.resolveDocumentLink('/absolute/target.md', sourceResource);

		assert.ok(normalTargetResult);
		assert.ok(absoluteTargetResult);
		assert.strictEqual(vscode.Uri.from(normalTargetResult.uri).toString(), resolvedTarget.toString());
		assert.strictEqual(vscode.Uri.from(absoluteTargetResult.uri).toString(), resolvedTarget.toString());
	});

	test('does not stat links that cannot be filesystem-absolute paths', async () => {
		const resolvedTarget = vscode.Uri.file('/workspace/target.md');
		const statCalls: vscode.Uri[] = [];
		const opener = createLinkOpener(
			{ kind: 'file', uri: resolvedTarget },
			[],
			{ onStat: resource => statCalls.push(resource) },
		);

		for (const link of [
			'./target.md',
			'#heading',
			'https://example.com/target.md',
			'//example.com/target.md',
			'////target.md',
			'/\\example.com/share/target.md',
			'/%5Cexample.com/share/target.md',
		]) {
			const result = await opener.resolveDocumentLink(link, sourceResource);
			assert.ok(result);
			assert.strictEqual(vscode.Uri.from(result.uri).toString(), resolvedTarget.toString());
		}
		await opener.resolveDocumentLink('/target.md', vscode.Uri.parse('vscode-vfs://github/repository/source.md'));
		await opener.resolveDocumentLink('/target.md', vscode.Uri.parse('untitled:source.md'));

		assert.deepStrictEqual(statCalls, []);
	});
});

interface TestLinkOpenerOptions {
	readonly allowAbsoluteFilePathFallback?: boolean;
	readonly fileType?: vscode.FileType;
	readonly unavailableResources?: readonly vscode.Uri[];
	readonly onStat?: (resource: vscode.Uri) => void;
}

function createLinkOpener(
	resolved: proto.ResolvedDocumentLinkTarget | undefined,
	existingResources: readonly vscode.Uri[],
	options: TestLinkOpenerOptions = {},
): MdLinkOpener {
	const existing = new Set(existingResources.map(resourceKey));
	const unavailable = new Set((options.unavailableResources ?? []).map(resourceKey));
	return new MdLinkOpener(
		{ resolveLinkTarget: async () => resolved },
		{
			allowAbsoluteFilePathFallback: options.allowAbsoluteFilePathFallback ?? true,
			fileSystem: {
				stat: async resource => {
					options.onStat?.(resource);
					if (unavailable.has(resourceKey(resource))) {
						throw vscode.FileSystemError.NoPermissions(resource);
					}
					if (!existing.has(resourceKey(resource))) {
						throw vscode.FileSystemError.FileNotFound(resource);
					}
					return { type: options.fileType ?? vscode.FileType.File, ctime: 0, mtime: 0, size: 0 };
				},
			},
		},
	);
}

function resourceKey(resource: vscode.Uri): string {
	return resource.with({ query: '', fragment: '' }).toString();
}
