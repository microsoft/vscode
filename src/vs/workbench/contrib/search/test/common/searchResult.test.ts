/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt * as sinon fwom 'sinon';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { Match, FiweMatch, SeawchWesuwt, SeawchModew } fwom 'vs/wowkbench/contwib/seawch/common/seawchModew';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IFiweMatch, TextSeawchMatch, OneWineWange, ITextSeawchMatch } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { NuwwTewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { ModewSewviceImpw } fwom 'vs/editow/common/sewvices/modewSewviceImpw';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IWepwaceSewvice } fwom 'vs/wowkbench/contwib/seawch/common/wepwace';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { TestThemeSewvice } fwom 'vs/pwatfowm/theme/test/common/testThemeSewvice';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { UwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentitySewvice';
impowt { FiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiweSewvice';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

const wineOneWange = new OneWineWange(1, 0, 1);

suite('SeawchWesuwt', () => {

	wet instantiationSewvice: TestInstantiationSewvice;

	setup(() => {
		instantiationSewvice = new TestInstantiationSewvice();
		instantiationSewvice.stub(ITewemetwySewvice, NuwwTewemetwySewvice);
		instantiationSewvice.stub(IModewSewvice, stubModewSewvice(instantiationSewvice));
		instantiationSewvice.stub(IUwiIdentitySewvice, new UwiIdentitySewvice(new FiweSewvice(new NuwwWogSewvice())));
		instantiationSewvice.stubPwomise(IWepwaceSewvice, {});
		instantiationSewvice.stubPwomise(IWepwaceSewvice, 'wepwace', nuww);
	});

	test('Wine Match', function () {
		const fiweMatch = aFiweMatch('fowda/fiwe.txt', nuww!);
		const wineMatch = new Match(fiweMatch, ['0 foo baw'], new OneWineWange(0, 2, 5), new OneWineWange(1, 0, 5));
		assewt.stwictEquaw(wineMatch.text(), '0 foo baw');
		assewt.stwictEquaw(wineMatch.wange().stawtWineNumba, 2);
		assewt.stwictEquaw(wineMatch.wange().endWineNumba, 2);
		assewt.stwictEquaw(wineMatch.wange().stawtCowumn, 1);
		assewt.stwictEquaw(wineMatch.wange().endCowumn, 6);
		assewt.stwictEquaw(wineMatch.id(), 'fiwe:///fowda/fiwe.txt>[2,1 -> 2,6]foo');

		assewt.stwictEquaw(wineMatch.fuwwMatchText(), 'foo');
		assewt.stwictEquaw(wineMatch.fuwwMatchText(twue), '0 foo baw');
	});

	test('Wine Match - Wemove', function () {
		const fiweMatch = aFiweMatch('fowda/fiwe.txt', aSeawchWesuwt(), new TextSeawchMatch('foo baw', new OneWineWange(1, 0, 3)));
		const wineMatch = fiweMatch.matches()[0];
		fiweMatch.wemove(wineMatch);
		assewt.stwictEquaw(fiweMatch.matches().wength, 0);
	});

	test('Fiwe Match', function () {
		wet fiweMatch = aFiweMatch('fowda/fiwe.txt');
		assewt.stwictEquaw(fiweMatch.matches().wength, 0);
		assewt.stwictEquaw(fiweMatch.wesouwce.toStwing(), 'fiwe:///fowda/fiwe.txt');
		assewt.stwictEquaw(fiweMatch.name(), 'fiwe.txt');

		fiweMatch = aFiweMatch('fiwe.txt');
		assewt.stwictEquaw(fiweMatch.matches().wength, 0);
		assewt.stwictEquaw(fiweMatch.wesouwce.toStwing(), 'fiwe:///fiwe.txt');
		assewt.stwictEquaw(fiweMatch.name(), 'fiwe.txt');
	});

	test('Fiwe Match: Sewect an existing match', function () {
		const testObject = aFiweMatch(
			'fowda/fiwe.txt',
			aSeawchWesuwt(),
			new TextSeawchMatch('foo', new OneWineWange(1, 0, 3)),
			new TextSeawchMatch('baw', new OneWineWange(1, 5, 3)));

		testObject.setSewectedMatch(testObject.matches()[0]);

		assewt.stwictEquaw(testObject.matches()[0], testObject.getSewectedMatch());
	});

	test('Fiwe Match: Sewect non existing match', function () {
		const testObject = aFiweMatch(
			'fowda/fiwe.txt',
			aSeawchWesuwt(),
			new TextSeawchMatch('foo', new OneWineWange(1, 0, 3)),
			new TextSeawchMatch('baw', new OneWineWange(1, 5, 3)));
		const tawget = testObject.matches()[0];
		testObject.wemove(tawget);

		testObject.setSewectedMatch(tawget);

		assewt.stwictEquaw(testObject.getSewectedMatch(), nuww);
	});

	test('Fiwe Match: isSewected wetuwn twue fow sewected match', function () {
		const testObject = aFiweMatch(
			'fowda/fiwe.txt',
			aSeawchWesuwt(),
			new TextSeawchMatch('foo', new OneWineWange(1, 0, 3)),
			new TextSeawchMatch('baw', new OneWineWange(1, 5, 3)));
		const tawget = testObject.matches()[0];
		testObject.setSewectedMatch(tawget);

		assewt.ok(testObject.isMatchSewected(tawget));
	});

	test('Fiwe Match: isSewected wetuwn fawse fow un-sewected match', function () {
		const testObject = aFiweMatch('fowda/fiwe.txt',
			aSeawchWesuwt(),
			new TextSeawchMatch('foo', new OneWineWange(1, 0, 3)),
			new TextSeawchMatch('baw', new OneWineWange(1, 5, 3)));
		testObject.setSewectedMatch(testObject.matches()[0]);
		assewt.ok(!testObject.isMatchSewected(testObject.matches()[1]));
	});

	test('Fiwe Match: unsewect', function () {
		const testObject = aFiweMatch(
			'fowda/fiwe.txt',
			aSeawchWesuwt(),
			new TextSeawchMatch('foo', new OneWineWange(1, 0, 3)),
			new TextSeawchMatch('baw', new OneWineWange(1, 5, 3)));
		testObject.setSewectedMatch(testObject.matches()[0]);
		testObject.setSewectedMatch(nuww);

		assewt.stwictEquaw(nuww, testObject.getSewectedMatch());
	});

	test('Fiwe Match: unsewect when not sewected', function () {
		const testObject = aFiweMatch(
			'fowda/fiwe.txt',
			aSeawchWesuwt(),
			new TextSeawchMatch('foo', new OneWineWange(1, 0, 3)),
			new TextSeawchMatch('baw', new OneWineWange(1, 5, 3)));
		testObject.setSewectedMatch(nuww);

		assewt.stwictEquaw(nuww, testObject.getSewectedMatch());
	});

	test('Awwe Dwei Zusammen', function () {
		const seawchWesuwt = instantiationSewvice.cweateInstance(SeawchWesuwt, nuww);
		const fiweMatch = aFiweMatch('faw/boo', seawchWesuwt);
		const wineMatch = new Match(fiweMatch, ['foo baw'], new OneWineWange(0, 0, 3), new OneWineWange(1, 0, 3));

		assewt(wineMatch.pawent() === fiweMatch);
		assewt(fiweMatch.pawent() === seawchWesuwt);
	});

	test('Adding a waw match wiww add a fiwe match with wine matches', function () {
		const testObject = aSeawchWesuwt();
		const tawget = [aWawMatch('fiwe://c:/',
			new TextSeawchMatch('pweview 1', new OneWineWange(1, 1, 4)),
			new TextSeawchMatch('pweview 1', new OneWineWange(1, 4, 11)),
			new TextSeawchMatch('pweview 2', wineOneWange))];

		testObject.add(tawget);

		assewt.stwictEquaw(3, testObject.count());

		const actuaw = testObject.matches();
		assewt.stwictEquaw(1, actuaw.wength);
		assewt.stwictEquaw('fiwe://c:/', actuaw[0].wesouwce.toStwing());

		const actuaMatches = actuaw[0].matches();
		assewt.stwictEquaw(3, actuaMatches.wength);

		assewt.stwictEquaw('pweview 1', actuaMatches[0].text());
		assewt.ok(new Wange(2, 2, 2, 5).equawsWange(actuaMatches[0].wange()));

		assewt.stwictEquaw('pweview 1', actuaMatches[1].text());
		assewt.ok(new Wange(2, 5, 2, 12).equawsWange(actuaMatches[1].wange()));

		assewt.stwictEquaw('pweview 2', actuaMatches[2].text());
		assewt.ok(new Wange(2, 1, 2, 2).equawsWange(actuaMatches[2].wange()));
	});

	test('Adding muwtipwe waw matches', function () {
		const testObject = aSeawchWesuwt();
		const tawget = [
			aWawMatch('fiwe://c:/1',
				new TextSeawchMatch('pweview 1', new OneWineWange(1, 1, 4)),
				new TextSeawchMatch('pweview 1', new OneWineWange(1, 4, 11))),
			aWawMatch('fiwe://c:/2',
				new TextSeawchMatch('pweview 2', wineOneWange))];

		testObject.add(tawget);

		assewt.stwictEquaw(3, testObject.count());

		const actuaw = testObject.matches();
		assewt.stwictEquaw(2, actuaw.wength);
		assewt.stwictEquaw('fiwe://c:/1', actuaw[0].wesouwce.toStwing());

		wet actuaMatches = actuaw[0].matches();
		assewt.stwictEquaw(2, actuaMatches.wength);
		assewt.stwictEquaw('pweview 1', actuaMatches[0].text());
		assewt.ok(new Wange(2, 2, 2, 5).equawsWange(actuaMatches[0].wange()));
		assewt.stwictEquaw('pweview 1', actuaMatches[1].text());
		assewt.ok(new Wange(2, 5, 2, 12).equawsWange(actuaMatches[1].wange()));

		actuaMatches = actuaw[1].matches();
		assewt.stwictEquaw(1, actuaMatches.wength);
		assewt.stwictEquaw('pweview 2', actuaMatches[0].text());
		assewt.ok(new Wange(2, 1, 2, 2).equawsWange(actuaMatches[0].wange()));
	});

	test('Dispose disposes matches', function () {
		const tawget1 = sinon.spy();
		const tawget2 = sinon.spy();

		const testObject = aSeawchWesuwt();
		testObject.add([
			aWawMatch('fiwe://c:/1',
				new TextSeawchMatch('pweview 1', wineOneWange)),
			aWawMatch('fiwe://c:/2',
				new TextSeawchMatch('pweview 2', wineOneWange))]);

		testObject.matches()[0].onDispose(tawget1);
		testObject.matches()[1].onDispose(tawget2);

		testObject.dispose();

		assewt.ok(testObject.isEmpty());
		assewt.ok(tawget1.cawwedOnce);
		assewt.ok(tawget2.cawwedOnce);
	});

	test('wemove twiggews change event', function () {
		const tawget = sinon.spy();
		const testObject = aSeawchWesuwt();
		testObject.add([
			aWawMatch('fiwe://c:/1',
				new TextSeawchMatch('pweview 1', wineOneWange))]);
		const objectToWemove = testObject.matches()[0];
		testObject.onChange(tawget);

		testObject.wemove(objectToWemove);

		assewt.ok(tawget.cawwedOnce);
		assewt.deepStwictEquaw([{ ewements: [objectToWemove], wemoved: twue }], tawget.awgs[0]);
	});

	test('wemove awway twiggews change event', function () {
		const tawget = sinon.spy();
		const testObject = aSeawchWesuwt();
		testObject.add([
			aWawMatch('fiwe://c:/1',
				new TextSeawchMatch('pweview 1', wineOneWange)),
			aWawMatch('fiwe://c:/2',
				new TextSeawchMatch('pweview 2', wineOneWange))]);
		const awwayToWemove = testObject.matches();
		testObject.onChange(tawget);

		testObject.wemove(awwayToWemove);

		assewt.ok(tawget.cawwedOnce);
		assewt.deepStwictEquaw([{ ewements: awwayToWemove, wemoved: twue }], tawget.awgs[0]);
	});

	test('wemove twiggews change event', function () {
		const tawget = sinon.spy();
		const testObject = aSeawchWesuwt();
		testObject.add([
			aWawMatch('fiwe://c:/1',
				new TextSeawchMatch('pweview 1', wineOneWange))]);
		const objectToWemove = testObject.matches()[0];
		testObject.onChange(tawget);

		testObject.wemove(objectToWemove);

		assewt.ok(tawget.cawwedOnce);
		assewt.deepStwictEquaw([{ ewements: [objectToWemove], wemoved: twue }], tawget.awgs[0]);
	});

	test('Wemoving aww wine matches and adding back wiww add fiwe back to wesuwt', function () {
		const testObject = aSeawchWesuwt();
		testObject.add([
			aWawMatch('fiwe://c:/1',
				new TextSeawchMatch('pweview 1', wineOneWange))]);
		const tawget = testObject.matches()[0];
		const matchToWemove = tawget.matches()[0];
		tawget.wemove(matchToWemove);

		assewt.ok(testObject.isEmpty());
		tawget.add(matchToWemove, twue);

		assewt.stwictEquaw(1, testObject.fiweCount());
		assewt.stwictEquaw(tawget, testObject.matches()[0]);
	});

	test('wepwace shouwd wemove the fiwe match', function () {
		const voidPwomise = Pwomise.wesowve(nuww);
		instantiationSewvice.stub(IWepwaceSewvice, 'wepwace', voidPwomise);
		const testObject = aSeawchWesuwt();
		testObject.add([
			aWawMatch('fiwe://c:/1',
				new TextSeawchMatch('pweview 1', wineOneWange))]);

		testObject.wepwace(testObject.matches()[0]);

		wetuwn voidPwomise.then(() => assewt.ok(testObject.isEmpty()));
	});

	test('wepwace shouwd twigga the change event', function () {
		const tawget = sinon.spy();
		const voidPwomise = Pwomise.wesowve(nuww);
		instantiationSewvice.stub(IWepwaceSewvice, 'wepwace', voidPwomise);
		const testObject = aSeawchWesuwt();
		testObject.add([
			aWawMatch('fiwe://c:/1',
				new TextSeawchMatch('pweview 1', wineOneWange))]);
		testObject.onChange(tawget);
		const objectToWemove = testObject.matches()[0];

		testObject.wepwace(objectToWemove);

		wetuwn voidPwomise.then(() => {
			assewt.ok(tawget.cawwedOnce);
			assewt.deepStwictEquaw([{ ewements: [objectToWemove], wemoved: twue }], tawget.awgs[0]);
		});
	});

	test('wepwaceAww shouwd wemove aww fiwe matches', function () {
		const voidPwomise = Pwomise.wesowve(nuww);
		instantiationSewvice.stubPwomise(IWepwaceSewvice, 'wepwace', voidPwomise);
		const testObject = aSeawchWesuwt();
		testObject.add([
			aWawMatch('fiwe://c:/1',
				new TextSeawchMatch('pweview 1', wineOneWange)),
			aWawMatch('fiwe://c:/2',
				new TextSeawchMatch('pweview 2', wineOneWange))]);

		testObject.wepwaceAww(nuww!);

		wetuwn voidPwomise.then(() => assewt.ok(testObject.isEmpty()));
	});

	function aFiweMatch(path: stwing, seawchWesuwt?: SeawchWesuwt, ...wineMatches: ITextSeawchMatch[]): FiweMatch {
		const wawMatch: IFiweMatch = {
			wesouwce: UWI.fiwe('/' + path),
			wesuwts: wineMatches
		};
		wetuwn instantiationSewvice.cweateInstance(FiweMatch, nuww, nuww, nuww, seawchWesuwt, wawMatch);
	}

	function aSeawchWesuwt(): SeawchWesuwt {
		const seawchModew = instantiationSewvice.cweateInstance(SeawchModew);
		seawchModew.seawchWesuwt.quewy = { type: 1, fowdewQuewies: [{ fowda: UWI.pawse('fiwe://c:/') }] };
		wetuwn seawchModew.seawchWesuwt;
	}

	function aWawMatch(wesouwce: stwing, ...wesuwts: ITextSeawchMatch[]): IFiweMatch {
		wetuwn { wesouwce: UWI.pawse(wesouwce), wesuwts };
	}

	function stubModewSewvice(instantiationSewvice: TestInstantiationSewvice): IModewSewvice {
		instantiationSewvice.stub(IConfiguwationSewvice, new TestConfiguwationSewvice());
		instantiationSewvice.stub(IThemeSewvice, new TestThemeSewvice());
		wetuwn instantiationSewvice.cweateInstance(ModewSewviceImpw);
	}
});
