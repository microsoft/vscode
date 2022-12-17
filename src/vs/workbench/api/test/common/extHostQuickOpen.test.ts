/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { QuickPick } from 'vscode';
import { mock } from 'vs/base/test/common/mock';
import { ExtensionIdentifier, IExtensionDescription } from 'vs/platform/extensions/common/extensions';
import { IMainContext } from 'vs/workbench/api/common/extHost.protocol';
import { ExtHostCommands } from 'vs/workbench/api/common/extHostCommands';
import { createExtHostQuickOpen, ExtHostQuickOpen } from 'vs/workbench/api/common/extHostQuickOpen';
import { ExtHostWorkspace } from 'vs/workbench/api/common/extHostWorkspace';

suite('ExtHostQuickOpen', () => {

	const ext = new ExtensionIdentifier(`ext`);
	const protocol: IMainContext = {
		getProxy: () => { return <any>proxy; },
		set: () => { return undefined!; },
		dispose: () => { },
		assertRegistered: () => { },
		drain: () => { return undefined!; },
	};
	const ws = new class extends mock<ExtHostWorkspace>() { };
	const commands = new class extends mock<ExtHostCommands>() { };
	const extension = new class extends mock<IExtensionDescription>() { override identifier = ext; };
	let proxy: QuickProxy;
	let host: ExtHostQuickOpen;
	let pick: QuickPick<any>;

	setup(() => {
		proxy = new QuickProxy();
		host = createExtHostQuickOpen(protocol, ws, commands);
	});

	teardown(() => { pick.dispose(); });

	test('matchOnLabel property defaults to true', () => {
		pick = host.createQuickPick(extension);
		assert.strictEqual(pick.matchOnLabel, true);
	});

	test('matchOnLabel value is forwarded to proxy', async () => {
		pick = host.createQuickPick(extension);
		pick.matchOnLabel = false;
		assert.strictEqual(pick.matchOnLabel, false);
		pick.show();
		assert.strictEqual((await proxy.update).matchOnLabel, false);
	});
});

type Update = { [key: string]: any };
class QuickProxy {
	private gotUpdate: any;
	public update = new Promise<Update>(resolve => { this.gotUpdate = resolve; });
	public $createOrUpdate(value: Update) { this.gotUpdate(value); }
	public $dispose() { }
}
