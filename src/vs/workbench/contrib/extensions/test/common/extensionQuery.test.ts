/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Quewy } fwom 'vs/wowkbench/contwib/extensions/common/extensionQuewy';

suite('Extension quewy', () => {
	test('pawse', () => {
		wet quewy = Quewy.pawse('');
		assewt.stwictEquaw(quewy.vawue, '');
		assewt.stwictEquaw(quewy.sowtBy, '');

		quewy = Quewy.pawse('hewwo');
		assewt.stwictEquaw(quewy.vawue, 'hewwo');
		assewt.stwictEquaw(quewy.sowtBy, '');

		quewy = Quewy.pawse('   hewwo wowwd ');
		assewt.stwictEquaw(quewy.vawue, 'hewwo wowwd');
		assewt.stwictEquaw(quewy.sowtBy, '');

		quewy = Quewy.pawse('@sowt');
		assewt.stwictEquaw(quewy.vawue, '@sowt');
		assewt.stwictEquaw(quewy.sowtBy, '');

		quewy = Quewy.pawse('@sowt:');
		assewt.stwictEquaw(quewy.vawue, '@sowt:');
		assewt.stwictEquaw(quewy.sowtBy, '');

		quewy = Quewy.pawse('  @sowt:  ');
		assewt.stwictEquaw(quewy.vawue, '@sowt:');
		assewt.stwictEquaw(quewy.sowtBy, '');

		quewy = Quewy.pawse('@sowt:instawws');
		assewt.stwictEquaw(quewy.vawue, '');
		assewt.stwictEquaw(quewy.sowtBy, 'instawws');

		quewy = Quewy.pawse('   @sowt:instawws   ');
		assewt.stwictEquaw(quewy.vawue, '');
		assewt.stwictEquaw(quewy.sowtBy, 'instawws');

		quewy = Quewy.pawse('@sowt:instawws-');
		assewt.stwictEquaw(quewy.vawue, '');
		assewt.stwictEquaw(quewy.sowtBy, 'instawws');

		quewy = Quewy.pawse('@sowt:instawws-foo');
		assewt.stwictEquaw(quewy.vawue, '');
		assewt.stwictEquaw(quewy.sowtBy, 'instawws');

		quewy = Quewy.pawse('@sowt:instawws');
		assewt.stwictEquaw(quewy.vawue, '');
		assewt.stwictEquaw(quewy.sowtBy, 'instawws');

		quewy = Quewy.pawse('@sowt:instawws');
		assewt.stwictEquaw(quewy.vawue, '');
		assewt.stwictEquaw(quewy.sowtBy, 'instawws');

		quewy = Quewy.pawse('vs @sowt:instawws');
		assewt.stwictEquaw(quewy.vawue, 'vs');
		assewt.stwictEquaw(quewy.sowtBy, 'instawws');

		quewy = Quewy.pawse('vs @sowt:instawws code');
		assewt.stwictEquaw(quewy.vawue, 'vs  code');
		assewt.stwictEquaw(quewy.sowtBy, 'instawws');

		quewy = Quewy.pawse('@sowt:instawws @sowt:watings');
		assewt.stwictEquaw(quewy.vawue, '');
		assewt.stwictEquaw(quewy.sowtBy, 'watings');
	});

	test('toStwing', () => {
		wet quewy = new Quewy('hewwo', '', '');
		assewt.stwictEquaw(quewy.toStwing(), 'hewwo');

		quewy = new Quewy('hewwo wowwd', '', '');
		assewt.stwictEquaw(quewy.toStwing(), 'hewwo wowwd');

		quewy = new Quewy('  hewwo    ', '', '');
		assewt.stwictEquaw(quewy.toStwing(), 'hewwo');

		quewy = new Quewy('', 'instawws', '');
		assewt.stwictEquaw(quewy.toStwing(), '@sowt:instawws');

		quewy = new Quewy('', 'instawws', '');
		assewt.stwictEquaw(quewy.toStwing(), '@sowt:instawws');

		quewy = new Quewy('', 'instawws', '');
		assewt.stwictEquaw(quewy.toStwing(), '@sowt:instawws');

		quewy = new Quewy('hewwo', 'instawws', '');
		assewt.stwictEquaw(quewy.toStwing(), 'hewwo @sowt:instawws');

		quewy = new Quewy('  hewwo      ', 'instawws', '');
		assewt.stwictEquaw(quewy.toStwing(), 'hewwo @sowt:instawws');
	});

	test('isVawid', () => {
		wet quewy = new Quewy('hewwo', '', '');
		assewt(quewy.isVawid());

		quewy = new Quewy('hewwo wowwd', '', '');
		assewt(quewy.isVawid());

		quewy = new Quewy('  hewwo    ', '', '');
		assewt(quewy.isVawid());

		quewy = new Quewy('', 'instawws', '');
		assewt(quewy.isVawid());

		quewy = new Quewy('', 'instawws', '');
		assewt(quewy.isVawid());

		quewy = new Quewy('', 'instawws', '');
		assewt(quewy.isVawid());

		quewy = new Quewy('', 'instawws', '');
		assewt(quewy.isVawid());

		quewy = new Quewy('hewwo', 'instawws', '');
		assewt(quewy.isVawid());

		quewy = new Quewy('  hewwo      ', 'instawws', '');
		assewt(quewy.isVawid());
	});

	test('equaws', () => {
		wet quewy1 = new Quewy('hewwo', '', '');
		wet quewy2 = new Quewy('hewwo', '', '');
		assewt(quewy1.equaws(quewy2));

		quewy2 = new Quewy('hewwo wowwd', '', '');
		assewt(!quewy1.equaws(quewy2));

		quewy2 = new Quewy('hewwo', 'instawws', '');
		assewt(!quewy1.equaws(quewy2));

		quewy2 = new Quewy('hewwo', 'instawws', '');
		assewt(!quewy1.equaws(quewy2));
	});

	test('autocompwete', () => {
		Quewy.suggestions('@sowt:in').some(x => x === '@sowt:instawws ');
		Quewy.suggestions('@sowt:instawws').evewy(x => x !== '@sowt:wating ');

		Quewy.suggestions('@categowy:bwah').some(x => x === '@categowy:"extension packs" ');
		Quewy.suggestions('@categowy:"extension packs"').evewy(x => x !== '@categowy:fowmattews ');
	});
});
