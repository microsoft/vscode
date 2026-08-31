/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ExtensionContext, ExtensionMode, Memento } from 'vscode';
import { IDisposable } from '../../../util/vs/base/common/lifecycle';
import { vscodeNodeContributions } from '../../extension/vscode-node/contributions';
import { registerServices } from '../../extension/vscode-node/services';
import { createInstantiationService } from '../../extension/vscode/extension';

suite('Extension tests', function () {
	let disposables: IDisposable[] = [];

	teardown(() => {
		disposables.forEach(d => d.dispose());
		disposables = [];
	});

	test('can create production context', async function () {
		const globalState: Memento = {
			get: () => undefined,
			update: () => Promise.resolve(),
			keys: () => [],
		};
		const extensionContext = {
			extensionMode: ExtensionMode.Production,
			extension: {
				packageJSON: {
					name: 'copilot',
				},
			},
			globalState,
			subscriptions: [] as { dispose(): any }[],
		} as ExtensionContext;
		const accessor = createInstantiationService({
			context: extensionContext,
			contributions: vscodeNodeContributions,
			registerServices
		});
		disposables.push(accessor);
		assert.ok(accessor);
	});

	// TODO@lramos15 has to be skipped, when we don't have a token, because
	// of the eventual call to `getOrCreateTestingCopilotTokenManager` which
	// requires a token in a sync fashion.
	test.skip('can create test context', async function () {
		const extensionContext = {
			extensionMode: ExtensionMode.Test,
			subscriptions: [] as { dispose(): any }[],
			extension: {
				id: 'copilot.extension-test',
				packageJSON: {},
			},
		} as ExtensionContext;
		const accessor = createInstantiationService({
			context: extensionContext,
			contributions: vscodeNodeContributions,
			registerServices
		});
		disposables.push(accessor);
		assert.ok(accessor);
	});
});
