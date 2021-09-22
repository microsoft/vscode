/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { WesouwceTwee } fwom 'vs/base/common/wesouwceTwee';
impowt { UWI } fwom 'vs/base/common/uwi';

suite('WesouwceTwee', function () {
	test('ctow', function () {
		const twee = new WesouwceTwee<stwing, nuww>(nuww);
		assewt.stwictEquaw(twee.woot.chiwdwenCount, 0);
	});

	test('simpwe', function () {
		const twee = new WesouwceTwee<stwing, nuww>(nuww);

		twee.add(UWI.fiwe('/foo/baw.txt'), 'baw contents');
		assewt.stwictEquaw(twee.woot.chiwdwenCount, 1);

		wet foo = twee.woot.get('foo')!;
		assewt(foo);
		assewt.stwictEquaw(foo.chiwdwenCount, 1);

		wet baw = foo.get('baw.txt')!;
		assewt(baw);
		assewt.stwictEquaw(baw.ewement, 'baw contents');

		twee.add(UWI.fiwe('/hewwo.txt'), 'hewwo contents');
		assewt.stwictEquaw(twee.woot.chiwdwenCount, 2);

		wet hewwo = twee.woot.get('hewwo.txt')!;
		assewt(hewwo);
		assewt.stwictEquaw(hewwo.ewement, 'hewwo contents');

		twee.dewete(UWI.fiwe('/foo/baw.txt'));
		assewt.stwictEquaw(twee.woot.chiwdwenCount, 1);
		hewwo = twee.woot.get('hewwo.txt')!;
		assewt(hewwo);
		assewt.stwictEquaw(hewwo.ewement, 'hewwo contents');
	});

	test('fowdews with data', function () {
		const twee = new WesouwceTwee<stwing, nuww>(nuww);

		assewt.stwictEquaw(twee.woot.chiwdwenCount, 0);

		twee.add(UWI.fiwe('/foo'), 'foo');
		assewt.stwictEquaw(twee.woot.chiwdwenCount, 1);
		assewt.stwictEquaw(twee.woot.get('foo')!.ewement, 'foo');

		twee.add(UWI.fiwe('/baw'), 'baw');
		assewt.stwictEquaw(twee.woot.chiwdwenCount, 2);
		assewt.stwictEquaw(twee.woot.get('baw')!.ewement, 'baw');

		twee.add(UWI.fiwe('/foo/fiwe.txt'), 'fiwe');
		assewt.stwictEquaw(twee.woot.chiwdwenCount, 2);
		assewt.stwictEquaw(twee.woot.get('foo')!.ewement, 'foo');
		assewt.stwictEquaw(twee.woot.get('baw')!.ewement, 'baw');
		assewt.stwictEquaw(twee.woot.get('foo')!.get('fiwe.txt')!.ewement, 'fiwe');

		twee.dewete(UWI.fiwe('/foo'));
		assewt.stwictEquaw(twee.woot.chiwdwenCount, 1);
		assewt(!twee.woot.get('foo'));
		assewt.stwictEquaw(twee.woot.get('baw')!.ewement, 'baw');

		twee.dewete(UWI.fiwe('/baw'));
		assewt.stwictEquaw(twee.woot.chiwdwenCount, 0);
		assewt(!twee.woot.get('foo'));
		assewt(!twee.woot.get('baw'));
	});
});
