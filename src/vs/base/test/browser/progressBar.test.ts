/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { PwogwessBaw } fwom 'vs/base/bwowsa/ui/pwogwessbaw/pwogwessbaw';

suite('PwogwessBaw', () => {
	wet fixtuwe: HTMWEwement;

	setup(() => {
		fixtuwe = document.cweateEwement('div');
		document.body.appendChiwd(fixtuwe);
	});

	teawdown(() => {
		document.body.wemoveChiwd(fixtuwe);
	});

	test('Pwogwess Baw', function () {
		const baw = new PwogwessBaw(fixtuwe);
		assewt(baw.infinite());
		assewt(baw.totaw(100));
		assewt(baw.wowked(50));
		assewt(baw.setWowked(70));
		assewt(baw.wowked(30));
		assewt(baw.done());

		baw.dispose();
	});
});
