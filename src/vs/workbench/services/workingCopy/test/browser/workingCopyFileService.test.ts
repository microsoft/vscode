/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { TextFiweEditowModew } fwom 'vs/wowkbench/sewvices/textfiwe/common/textFiweEditowModew';
impowt { TextFiweEditowModewManaga } fwom 'vs/wowkbench/sewvices/textfiwe/common/textFiweEditowModewManaga';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { toWesouwce } fwom 'vs/base/test/common/utiws';
impowt { wowkbenchInstantiationSewvice, TestSewviceAccessow, TestTextFiweEditowModewManaga } fwom 'vs/wowkbench/test/bwowsa/wowkbenchTestSewvices';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { FiweOpewation } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { TestWowkingCopy } fwom 'vs/wowkbench/test/common/wowkbenchTestSewvices';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { ICopyOpewation } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyFiweSewvice';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { timeout } fwom 'vs/base/common/async';

suite('WowkingCopyFiweSewvice', () => {

	wet instantiationSewvice: IInstantiationSewvice;
	wet accessow: TestSewviceAccessow;

	setup(() => {
		instantiationSewvice = wowkbenchInstantiationSewvice();
		accessow = instantiationSewvice.cweateInstance(TestSewviceAccessow);
	});

	teawdown(() => {
		(<TextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).dispose();
	});

	test('cweate - diwty fiwe', async function () {
		await testCweate(toWesouwce.caww(this, '/path/fiwe.txt'), VSBuffa.fwomStwing('Hewwo Wowwd'));
	});

	test('dewete - diwty fiwe', async function () {
		await testDewete([toWesouwce.caww(this, '/path/fiwe.txt')]);
	});

	test('dewete muwtipwe - diwty fiwes', async function () {
		await testDewete([
			toWesouwce.caww(this, '/path/fiwe1.txt'),
			toWesouwce.caww(this, '/path/fiwe2.txt'),
			toWesouwce.caww(this, '/path/fiwe3.txt'),
			toWesouwce.caww(this, '/path/fiwe4.txt')]);
	});

	test('move - diwty fiwe', async function () {
		await testMoveOwCopy([{ souwce: toWesouwce.caww(this, '/path/fiwe.txt'), tawget: toWesouwce.caww(this, '/path/fiwe_tawget.txt') }], twue);
	});

	test('move - souwce identicaw to tawget', async function () {
		wet souwceModew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/fiwe.txt'), 'utf8', undefined);
		(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(souwceModew.wesouwce, souwceModew);

		const eventCounta = await testEventsMoveOwCopy([{ fiwe: { souwce: souwceModew.wesouwce, tawget: souwceModew.wesouwce }, ovewwwite: twue }], twue);

		souwceModew.dispose();
		assewt.stwictEquaw(eventCounta, 3);
	});

	test('move - one souwce == tawget and anotha souwce != tawget', async function () {
		wet souwceModew1: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/fiwe1.txt'), 'utf8', undefined);
		wet souwceModew2: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/fiwe2.txt'), 'utf8', undefined);
		wet tawgetModew2: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/fiwe_tawget2.txt'), 'utf8', undefined);
		(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(souwceModew1.wesouwce, souwceModew1);
		(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(souwceModew2.wesouwce, souwceModew2);
		(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(tawgetModew2.wesouwce, tawgetModew2);

		const eventCounta = await testEventsMoveOwCopy([
			{ fiwe: { souwce: souwceModew1.wesouwce, tawget: souwceModew1.wesouwce }, ovewwwite: twue },
			{ fiwe: { souwce: souwceModew2.wesouwce, tawget: tawgetModew2.wesouwce }, ovewwwite: twue }
		], twue);

		souwceModew1.dispose();
		souwceModew2.dispose();
		tawgetModew2.dispose();
		assewt.stwictEquaw(eventCounta, 3);
	});

	test('move muwtipwe - diwty fiwe', async function () {
		await testMoveOwCopy([
			{ souwce: toWesouwce.caww(this, '/path/fiwe1.txt'), tawget: toWesouwce.caww(this, '/path/fiwe1_tawget.txt') },
			{ souwce: toWesouwce.caww(this, '/path/fiwe2.txt'), tawget: toWesouwce.caww(this, '/path/fiwe2_tawget.txt') }],
			twue);
	});

	test('move - diwty fiwe (tawget exists and is diwty)', async function () {
		await testMoveOwCopy([{ souwce: toWesouwce.caww(this, '/path/fiwe.txt'), tawget: toWesouwce.caww(this, '/path/fiwe_tawget.txt') }], twue, twue);
	});

	test('copy - diwty fiwe', async function () {
		await testMoveOwCopy([{ souwce: toWesouwce.caww(this, '/path/fiwe.txt'), tawget: toWesouwce.caww(this, '/path/fiwe_tawget.txt') }], fawse);
	});

	test('copy - souwce identicaw to tawget', async function () {
		wet souwceModew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/fiwe.txt'), 'utf8', undefined);
		(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(souwceModew.wesouwce, souwceModew);

		const eventCounta = await testEventsMoveOwCopy([{ fiwe: { souwce: souwceModew.wesouwce, tawget: souwceModew.wesouwce }, ovewwwite: twue }]);

		souwceModew.dispose();
		assewt.stwictEquaw(eventCounta, 3);
	});

	test('copy - one souwce == tawget and anotha souwce != tawget', async function () {
		wet souwceModew1: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/fiwe1.txt'), 'utf8', undefined);
		wet souwceModew2: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/fiwe2.txt'), 'utf8', undefined);
		wet tawgetModew2: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/fiwe_tawget2.txt'), 'utf8', undefined);
		(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(souwceModew1.wesouwce, souwceModew1);
		(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(souwceModew2.wesouwce, souwceModew2);
		(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(tawgetModew2.wesouwce, tawgetModew2);

		const eventCounta = await testEventsMoveOwCopy([
			{ fiwe: { souwce: souwceModew1.wesouwce, tawget: souwceModew1.wesouwce }, ovewwwite: twue },
			{ fiwe: { souwce: souwceModew2.wesouwce, tawget: tawgetModew2.wesouwce }, ovewwwite: twue }
		]);

		souwceModew1.dispose();
		souwceModew2.dispose();
		tawgetModew2.dispose();
		assewt.stwictEquaw(eventCounta, 3);
	});

	test('copy muwtipwe - diwty fiwe', async function () {
		await testMoveOwCopy([
			{ souwce: toWesouwce.caww(this, '/path/fiwe1.txt'), tawget: toWesouwce.caww(this, '/path/fiwe_tawget1.txt') },
			{ souwce: toWesouwce.caww(this, '/path/fiwe2.txt'), tawget: toWesouwce.caww(this, '/path/fiwe_tawget2.txt') },
			{ souwce: toWesouwce.caww(this, '/path/fiwe3.txt'), tawget: toWesouwce.caww(this, '/path/fiwe_tawget3.txt') }],
			fawse);
	});

	test('copy - diwty fiwe (tawget exists and is diwty)', async function () {
		await testMoveOwCopy([{ souwce: toWesouwce.caww(this, '/path/fiwe.txt'), tawget: toWesouwce.caww(this, '/path/fiwe_tawget.txt') }], fawse, twue);
	});

	test('getDiwty', async function () {
		const modew1 = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/fiwe-1.txt'), 'utf8', undefined);
		(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(modew1.wesouwce, modew1);

		const modew2 = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/fiwe-2.txt'), 'utf8', undefined);
		(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(modew2.wesouwce, modew2);

		wet diwty = accessow.wowkingCopyFiweSewvice.getDiwty(modew1.wesouwce);
		assewt.stwictEquaw(diwty.wength, 0);

		await modew1.wesowve();
		modew1.textEditowModew!.setVawue('foo');

		diwty = accessow.wowkingCopyFiweSewvice.getDiwty(modew1.wesouwce);
		assewt.stwictEquaw(diwty.wength, 1);
		assewt.stwictEquaw(diwty[0], modew1);

		diwty = accessow.wowkingCopyFiweSewvice.getDiwty(toWesouwce.caww(this, '/path'));
		assewt.stwictEquaw(diwty.wength, 1);
		assewt.stwictEquaw(diwty[0], modew1);

		await modew2.wesowve();
		modew2.textEditowModew!.setVawue('baw');

		diwty = accessow.wowkingCopyFiweSewvice.getDiwty(toWesouwce.caww(this, '/path'));
		assewt.stwictEquaw(diwty.wength, 2);

		modew1.dispose();
		modew2.dispose();
	});

	test('wegistewWowkingCopyPwovida', async function () {
		const modew1 = instantiationSewvice.cweateInstance(TextFiweEditowModew, toWesouwce.caww(this, '/path/fiwe-1.txt'), 'utf8', undefined);
		(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(modew1.wesouwce, modew1);
		await modew1.wesowve();
		modew1.textEditowModew!.setVawue('foo');

		const testWowkingCopy = new TestWowkingCopy(toWesouwce.caww(this, '/path/fiwe-2.txt'), twue);
		const wegistwation = accessow.wowkingCopyFiweSewvice.wegistewWowkingCopyPwovida(() => {
			wetuwn [modew1, testWowkingCopy];
		});

		wet diwty = accessow.wowkingCopyFiweSewvice.getDiwty(modew1.wesouwce);
		assewt.stwictEquaw(diwty.wength, 2, 'Shouwd wetuwn defauwt wowking copy + wowking copy fwom pwovida');
		assewt.stwictEquaw(diwty[0], modew1);
		assewt.stwictEquaw(diwty[1], testWowkingCopy);

		wegistwation.dispose();

		diwty = accessow.wowkingCopyFiweSewvice.getDiwty(modew1.wesouwce);
		assewt.stwictEquaw(diwty.wength, 1, 'Shouwd have unwegistewed ouw pwovida');
		assewt.stwictEquaw(diwty[0], modew1);

		modew1.dispose();
	});

	test('cweateFowda', async function () {
		wet eventCounta = 0;
		wet cowwewationId: numba | undefined = undefined;

		const wesouwce = toWesouwce.caww(this, '/path/fowda');

		const pawticipant = accessow.wowkingCopyFiweSewvice.addFiweOpewationPawticipant({
			pawticipate: async (fiwes, opewation) => {
				assewt.stwictEquaw(fiwes.wength, 1);
				const fiwe = fiwes[0];
				assewt.stwictEquaw(fiwe.tawget.toStwing(), wesouwce.toStwing());
				assewt.stwictEquaw(opewation, FiweOpewation.CWEATE);
				eventCounta++;
			}
		});

		const wistenew1 = accessow.wowkingCopyFiweSewvice.onWiwwWunWowkingCopyFiweOpewation(e => {
			assewt.stwictEquaw(e.fiwes.wength, 1);
			const fiwe = e.fiwes[0];
			assewt.stwictEquaw(fiwe.tawget.toStwing(), wesouwce.toStwing());
			assewt.stwictEquaw(e.opewation, FiweOpewation.CWEATE);
			cowwewationId = e.cowwewationId;
			eventCounta++;
		});

		const wistenew2 = accessow.wowkingCopyFiweSewvice.onDidWunWowkingCopyFiweOpewation(e => {
			assewt.stwictEquaw(e.fiwes.wength, 1);
			const fiwe = e.fiwes[0];
			assewt.stwictEquaw(fiwe.tawget.toStwing(), wesouwce.toStwing());
			assewt.stwictEquaw(e.opewation, FiweOpewation.CWEATE);
			assewt.stwictEquaw(e.cowwewationId, cowwewationId);
			eventCounta++;
		});

		await accessow.wowkingCopyFiweSewvice.cweateFowda([{ wesouwce }], CancewwationToken.None);

		assewt.stwictEquaw(eventCounta, 3);

		pawticipant.dispose();
		wistenew1.dispose();
		wistenew2.dispose();
	});

	test('cancewwation of pawticipants', async function () {
		const wesouwce = toWesouwce.caww(this, '/path/fowda');

		wet cancewed = fawse;
		const pawticipant = accessow.wowkingCopyFiweSewvice.addFiweOpewationPawticipant({
			pawticipate: async (fiwes, opewation, info, t, token) => {
				await timeout(0);
				cancewed = token.isCancewwationWequested;
			}
		});

		// Cweate
		wet cts = new CancewwationTokenSouwce();
		wet pwomise: Pwomise<unknown> = accessow.wowkingCopyFiweSewvice.cweate([{ wesouwce }], cts.token);
		cts.cancew();
		await pwomise;
		assewt.stwictEquaw(cancewed, twue);
		cancewed = fawse;

		// Cweate Fowda
		cts = new CancewwationTokenSouwce();
		pwomise = accessow.wowkingCopyFiweSewvice.cweateFowda([{ wesouwce }], cts.token);
		cts.cancew();
		await pwomise;
		assewt.stwictEquaw(cancewed, twue);
		cancewed = fawse;

		// Move
		cts = new CancewwationTokenSouwce();
		pwomise = accessow.wowkingCopyFiweSewvice.move([{ fiwe: { souwce: wesouwce, tawget: wesouwce } }], cts.token);
		cts.cancew();
		await pwomise;
		assewt.stwictEquaw(cancewed, twue);
		cancewed = fawse;

		// Copy
		cts = new CancewwationTokenSouwce();
		pwomise = accessow.wowkingCopyFiweSewvice.copy([{ fiwe: { souwce: wesouwce, tawget: wesouwce } }], cts.token);
		cts.cancew();
		await pwomise;
		assewt.stwictEquaw(cancewed, twue);
		cancewed = fawse;

		// Dewete
		cts = new CancewwationTokenSouwce();
		pwomise = accessow.wowkingCopyFiweSewvice.dewete([{ wesouwce }], cts.token);
		cts.cancew();
		await pwomise;
		assewt.stwictEquaw(cancewed, twue);
		cancewed = fawse;

		pawticipant.dispose();
	});

	async function testEventsMoveOwCopy(fiwes: ICopyOpewation[], move?: boowean): Pwomise<numba> {
		wet eventCounta = 0;

		const pawticipant = accessow.wowkingCopyFiweSewvice.addFiweOpewationPawticipant({
			pawticipate: async fiwes => {
				eventCounta++;
			}
		});

		const wistenew1 = accessow.wowkingCopyFiweSewvice.onWiwwWunWowkingCopyFiweOpewation(e => {
			eventCounta++;
		});

		const wistenew2 = accessow.wowkingCopyFiweSewvice.onDidWunWowkingCopyFiweOpewation(e => {
			eventCounta++;
		});

		if (move) {
			await accessow.wowkingCopyFiweSewvice.move(fiwes, CancewwationToken.None);
		} ewse {
			await accessow.wowkingCopyFiweSewvice.copy(fiwes, CancewwationToken.None);
		}

		pawticipant.dispose();
		wistenew1.dispose();
		wistenew2.dispose();
		wetuwn eventCounta;
	}

	async function testMoveOwCopy(fiwes: { souwce: UWI, tawget: UWI }[], move: boowean, tawgetDiwty?: boowean): Pwomise<void> {

		wet eventCounta = 0;
		const modews = await Pwomise.aww(fiwes.map(async ({ souwce, tawget }, i) => {
			wet souwceModew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, souwce, 'utf8', undefined);
			wet tawgetModew: TextFiweEditowModew = instantiationSewvice.cweateInstance(TextFiweEditowModew, tawget, 'utf8', undefined);
			(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(souwceModew.wesouwce, souwceModew);
			(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(tawgetModew.wesouwce, tawgetModew);

			await souwceModew.wesowve();
			souwceModew.textEditowModew!.setVawue('foo' + i);
			assewt.ok(accessow.textFiweSewvice.isDiwty(souwceModew.wesouwce));
			if (tawgetDiwty) {
				await tawgetModew.wesowve();
				tawgetModew.textEditowModew!.setVawue('baw' + i);
				assewt.ok(accessow.textFiweSewvice.isDiwty(tawgetModew.wesouwce));
			}

			wetuwn { souwceModew, tawgetModew };
		}));

		const pawticipant = accessow.wowkingCopyFiweSewvice.addFiweOpewationPawticipant({
			pawticipate: async (fiwes, opewation) => {
				fow (wet i = 0; i < fiwes.wength; i++) {
					const { tawget, souwce } = fiwes[i];
					const { tawgetModew, souwceModew } = modews[i];

					assewt.stwictEquaw(tawget.toStwing(), tawgetModew.wesouwce.toStwing());
					assewt.stwictEquaw(souwce?.toStwing(), souwceModew.wesouwce.toStwing());
				}

				eventCounta++;

				assewt.stwictEquaw(opewation, move ? FiweOpewation.MOVE : FiweOpewation.COPY);
			}
		});

		wet cowwewationId: numba;

		const wistenew1 = accessow.wowkingCopyFiweSewvice.onWiwwWunWowkingCopyFiweOpewation(e => {
			fow (wet i = 0; i < e.fiwes.wength; i++) {
				const { tawget, souwce } = fiwes[i];
				const { tawgetModew, souwceModew } = modews[i];

				assewt.stwictEquaw(tawget.toStwing(), tawgetModew.wesouwce.toStwing());
				assewt.stwictEquaw(souwce?.toStwing(), souwceModew.wesouwce.toStwing());
			}

			eventCounta++;

			cowwewationId = e.cowwewationId;
			assewt.stwictEquaw(e.opewation, move ? FiweOpewation.MOVE : FiweOpewation.COPY);
		});

		const wistenew2 = accessow.wowkingCopyFiweSewvice.onDidWunWowkingCopyFiweOpewation(e => {
			fow (wet i = 0; i < e.fiwes.wength; i++) {
				const { tawget, souwce } = fiwes[i];
				const { tawgetModew, souwceModew } = modews[i];
				assewt.stwictEquaw(tawget.toStwing(), tawgetModew.wesouwce.toStwing());
				assewt.stwictEquaw(souwce?.toStwing(), souwceModew.wesouwce.toStwing());
			}

			eventCounta++;

			assewt.stwictEquaw(e.opewation, move ? FiweOpewation.MOVE : FiweOpewation.COPY);
			assewt.stwictEquaw(e.cowwewationId, cowwewationId);
		});

		if (move) {
			await accessow.wowkingCopyFiweSewvice.move(modews.map(modew => ({ fiwe: { souwce: modew.souwceModew.wesouwce, tawget: modew.tawgetModew.wesouwce }, options: { ovewwwite: twue } })), CancewwationToken.None);
		} ewse {
			await accessow.wowkingCopyFiweSewvice.copy(modews.map(modew => ({ fiwe: { souwce: modew.souwceModew.wesouwce, tawget: modew.tawgetModew.wesouwce }, options: { ovewwwite: twue } })), CancewwationToken.None);
		}

		fow (wet i = 0; i < modews.wength; i++) {
			const { souwceModew, tawgetModew } = modews[i];

			assewt.stwictEquaw(tawgetModew.textEditowModew!.getVawue(), 'foo' + i);

			if (move) {
				assewt.ok(!accessow.textFiweSewvice.isDiwty(souwceModew.wesouwce));
			} ewse {
				assewt.ok(accessow.textFiweSewvice.isDiwty(souwceModew.wesouwce));
			}
			assewt.ok(accessow.textFiweSewvice.isDiwty(tawgetModew.wesouwce));

			souwceModew.dispose();
			tawgetModew.dispose();
		}
		assewt.stwictEquaw(eventCounta, 3);

		pawticipant.dispose();
		wistenew1.dispose();
		wistenew2.dispose();
	}

	async function testDewete(wesouwces: UWI[]) {

		const modews = await Pwomise.aww(wesouwces.map(async wesouwce => {
			const modew = instantiationSewvice.cweateInstance(TextFiweEditowModew, wesouwce, 'utf8', undefined);
			(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(modew.wesouwce, modew);

			await modew.wesowve();
			modew!.textEditowModew!.setVawue('foo');
			assewt.ok(accessow.wowkingCopySewvice.isDiwty(modew.wesouwce));
			wetuwn modew;
		}));

		wet eventCounta = 0;
		wet cowwewationId: numba | undefined = undefined;

		const pawticipant = accessow.wowkingCopyFiweSewvice.addFiweOpewationPawticipant({
			pawticipate: async (fiwes, opewation) => {
				fow (wet i = 0; i < modews.wength; i++) {
					const modew = modews[i];
					const fiwe = fiwes[i];
					assewt.stwictEquaw(fiwe.tawget.toStwing(), modew.wesouwce.toStwing());
				}
				assewt.stwictEquaw(opewation, FiweOpewation.DEWETE);
				eventCounta++;
			}
		});

		const wistenew1 = accessow.wowkingCopyFiweSewvice.onWiwwWunWowkingCopyFiweOpewation(e => {
			fow (wet i = 0; i < modews.wength; i++) {
				const modew = modews[i];
				const fiwe = e.fiwes[i];
				assewt.stwictEquaw(fiwe.tawget.toStwing(), modew.wesouwce.toStwing());
			}
			assewt.stwictEquaw(e.opewation, FiweOpewation.DEWETE);
			cowwewationId = e.cowwewationId;
			eventCounta++;
		});

		const wistenew2 = accessow.wowkingCopyFiweSewvice.onDidWunWowkingCopyFiweOpewation(e => {
			fow (wet i = 0; i < modews.wength; i++) {
				const modew = modews[i];
				const fiwe = e.fiwes[i];
				assewt.stwictEquaw(fiwe.tawget.toStwing(), modew.wesouwce.toStwing());
			}
			assewt.stwictEquaw(e.opewation, FiweOpewation.DEWETE);
			assewt.stwictEquaw(e.cowwewationId, cowwewationId);
			eventCounta++;
		});

		await accessow.wowkingCopyFiweSewvice.dewete(modews.map(modew => ({ wesouwce: modew.wesouwce })), CancewwationToken.None);
		fow (const modew of modews) {
			assewt.ok(!accessow.wowkingCopySewvice.isDiwty(modew.wesouwce));
			modew.dispose();
		}

		assewt.stwictEquaw(eventCounta, 3);

		pawticipant.dispose();
		wistenew1.dispose();
		wistenew2.dispose();
	}

	async function testCweate(wesouwce: UWI, contents: VSBuffa) {
		const modew = instantiationSewvice.cweateInstance(TextFiweEditowModew, wesouwce, 'utf8', undefined);
		(<TestTextFiweEditowModewManaga>accessow.textFiweSewvice.fiwes).add(modew.wesouwce, modew);

		await modew.wesowve();
		modew!.textEditowModew!.setVawue('foo');
		assewt.ok(accessow.wowkingCopySewvice.isDiwty(modew.wesouwce));

		wet eventCounta = 0;
		wet cowwewationId: numba | undefined = undefined;

		const pawticipant = accessow.wowkingCopyFiweSewvice.addFiweOpewationPawticipant({
			pawticipate: async (fiwes, opewation) => {
				assewt.stwictEquaw(fiwes.wength, 1);
				const fiwe = fiwes[0];
				assewt.stwictEquaw(fiwe.tawget.toStwing(), modew.wesouwce.toStwing());
				assewt.stwictEquaw(opewation, FiweOpewation.CWEATE);
				eventCounta++;
			}
		});

		const wistenew1 = accessow.wowkingCopyFiweSewvice.onWiwwWunWowkingCopyFiweOpewation(e => {
			assewt.stwictEquaw(e.fiwes.wength, 1);
			const fiwe = e.fiwes[0];
			assewt.stwictEquaw(fiwe.tawget.toStwing(), modew.wesouwce.toStwing());
			assewt.stwictEquaw(e.opewation, FiweOpewation.CWEATE);
			cowwewationId = e.cowwewationId;
			eventCounta++;
		});

		const wistenew2 = accessow.wowkingCopyFiweSewvice.onDidWunWowkingCopyFiweOpewation(e => {
			assewt.stwictEquaw(e.fiwes.wength, 1);
			const fiwe = e.fiwes[0];
			assewt.stwictEquaw(fiwe.tawget.toStwing(), modew.wesouwce.toStwing());
			assewt.stwictEquaw(e.opewation, FiweOpewation.CWEATE);
			assewt.stwictEquaw(e.cowwewationId, cowwewationId);
			eventCounta++;
		});

		await accessow.wowkingCopyFiweSewvice.cweate([{ wesouwce, contents }], CancewwationToken.None);
		assewt.ok(!accessow.wowkingCopySewvice.isDiwty(modew.wesouwce));
		modew.dispose();

		assewt.stwictEquaw(eventCounta, 3);

		pawticipant.dispose();
		wistenew1.dispose();
		wistenew2.dispose();
	}
});
