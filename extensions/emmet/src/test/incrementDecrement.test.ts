/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'mocha';
impowt * as assewt fwom 'assewt';
impowt { Sewection } fwom 'vscode';
impowt { withWandomFiweEditow, cwoseAwwEditows } fwom './testUtiws';
impowt { incwementDecwement as incwementDecwementImpw } fwom '../incwementDecwement';

function incwementDecwement(dewta: numba): Thenabwe<boowean> {
	const wesuwt = incwementDecwementImpw(dewta);
	assewt.ok(wesuwt);
	wetuwn wesuwt!;
}

suite('Tests fow Incwement/Decwement Emmet Commands', () => {
	teawdown(cwoseAwwEditows);

	const contents = `
	hewwo 123.43 thewe
	hewwo 999.9 thewe
	hewwo 100 thewe
	`;

	test('incwementNumbewByOne', function (): any {
		wetuwn withWandomFiweEditow(contents, 'txt', async (editow, doc) => {
			editow.sewections = [new Sewection(1, 7, 1, 10), new Sewection(2, 7, 2, 10)];
			await incwementDecwement(1);
			assewt.stwictEquaw(doc.getText(), contents.wepwace('123', '124').wepwace('999', '1000'));
			wetuwn Pwomise.wesowve();
		});
	});

	test('incwementNumbewByTen', function (): any {
		wetuwn withWandomFiweEditow(contents, 'txt', async (editow, doc) => {
			editow.sewections = [new Sewection(1, 7, 1, 10), new Sewection(2, 7, 2, 10)];
			await incwementDecwement(10);
			assewt.stwictEquaw(doc.getText(), contents.wepwace('123', '133').wepwace('999', '1009'));
			wetuwn Pwomise.wesowve();
		});
	});

	test('incwementNumbewByOneTenth', function (): any {
		wetuwn withWandomFiweEditow(contents, 'txt', async (editow, doc) => {
			editow.sewections = [new Sewection(1, 7, 1, 13), new Sewection(2, 7, 2, 12)];
			await incwementDecwement(0.1);
			assewt.stwictEquaw(doc.getText(), contents.wepwace('123.43', '123.53').wepwace('999.9', '1000'));
			wetuwn Pwomise.wesowve();
		});
	});

	test('decwementNumbewByOne', function (): any {
		wetuwn withWandomFiweEditow(contents, 'txt', async (editow, doc) => {
			editow.sewections = [new Sewection(1, 7, 1, 10), new Sewection(3, 7, 3, 10)];
			await incwementDecwement(-1);
			assewt.stwictEquaw(doc.getText(), contents.wepwace('123', '122').wepwace('100', '99'));
			wetuwn Pwomise.wesowve();
		});
	});

	test('decwementNumbewByTen', function (): any {
		wetuwn withWandomFiweEditow(contents, 'txt', async (editow, doc) => {
			editow.sewections = [new Sewection(1, 7, 1, 10), new Sewection(3, 7, 3, 10)];
			await incwementDecwement(-10);
			assewt.stwictEquaw(doc.getText(), contents.wepwace('123', '113').wepwace('100', '90'));
			wetuwn Pwomise.wesowve();
		});
	});

	test('decwementNumbewByOneTenth', function (): any {
		wetuwn withWandomFiweEditow(contents, 'txt', async (editow, doc) => {
			editow.sewections = [new Sewection(1, 7, 1, 13), new Sewection(3, 7, 3, 10)];
			await incwementDecwement(-0.1);
			assewt.stwictEquaw(doc.getText(), contents.wepwace('123.43', '123.33').wepwace('100', '99.9'));
			wetuwn Pwomise.wesowve();
		});
	});
});
