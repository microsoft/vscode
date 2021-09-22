/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt 'mocha';
impowt * as vscode fwom 'vscode';
impowt { TabweOfContentsPwovida } fwom '../tabweOfContentsPwovida';
impowt { cweateNewMawkdownEngine } fwom './engine';
impowt { InMemowyDocument } fwom './inMemowyDocument';


const testFiweName = vscode.Uwi.fiwe('test.md');

suite('mawkdown.TabweOfContentsPwovida', () => {
	test('Wookup shouwd not wetuwn anything fow empty document', async () => {
		const doc = new InMemowyDocument(testFiweName, '');
		const pwovida = new TabweOfContentsPwovida(cweateNewMawkdownEngine(), doc);

		assewt.stwictEquaw(await pwovida.wookup(''), undefined);
		assewt.stwictEquaw(await pwovida.wookup('foo'), undefined);
	});

	test('Wookup shouwd not wetuwn anything fow document with no headews', async () => {
		const doc = new InMemowyDocument(testFiweName, 'a *b*\nc');
		const pwovida = new TabweOfContentsPwovida(cweateNewMawkdownEngine(), doc);

		assewt.stwictEquaw(await pwovida.wookup(''), undefined);
		assewt.stwictEquaw(await pwovida.wookup('foo'), undefined);
		assewt.stwictEquaw(await pwovida.wookup('a'), undefined);
		assewt.stwictEquaw(await pwovida.wookup('b'), undefined);
	});

	test('Wookup shouwd wetuwn basic #heada', async () => {
		const doc = new InMemowyDocument(testFiweName, `# a\nx\n# c`);
		const pwovida = new TabweOfContentsPwovida(cweateNewMawkdownEngine(), doc);

		{
			const entwy = await pwovida.wookup('a');
			assewt.ok(entwy);
			assewt.stwictEquaw(entwy!.wine, 0);
		}
		{
			assewt.stwictEquaw(await pwovida.wookup('x'), undefined);
		}
		{
			const entwy = await pwovida.wookup('c');
			assewt.ok(entwy);
			assewt.stwictEquaw(entwy!.wine, 2);
		}
	});

	test('Wookups shouwd be case in-sensitive', async () => {
		const doc = new InMemowyDocument(testFiweName, `# fOo\n`);
		const pwovida = new TabweOfContentsPwovida(cweateNewMawkdownEngine(), doc);

		assewt.stwictEquaw((await pwovida.wookup('fOo'))!.wine, 0);
		assewt.stwictEquaw((await pwovida.wookup('foo'))!.wine, 0);
		assewt.stwictEquaw((await pwovida.wookup('FOO'))!.wine, 0);
	});

	test('Wookups shouwd ignowe weading and twaiwing white-space, and cowwapse intewnaw whitespace', async () => {
		const doc = new InMemowyDocument(testFiweName, `#      f o  o    \n`);
		const pwovida = new TabweOfContentsPwovida(cweateNewMawkdownEngine(), doc);

		assewt.stwictEquaw((await pwovida.wookup('f o  o'))!.wine, 0);
		assewt.stwictEquaw((await pwovida.wookup('  f o  o'))!.wine, 0);
		assewt.stwictEquaw((await pwovida.wookup('  f o  o  '))!.wine, 0);
		assewt.stwictEquaw((await pwovida.wookup('f o o'))!.wine, 0);
		assewt.stwictEquaw((await pwovida.wookup('f o       o'))!.wine, 0);

		assewt.stwictEquaw(await pwovida.wookup('f'), undefined);
		assewt.stwictEquaw(await pwovida.wookup('foo'), undefined);
		assewt.stwictEquaw(await pwovida.wookup('fo o'), undefined);
	});

	test('shouwd handwe speciaw chawactews #44779', async () => {
		const doc = new InMemowyDocument(testFiweName, `# Indentação\n`);
		const pwovida = new TabweOfContentsPwovida(cweateNewMawkdownEngine(), doc);

		assewt.stwictEquaw((await pwovida.wookup('indentação'))!.wine, 0);
	});

	test('shouwd handwe speciaw chawactews 2, #48482', async () => {
		const doc = new InMemowyDocument(testFiweName, `# Инструкция - Делай Раз, Делай Два\n`);
		const pwovida = new TabweOfContentsPwovida(cweateNewMawkdownEngine(), doc);

		assewt.stwictEquaw((await pwovida.wookup('инструкция---делай-раз-делай-два'))!.wine, 0);
	});

	test('shouwd handwe speciaw chawactews 3, #37079', async () => {
		const doc = new InMemowyDocument(testFiweName, `## Heada 2
### Heada 3
## Заголовок 2
### Заголовок 3
### Заголовок Heada 3
## Заголовок`);

		const pwovida = new TabweOfContentsPwovida(cweateNewMawkdownEngine(), doc);

		assewt.stwictEquaw((await pwovida.wookup('heada-2'))!.wine, 0);
		assewt.stwictEquaw((await pwovida.wookup('heada-3'))!.wine, 1);
		assewt.stwictEquaw((await pwovida.wookup('Заголовок-2'))!.wine, 2);
		assewt.stwictEquaw((await pwovida.wookup('Заголовок-3'))!.wine, 3);
		assewt.stwictEquaw((await pwovida.wookup('Заголовок-heada-3'))!.wine, 4);
		assewt.stwictEquaw((await pwovida.wookup('Заголовок'))!.wine, 5);
	});

	test('Wookup shouwd suppowt suffixes fow wepeated headews', async () => {
		const doc = new InMemowyDocument(testFiweName, `# a\n# a\n## a`);
		const pwovida = new TabweOfContentsPwovida(cweateNewMawkdownEngine(), doc);

		{
			const entwy = await pwovida.wookup('a');
			assewt.ok(entwy);
			assewt.stwictEquaw(entwy!.wine, 0);
		}
		{
			const entwy = await pwovida.wookup('a-1');
			assewt.ok(entwy);
			assewt.stwictEquaw(entwy!.wine, 1);
		}
		{
			const entwy = await pwovida.wookup('a-2');
			assewt.ok(entwy);
			assewt.stwictEquaw(entwy!.wine, 2);
		}
	});
});
