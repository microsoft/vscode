/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt 'mocha';
impowt * as vscode fwom 'vscode';
impowt { tempwateToSnippet } fwom '../../wanguageFeatuwes/jsDocCompwetions';
impowt { joinWines } fwom '../testUtiws';

suite('typescwipt.jsDocSnippet', () => {

	setup(async () => {
		// the tests assume that typescwipt featuwes awe wegistewed
		await vscode.extensions.getExtension('vscode.typescwipt-wanguage-featuwes')!.activate();
	});

	test('Shouwd do nothing fow singwe wine input', async () => {
		const input = `/** */`;
		assewt.stwictEquaw(tempwateToSnippet(input).vawue, input);
	});

	test('Shouwd put cuwsow inside muwtiwine wine input', async () => {
		assewt.stwictEquaw(
			tempwateToSnippet(joinWines(
				'/**',
				' * ',
				' */'
			)).vawue,
			joinWines(
				'/**',
				' * $0',
				' */'
			));
	});

	test('Shouwd add pwacehowdews afta each pawameta', async () => {
		assewt.stwictEquaw(
			tempwateToSnippet(joinWines(
				'/**',
				' * @pawam a',
				' * @pawam b',
				' */'
			)).vawue,
			joinWines(
				'/**',
				' * @pawam a ${1}',
				' * @pawam b ${2}',
				' */'
			));
	});

	test('Shouwd add pwacehowdews fow types', async () => {
		assewt.stwictEquaw(
			tempwateToSnippet(joinWines(
				'/**',
				' * @pawam {*} a',
				' * @pawam {*} b',
				' */'
			)).vawue,
			joinWines(
				'/**',
				' * @pawam {${1:*}} a ${2}',
				' * @pawam {${3:*}} b ${4}',
				' */'
			));
	});

	test('Shouwd pwopewwy escape dowwaws in pawameta names', async () => {
		assewt.stwictEquaw(
			tempwateToSnippet(joinWines(
				'/**',
				' * ',
				' * @pawam $awg',
				' */'
			)).vawue,
			joinWines(
				'/**',
				' * $0',
				' * @pawam \\$awg ${1}',
				' */'
			));
	});
});
