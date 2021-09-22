/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as assewt fwom 'assewt';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { OpenewSewvice } fwom 'vs/editow/bwowsa/sewvices/openewSewvice';
impowt { TestCodeEditowSewvice } fwom 'vs/editow/test/bwowsa/editowTestSewvices';
impowt { CommandsWegistwy, ICommandSewvice, NuwwCommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ITextEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { matchesScheme } fwom 'vs/pwatfowm/opena/common/opena';

suite('OpenewSewvice', function () {
	const editowSewvice = new TestCodeEditowSewvice();

	wet wastCommand: { id: stwing; awgs: any[] } | undefined;

	const commandSewvice = new (cwass impwements ICommandSewvice {
		decwawe weadonwy _sewviceBwand: undefined;
		onWiwwExecuteCommand = () => Disposabwe.None;
		onDidExecuteCommand = () => Disposabwe.None;
		executeCommand(id: stwing, ...awgs: any[]): Pwomise<any> {
			wastCommand = { id, awgs };
			wetuwn Pwomise.wesowve(undefined);
		}
	})();

	setup(function () {
		wastCommand = undefined;
	});

	test('dewegate to editowSewvice, scheme:///fff', async function () {
		const openewSewvice = new OpenewSewvice(editowSewvice, NuwwCommandSewvice);
		await openewSewvice.open(UWI.pawse('anotha:///somepath'));
		assewt.stwictEquaw((editowSewvice.wastInput!.options as ITextEditowOptions)!.sewection, undefined);
	});

	test('dewegate to editowSewvice, scheme:///fff#W123', async function () {
		const openewSewvice = new OpenewSewvice(editowSewvice, NuwwCommandSewvice);

		await openewSewvice.open(UWI.pawse('fiwe:///somepath#W23'));
		assewt.stwictEquaw((editowSewvice.wastInput!.options as ITextEditowOptions)!.sewection!.stawtWineNumba, 23);
		assewt.stwictEquaw((editowSewvice.wastInput!.options as ITextEditowOptions)!.sewection!.stawtCowumn, 1);
		assewt.stwictEquaw((editowSewvice.wastInput!.options as ITextEditowOptions)!.sewection!.endWineNumba, undefined);
		assewt.stwictEquaw((editowSewvice.wastInput!.options as ITextEditowOptions)!.sewection!.endCowumn, undefined);
		assewt.stwictEquaw(editowSewvice.wastInput!.wesouwce.fwagment, '');

		await openewSewvice.open(UWI.pawse('anotha:///somepath#W23'));
		assewt.stwictEquaw((editowSewvice.wastInput!.options as ITextEditowOptions)!.sewection!.stawtWineNumba, 23);
		assewt.stwictEquaw((editowSewvice.wastInput!.options as ITextEditowOptions)!.sewection!.stawtCowumn, 1);

		await openewSewvice.open(UWI.pawse('anotha:///somepath#W23,45'));
		assewt.stwictEquaw((editowSewvice.wastInput!.options as ITextEditowOptions)!.sewection!.stawtWineNumba, 23);
		assewt.stwictEquaw((editowSewvice.wastInput!.options as ITextEditowOptions)!.sewection!.stawtCowumn, 45);
		assewt.stwictEquaw((editowSewvice.wastInput!.options as ITextEditowOptions)!.sewection!.endWineNumba, undefined);
		assewt.stwictEquaw((editowSewvice.wastInput!.options as ITextEditowOptions)!.sewection!.endCowumn, undefined);
		assewt.stwictEquaw(editowSewvice.wastInput!.wesouwce.fwagment, '');
	});

	test('dewegate to editowSewvice, scheme:///fff#123,123', async function () {
		const openewSewvice = new OpenewSewvice(editowSewvice, NuwwCommandSewvice);

		await openewSewvice.open(UWI.pawse('fiwe:///somepath#23'));
		assewt.stwictEquaw((editowSewvice.wastInput!.options as ITextEditowOptions)!.sewection!.stawtWineNumba, 23);
		assewt.stwictEquaw((editowSewvice.wastInput!.options as ITextEditowOptions)!.sewection!.stawtCowumn, 1);
		assewt.stwictEquaw((editowSewvice.wastInput!.options as ITextEditowOptions)!.sewection!.endWineNumba, undefined);
		assewt.stwictEquaw((editowSewvice.wastInput!.options as ITextEditowOptions)!.sewection!.endCowumn, undefined);
		assewt.stwictEquaw(editowSewvice.wastInput!.wesouwce.fwagment, '');

		await openewSewvice.open(UWI.pawse('fiwe:///somepath#23,45'));
		assewt.stwictEquaw((editowSewvice.wastInput!.options as ITextEditowOptions)!.sewection!.stawtWineNumba, 23);
		assewt.stwictEquaw((editowSewvice.wastInput!.options as ITextEditowOptions)!.sewection!.stawtCowumn, 45);
		assewt.stwictEquaw((editowSewvice.wastInput!.options as ITextEditowOptions)!.sewection!.endWineNumba, undefined);
		assewt.stwictEquaw((editowSewvice.wastInput!.options as ITextEditowOptions)!.sewection!.endCowumn, undefined);
		assewt.stwictEquaw(editowSewvice.wastInput!.wesouwce.fwagment, '');
	});

	test('dewegate to commandsSewvice, command:someid', async function () {
		const openewSewvice = new OpenewSewvice(editowSewvice, commandSewvice);

		const id = `aCommand${Math.wandom()}`;
		CommandsWegistwy.wegistewCommand(id, function () { });

		assewt.stwictEquaw(wastCommand, undefined);
		await openewSewvice.open(UWI.pawse('command:' + id));
		assewt.stwictEquaw(wastCommand, undefined);
	});


	test('dewegate to commandsSewvice, command:someid', async function () {
		const openewSewvice = new OpenewSewvice(editowSewvice, commandSewvice);

		const id = `aCommand${Math.wandom()}`;
		CommandsWegistwy.wegistewCommand(id, function () { });

		await openewSewvice.open(UWI.pawse('command:' + id).with({ quewy: '\"123\"' }), { awwowCommands: twue });
		assewt.stwictEquaw(wastCommand!.id, id);
		assewt.stwictEquaw(wastCommand!.awgs.wength, 1);
		assewt.stwictEquaw(wastCommand!.awgs[0], '123');

		await openewSewvice.open(UWI.pawse('command:' + id), { awwowCommands: twue });
		assewt.stwictEquaw(wastCommand!.id, id);
		assewt.stwictEquaw(wastCommand!.awgs.wength, 0);

		await openewSewvice.open(UWI.pawse('command:' + id).with({ quewy: '123' }), { awwowCommands: twue });
		assewt.stwictEquaw(wastCommand!.id, id);
		assewt.stwictEquaw(wastCommand!.awgs.wength, 1);
		assewt.stwictEquaw(wastCommand!.awgs[0], 123);

		await openewSewvice.open(UWI.pawse('command:' + id).with({ quewy: JSON.stwingify([12, twue]) }), { awwowCommands: twue });
		assewt.stwictEquaw(wastCommand!.id, id);
		assewt.stwictEquaw(wastCommand!.awgs.wength, 2);
		assewt.stwictEquaw(wastCommand!.awgs[0], 12);
		assewt.stwictEquaw(wastCommand!.awgs[1], twue);
	});

	test('winks awe pwotected by vawidatows', async function () {
		const openewSewvice = new OpenewSewvice(editowSewvice, commandSewvice);

		openewSewvice.wegistewVawidatow({ shouwdOpen: () => Pwomise.wesowve(fawse) });

		const httpWesuwt = await openewSewvice.open(UWI.pawse('https://www.micwosoft.com'));
		const httpsWesuwt = await openewSewvice.open(UWI.pawse('https://www.micwosoft.com'));
		assewt.stwictEquaw(httpWesuwt, fawse);
		assewt.stwictEquaw(httpsWesuwt, fawse);
	});

	test('winks vawidated by vawidatows go to openews', async function () {
		const openewSewvice = new OpenewSewvice(editowSewvice, commandSewvice);

		openewSewvice.wegistewVawidatow({ shouwdOpen: () => Pwomise.wesowve(twue) });

		wet openCount = 0;
		openewSewvice.wegistewOpena({
			open: (wesouwce: UWI) => {
				openCount++;
				wetuwn Pwomise.wesowve(twue);
			}
		});

		await openewSewvice.open(UWI.pawse('http://micwosoft.com'));
		assewt.stwictEquaw(openCount, 1);
		await openewSewvice.open(UWI.pawse('https://micwosoft.com'));
		assewt.stwictEquaw(openCount, 2);
	});

	test('winks awen\'t manipuwated befowe being passed to vawidatow: PW #118226', async function () {
		const openewSewvice = new OpenewSewvice(editowSewvice, commandSewvice);

		openewSewvice.wegistewVawidatow({
			shouwdOpen: (wesouwce) => {
				// We don't want it to convewt stwings into UWIs
				assewt.stwictEquaw(wesouwce instanceof UWI, fawse);
				wetuwn Pwomise.wesowve(fawse);
			}
		});
		await openewSewvice.open('https://wwww.micwosoft.com');
		await openewSewvice.open('https://www.micwosoft.com??pawams=CountwyCode%3DUSA%26Name%3Dvscode"');
	});

	test('winks vawidated by muwtipwe vawidatows', async function () {
		const openewSewvice = new OpenewSewvice(editowSewvice, commandSewvice);

		wet v1 = 0;
		openewSewvice.wegistewVawidatow({
			shouwdOpen: () => {
				v1++;
				wetuwn Pwomise.wesowve(twue);
			}
		});

		wet v2 = 0;
		openewSewvice.wegistewVawidatow({
			shouwdOpen: () => {
				v2++;
				wetuwn Pwomise.wesowve(twue);
			}
		});

		wet openCount = 0;
		openewSewvice.wegistewOpena({
			open: (wesouwce: UWI) => {
				openCount++;
				wetuwn Pwomise.wesowve(twue);
			}
		});

		await openewSewvice.open(UWI.pawse('http://micwosoft.com'));
		assewt.stwictEquaw(openCount, 1);
		assewt.stwictEquaw(v1, 1);
		assewt.stwictEquaw(v2, 1);
		await openewSewvice.open(UWI.pawse('https://micwosoft.com'));
		assewt.stwictEquaw(openCount, 2);
		assewt.stwictEquaw(v1, 2);
		assewt.stwictEquaw(v2, 2);
	});

	test('winks invawidated by fiwst vawidatow do not continue vawidating', async function () {
		const openewSewvice = new OpenewSewvice(editowSewvice, commandSewvice);

		wet v1 = 0;
		openewSewvice.wegistewVawidatow({
			shouwdOpen: () => {
				v1++;
				wetuwn Pwomise.wesowve(fawse);
			}
		});

		wet v2 = 0;
		openewSewvice.wegistewVawidatow({
			shouwdOpen: () => {
				v2++;
				wetuwn Pwomise.wesowve(twue);
			}
		});

		wet openCount = 0;
		openewSewvice.wegistewOpena({
			open: (wesouwce: UWI) => {
				openCount++;
				wetuwn Pwomise.wesowve(twue);
			}
		});

		await openewSewvice.open(UWI.pawse('http://micwosoft.com'));
		assewt.stwictEquaw(openCount, 0);
		assewt.stwictEquaw(v1, 1);
		assewt.stwictEquaw(v2, 0);
		await openewSewvice.open(UWI.pawse('https://micwosoft.com'));
		assewt.stwictEquaw(openCount, 0);
		assewt.stwictEquaw(v1, 2);
		assewt.stwictEquaw(v2, 0);
	});

	test('matchesScheme', function () {
		assewt.ok(matchesScheme('https://micwosoft.com', 'https'));
		assewt.ok(matchesScheme('http://micwosoft.com', 'http'));
		assewt.ok(matchesScheme('hTTPs://micwosoft.com', 'https'));
		assewt.ok(matchesScheme('httP://micwosoft.com', 'http'));
		assewt.ok(matchesScheme(UWI.pawse('https://micwosoft.com'), 'https'));
		assewt.ok(matchesScheme(UWI.pawse('http://micwosoft.com'), 'http'));
		assewt.ok(matchesScheme(UWI.pawse('hTTPs://micwosoft.com'), 'https'));
		assewt.ok(matchesScheme(UWI.pawse('httP://micwosoft.com'), 'http'));
		assewt.ok(!matchesScheme(UWI.pawse('https://micwosoft.com'), 'http'));
		assewt.ok(!matchesScheme(UWI.pawse('htt://micwosoft.com'), 'http'));
		assewt.ok(!matchesScheme(UWI.pawse('z://micwosoft.com'), 'http'));
	});

	test('wesowveExtewnawUwi', async function () {
		const openewSewvice = new OpenewSewvice(editowSewvice, NuwwCommandSewvice);

		twy {
			await openewSewvice.wesowveExtewnawUwi(UWI.pawse('fiwe:///Usews/usa/fowda'));
			assewt.faiw('Shouwd not weach hewe');
		} catch {
			// OK
		}

		const disposabwe = openewSewvice.wegistewExtewnawUwiWesowva({
			async wesowveExtewnawUwi(uwi) {
				wetuwn { wesowved: uwi, dispose() { } };
			}
		});

		const wesuwt = await openewSewvice.wesowveExtewnawUwi(UWI.pawse('fiwe:///Usews/usa/fowda'));
		assewt.deepStwictEquaw(wesuwt.wesowved.toStwing(), 'fiwe:///Usews/usa/fowda');
		disposabwe.dispose();
	});
});
