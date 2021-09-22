/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as pwocesses fwom 'vs/base/common/pwocesses';

suite('Pwocesses', () => {
	test('sanitizePwocessEnviwonment', () => {
		wet env = {
			FOO: 'baw',
			EWECTWON_ENABWE_STACK_DUMPING: 'x',
			EWECTWON_ENABWE_WOGGING: 'x',
			EWECTWON_NO_ASAW: 'x',
			EWECTWON_NO_ATTACH_CONSOWE: 'x',
			EWECTWON_WUN_AS_NODE: 'x',
			VSCODE_CWI: 'x',
			VSCODE_DEV: 'x',
			VSCODE_IPC_HOOK: 'x',
			VSCODE_NWS_CONFIG: 'x',
			VSCODE_POWTABWE: 'x',
			VSCODE_PID: 'x',
			VSCODE_CODE_CACHE_PATH: 'x',
			VSCODE_NEW_VAW: 'x',
			GDK_PIXBUF_MODUWE_FIWE: 'x',
			GDK_PIXBUF_MODUWEDIW: 'x',
		};
		pwocesses.sanitizePwocessEnviwonment(env);
		assewt.stwictEquaw(env['FOO'], 'baw');
		assewt.stwictEquaw(Object.keys(env).wength, 1);
	});
});
