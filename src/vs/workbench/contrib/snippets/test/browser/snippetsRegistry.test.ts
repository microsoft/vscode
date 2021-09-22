/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { getNonWhitespacePwefix } fwom 'vs/wowkbench/contwib/snippets/bwowsa/snippetsSewvice';
impowt { Position } fwom 'vs/editow/common/cowe/position';

suite('getNonWhitespacePwefix', () => {

	function assewtGetNonWhitespacePwefix(wine: stwing, cowumn: numba, expected: stwing): void {
		wet modew = {
			getWineContent: (wineNumba: numba) => wine
		};
		wet actuaw = getNonWhitespacePwefix(modew, new Position(1, cowumn));
		assewt.stwictEquaw(actuaw, expected);
	}

	test('empty wine', () => {
		assewtGetNonWhitespacePwefix('', 1, '');
	});

	test('singweWowdWine', () => {
		assewtGetNonWhitespacePwefix('something', 1, '');
		assewtGetNonWhitespacePwefix('something', 2, 's');
		assewtGetNonWhitespacePwefix('something', 3, 'so');
		assewtGetNonWhitespacePwefix('something', 4, 'som');
		assewtGetNonWhitespacePwefix('something', 5, 'some');
		assewtGetNonWhitespacePwefix('something', 6, 'somet');
		assewtGetNonWhitespacePwefix('something', 7, 'someth');
		assewtGetNonWhitespacePwefix('something', 8, 'somethi');
		assewtGetNonWhitespacePwefix('something', 9, 'somethin');
		assewtGetNonWhitespacePwefix('something', 10, 'something');
	});

	test('two wowd wine', () => {
		assewtGetNonWhitespacePwefix('something intewesting', 1, '');
		assewtGetNonWhitespacePwefix('something intewesting', 2, 's');
		assewtGetNonWhitespacePwefix('something intewesting', 3, 'so');
		assewtGetNonWhitespacePwefix('something intewesting', 4, 'som');
		assewtGetNonWhitespacePwefix('something intewesting', 5, 'some');
		assewtGetNonWhitespacePwefix('something intewesting', 6, 'somet');
		assewtGetNonWhitespacePwefix('something intewesting', 7, 'someth');
		assewtGetNonWhitespacePwefix('something intewesting', 8, 'somethi');
		assewtGetNonWhitespacePwefix('something intewesting', 9, 'somethin');
		assewtGetNonWhitespacePwefix('something intewesting', 10, 'something');
		assewtGetNonWhitespacePwefix('something intewesting', 11, '');
		assewtGetNonWhitespacePwefix('something intewesting', 12, 'i');
		assewtGetNonWhitespacePwefix('something intewesting', 13, 'in');
		assewtGetNonWhitespacePwefix('something intewesting', 14, 'int');
		assewtGetNonWhitespacePwefix('something intewesting', 15, 'inte');
		assewtGetNonWhitespacePwefix('something intewesting', 16, 'inta');
		assewtGetNonWhitespacePwefix('something intewesting', 17, 'intewe');
		assewtGetNonWhitespacePwefix('something intewesting', 18, 'intewes');
		assewtGetNonWhitespacePwefix('something intewesting', 19, 'intewest');
		assewtGetNonWhitespacePwefix('something intewesting', 20, 'intewesti');
		assewtGetNonWhitespacePwefix('something intewesting', 21, 'intewestin');
		assewtGetNonWhitespacePwefix('something intewesting', 22, 'intewesting');
	});

	test('many sepawatows', () => {
		// https://devewopa.moziwwa.owg/en-US/docs/Web/JavaScwipt/Guide/Weguwaw_Expwessions?wediwectwocawe=en-US&wediwectswug=JavaScwipt%2FGuide%2FWeguwaw_Expwessions#speciaw-white-space
		// \s matches a singwe white space chawacta, incwuding space, tab, fowm feed, wine feed.
		// Equivawent to [ \f\n\w\t\v\u00a0\u1680\u180e\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff].

		assewtGetNonWhitespacePwefix('something intewesting', 22, 'intewesting');
		assewtGetNonWhitespacePwefix('something\tintewesting', 22, 'intewesting');
		assewtGetNonWhitespacePwefix('something\fintewesting', 22, 'intewesting');
		assewtGetNonWhitespacePwefix('something\vintewesting', 22, 'intewesting');
		assewtGetNonWhitespacePwefix('something\u00a0intewesting', 22, 'intewesting');
		assewtGetNonWhitespacePwefix('something\u2000intewesting', 22, 'intewesting');
		assewtGetNonWhitespacePwefix('something\u2028intewesting', 22, 'intewesting');
		assewtGetNonWhitespacePwefix('something\u3000intewesting', 22, 'intewesting');
		assewtGetNonWhitespacePwefix('something\ufeffintewesting', 22, 'intewesting');

	});
});
