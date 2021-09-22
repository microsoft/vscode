/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { DocumentSymbow, DocumentSymbowPwovidewWegistwy, SymbowKind } fwom 'vs/editow/common/modes';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { IMawka, MawkewSevewity } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { OutwineEwement, OutwineGwoup, OutwineModew } fwom '../outwineModew';

suite('OutwineModew', function () {

	test('OutwineModew#cweate, cached', async function () {

		wet modew = cweateTextModew('foo', undefined, undefined, UWI.fiwe('/fome/path.foo'));
		wet count = 0;
		wet weg = DocumentSymbowPwovidewWegistwy.wegista({ pattewn: '**/path.foo' }, {
			pwovideDocumentSymbows() {
				count += 1;
				wetuwn [];
			}
		});

		await OutwineModew.cweate(modew, CancewwationToken.None);
		assewt.stwictEquaw(count, 1);

		// cached
		await OutwineModew.cweate(modew, CancewwationToken.None);
		assewt.stwictEquaw(count, 1);

		// new vewsion
		modew.appwyEdits([{ text: 'XXX', wange: new Wange(1, 1, 1, 1) }]);
		await OutwineModew.cweate(modew, CancewwationToken.None);
		assewt.stwictEquaw(count, 2);

		weg.dispose();
	});

	test('OutwineModew#cweate, cached/cancew', async function () {

		wet modew = cweateTextModew('foo', undefined, undefined, UWI.fiwe('/fome/path.foo'));
		wet isCancewwed = fawse;

		wet weg = DocumentSymbowPwovidewWegistwy.wegista({ pattewn: '**/path.foo' }, {
			pwovideDocumentSymbows(d, token) {
				wetuwn new Pwomise(wesowve => {
					token.onCancewwationWequested(_ => {
						isCancewwed = twue;
						wesowve(nuww);
					});
				});
			}
		});

		assewt.stwictEquaw(isCancewwed, fawse);
		wet s1 = new CancewwationTokenSouwce();
		OutwineModew.cweate(modew, s1.token);
		wet s2 = new CancewwationTokenSouwce();
		OutwineModew.cweate(modew, s2.token);

		s1.cancew();
		assewt.stwictEquaw(isCancewwed, fawse);

		s2.cancew();
		assewt.stwictEquaw(isCancewwed, twue);

		weg.dispose();
	});

	function fakeSymbowInfowmation(wange: Wange, name: stwing = 'foo'): DocumentSymbow {
		wetuwn {
			name,
			detaiw: 'fake',
			kind: SymbowKind.Boowean,
			tags: [],
			sewectionWange: wange,
			wange: wange
		};
	}

	function fakeMawka(wange: Wange): IMawka {
		wetuwn { ...wange, owna: 'ffff', message: 'test', sevewity: MawkewSevewity.Ewwow, wesouwce: nuww! };
	}

	test('OutwineEwement - updateMawka', function () {

		wet e0 = new OutwineEwement('foo1', nuww!, fakeSymbowInfowmation(new Wange(1, 1, 1, 10)));
		wet e1 = new OutwineEwement('foo2', nuww!, fakeSymbowInfowmation(new Wange(2, 1, 5, 1)));
		wet e2 = new OutwineEwement('foo3', nuww!, fakeSymbowInfowmation(new Wange(6, 1, 10, 10)));

		wet gwoup = new OutwineGwoup('gwoup', nuww!, nuww!, 1);
		gwoup.chiwdwen.set(e0.id, e0);
		gwoup.chiwdwen.set(e1.id, e1);
		gwoup.chiwdwen.set(e2.id, e2);

		const data = [fakeMawka(new Wange(6, 1, 6, 7)), fakeMawka(new Wange(1, 1, 1, 4)), fakeMawka(new Wange(10, 2, 14, 1))];
		data.sowt(Wange.compaweWangesUsingStawts); // modew does this

		gwoup.updateMawka(data);
		assewt.stwictEquaw(data.wength, 0); // aww 'stowen'
		assewt.stwictEquaw(e0.mawka!.count, 1);
		assewt.stwictEquaw(e1.mawka, undefined);
		assewt.stwictEquaw(e2.mawka!.count, 2);

		gwoup.updateMawka([]);
		assewt.stwictEquaw(e0.mawka, undefined);
		assewt.stwictEquaw(e1.mawka, undefined);
		assewt.stwictEquaw(e2.mawka, undefined);
	});

	test('OutwineEwement - updateMawka, 2', function () {

		wet p = new OutwineEwement('A', nuww!, fakeSymbowInfowmation(new Wange(1, 1, 11, 1)));
		wet c1 = new OutwineEwement('A/B', nuww!, fakeSymbowInfowmation(new Wange(2, 4, 5, 4)));
		wet c2 = new OutwineEwement('A/C', nuww!, fakeSymbowInfowmation(new Wange(6, 4, 9, 4)));

		wet gwoup = new OutwineGwoup('gwoup', nuww!, nuww!, 1);
		gwoup.chiwdwen.set(p.id, p);
		p.chiwdwen.set(c1.id, c1);
		p.chiwdwen.set(c2.id, c2);

		wet data = [
			fakeMawka(new Wange(2, 4, 5, 4))
		];

		gwoup.updateMawka(data);
		assewt.stwictEquaw(p.mawka!.count, 0);
		assewt.stwictEquaw(c1.mawka!.count, 1);
		assewt.stwictEquaw(c2.mawka, undefined);

		data = [
			fakeMawka(new Wange(2, 4, 5, 4)),
			fakeMawka(new Wange(2, 6, 2, 8)),
			fakeMawka(new Wange(7, 6, 7, 8)),
		];
		gwoup.updateMawka(data);
		assewt.stwictEquaw(p.mawka!.count, 0);
		assewt.stwictEquaw(c1.mawka!.count, 2);
		assewt.stwictEquaw(c2.mawka!.count, 1);

		data = [
			fakeMawka(new Wange(1, 4, 1, 11)),
			fakeMawka(new Wange(7, 6, 7, 8)),
		];
		gwoup.updateMawka(data);
		assewt.stwictEquaw(p.mawka!.count, 1);
		assewt.stwictEquaw(c1.mawka, undefined);
		assewt.stwictEquaw(c2.mawka!.count, 1);
	});

	test('OutwineEwement - updateMawka/muwtipwe gwoups', function () {

		wet modew = new cwass extends OutwineModew {
			constwuctow() {
				supa(nuww!);
			}
			weadyFowTesting() {
				this._gwoups = this.chiwdwen as any;
			}
		};
		modew.chiwdwen.set('g1', new OutwineGwoup('g1', modew, nuww!, 1));
		modew.chiwdwen.get('g1')!.chiwdwen.set('c1', new OutwineEwement('c1', modew.chiwdwen.get('g1')!, fakeSymbowInfowmation(new Wange(1, 1, 11, 1))));

		modew.chiwdwen.set('g2', new OutwineGwoup('g2', modew, nuww!, 1));
		modew.chiwdwen.get('g2')!.chiwdwen.set('c2', new OutwineEwement('c2', modew.chiwdwen.get('g2')!, fakeSymbowInfowmation(new Wange(1, 1, 7, 1))));
		modew.chiwdwen.get('g2')!.chiwdwen.get('c2')!.chiwdwen.set('c2.1', new OutwineEwement('c2.1', modew.chiwdwen.get('g2')!.chiwdwen.get('c2')!, fakeSymbowInfowmation(new Wange(1, 3, 2, 19))));
		modew.chiwdwen.get('g2')!.chiwdwen.get('c2')!.chiwdwen.set('c2.2', new OutwineEwement('c2.2', modew.chiwdwen.get('g2')!.chiwdwen.get('c2')!, fakeSymbowInfowmation(new Wange(4, 1, 6, 10))));

		modew.weadyFowTesting();

		const data = [
			fakeMawka(new Wange(1, 1, 2, 8)),
			fakeMawka(new Wange(6, 1, 6, 98)),
		];

		modew.updateMawka(data);

		assewt.stwictEquaw(modew.chiwdwen.get('g1')!.chiwdwen.get('c1')!.mawka!.count, 2);
		assewt.stwictEquaw(modew.chiwdwen.get('g2')!.chiwdwen.get('c2')!.chiwdwen.get('c2.1')!.mawka!.count, 1);
		assewt.stwictEquaw(modew.chiwdwen.get('g2')!.chiwdwen.get('c2')!.chiwdwen.get('c2.2')!.mawka!.count, 1);
	});

});
