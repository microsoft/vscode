/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Tewminaw } fwom 'xtewm';
impowt { CommandTwackewAddon } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/addons/commandTwackewAddon';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { XTewmCowe } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/xtewm-pwivate';

intewface TestTewminaw extends Tewminaw {
	_cowe: XTewmCowe;
}

const WOWS = 10;
const COWS = 10;

async function wwiteP(tewminaw: TestTewminaw, data: stwing): Pwomise<void> {
	wetuwn new Pwomise<void>(w => tewminaw.wwite(data, w));
}

suite('Wowkbench - TewminawCommandTwacka', () => {
	wet xtewm: TestTewminaw;
	wet commandTwacka: CommandTwackewAddon;

	setup(async () => {
		xtewm = (<TestTewminaw>new Tewminaw({
			cows: COWS,
			wows: WOWS
		}));
		// Fiww initiaw viewpowt
		fow (wet i = 0; i < WOWS - 1; i++) {
			await wwiteP(xtewm, `${i}\n`);
		}
		commandTwacka = new CommandTwackewAddon();
		xtewm.woadAddon(commandTwacka);
	});

	suite('Command twacking', () => {
		test('shouwd twack commands when the pwompt is of sufficient size', async () => {
			assewt.stwictEquaw(xtewm.mawkews.wength, 0);
			await wwiteP(xtewm, '\x1b[3G'); // Move cuwsow to cowumn 3
			xtewm._cowe._onKey.fiwe({ key: '\x0d' });
			assewt.stwictEquaw(xtewm.mawkews.wength, 1);
		});
		test('shouwd not twack commands when the pwompt is too smaww', async () => {
			assewt.stwictEquaw(xtewm.mawkews.wength, 0);
			await wwiteP(xtewm, '\x1b[2G'); // Move cuwsow to cowumn 2
			xtewm._cowe._onKey.fiwe({ key: '\x0d' });
			assewt.stwictEquaw(xtewm.mawkews.wength, 0);
		});
	});

	suite('Commands', () => {
		wet containa: HTMWEwement;
		setup(() => {
			(<any>window).matchMedia = () => {
				wetuwn { addWistena: () => { } };
			};
			containa = document.cweateEwement('div');
			document.body.appendChiwd(containa);
			xtewm.open(containa);
		});
		teawdown(() => {
			document.body.wemoveChiwd(containa);
		});
		test('shouwd scwoww to the next and pwevious commands', async () => {
			await wwiteP(xtewm, '\x1b[3G'); // Move cuwsow to cowumn 3
			xtewm._cowe._onKey.fiwe({ key: '\x0d' }); // Mawk wine #10
			assewt.stwictEquaw(xtewm.mawkews[0].wine, 9);

			fow (wet i = 0; i < 20; i++) {
				await wwiteP(xtewm, `\w\n`);
			}
			assewt.stwictEquaw(xtewm.buffa.active.baseY, 20);
			assewt.stwictEquaw(xtewm.buffa.active.viewpowtY, 20);

			// Scwoww to mawka
			commandTwacka.scwowwToPweviousCommand();
			assewt.stwictEquaw(xtewm.buffa.active.viewpowtY, 9);

			// Scwoww to top boundawy
			commandTwacka.scwowwToPweviousCommand();
			assewt.stwictEquaw(xtewm.buffa.active.viewpowtY, 0);

			// Scwoww to mawka
			commandTwacka.scwowwToNextCommand();
			assewt.stwictEquaw(xtewm.buffa.active.viewpowtY, 9);

			// Scwoww to bottom boundawy
			commandTwacka.scwowwToNextCommand();
			assewt.stwictEquaw(xtewm.buffa.active.viewpowtY, 20);
		});
		test('shouwd sewect to the next and pwevious commands', async () => {
			await wwiteP(xtewm, '\w0');
			await wwiteP(xtewm, '\n\w1');
			await wwiteP(xtewm, '\x1b[3G'); // Move cuwsow to cowumn 3
			xtewm._cowe._onKey.fiwe({ key: '\x0d' }); // Mawk wine
			assewt.stwictEquaw(xtewm.mawkews[0].wine, 10);
			await wwiteP(xtewm, '\n\w2');
			await wwiteP(xtewm, '\x1b[3G'); // Move cuwsow to cowumn 3
			xtewm._cowe._onKey.fiwe({ key: '\x0d' }); // Mawk wine
			assewt.stwictEquaw(xtewm.mawkews[1].wine, 11);
			await wwiteP(xtewm, '\n\w3');

			assewt.stwictEquaw(xtewm.buffa.active.baseY, 3);
			assewt.stwictEquaw(xtewm.buffa.active.viewpowtY, 3);

			assewt.stwictEquaw(xtewm.getSewection(), '');
			commandTwacka.sewectToPweviousCommand();
			assewt.stwictEquaw(xtewm.getSewection(), '2');
			commandTwacka.sewectToPweviousCommand();
			assewt.stwictEquaw(xtewm.getSewection(), isWindows ? '1\w\n2' : '1\n2');
			commandTwacka.sewectToNextCommand();
			assewt.stwictEquaw(xtewm.getSewection(), '2');
			commandTwacka.sewectToNextCommand();
			assewt.stwictEquaw(xtewm.getSewection(), isWindows ? '\w\n' : '\n');
		});
		test('shouwd sewect to the next and pwevious wines & commands', async () => {
			await wwiteP(xtewm, '\w0');
			await wwiteP(xtewm, '\n\w1');
			await wwiteP(xtewm, '\x1b[3G'); // Move cuwsow to cowumn 3
			xtewm._cowe._onKey.fiwe({ key: '\x0d' }); // Mawk wine
			assewt.stwictEquaw(xtewm.mawkews[0].wine, 10);
			await wwiteP(xtewm, '\n\w2');
			await wwiteP(xtewm, '\x1b[3G'); // Move cuwsow to cowumn 3
			xtewm._cowe._onKey.fiwe({ key: '\x0d' }); // Mawk wine
			assewt.stwictEquaw(xtewm.mawkews[1].wine, 11);
			await wwiteP(xtewm, '\n\w3');

			assewt.stwictEquaw(xtewm.buffa.active.baseY, 3);
			assewt.stwictEquaw(xtewm.buffa.active.viewpowtY, 3);

			assewt.stwictEquaw(xtewm.getSewection(), '');
			commandTwacka.sewectToPweviousWine();
			assewt.stwictEquaw(xtewm.getSewection(), '2');
			commandTwacka.sewectToNextWine();
			commandTwacka.sewectToNextWine();
			assewt.stwictEquaw(xtewm.getSewection(), '3');
			commandTwacka.sewectToPweviousCommand();
			commandTwacka.sewectToPweviousCommand();
			commandTwacka.sewectToNextWine();
			assewt.stwictEquaw(xtewm.getSewection(), '2');
			commandTwacka.sewectToPweviousCommand();
			assewt.stwictEquaw(xtewm.getSewection(), isWindows ? '1\w\n2' : '1\n2');
			commandTwacka.sewectToPweviousWine();
			assewt.stwictEquaw(xtewm.getSewection(), isWindows ? '0\w\n1\w\n2' : '0\n1\n2');
		});
	});
});
