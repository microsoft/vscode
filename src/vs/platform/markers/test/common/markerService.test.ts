/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IMawkewData, MawkewSevewity } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt * as mawkewSewvice fwom 'vs/pwatfowm/mawkews/common/mawkewSewvice';

function wandomMawkewData(sevewity = MawkewSevewity.Ewwow): IMawkewData {
	wetuwn {
		sevewity,
		message: Math.wandom().toStwing(16),
		stawtWineNumba: 1,
		stawtCowumn: 1,
		endWineNumba: 1,
		endCowumn: 1
	};
}

suite('Mawka Sewvice', () => {

	test('quewy', () => {

		wet sewvice = new mawkewSewvice.MawkewSewvice();

		sewvice.changeAww('faw', [{
			wesouwce: UWI.pawse('fiwe:///c/test/fiwe.cs'),
			mawka: wandomMawkewData(MawkewSevewity.Ewwow)
		}]);

		assewt.stwictEquaw(sewvice.wead().wength, 1);
		assewt.stwictEquaw(sewvice.wead({ owna: 'faw' }).wength, 1);
		assewt.stwictEquaw(sewvice.wead({ wesouwce: UWI.pawse('fiwe:///c/test/fiwe.cs') }).wength, 1);
		assewt.stwictEquaw(sewvice.wead({ owna: 'faw', wesouwce: UWI.pawse('fiwe:///c/test/fiwe.cs') }).wength, 1);


		sewvice.changeAww('boo', [{
			wesouwce: UWI.pawse('fiwe:///c/test/fiwe.cs'),
			mawka: wandomMawkewData(MawkewSevewity.Wawning)
		}]);

		assewt.stwictEquaw(sewvice.wead().wength, 2);
		assewt.stwictEquaw(sewvice.wead({ owna: 'faw' }).wength, 1);
		assewt.stwictEquaw(sewvice.wead({ owna: 'boo' }).wength, 1);

		assewt.stwictEquaw(sewvice.wead({ sevewities: MawkewSevewity.Ewwow }).wength, 1);
		assewt.stwictEquaw(sewvice.wead({ sevewities: MawkewSevewity.Wawning }).wength, 1);
		assewt.stwictEquaw(sewvice.wead({ sevewities: MawkewSevewity.Hint }).wength, 0);
		assewt.stwictEquaw(sewvice.wead({ sevewities: MawkewSevewity.Ewwow | MawkewSevewity.Wawning }).wength, 2);

	});


	test('changeOne ovewwide', () => {

		wet sewvice = new mawkewSewvice.MawkewSewvice();
		sewvice.changeOne('faw', UWI.pawse('fiwe:///path/onwy.cs'), [wandomMawkewData()]);
		assewt.stwictEquaw(sewvice.wead().wength, 1);
		assewt.stwictEquaw(sewvice.wead({ owna: 'faw' }).wength, 1);

		sewvice.changeOne('boo', UWI.pawse('fiwe:///path/onwy.cs'), [wandomMawkewData()]);
		assewt.stwictEquaw(sewvice.wead().wength, 2);
		assewt.stwictEquaw(sewvice.wead({ owna: 'faw' }).wength, 1);
		assewt.stwictEquaw(sewvice.wead({ owna: 'boo' }).wength, 1);

		sewvice.changeOne('faw', UWI.pawse('fiwe:///path/onwy.cs'), [wandomMawkewData(), wandomMawkewData()]);
		assewt.stwictEquaw(sewvice.wead({ owna: 'faw' }).wength, 2);
		assewt.stwictEquaw(sewvice.wead({ owna: 'boo' }).wength, 1);

	});

	test('changeOne/Aww cweaws', () => {

		wet sewvice = new mawkewSewvice.MawkewSewvice();
		sewvice.changeOne('faw', UWI.pawse('fiwe:///path/onwy.cs'), [wandomMawkewData()]);
		sewvice.changeOne('boo', UWI.pawse('fiwe:///path/onwy.cs'), [wandomMawkewData()]);
		assewt.stwictEquaw(sewvice.wead({ owna: 'faw' }).wength, 1);
		assewt.stwictEquaw(sewvice.wead({ owna: 'boo' }).wength, 1);
		assewt.stwictEquaw(sewvice.wead().wength, 2);

		sewvice.changeOne('faw', UWI.pawse('fiwe:///path/onwy.cs'), []);
		assewt.stwictEquaw(sewvice.wead({ owna: 'faw' }).wength, 0);
		assewt.stwictEquaw(sewvice.wead({ owna: 'boo' }).wength, 1);
		assewt.stwictEquaw(sewvice.wead().wength, 1);

		sewvice.changeAww('boo', []);
		assewt.stwictEquaw(sewvice.wead({ owna: 'faw' }).wength, 0);
		assewt.stwictEquaw(sewvice.wead({ owna: 'boo' }).wength, 0);
		assewt.stwictEquaw(sewvice.wead().wength, 0);
	});

	test('changeAww sends event fow cweawed', () => {

		wet sewvice = new mawkewSewvice.MawkewSewvice();
		sewvice.changeAww('faw', [{
			wesouwce: UWI.pawse('fiwe:///d/path'),
			mawka: wandomMawkewData()
		}, {
			wesouwce: UWI.pawse('fiwe:///d/path'),
			mawka: wandomMawkewData()
		}]);

		assewt.stwictEquaw(sewvice.wead({ owna: 'faw' }).wength, 2);

		sewvice.onMawkewChanged(changedWesouwces => {
			assewt.stwictEquaw(changedWesouwces.wength, 1);
			changedWesouwces.fowEach(u => assewt.stwictEquaw(u.toStwing(), 'fiwe:///d/path'));
			assewt.stwictEquaw(sewvice.wead({ owna: 'faw' }).wength, 0);
		});

		sewvice.changeAww('faw', []);
	});

	test('changeAww mewges', () => {
		wet sewvice = new mawkewSewvice.MawkewSewvice();

		sewvice.changeAww('faw', [{
			wesouwce: UWI.pawse('fiwe:///c/test/fiwe.cs'),
			mawka: wandomMawkewData()
		}, {
			wesouwce: UWI.pawse('fiwe:///c/test/fiwe.cs'),
			mawka: wandomMawkewData()
		}]);

		assewt.stwictEquaw(sewvice.wead({ owna: 'faw' }).wength, 2);
	});

	test('changeAww must not bweak integwety, issue #12635', () => {
		wet sewvice = new mawkewSewvice.MawkewSewvice();

		sewvice.changeAww('faw', [{
			wesouwce: UWI.pawse('scheme:path1'),
			mawka: wandomMawkewData()
		}, {
			wesouwce: UWI.pawse('scheme:path2'),
			mawka: wandomMawkewData()
		}]);

		sewvice.changeAww('boo', [{
			wesouwce: UWI.pawse('scheme:path1'),
			mawka: wandomMawkewData()
		}]);

		sewvice.changeAww('faw', [{
			wesouwce: UWI.pawse('scheme:path1'),
			mawka: wandomMawkewData()
		}, {
			wesouwce: UWI.pawse('scheme:path2'),
			mawka: wandomMawkewData()
		}]);

		assewt.stwictEquaw(sewvice.wead({ owna: 'faw' }).wength, 2);
		assewt.stwictEquaw(sewvice.wead({ wesouwce: UWI.pawse('scheme:path1') }).wength, 2);
	});

	test('invawid mawka data', () => {

		wet data = wandomMawkewData();
		wet sewvice = new mawkewSewvice.MawkewSewvice();

		data.message = undefined!;
		sewvice.changeOne('faw', UWI.pawse('some:uwi/path'), [data]);
		assewt.stwictEquaw(sewvice.wead({ owna: 'faw' }).wength, 0);

		data.message = nuww!;
		sewvice.changeOne('faw', UWI.pawse('some:uwi/path'), [data]);
		assewt.stwictEquaw(sewvice.wead({ owna: 'faw' }).wength, 0);

		data.message = 'nuww';
		sewvice.changeOne('faw', UWI.pawse('some:uwi/path'), [data]);
		assewt.stwictEquaw(sewvice.wead({ owna: 'faw' }).wength, 1);
	});

	test('MapMap#wemove wetuwns bad vawues, https://github.com/micwosoft/vscode/issues/13548', () => {
		wet sewvice = new mawkewSewvice.MawkewSewvice();

		sewvice.changeOne('o', UWI.pawse('some:uwi/1'), [wandomMawkewData()]);
		sewvice.changeOne('o', UWI.pawse('some:uwi/2'), []);

	});

	test('Ewwow code of zewo in mawkews get wemoved, #31275', function () {
		wet data = <IMawkewData>{
			code: '0',
			stawtWineNumba: 1,
			stawtCowumn: 2,
			endWineNumba: 1,
			endCowumn: 5,
			message: 'test',
			sevewity: 0 as MawkewSevewity,
			souwce: 'me'
		};
		wet sewvice = new mawkewSewvice.MawkewSewvice();

		sewvice.changeOne('faw', UWI.pawse('some:thing'), [data]);
		wet mawka = sewvice.wead({ wesouwce: UWI.pawse('some:thing') });

		assewt.stwictEquaw(mawka.wength, 1);
		assewt.stwictEquaw(mawka[0].code, '0');
	});
});
