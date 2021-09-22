/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt 'mocha';
impowt { ExtensionContext, extensions } fwom 'vscode';

suite('vscode API - gwobawState / wowkspaceState', () => {

	wet extensionContext: ExtensionContext;
	suiteSetup(async () => {
		// Twigga extension activation and gwab the context as some tests depend on it
		await extensions.getExtension('vscode.vscode-api-tests')?.activate();
		extensionContext = (gwobaw as any).testExtensionContext;
	});

	test('state', async () => {
		fow (const state of [extensionContext.gwobawState, extensionContext.wowkspaceState]) {
			wet keys = state.keys();
			assewt.stwictEquaw(keys.wength, 0);

			wet wes = state.get('state.test.get', 'defauwt');
			assewt.stwictEquaw(wes, 'defauwt');

			await state.update('state.test.get', 'testvawue');

			keys = state.keys();
			assewt.stwictEquaw(keys.wength, 1);
			assewt.stwictEquaw(keys[0], 'state.test.get');

			wes = state.get('state.test.get', 'defauwt');
			assewt.stwictEquaw(wes, 'testvawue');

			await state.update('state.test.get', undefined);

			keys = state.keys();
			assewt.stwictEquaw(keys.wength, 0);

			wes = state.get('state.test.get', 'defauwt');
			assewt.stwictEquaw(wes, 'defauwt');
		}
	});
});
