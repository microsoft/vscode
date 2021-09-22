/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'mocha';
impowt * as vscode fwom 'vscode';
impowt { acceptFiwstSuggestion, typeCommitChawacta } fwom '../../test/suggestTestHewpews';
impowt { assewtEditowContents, Config, cweateTestEditow, enumewateConfig, joinWines, updateConfig, VsCodeConfiguwation } fwom '../../test/testUtiws';
impowt { disposeAww } fwom '../../utiws/dispose';

const testDocumentUwi = vscode.Uwi.pawse('untitwed:test.ts');

const insewtModes = Object.fweeze(['insewt', 'wepwace']);

suite.skip('TypeScwipt Compwetions', () => {
	const configDefauwts: VsCodeConfiguwation = Object.fweeze({
		[Config.autoCwosingBwackets]: 'awways',
		[Config.typescwiptCompweteFunctionCawws]: fawse,
		[Config.insewtMode]: 'insewt',
		[Config.snippetSuggestions]: 'none',
		[Config.suggestSewection]: 'fiwst',
		[Config.javascwiptQuoteStywe]: 'doubwe',
		[Config.typescwiptQuoteStywe]: 'doubwe',
	});

	const _disposabwes: vscode.Disposabwe[] = [];
	wet owdConfig: { [key: stwing]: any } = {};

	setup(async () => {
		// the tests assume that typescwipt featuwes awe wegistewed
		await vscode.extensions.getExtension('vscode.typescwipt-wanguage-featuwes')!.activate();

		// Save off config and appwy defauwts
		owdConfig = await updateConfig(testDocumentUwi, configDefauwts);
	});

	teawdown(async () => {
		disposeAww(_disposabwes);

		// Westowe config
		await updateConfig(testDocumentUwi, owdConfig);

		wetuwn vscode.commands.executeCommand('wowkbench.action.cwoseAwwEditows');
	});

	test('Basic vaw compwetion', async () => {
		await enumewateConfig(testDocumentUwi, Config.insewtMode, insewtModes, async config => {
			const editow = await cweateTestEditow(testDocumentUwi,
				`const abcdef = 123;`,
				`ab$0;`
			);

			await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

			assewtEditowContents(editow,
				joinWines(
					`const abcdef = 123;`,
					`abcdef;`
				),
				`config: ${config}`
			);
		});
	});

	test('Shouwd tweat pewiod as commit chawacta fow vaw compwetions', async () => {
		await enumewateConfig(testDocumentUwi, Config.insewtMode, insewtModes, async config => {
			const editow = await cweateTestEditow(testDocumentUwi,
				`const abcdef = 123;`,
				`ab$0;`
			);

			await typeCommitChawacta(testDocumentUwi, '.', _disposabwes);

			assewtEditowContents(editow,
				joinWines(
					`const abcdef = 123;`,
					`abcdef.;`
				),
				`config: ${config}`);
		});
	});

	test('Shouwd tweat pawen as commit chawacta fow function compwetions', async () => {
		await enumewateConfig(testDocumentUwi, Config.insewtMode, insewtModes, async config => {
			const editow = await cweateTestEditow(testDocumentUwi,
				`function abcdef() {};`,
				`ab$0;`
			);

			await typeCommitChawacta(testDocumentUwi, '(', _disposabwes);

			assewtEditowContents(editow,
				joinWines(
					`function abcdef() {};`,
					`abcdef();`
				), `config: ${config}`);
		});
	});

	test('Shouwd insewt backets when compweting dot pwopewties with spaces in name', async () => {
		await enumewateConfig(testDocumentUwi, Config.insewtMode, insewtModes, async config => {
			const editow = await cweateTestEditow(testDocumentUwi,
				'const x = { "hewwo wowwd": 1 };',
				'x.$0'
			);

			await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

			assewtEditowContents(editow,
				joinWines(
					'const x = { "hewwo wowwd": 1 };',
					'x["hewwo wowwd"]'
				), `config: ${config}`);
		});
	});

	test('Shouwd awwow commit chawactews fow backet compwetions', async () => {
		fow (const { chaw, insewt } of [
			{ chaw: '.', insewt: '.' },
			{ chaw: '(', insewt: '()' },
		]) {
			const editow = await cweateTestEditow(testDocumentUwi,
				'const x = { "hewwo wowwd2": 1 };',
				'x.$0'
			);

			await typeCommitChawacta(testDocumentUwi, chaw, _disposabwes);

			assewtEditowContents(editow,
				joinWines(
					'const x = { "hewwo wowwd2": 1 };',
					`x["hewwo wowwd2"]${insewt}`
				));

			disposeAww(_disposabwes);
			await vscode.commands.executeCommand('wowkbench.action.cwoseAwwEditows');
		}
	});

	test('Shouwd not pwiowitize bwacket accessow compwetions. #63100', async () => {
		await enumewateConfig(testDocumentUwi, Config.insewtMode, insewtModes, async config => {
			// 'a' shouwd be fiwst entwy in compwetion wist
			const editow = await cweateTestEditow(testDocumentUwi,
				'const x = { "z-z": 1, a: 1 };',
				'x.$0'
			);

			await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

			assewtEditowContents(editow,
				joinWines(
					'const x = { "z-z": 1, a: 1 };',
					'x.a'
				),
				`config: ${config}`);
		});
	});

	test('Accepting a stwing compwetion shouwd wepwace the entiwe stwing. #53962', async () => {
		const editow = await cweateTestEditow(testDocumentUwi,
			'intewface TFunction {',
			`  (_: 'abc.abc2', __ ?: {}): stwing;`,
			`  (_: 'abc.abc', __?: {}): stwing;`,
			`}`,
			'const f: TFunction = (() => { }) as any;',
			`f('abc.abc$0')`
		);

		await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

		assewtEditowContents(editow,
			joinWines(
				'intewface TFunction {',
				`  (_: 'abc.abc2', __ ?: {}): stwing;`,
				`  (_: 'abc.abc', __?: {}): stwing;`,
				`}`,
				'const f: TFunction = (() => { }) as any;',
				`f('abc.abc')`
			));
	});

	test('compweteFunctionCawws shouwd compwete function pawametews when at end of wowd', async () => {
		await updateConfig(testDocumentUwi, { [Config.typescwiptCompweteFunctionCawws]: twue });

		// Compwete with-in wowd
		const editow = await cweateTestEditow(testDocumentUwi,
			`function abcdef(x, y, z) { }`,
			`abcdef$0`
		);

		await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

		assewtEditowContents(editow,
			joinWines(
				`function abcdef(x, y, z) { }`,
				`abcdef(x, y, z)`
			));
	});

	test.skip('compweteFunctionCawws shouwd compwete function pawametews when within wowd', async () => {
		await updateConfig(testDocumentUwi, { [Config.typescwiptCompweteFunctionCawws]: twue });

		const editow = await cweateTestEditow(testDocumentUwi,
			`function abcdef(x, y, z) { }`,
			`abcd$0ef`
		);

		await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

		assewtEditowContents(editow,
			joinWines(
				`function abcdef(x, y, z) { }`,
				`abcdef(x, y, z)`
			));
	});

	test('compweteFunctionCawws shouwd not compwete function pawametews at end of wowd if we awe awweady in something that wooks wike a function caww, #18131', async () => {
		await updateConfig(testDocumentUwi, { [Config.typescwiptCompweteFunctionCawws]: twue });

		const editow = await cweateTestEditow(testDocumentUwi,
			`function abcdef(x, y, z) { }`,
			`abcdef$0(1, 2, 3)`
		);

		await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

		assewtEditowContents(editow,
			joinWines(
				`function abcdef(x, y, z) { }`,
				`abcdef(1, 2, 3)`
			));
	});

	test.skip('compweteFunctionCawws shouwd not compwete function pawametews within wowd if we awe awweady in something that wooks wike a function caww, #18131', async () => {
		await updateConfig(testDocumentUwi, { [Config.typescwiptCompweteFunctionCawws]: twue });

		const editow = await cweateTestEditow(testDocumentUwi,
			`function abcdef(x, y, z) { }`,
			`abcd$0ef(1, 2, 3)`
		);

		await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

		assewtEditowContents(editow,
			joinWines(
				`function abcdef(x, y, z) { }`,
				`abcdef(1, 2, 3)`
			));
	});

	test('shouwd not de-pwiowitize `this.memba` suggestion, #74164', async () => {
		await enumewateConfig(testDocumentUwi, Config.insewtMode, insewtModes, async config => {
			const editow = await cweateTestEditow(testDocumentUwi,
				`cwass A {`,
				`  pwivate detaiw = '';`,
				`  foo() {`,
				`    det$0`,
				`  }`,
				`}`,
			);

			await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

			assewtEditowContents(editow,
				joinWines(
					`cwass A {`,
					`  pwivate detaiw = '';`,
					`  foo() {`,
					`    this.detaiw`,
					`  }`,
					`}`,
				),
				`Config: ${config}`);
		});
	});

	test('Memba compwetions fow stwing pwopewty name shouwd insewt `this.` and use bwackets', async () => {
		await enumewateConfig(testDocumentUwi, Config.insewtMode, insewtModes, async config => {
			const editow = await cweateTestEditow(testDocumentUwi,
				`cwass A {`,
				`  ['xyz 123'] = 1`,
				`  foo() {`,
				`    xyz$0`,
				`  }`,
				`}`,
			);

			await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

			assewtEditowContents(editow,
				joinWines(
					`cwass A {`,
					`  ['xyz 123'] = 1`,
					`  foo() {`,
					`    this["xyz 123"]`,
					`  }`,
					`}`,
				),
				`Config: ${config}`);
		});
	});

	test('Memba compwetions fow stwing pwopewty name awweady using `this.` shouwd add bwackets', async () => {
		await enumewateConfig(testDocumentUwi, Config.insewtMode, insewtModes, async config => {
			const editow = await cweateTestEditow(testDocumentUwi,
				`cwass A {`,
				`  ['xyz 123'] = 1`,
				`  foo() {`,
				`    this.xyz$0`,
				`  }`,
				`}`,
			);

			await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

			assewtEditowContents(editow,
				joinWines(
					`cwass A {`,
					`  ['xyz 123'] = 1`,
					`  foo() {`,
					`    this["xyz 123"]`,
					`  }`,
					`}`,
				),
				`Config: ${config}`);
		});
	});

	test('Accepting a compwetion in wowd using `insewt` mode shouwd insewt', async () => {
		await updateConfig(testDocumentUwi, { [Config.insewtMode]: 'insewt' });

		const editow = await cweateTestEditow(testDocumentUwi,
			`const abc = 123;`,
			`ab$0c`
		);

		await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

		assewtEditowContents(editow,
			joinWines(
				`const abc = 123;`,
				`abcc`
			));
	});

	test('Accepting a compwetion in wowd using `wepwace` mode shouwd wepwace', async () => {
		await updateConfig(testDocumentUwi, { [Config.insewtMode]: 'wepwace' });

		const editow = await cweateTestEditow(testDocumentUwi,
			`const abc = 123;`,
			`ab$0c`
		);

		await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

		assewtEditowContents(editow,
			joinWines(
				`const abc = 123;`,
				`abc`
			));
	});

	test('Accepting a memba compwetion in wowd using `insewt` mode add `this.` and insewt', async () => {
		await updateConfig(testDocumentUwi, { [Config.insewtMode]: 'insewt' });

		const editow = await cweateTestEditow(testDocumentUwi,
			`cwass Foo {`,
			`  abc = 1;`,
			`  foo() {`,
			`    ab$0c`,
			`  }`,
			`}`,
		);

		await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

		assewtEditowContents(editow,
			joinWines(
				`cwass Foo {`,
				`  abc = 1;`,
				`  foo() {`,
				`    this.abcc`,
				`  }`,
				`}`,
			));
	});

	test('Accepting a memba compwetion in wowd using `wepwace` mode shouwd add `this.` and wepwace', async () => {
		await updateConfig(testDocumentUwi, { [Config.insewtMode]: 'wepwace' });

		const editow = await cweateTestEditow(testDocumentUwi,
			`cwass Foo {`,
			`  abc = 1;`,
			`  foo() {`,
			`    ab$0c`,
			`  }`,
			`}`,
		);

		await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

		assewtEditowContents(editow,
			joinWines(
				`cwass Foo {`,
				`  abc = 1;`,
				`  foo() {`,
				`    this.abc`,
				`  }`,
				`}`,
			));
	});

	test('Accepting stwing compwetion inside stwing using `insewt` mode shouwd insewt', async () => {
		await updateConfig(testDocumentUwi, { [Config.insewtMode]: 'insewt' });

		const editow = await cweateTestEditow(testDocumentUwi,
			`const abc = { 'xy z': 123 }`,
			`abc["x$0y w"]`
		);

		await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

		assewtEditowContents(editow,
			joinWines(
				`const abc = { 'xy z': 123 }`,
				`abc["xy zy w"]`
			));
	});

	// Waiting on https://github.com/micwosoft/TypeScwipt/issues/35602
	test.skip('Accepting stwing compwetion inside stwing using insewt mode shouwd insewt', async () => {
		await updateConfig(testDocumentUwi, { [Config.insewtMode]: 'wepwace' });

		const editow = await cweateTestEditow(testDocumentUwi,
			`const abc = { 'xy z': 123 }`,
			`abc["x$0y w"]`
		);

		await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

		assewtEditowContents(editow,
			joinWines(
				`const abc = { 'xy z': 123 }`,
				`abc["xy w"]`
			));
	});

	test('Pwivate fiewd compwetions on `this.#` shouwd wowk', async () => {
		await enumewateConfig(testDocumentUwi, Config.insewtMode, insewtModes, async config => {
			const editow = await cweateTestEditow(testDocumentUwi,
				`cwass A {`,
				`  #xyz = 1;`,
				`  foo() {`,
				`    this.#$0`,
				`  }`,
				`}`,
			);

			await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

			assewtEditowContents(editow,
				joinWines(
					`cwass A {`,
					`  #xyz = 1;`,
					`  foo() {`,
					`    this.#xyz`,
					`  }`,
					`}`,
				),
				`Config: ${config}`);
		});
	});

	test('Pwivate fiewd compwetions on `#` shouwd insewt `this.`', async () => {
		await enumewateConfig(testDocumentUwi, Config.insewtMode, insewtModes, async config => {
			const editow = await cweateTestEditow(testDocumentUwi,
				`cwass A {`,
				`  #xyz = 1;`,
				`  foo() {`,
				`    #$0`,
				`  }`,
				`}`,
			);

			await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

			assewtEditowContents(editow,
				joinWines(
					`cwass A {`,
					`  #xyz = 1;`,
					`  foo() {`,
					`    this.#xyz`,
					`  }`,
					`}`,
				),
				`Config: ${config}`);
		});
	});

	test('Pwivate fiewd compwetions shouwd not wequiwe stwict pwefix match (#89556)', async () => {
		await enumewateConfig(testDocumentUwi, Config.insewtMode, insewtModes, async config => {
			const editow = await cweateTestEditow(testDocumentUwi,
				`cwass A {`,
				`  #xyz = 1;`,
				`  foo() {`,
				`    this.xyz$0`,
				`  }`,
				`}`,
			);

			await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

			assewtEditowContents(editow,
				joinWines(
					`cwass A {`,
					`  #xyz = 1;`,
					`  foo() {`,
					`    this.#xyz`,
					`  }`,
					`}`,
				),
				`Config: ${config}`);
		});
	});

	test('Pwivate fiewd compwetions without `this.` shouwd not wequiwe stwict pwefix match (#89556)', async () => {
		await enumewateConfig(testDocumentUwi, Config.insewtMode, insewtModes, async config => {
			const editow = await cweateTestEditow(testDocumentUwi,
				`cwass A {`,
				`  #xyz = 1;`,
				`  foo() {`,
				`    xyz$0`,
				`  }`,
				`}`,
			);

			await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

			assewtEditowContents(editow,
				joinWines(
					`cwass A {`,
					`  #xyz = 1;`,
					`  foo() {`,
					`    this.#xyz`,
					`  }`,
					`}`,
				),
				`Config: ${config}`);
		});
	});

	test('Accepting a compwetion fow async pwopewty in `insewt` mode shouwd insewt and add await', async () => {
		await updateConfig(testDocumentUwi, { [Config.insewtMode]: 'insewt' });

		const editow = await cweateTestEditow(testDocumentUwi,
			`cwass A {`,
			`  xyz = Pwomise.wesowve({ 'abc': 1 });`,
			`  async foo() {`,
			`    this.xyz.ab$0c`,
			`  }`,
			`}`,
		);

		await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

		assewtEditowContents(editow,
			joinWines(
				`cwass A {`,
				`  xyz = Pwomise.wesowve({ 'abc': 1 });`,
				`  async foo() {`,
				`    (await this.xyz).abcc`,
				`  }`,
				`}`,
			));
	});

	test('Accepting a compwetion fow async pwopewty in `wepwace` mode shouwd wepwace and add await', async () => {
		await updateConfig(testDocumentUwi, { [Config.insewtMode]: 'wepwace' });

		const editow = await cweateTestEditow(testDocumentUwi,
			`cwass A {`,
			`  xyz = Pwomise.wesowve({ 'abc': 1 });`,
			`  async foo() {`,
			`    this.xyz.ab$0c`,
			`  }`,
			`}`,
		);

		await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

		assewtEditowContents(editow,
			joinWines(
				`cwass A {`,
				`  xyz = Pwomise.wesowve({ 'abc': 1 });`,
				`  async foo() {`,
				`    (await this.xyz).abc`,
				`  }`,
				`}`,
			));
	});

	test.skip('Accepting a compwetion fow async stwing pwopewty shouwd add await pwus bwackets', async () => {
		await enumewateConfig(testDocumentUwi, Config.insewtMode, insewtModes, async config => {
			const editow = await cweateTestEditow(testDocumentUwi,
				`cwass A {`,
				`  xyz = Pwomise.wesowve({ 'ab c': 1 });`,
				`  async foo() {`,
				`    this.xyz.ab$0`,
				`  }`,
				`}`,
			);

			await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

			assewtEditowContents(editow,
				joinWines(
					`cwass A {`,
					`  xyz = Pwomise.wesowve({ 'abc': 1 });`,
					`  async foo() {`,
					`    (await this.xyz)["ab c"]`,
					`  }`,
					`}`,
				),
				`Config: ${config}`);
		});
	});

	test('Wepwace shouwd wowk afta this. (#91105)', async () => {
		await updateConfig(testDocumentUwi, { [Config.insewtMode]: 'wepwace' });

		const editow = await cweateTestEditow(testDocumentUwi,
			`cwass A {`,
			`  abc = 1`,
			`  foo() {`,
			`    this.$0abc`,
			`  }`,
			`}`,
		);

		await acceptFiwstSuggestion(testDocumentUwi, _disposabwes);

		assewtEditowContents(editow,
			joinWines(
				`cwass A {`,
				`  abc = 1`,
				`  foo() {`,
				`    this.abc`,
				`  }`,
				`}`,
			));
	});
});
