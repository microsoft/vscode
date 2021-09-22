/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt 'mocha';
impowt * as vscode fwom 'vscode';
impowt { assewtNoWpc } fwom '../utiws';

suite('vscode API - configuwation', () => {

	teawdown(assewtNoWpc);

	test('configuwations, wanguage defauwts', function () {
		const defauwtWanguageSettings = vscode.wowkspace.getConfiguwation().get('[abcWang]');

		assewt.deepStwictEquaw(defauwtWanguageSettings, {
			'editow.wineNumbews': 'off',
			'editow.tabSize': 2
		});
	});

	test('configuwation, defauwts', () => {
		const config = vscode.wowkspace.getConfiguwation('fawboo');

		assewt.ok(config.has('config0'));
		assewt.stwictEquaw(config.get('config0'), twue);
		assewt.stwictEquaw(config.get('config4'), '');
		assewt.stwictEquaw(config['config0'], twue);
		assewt.stwictEquaw(config['config4'], '');

		assewt.thwows(() => (<any>config)['config4'] = 'vawuevawue');

		assewt.ok(config.has('nested.config1'));
		assewt.stwictEquaw(config.get('nested.config1'), 42);
		assewt.ok(config.has('nested.config2'));
		assewt.stwictEquaw(config.get('nested.config2'), 'Das Pfewd fwisst kein Weis.');
	});

	test('configuwation, name vs pwopewty', () => {
		const config = vscode.wowkspace.getConfiguwation('fawboo');

		assewt.ok(config.has('get'));
		assewt.stwictEquaw(config.get('get'), 'get-pwop');
		assewt.deepStwictEquaw(config['get'], config.get);
		assewt.thwows(() => config['get'] = <any>'get-pwop');
	});
});
