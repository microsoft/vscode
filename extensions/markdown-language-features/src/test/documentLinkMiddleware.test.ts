/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { CancellationToken } from 'vscode-languageclient';
import { createDocumentLinkMiddleware } from '../client/documentLinks';
import { joinLines } from './util';

suite('Markdown document link middleware', () => {
	test('restores unconsumed fragments without replacing resolved navigation', async () => {
		const document = await vscode.workspace.openTextDocument({
			language: 'markdown',
			content: joinLines('file.pdf#page=3', 'file.pdf#page%3D3', 'file.txt#L10', 'file.md#heading', 'folder#page=3', 'file.pdf#bad%', 'https://example.com/#page=3'),
		});
		const target = vscode.Uri.file('/workspace/file.pdf');
		const targets = [
			target,
			target,
			target.with({ fragment: 'L10' }),
			target.with({ fragment: 'L20,1' }),
			vscode.Uri.parse('command:revealInExplorer'),
			target,
			vscode.Uri.parse('https://example.com/'),
		];
		const links = targets.map((_, line) => new vscode.DocumentLink(document.lineAt(line).range));
		links[6].target = targets[6];
		const middleware = createDocumentLinkMiddleware();
		await middleware.provideDocumentLinks!(document, CancellationToken.None, () => links);

		const results = [];
		for (let i = 0; i < links.length; i++) {
			const resolved = await middleware.resolveDocumentLink!(links[i], CancellationToken.None, link => new vscode.DocumentLink(link.range, targets[i]));
			results.push(resolved?.target?.toString());
		}
		assert.deepStrictEqual(results, [
			target.with({ fragment: 'page=3' }).toString(),
			target.with({ fragment: 'page=3' }).toString(),
			targets[2].toString(),
			targets[3].toString(),
			targets[4].toString(),
			target.toString(),
			targets[6].toString(),
		]);
	});

	test('does not change a cancelled or unresolved link', async () => {
		const document = await vscode.workspace.openTextDocument({ language: 'markdown', content: 'file.pdf#page=3' });
		const link = new vscode.DocumentLink(document.lineAt(0).range);
		const middleware = createDocumentLinkMiddleware();
		await middleware.provideDocumentLinks!(document, CancellationToken.None, () => [link]);
		const cancellation = new vscode.CancellationTokenSource();
		try {
			cancellation.cancel();
			const target = vscode.Uri.file('/workspace/file.pdf');
			const cancelled = await middleware.resolveDocumentLink!(link, cancellation.token, () => new vscode.DocumentLink(link.range, target));
			const unresolved = await middleware.resolveDocumentLink!(link, CancellationToken.None, () => undefined);
			assert.deepStrictEqual({ cancelled: cancelled?.target?.toString(), unresolved }, { cancelled: target.toString(), unresolved: undefined });
		} finally {
			cancellation.dispose();
		}
	});
});
