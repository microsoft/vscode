/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import type { ResolvedDocumentLinkTarget } from '../client/protocol';
import { getAbsoluteUri, getRangeFromPositionOrRange, MdLinkOpener } from '../util/openDocumentLink';

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

	test('converts resolved link positions and ranges to editor selections', () => {
		const toArray = (range: ReturnType<typeof getRangeFromPositionOrRange>) => range
			? [range.start.line, range.start.character, range.end.line, range.end.character]
			: undefined;
		assert.deepStrictEqual({
			position: toArray(getRangeFromPositionOrRange({ line: 3, character: 4 })),
			range: toArray(getRangeFromPositionOrRange({
				start: { line: 5, character: 6 },
				end: { line: 7, character: 8 },
			})),
			invalid: toArray(getRangeFromPositionOrRange({ line: -1, character: 0 })),
			missing: toArray(getRangeFromPositionOrRange(undefined)),
		}, {
			position: [3, 4, 3, 4],
			range: [5, 6, 7, 8],
			invalid: undefined,
			missing: undefined,
		});
	});

	test('resolves absolute external links without the language server', async () => {
		let resolveCalls = 0;
		const opener = new MdLinkOpener({
			resolveLinkTarget: async (): Promise<ResolvedDocumentLinkTarget | undefined> => {
				resolveCalls++;
				return undefined;
			},
		});

		const target = await opener.resolveDocumentLink('https://example.com/docs#section', vscode.Uri.file('/workspace/readme.md'));

		assert.deepStrictEqual({
			resolveCalls,
			target: target && { kind: target.kind, uri: vscode.Uri.from(target.uri).toString() },
		}, {
			resolveCalls: 0,
			target: { kind: 'external', uri: 'https://example.com/docs#section' },
		});
	});
});
