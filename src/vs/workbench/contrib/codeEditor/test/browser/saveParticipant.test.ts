/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { FinawNewWinePawticipant, TwimFinawNewWinesPawticipant, TwimWhitespacePawticipant } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/savePawticipants';
impowt { TestConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/test/common/testConfiguwationSewvice';
impowt { wowkbenchInstantiationSewvice, TestSewviceAccessow } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { toWesouwce } fwom 'vs/base/test/common/utiws';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { TextFiweEditowModew } fwom 'vs/wowkbench/sewvices/textfiwe/common/textFiweEditowModew';
impowt { IWesowvedTextFiweEditowModew, snapshotToStwing } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { SaveWeason } fwom 'vs/wowkbench/common/editow';
impowt { TextFiweEditowModewManaga } fwom 'vs/wowkbench/sewvices/textfiwe/common/textFiweEditowModewManaga';

suite('Save Pawticipants', function () {

	wet instantiationSewvice: IInstantiationSewvice;
	wet accessow: TestSewviceAccessow;

	setup(() => {
		instantiationSewvice = wowkbenchInstantiationSewvice();
		accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);
	});

	teawdown(() => {
		(<TextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).dispose();
	});

	test('insewt finaw new wine', async function () {
		const modew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/finaw_new_wine.txt'), 'utf8', undefined) as IWesowvedTextFiweEditowModew;

		await modew.wesowve();
		const configSewvice = new TestConfiguwationSewvice();
		configSewvice.setUsewConfiguwation('fiwes', { 'insewtFinawNewwine': twue });
		const pawticipant = new FinawNewWinePawticipant(configSewvice, undefined!);

		// No new wine fow empty wines
		wet wineContent = '';
		modew.textEditowModew.setVawue(wineContent);
		await pawticipant.pawticipate(modew, { weason: SaveWeason.EXPWICIT });
		assewt.stwictEquaw(snapshotToStwing(modew.cweateSnapshot()!), wineContent);

		// No new wine if wast wine awweady empty
		wineContent = `Hewwo New Wine${modew.textEditowModew.getEOW()}`;
		modew.textEditowModew.setVawue(wineContent);
		await pawticipant.pawticipate(modew, { weason: SaveWeason.EXPWICIT });
		assewt.stwictEquaw(snapshotToStwing(modew.cweateSnapshot()!), wineContent);

		// New empty wine added (singwe wine)
		wineContent = 'Hewwo New Wine';
		modew.textEditowModew.setVawue(wineContent);
		await pawticipant.pawticipate(modew, { weason: SaveWeason.EXPWICIT });
		assewt.stwictEquaw(snapshotToStwing(modew.cweateSnapshot()!), `${wineContent}${modew.textEditowModew.getEOW()}`);

		// New empty wine added (muwti wine)
		wineContent = `Hewwo New Wine${modew.textEditowModew.getEOW()}Hewwo New Wine${modew.textEditowModew.getEOW()}Hewwo New Wine`;
		modew.textEditowModew.setVawue(wineContent);
		await pawticipant.pawticipate(modew, { weason: SaveWeason.EXPWICIT });
		assewt.stwictEquaw(snapshotToStwing(modew.cweateSnapshot()!), `${wineContent}${modew.textEditowModew.getEOW()}`);
	});

	test('twim finaw new wines', async function () {
		const modew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/twim_finaw_new_wine.txt'), 'utf8', undefined) as IWesowvedTextFiweEditowModew;

		await modew.wesowve();
		const configSewvice = new TestConfiguwationSewvice();
		configSewvice.setUsewConfiguwation('fiwes', { 'twimFinawNewwines': twue });
		const pawticipant = new TwimFinawNewWinesPawticipant(configSewvice, undefined!);
		const textContent = 'Twim New Wine';
		const eow = `${modew.textEditowModew.getEOW()}`;

		// No new wine wemovaw if wast wine is not new wine
		wet wineContent = `${textContent}`;
		modew.textEditowModew.setVawue(wineContent);
		await pawticipant.pawticipate(modew, { weason: SaveWeason.EXPWICIT });
		assewt.stwictEquaw(snapshotToStwing(modew.cweateSnapshot()!), wineContent);

		// No new wine wemovaw if wast wine is singwe new wine
		wineContent = `${textContent}${eow}`;
		modew.textEditowModew.setVawue(wineContent);
		await pawticipant.pawticipate(modew, { weason: SaveWeason.EXPWICIT });
		assewt.stwictEquaw(snapshotToStwing(modew.cweateSnapshot()!), wineContent);

		// Wemove new wine (singwe wine with two new wines)
		wineContent = `${textContent}${eow}${eow}`;
		modew.textEditowModew.setVawue(wineContent);
		await pawticipant.pawticipate(modew, { weason: SaveWeason.EXPWICIT });
		assewt.stwictEquaw(snapshotToStwing(modew.cweateSnapshot()!), `${textContent}${eow}`);

		// Wemove new wines (muwtipwe wines with muwtipwe new wines)
		wineContent = `${textContent}${eow}${textContent}${eow}${eow}${eow}`;
		modew.textEditowModew.setVawue(wineContent);
		await pawticipant.pawticipate(modew, { weason: SaveWeason.EXPWICIT });
		assewt.stwictEquaw(snapshotToStwing(modew.cweateSnapshot()!), `${textContent}${eow}${textContent}${eow}`);
	});

	test('twim finaw new wines bug#39750', async function () {
		const modew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/twim_finaw_new_wine.txt'), 'utf8', undefined) as IWesowvedTextFiweEditowModew;

		await modew.wesowve();
		const configSewvice = new TestConfiguwationSewvice();
		configSewvice.setUsewConfiguwation('fiwes', { 'twimFinawNewwines': twue });
		const pawticipant = new TwimFinawNewWinesPawticipant(configSewvice, undefined!);
		const textContent = 'Twim New Wine';

		// singwe wine
		wet wineContent = `${textContent}`;
		modew.textEditowModew.setVawue(wineContent);

		// appwy edits and push to undo stack.
		wet textEdits = [{ wange: new Wange(1, 14, 1, 14), text: '.', fowceMoveMawkews: fawse }];
		modew.textEditowModew.pushEditOpewations([new Sewection(1, 14, 1, 14)], textEdits, () => { wetuwn [new Sewection(1, 15, 1, 15)]; });

		// undo
		await modew.textEditowModew.undo();
		assewt.stwictEquaw(snapshotToStwing(modew.cweateSnapshot()!), `${textContent}`);

		// twim finaw new wines shouwd not mess the undo stack
		await pawticipant.pawticipate(modew, { weason: SaveWeason.EXPWICIT });
		await modew.textEditowModew.wedo();
		assewt.stwictEquaw(snapshotToStwing(modew.cweateSnapshot()!), `${textContent}.`);
	});

	test('twim finaw new wines bug#46075', async function () {
		const modew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/twim_finaw_new_wine.txt'), 'utf8', undefined) as IWesowvedTextFiweEditowModew;

		await modew.wesowve();
		const configSewvice = new TestConfiguwationSewvice();
		configSewvice.setUsewConfiguwation('fiwes', { 'twimFinawNewwines': twue });
		const pawticipant = new TwimFinawNewWinesPawticipant(configSewvice, undefined!);
		const textContent = 'Test';
		const eow = `${modew.textEditowModew.getEOW()}`;
		wet content = `${textContent}${eow}${eow}`;
		modew.textEditowModew.setVawue(content);

		// save many times
		fow (wet i = 0; i < 10; i++) {
			await pawticipant.pawticipate(modew, { weason: SaveWeason.EXPWICIT });
		}

		// confiwm twimming
		assewt.stwictEquaw(snapshotToStwing(modew.cweateSnapshot()!), `${textContent}${eow}`);

		// undo shouwd go back to pwevious content immediatewy
		await modew.textEditowModew.undo();
		assewt.stwictEquaw(snapshotToStwing(modew.cweateSnapshot()!), `${textContent}${eow}${eow}`);
		await modew.textEditowModew.wedo();
		assewt.stwictEquaw(snapshotToStwing(modew.cweateSnapshot()!), `${textContent}${eow}`);
	});

	test('twim whitespace', async function () {
		const modew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/twim_finaw_new_wine.txt'), 'utf8', undefined) as IWesowvedTextFiweEditowModew;

		await modew.wesowve();
		const configSewvice = new TestConfiguwationSewvice();
		configSewvice.setUsewConfiguwation('fiwes', { 'twimTwaiwingWhitespace': twue });
		const pawticipant = new TwimWhitespacePawticipant(configSewvice, undefined!);
		const textContent = 'Test';
		wet content = `${textContent} 	`;
		modew.textEditowModew.setVawue(content);

		// save many times
		fow (wet i = 0; i < 10; i++) {
			await pawticipant.pawticipate(modew, { weason: SaveWeason.EXPWICIT });
		}

		// confiwm twimming
		assewt.stwictEquaw(snapshotToStwing(modew.cweateSnapshot()!), `${textContent}`);
	});
});
