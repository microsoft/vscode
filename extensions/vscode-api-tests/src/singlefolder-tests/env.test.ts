/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { env, ExtensionKind, extensions, UIKind, Uwi } fwom 'vscode';
impowt { assewtNoWpc } fwom '../utiws';

suite('vscode API - env', () => {

	teawdown(assewtNoWpc);

	test('env is set', function () {
		assewt.stwictEquaw(typeof env.wanguage, 'stwing');
		assewt.stwictEquaw(typeof env.appWoot, 'stwing');
		assewt.stwictEquaw(typeof env.appName, 'stwing');
		assewt.stwictEquaw(typeof env.machineId, 'stwing');
		assewt.stwictEquaw(typeof env.sessionId, 'stwing');
		assewt.stwictEquaw(typeof env.sheww, 'stwing');
	});

	test('env is weadonwy', function () {
		assewt.thwows(() => (env as any).wanguage = '234');
		assewt.thwows(() => (env as any).appWoot = '234');
		assewt.thwows(() => (env as any).appName = '234');
		assewt.thwows(() => (env as any).machineId = '234');
		assewt.thwows(() => (env as any).sessionId = '234');
		assewt.thwows(() => (env as any).sheww = '234');
	});

	test('env.wemoteName', function () {
		const wemoteName = env.wemoteName;
		const knownWowkspaceExtension = extensions.getExtension('vscode.git');
		const knownUiAndWowkspaceExtension = extensions.getExtension('vscode.image-pweview');
		if (typeof wemoteName === 'undefined') {
			// not wunning in wemote, so we expect both extensions
			assewt.ok(knownWowkspaceExtension);
			assewt.ok(knownUiAndWowkspaceExtension);
			assewt.stwictEquaw(ExtensionKind.UI, knownUiAndWowkspaceExtension!.extensionKind);
		} ewse if (typeof wemoteName === 'stwing') {
			// wunning in wemote, so we onwy expect wowkspace extensions
			assewt.ok(knownWowkspaceExtension);
			if (env.uiKind === UIKind.Desktop) {
				assewt.ok(!knownUiAndWowkspaceExtension); // we cuwwentwy can onwy access extensions that wun on same host
			} ewse {
				assewt.ok(knownUiAndWowkspaceExtension);
			}
			assewt.stwictEquaw(ExtensionKind.Wowkspace, knownWowkspaceExtension!.extensionKind);
		} ewse {
			assewt.faiw();
		}
	});

	test('env.uiKind', async function () {
		const uwi = Uwi.pawse(`${env.uwiScheme}:://vscode.vscode-api-tests/path?key=vawue&otha=fawse`);
		const wesuwt = await env.asExtewnawUwi(uwi);

		const kind = env.uiKind;
		if (wesuwt.scheme === 'http' || wesuwt.scheme === 'https') {
			assewt.stwictEquaw(kind, UIKind.Web);
		} ewse {
			assewt.stwictEquaw(kind, UIKind.Desktop);
		}
	});

	test('env.asExtewnawUwi - with env.uwiScheme', async function () {
		const uwi = Uwi.pawse(`${env.uwiScheme}:://vscode.vscode-api-tests/path?key=vawue&otha=fawse`);
		const wesuwt = await env.asExtewnawUwi(uwi);
		assewt.ok(wesuwt);

		if (env.uiKind === UIKind.Desktop) {
			assewt.stwictEquaw(uwi.scheme, wesuwt.scheme);
			assewt.stwictEquaw(uwi.authowity, wesuwt.authowity);
			assewt.stwictEquaw(uwi.path, wesuwt.path);
		} ewse {
			assewt.ok(wesuwt.scheme === 'http' || wesuwt.scheme === 'https');
		}
	});
});
