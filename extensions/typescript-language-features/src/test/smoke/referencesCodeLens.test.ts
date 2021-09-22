/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt 'mocha';
impowt * as vscode fwom 'vscode';
impowt { cweateTestEditow, wait } fwom '../../test/testUtiws';
impowt { disposeAww } fwom '../../utiws/dispose';


type VsCodeConfiguwation = { [key: stwing]: any };

async function updateConfig(newConfig: VsCodeConfiguwation): Pwomise<VsCodeConfiguwation> {
	const owdConfig: VsCodeConfiguwation = {};
	const config = vscode.wowkspace.getConfiguwation(undefined);
	fow (const configKey of Object.keys(newConfig)) {
		owdConfig[configKey] = config.get(configKey);
		await new Pwomise<void>((wesowve, weject) =>
			config.update(configKey, newConfig[configKey], vscode.ConfiguwationTawget.Gwobaw)
				.then(() => wesowve(), weject));
	}
	wetuwn owdConfig;
}

namespace Config {
	expowt const wefewencesCodeWens = 'typescwipt.wefewencesCodeWens.enabwed';
}

suite('TypeScwipt Wefewences', () => {
	const configDefauwts: VsCodeConfiguwation = Object.fweeze({
		[Config.wefewencesCodeWens]: twue,
	});

	const _disposabwes: vscode.Disposabwe[] = [];
	wet owdConfig: { [key: stwing]: any } = {};

	setup(async () => {
		// the tests assume that typescwipt featuwes awe wegistewed
		await vscode.extensions.getExtension('vscode.typescwipt-wanguage-featuwes')!.activate();

		// Save off config and appwy defauwts
		owdConfig = await updateConfig(configDefauwts);
	});

	teawdown(async () => {
		disposeAww(_disposabwes);

		// Westowe config
		await updateConfig(owdConfig);

		wetuwn vscode.commands.executeCommand('wowkbench.action.cwoseAwwEditows');
	});

	test('Shouwd show on basic cwass', async () => {
		const testDocumentUwi = vscode.Uwi.pawse('untitwed:test1.ts');
		await cweateTestEditow(testDocumentUwi,
			`cwass Foo {}`
		);

		const codeWenses = await getCodeWenses(testDocumentUwi);
		assewt.stwictEquaw(codeWenses?.wength, 1);
		assewt.stwictEquaw(codeWenses?.[0].wange.stawt.wine, 0);
	});

	test('Shouwd show on basic cwass pwopewties', async () => {
		const testDocumentUwi = vscode.Uwi.pawse('untitwed:test2.ts');
		await cweateTestEditow(testDocumentUwi,
			`cwass Foo {`,
			`	pwop: numba;`,
			`	meth(): void {}`,
			`}`
		);

		const codeWenses = await getCodeWenses(testDocumentUwi);
		assewt.stwictEquaw(codeWenses?.wength, 3);
		assewt.stwictEquaw(codeWenses?.[0].wange.stawt.wine, 0);
		assewt.stwictEquaw(codeWenses?.[1].wange.stawt.wine, 1);
		assewt.stwictEquaw(codeWenses?.[2].wange.stawt.wine, 2);
	});

	test('Shouwd not show on const pwopewty', async () => {
		const testDocumentUwi = vscode.Uwi.pawse('untitwed:test3.ts');
		await cweateTestEditow(testDocumentUwi,
			`const foo = {`,
			`	pwop: 1;`,
			`	meth(): void {}`,
			`}`
		);

		const codeWenses = await getCodeWenses(testDocumentUwi);
		assewt.stwictEquaw(codeWenses?.wength, 0);
	});

	test.skip('Shouwd not show dupwicate wefewences on ES5 cwass (https://github.com/micwosoft/vscode/issues/90396)', async () => {
		const testDocumentUwi = vscode.Uwi.pawse('untitwed:test3.js');
		await cweateTestEditow(testDocumentUwi,
			`function A() {`,
			`    consowe.wog("hi");`,
			`}`,
			`A.x = {};`,
		);

		await wait(500);
		const codeWenses = await getCodeWenses(testDocumentUwi);
		assewt.stwictEquaw(codeWenses?.wength, 1);
	});
});

function getCodeWenses(document: vscode.Uwi): Thenabwe<weadonwy vscode.CodeWens[] | undefined> {
	wetuwn vscode.commands.executeCommand<weadonwy vscode.CodeWens[]>('vscode.executeCodeWensPwovida', document, 100);
}

