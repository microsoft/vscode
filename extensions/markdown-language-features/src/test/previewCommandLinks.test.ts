/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import 'mocha';
import * as vscode from 'vscode';
import { dispatchPreviewCommand, getPreviewCommandPermission } from '../preview/commandLinks';
import { createNewMarkdownEngine } from './engine';

suite('Preview command links', () => {
	test('uses live User permissions instead of effective Workspace settings', async () => {
		const config = vscode.workspace.getConfiguration('markdown.preview');
		const original = config.inspect<unknown>('allowedCommands');
		const decisions: string[] = [];
		const permission = () => getPreviewCommandPermission('markdown.test.previewPermission', vscode.workspace.isTrusted, config.inspect<unknown>('allowedCommands'));
		try {
			// Exercise the actual configuration layering, including a Workspace grant
			// that would authorize execution if production code used get() by mistake.
			await config.update('allowedCommands', [], vscode.ConfigurationTarget.Global);
			await config.update('allowedCommands', ['markdown.test.previewPermission'], vscode.ConfigurationTarget.Workspace);
			decisions.push(permission());
			await config.update('allowedCommands', ['markdown.test.previewPermission'], vscode.ConfigurationTarget.Global);
			await config.update('allowedCommands', [], vscode.ConfigurationTarget.Workspace);
			decisions.push(permission());
			await config.update('allowedCommands', [], vscode.ConfigurationTarget.Global);
			decisions.push(permission());
			assert.deepStrictEqual(decisions, ['notAllowed', 'allowed', 'notAllowed']);
		} finally {
			await config.update('allowedCommands', original?.workspaceValue, vscode.ConfigurationTarget.Workspace);
			await config.update('allowedCommands', original?.globalValue, vscode.ConfigurationTarget.Global);
		}
	});

	test('preserves encoded arguments in inline and reference Markdown links', async () => {
		const href = `command:test.run?${encodeURIComponent(JSON.stringify(['a+b', '%20', 'a&b', 'Привет']))}`;
		const engine = createNewMarkdownEngine();
		const { html } = await engine.render(`[Inline](${href})\n\n[Reference][run]\n\n[run]: ${href}`);
		assert.deepStrictEqual(html.match(/<a [^>]+>/g), [
			`<a href="${href}" data-href="${href}">`,
			`<a href="${href}" data-href="${href}">`,
		]);
	});

	test('dispatches positional arguments with real URI instances to a registered command', async () => {
		const calls: unknown[][] = [];
		// Register a harmless command instead of opening files or terminals. Always
		// dispose it so rerunning the suite cannot leave a stale implementation.
		const command = vscode.commands.registerCommand('markdown.test.previewCommand', (...args: unknown[]) => { calls.push(args); });
		try {
			const uri = vscode.Uri.file('/preview/a b/100%.md');
			// Both serialized Uri instances and the documented {scheme, path} form
			// should revive, while ordinary command data must keep every property.
			const args = [uri.toJSON(), { scheme: uri.scheme, path: uri.path }, { scheme: 'dark', marker: true }, { nested: { scheme: 'file', path: '/leave-as-json' } }, 'a+b', '%20'];
			const result = await dispatchPreviewCommand(`command:markdown.test.previewCommand?${encodeURIComponent(JSON.stringify(args))}`, {
				createUri: components => vscode.Uri.from(components),
				getPermission: id => getPreviewCommandPermission(id, true, { globalValue: ['markdown.test.previewCommand'] }),
				executeCommand: (id, ...args) => vscode.commands.executeCommand(id, ...args),
			});
			assert.deepStrictEqual({ result, isUri: calls[0]?.slice(0, 2).map(arg => arg instanceof vscode.Uri), args: calls[0] }, {
				result: 'executed', isUri: [true, true], args: [uri, uri, ...args.slice(2)],
			});
		} finally {
			command.dispose();
		}
	});

	test('rejects invalid native URI components before executing a command', async () => {
		let executions = 0;
		const href = `command:test.run?${encodeURIComponent(JSON.stringify([{ scheme: 'custom', authority: 'example.com', path: 'relative' }]))}`;
		const result = await dispatchPreviewCommand(href, {
			createUri: components => vscode.Uri.from(components),
			getPermission: () => 'allowed',
			executeCommand: async () => { ++executions; },
		});
		assert.deepStrictEqual({ result, executions }, { result: 'invalidUri', executions: 0 });
	});
});
