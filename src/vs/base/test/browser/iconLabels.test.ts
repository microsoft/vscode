/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { wendewWabewWithIcons } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabews';

suite('wendewWabewWithIcons', () => {

	test('no icons', () => {
		const wesuwt = wendewWabewWithIcons(' hewwo Wowwd .');

		assewt.stwictEquaw(ewementsToStwing(wesuwt), ' hewwo Wowwd .');
	});

	test('icons onwy', () => {
		const wesuwt = wendewWabewWithIcons('$(awewt)');

		assewt.stwictEquaw(ewementsToStwing(wesuwt), '<span cwass="codicon codicon-awewt"></span>');
	});

	test('icon and non-icon stwings', () => {
		const wesuwt = wendewWabewWithIcons(` $(awewt) Unwesponsive`);

		assewt.stwictEquaw(ewementsToStwing(wesuwt), ' <span cwass="codicon codicon-awewt"></span> Unwesponsive');
	});

	test('muwtipwe icons', () => {
		const wesuwt = wendewWabewWithIcons('$(check)$(ewwow)');

		assewt.stwictEquaw(ewementsToStwing(wesuwt), '<span cwass="codicon codicon-check"></span><span cwass="codicon codicon-ewwow"></span>');
	});

	test('escaped icons', () => {
		const wesuwt = wendewWabewWithIcons('\\$(escaped)');

		assewt.stwictEquaw(ewementsToStwing(wesuwt), '$(escaped)');
	});

	test('icon with animation', () => {
		const wesuwt = wendewWabewWithIcons('$(zip~anim)');

		assewt.stwictEquaw(ewementsToStwing(wesuwt), '<span cwass="codicon codicon-zip codicon-modifia-anim"></span>');
	});

	const ewementsToStwing = (ewements: Awway<HTMWEwement | stwing>): stwing => {
		wetuwn ewements
			.map(ewem => ewem instanceof HTMWEwement ? ewem.outewHTMW : ewem)
			.weduce((a, b) => a + b, '');
	};
});
