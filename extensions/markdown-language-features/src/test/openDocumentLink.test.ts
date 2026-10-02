/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { MdLanguageClient } from '../client/client';
import type { ResolvedDocumentLinkTarget } from '../client/protocol';
import { getAbsoluteUri, getRangeFromPositionOrRange, MdLinkOpener } from '../util/openDocumentLink';
import { getFragmentFromLinkText } from '../util/linkFragment';

suite('Open Markdown document link', () => {
	teardown(() => sinon.restore());

	test('forwards fragments to vscode.open while preserving selections', async () => {
		const client = sinon.createStubInstance(MdLanguageClient);
		const opener = new MdLinkOpener(client);
		const open = sinon.stub(vscode.commands, 'executeCommand').resolves();
		const target = vscode.Uri.file('/workspace/file.pdf');
		const source = vscode.Uri.file('/workspace/source.md');
		const links = ['file.pdf#page=3', 'file.pdf#page%3D3', 'file.pdf#nameddest=Chapter%201', 'file.pdf#bad%', 'file.pdf', 'file.pdf#L10,2-L12,4'];
		client.resolveLinkTarget.resolves({ kind: 'file', uri: target });
		for (const link of links) {
			await opener.openDocumentLink(link, source, vscode.ViewColumn.Active);
		}
		client.resolveLinkTarget.resolves({ kind: 'file', uri: target, positionOrRange: { line: 4, character: 2 } });
		await opener.openDocumentLink('file.pdf#page=3', source, vscode.ViewColumn.Active);
		client.resolveLinkTarget.resolves({ kind: 'file', uri: target.with({ fragment: 'page=2' }) });
		await opener.openDocumentLink('file.pdf#page=3', source, vscode.ViewColumn.Active);

		const options = { selection: undefined, viewColumn: vscode.ViewColumn.Active };
		assert.deepStrictEqual(open.getCalls().map(call => call.args), [
			['vscode.open', target.with({ fragment: 'page=3' }), options],
			['vscode.open', target.with({ fragment: 'page=3' }), options],
			['vscode.open', target.with({ fragment: 'nameddest=Chapter 1' }), options],
			['vscode.open', target, options],
			['vscode.open', target, options],
			['vscode.open', target.with({ fragment: 'L10,2-L12,4' }), { ...options, selection: new vscode.Range(9, 1, 11, 3) }],
			['vscode.open', target, { ...options, selection: new vscode.Range(4, 2, 4, 2) }],
			['vscode.open', target.with({ fragment: 'page=2' }), options],
		]);
	});

	test('extracts and decodes fragments once', () => {
		assert.deepStrictEqual([
			'file.pdf#page=3',
			'file.pdf#page%3D3',
			'file.pdf#nameddest=Chapter%201',
			'file.pdf#nameddest=Chapter%25201',
			'file.pdf#nameddest=Chapter%23One',
			'file.pdf',
			'file.pdf#',
			'file.pdf#bad%',
			'file.pdf#%FF',
			'file%23name.pdf#page=3',
			'file.txt#L10%2C2-L12%2C4',
		].map(getFragmentFromLinkText), [
			'page=3',
			'page=3',
			'nameddest=Chapter 1',
			'nameddest=Chapter%201',
			'nameddest=Chapter#One',
			undefined,
			undefined,
			undefined,
			undefined,
			'page=3',
			'L10,2-L12,4',
		]);
	});

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
