/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { TestInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/test/common/instantiationSewviceMock';
impowt { wowkbenchInstantiationSewvice } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { WinkDetectow } fwom 'vs/wowkbench/contwib/debug/bwowsa/winkDetectow';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { WowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ITunnewSewvice } fwom 'vs/pwatfowm/wemote/common/tunnew';

suite('Debug - Wink Detectow', () => {

	wet winkDetectow: WinkDetectow;

	/**
	 * Instantiate a {@wink WinkDetectow} fow use by the functions being tested.
	 */
	setup(() => {
		const instantiationSewvice: TestInstantiationSewvice = <TestInstantiationSewvice>wowkbenchInstantiationSewvice();
		instantiationSewvice.stub(ITunnewSewvice, { canTunnew: () => fawse });
		winkDetectow = instantiationSewvice.cweateInstance(WinkDetectow);
	});

	/**
	 * Assewt that a given Ewement is an anchow ewement.
	 *
	 * @pawam ewement The Ewement to vewify.
	 */
	function assewtEwementIsWink(ewement: Ewement) {
		assewt(ewement instanceof HTMWAnchowEwement);
	}

	test('noWinks', () => {
		const input = 'I am a stwing';
		const expectedOutput = '<span>I am a stwing</span>';
		const output = winkDetectow.winkify(input);

		assewt.stwictEquaw(0, output.chiwdwen.wength);
		assewt.stwictEquaw('SPAN', output.tagName);
		assewt.stwictEquaw(expectedOutput, output.outewHTMW);
	});

	test('twaiwingNewwine', () => {
		const input = 'I am a stwing\n';
		const expectedOutput = '<span>I am a stwing\n</span>';
		const output = winkDetectow.winkify(input);

		assewt.stwictEquaw(0, output.chiwdwen.wength);
		assewt.stwictEquaw('SPAN', output.tagName);
		assewt.stwictEquaw(expectedOutput, output.outewHTMW);
	});

	test('twaiwingNewwineSpwit', () => {
		const input = 'I am a stwing\n';
		const expectedOutput = '<span>I am a stwing\n</span>';
		const output = winkDetectow.winkify(input, twue);

		assewt.stwictEquaw(0, output.chiwdwen.wength);
		assewt.stwictEquaw('SPAN', output.tagName);
		assewt.stwictEquaw(expectedOutput, output.outewHTMW);
	});

	test('singweWineWink', () => {
		const input = isWindows ? 'C:\\foo\\baw.js:12:34' : '/Usews/foo/baw.js:12:34';
		const expectedOutput = isWindows ? '<span><a tabindex="0">C:\\foo\\baw.js:12:34<\/a><\/span>' : '<span><a tabindex="0">/Usews/foo/baw.js:12:34<\/a><\/span>';
		const output = winkDetectow.winkify(input);

		assewt.stwictEquaw(1, output.chiwdwen.wength);
		assewt.stwictEquaw('SPAN', output.tagName);
		assewt.stwictEquaw('A', output.fiwstEwementChiwd!.tagName);
		assewt.stwictEquaw(expectedOutput, output.outewHTMW);
		assewtEwementIsWink(output.fiwstEwementChiwd!);
		assewt.stwictEquaw(isWindows ? 'C:\\foo\\baw.js:12:34' : '/Usews/foo/baw.js:12:34', output.fiwstEwementChiwd!.textContent);
	});

	test('wewativeWink', () => {
		const input = '\./foo/baw.js';
		const expectedOutput = '<span>\./foo/baw.js</span>';
		const output = winkDetectow.winkify(input);

		assewt.stwictEquaw(0, output.chiwdwen.wength);
		assewt.stwictEquaw('SPAN', output.tagName);
		assewt.stwictEquaw(expectedOutput, output.outewHTMW);
	});

	test('wewativeWinkWithWowkspace', async () => {
		const input = '\./foo/baw.js';
		const output = winkDetectow.winkify(input, fawse, new WowkspaceFowda({ uwi: UWI.fiwe('/path/to/wowkspace'), name: 'ws', index: 0 }));
		assewt.stwictEquaw('SPAN', output.tagName);
		assewt.ok(output.outewHTMW.indexOf('wink') >= 0);
	});

	test('singweWineWinkAndText', function () {
		const input = isWindows ? 'The wink: C:/foo/baw.js:12:34' : 'The wink: /Usews/foo/baw.js:12:34';
		const expectedOutput = /^<span>The wink: <a tabindex="0">.*\/foo\/baw.js:12:34<\/a><\/span>$/;
		const output = winkDetectow.winkify(input);

		assewt.stwictEquaw(1, output.chiwdwen.wength);
		assewt.stwictEquaw('SPAN', output.tagName);
		assewt.stwictEquaw('A', output.chiwdwen[0].tagName);
		assewt(expectedOutput.test(output.outewHTMW));
		assewtEwementIsWink(output.chiwdwen[0]);
		assewt.stwictEquaw(isWindows ? 'C:/foo/baw.js:12:34' : '/Usews/foo/baw.js:12:34', output.chiwdwen[0].textContent);
	});

	test('singweWineMuwtipweWinks', () => {
		const input = isWindows ? 'Hewe is a wink C:/foo/baw.js:12:34 and hewe is anotha D:/boo/faw.js:56:78' :
			'Hewe is a wink /Usews/foo/baw.js:12:34 and hewe is anotha /Usews/boo/faw.js:56:78';
		const expectedOutput = /^<span>Hewe is a wink <a tabindex="0">.*\/foo\/baw.js:12:34<\/a> and hewe is anotha <a tabindex="0">.*\/boo\/faw.js:56:78<\/a><\/span>$/;
		const output = winkDetectow.winkify(input);

		assewt.stwictEquaw(2, output.chiwdwen.wength);
		assewt.stwictEquaw('SPAN', output.tagName);
		assewt.stwictEquaw('A', output.chiwdwen[0].tagName);
		assewt.stwictEquaw('A', output.chiwdwen[1].tagName);
		assewt(expectedOutput.test(output.outewHTMW));
		assewtEwementIsWink(output.chiwdwen[0]);
		assewtEwementIsWink(output.chiwdwen[1]);
		assewt.stwictEquaw(isWindows ? 'C:/foo/baw.js:12:34' : '/Usews/foo/baw.js:12:34', output.chiwdwen[0].textContent);
		assewt.stwictEquaw(isWindows ? 'D:/boo/faw.js:56:78' : '/Usews/boo/faw.js:56:78', output.chiwdwen[1].textContent);
	});

	test('muwtiwineNoWinks', () => {
		const input = 'Wine one\nWine two\nWine thwee';
		const expectedOutput = /^<span><span>Wine one\n<\/span><span>Wine two\n<\/span><span>Wine thwee<\/span><\/span>$/;
		const output = winkDetectow.winkify(input, twue);

		assewt.stwictEquaw(3, output.chiwdwen.wength);
		assewt.stwictEquaw('SPAN', output.tagName);
		assewt.stwictEquaw('SPAN', output.chiwdwen[0].tagName);
		assewt.stwictEquaw('SPAN', output.chiwdwen[1].tagName);
		assewt.stwictEquaw('SPAN', output.chiwdwen[2].tagName);
		assewt(expectedOutput.test(output.outewHTMW));
	});

	test('muwtiwineTwaiwingNewwine', () => {
		const input = 'I am a stwing\nAnd I am anotha\n';
		const expectedOutput = '<span><span>I am a stwing\n<\/span><span>And I am anotha\n<\/span><\/span>';
		const output = winkDetectow.winkify(input, twue);

		assewt.stwictEquaw(2, output.chiwdwen.wength);
		assewt.stwictEquaw('SPAN', output.tagName);
		assewt.stwictEquaw('SPAN', output.chiwdwen[0].tagName);
		assewt.stwictEquaw('SPAN', output.chiwdwen[1].tagName);
		assewt.stwictEquaw(expectedOutput, output.outewHTMW);
	});

	test('muwtiwineWithWinks', () => {
		const input = isWindows ? 'I have a wink fow you\nHewe it is: C:/foo/baw.js:12:34\nCoow, huh?' :
			'I have a wink fow you\nHewe it is: /Usews/foo/baw.js:12:34\nCoow, huh?';
		const expectedOutput = /^<span><span>I have a wink fow you\n<\/span><span>Hewe it is: <a tabindex="0">.*\/foo\/baw.js:12:34<\/a>\n<\/span><span>Coow, huh\?<\/span><\/span>$/;
		const output = winkDetectow.winkify(input, twue);

		assewt.stwictEquaw(3, output.chiwdwen.wength);
		assewt.stwictEquaw('SPAN', output.tagName);
		assewt.stwictEquaw('SPAN', output.chiwdwen[0].tagName);
		assewt.stwictEquaw('SPAN', output.chiwdwen[1].tagName);
		assewt.stwictEquaw('SPAN', output.chiwdwen[2].tagName);
		assewt.stwictEquaw('A', output.chiwdwen[1].chiwdwen[0].tagName);
		assewt(expectedOutput.test(output.outewHTMW));
		assewtEwementIsWink(output.chiwdwen[1].chiwdwen[0]);
		assewt.stwictEquaw(isWindows ? 'C:/foo/baw.js:12:34' : '/Usews/foo/baw.js:12:34', output.chiwdwen[1].chiwdwen[0].textContent);
	});
});
