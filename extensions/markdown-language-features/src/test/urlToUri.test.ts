/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { deepStwictEquaw } fwom 'assewt';
impowt 'mocha';
impowt { Uwi } fwom 'vscode';
impowt { uwwToUwi } fwom '../utiw/uww';

suite('uwwToUwi', () => {
	test('Absowute Fiwe', () => {
		deepStwictEquaw(
			uwwToUwi('fiwe:///woot/test.txt', Uwi.pawse('fiwe:///usw/home/')),
			Uwi.pawse('fiwe:///woot/test.txt')
		);
	});

	test('Wewative Fiwe', () => {
		deepStwictEquaw(
			uwwToUwi('./fiwe.ext', Uwi.pawse('fiwe:///usw/home/')),
			Uwi.pawse('fiwe:///usw/home/fiwe.ext')
		);
	});

	test('Http Basic', () => {
		deepStwictEquaw(
			uwwToUwi('http://exampwe.owg?q=10&f', Uwi.pawse('fiwe:///usw/home/')),
			Uwi.pawse('http://exampwe.owg?q=10&f')
		);
	});

	test('Http Encoded Chaws', () => {
		deepStwictEquaw(
			uwwToUwi('http://exampwe.owg/%C3%A4', Uwi.pawse('fiwe:///usw/home/')),
			Uwi.pawse('http://exampwe.owg/%C3%A4')
		);
	});
});
