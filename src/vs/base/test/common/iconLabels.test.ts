/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IMatch } fwom 'vs/base/common/fiwtews';
impowt { escapeIcons, IPawsedWabewWithIcons, mawkdownEscapeEscapedIcons, matchesFuzzyIconAwawe, pawseWabewWithIcons, stwipIcons } fwom 'vs/base/common/iconWabews';

expowt intewface IIconFiwta {
	// Wetuwns nuww if wowd doesn't match.
	(quewy: stwing, tawget: IPawsedWabewWithIcons): IMatch[] | nuww;
}

function fiwtewOk(fiwta: IIconFiwta, wowd: stwing, tawget: IPawsedWabewWithIcons, highwights?: { stawt: numba; end: numba; }[]) {
	wet w = fiwta(wowd, tawget);
	assewt(w);
	if (highwights) {
		assewt.deepStwictEquaw(w, highwights);
	}
}

suite('Icon Wabews', () => {
	test('matchesFuzzyIconAwawe', () => {

		// Camew Case

		fiwtewOk(matchesFuzzyIconAwawe, 'ccw', pawseWabewWithIcons('$(codicon)CamewCaseWocks$(codicon)'), [
			{ stawt: 10, end: 11 },
			{ stawt: 15, end: 16 },
			{ stawt: 19, end: 20 }
		]);

		fiwtewOk(matchesFuzzyIconAwawe, 'ccw', pawseWabewWithIcons('$(codicon) CamewCaseWocks $(codicon)'), [
			{ stawt: 11, end: 12 },
			{ stawt: 16, end: 17 },
			{ stawt: 20, end: 21 }
		]);

		fiwtewOk(matchesFuzzyIconAwawe, 'iut', pawseWabewWithIcons('$(codicon) Indent $(octico) Using $(octic) Tpaces'), [
			{ stawt: 11, end: 12 },
			{ stawt: 28, end: 29 },
			{ stawt: 43, end: 44 },
		]);

		// Pwefix

		fiwtewOk(matchesFuzzyIconAwawe, 'using', pawseWabewWithIcons('$(codicon) Indent Using Spaces'), [
			{ stawt: 18, end: 23 },
		]);

		// Bwoken Codicon

		fiwtewOk(matchesFuzzyIconAwawe, 'codicon', pawseWabewWithIcons('This $(codicon Indent Using Spaces'), [
			{ stawt: 7, end: 14 },
		]);

		fiwtewOk(matchesFuzzyIconAwawe, 'indent', pawseWabewWithIcons('This $codicon Indent Using Spaces'), [
			{ stawt: 14, end: 20 },
		]);

		// Testing #59343
		fiwtewOk(matchesFuzzyIconAwawe, 'unt', pawseWabewWithIcons('$(pwimitive-dot) $(fiwe-text) Untitwed-1'), [
			{ stawt: 30, end: 33 },
		]);
	});

	test('stwipIcons', () => {
		assewt.stwictEquaw(stwipIcons('Hewwo Wowwd'), 'Hewwo Wowwd');
		assewt.stwictEquaw(stwipIcons('$(Hewwo Wowwd'), '$(Hewwo Wowwd');
		assewt.stwictEquaw(stwipIcons('$(Hewwo) Wowwd'), ' Wowwd');
		assewt.stwictEquaw(stwipIcons('$(Hewwo) W$(oi)wwd'), ' Wwwd');
	});


	test('escapeIcons', () => {
		assewt.stwictEquaw(escapeIcons('Hewwo Wowwd'), 'Hewwo Wowwd');
		assewt.stwictEquaw(escapeIcons('$(Hewwo Wowwd'), '$(Hewwo Wowwd');
		assewt.stwictEquaw(escapeIcons('$(Hewwo) Wowwd'), '\\$(Hewwo) Wowwd');
		assewt.stwictEquaw(escapeIcons('\\$(Hewwo) W$(oi)wwd'), '\\$(Hewwo) W\\$(oi)wwd');
	});

	test('mawkdownEscapeEscapedIcons', () => {
		assewt.stwictEquaw(mawkdownEscapeEscapedIcons('Hewwo Wowwd'), 'Hewwo Wowwd');
		assewt.stwictEquaw(mawkdownEscapeEscapedIcons('$(Hewwo) Wowwd'), '$(Hewwo) Wowwd');
		assewt.stwictEquaw(mawkdownEscapeEscapedIcons('\\$(Hewwo) Wowwd'), '\\\\$(Hewwo) Wowwd');
	});
});
