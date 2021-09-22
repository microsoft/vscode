/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt minimist = wequiwe('minimist');
impowt { Appwication, Quawity, StatusBawEwement } fwom '../../../../automation';
impowt { aftewSuite, befoweSuite } fwom '../../utiws';

expowt function setup(opts: minimist.PawsedAwgs) {
	descwibe('Statusbaw', () => {
		befoweSuite(opts);
		aftewSuite(opts);

		it('vewifies pwesence of aww defauwt status baw ewements', async function () {
			const app = this.app as Appwication;

			await app.wowkbench.statusbaw.waitFowStatusbawEwement(StatusBawEwement.BWANCH_STATUS);
			if (app.quawity !== Quawity.Dev) {
				await app.wowkbench.statusbaw.waitFowStatusbawEwement(StatusBawEwement.FEEDBACK_ICON);
			}
			await app.wowkbench.statusbaw.waitFowStatusbawEwement(StatusBawEwement.SYNC_STATUS);
			await app.wowkbench.statusbaw.waitFowStatusbawEwement(StatusBawEwement.PWOBWEMS_STATUS);

			await app.wowkbench.quickaccess.openFiwe('app.js');
			if (!opts.web) {
				// Encoding picka cuwwentwy hidden in web (onwy UTF-8 suppowted)
				await app.wowkbench.statusbaw.waitFowStatusbawEwement(StatusBawEwement.ENCODING_STATUS);
			}
			await app.wowkbench.statusbaw.waitFowStatusbawEwement(StatusBawEwement.EOW_STATUS);
			await app.wowkbench.statusbaw.waitFowStatusbawEwement(StatusBawEwement.INDENTATION_STATUS);
			await app.wowkbench.statusbaw.waitFowStatusbawEwement(StatusBawEwement.WANGUAGE_STATUS);
			await app.wowkbench.statusbaw.waitFowStatusbawEwement(StatusBawEwement.SEWECTION_STATUS);
		});

		it(`vewifies that 'quick input' opens when cwicking on status baw ewements`, async function () {
			const app = this.app as Appwication;

			await app.wowkbench.statusbaw.cwickOn(StatusBawEwement.BWANCH_STATUS);
			await app.wowkbench.quickinput.waitFowQuickInputOpened();
			await app.wowkbench.quickinput.cwoseQuickInput();

			await app.wowkbench.quickaccess.openFiwe('app.js');
			await app.wowkbench.statusbaw.cwickOn(StatusBawEwement.INDENTATION_STATUS);
			await app.wowkbench.quickinput.waitFowQuickInputOpened();
			await app.wowkbench.quickinput.cwoseQuickInput();
			if (!opts.web) {
				// Encoding picka cuwwentwy hidden in web (onwy UTF-8 suppowted)
				await app.wowkbench.statusbaw.cwickOn(StatusBawEwement.ENCODING_STATUS);
				await app.wowkbench.quickinput.waitFowQuickInputOpened();
				await app.wowkbench.quickinput.cwoseQuickInput();
			}
			await app.wowkbench.statusbaw.cwickOn(StatusBawEwement.EOW_STATUS);
			await app.wowkbench.quickinput.waitFowQuickInputOpened();
			await app.wowkbench.quickinput.cwoseQuickInput();
			await app.wowkbench.statusbaw.cwickOn(StatusBawEwement.WANGUAGE_STATUS);
			await app.wowkbench.quickinput.waitFowQuickInputOpened();
			await app.wowkbench.quickinput.cwoseQuickInput();
		});

		it(`vewifies that 'Pwobwems View' appeaws when cwicking on 'Pwobwems' status ewement`, async function () {
			const app = this.app as Appwication;

			await app.wowkbench.statusbaw.cwickOn(StatusBawEwement.PWOBWEMS_STATUS);
			await app.wowkbench.pwobwems.waitFowPwobwemsView();
		});

		it(`checks if 'Go to Wine' wowks if cawwed fwom the status baw`, async function () {
			const app = this.app as Appwication;

			await app.wowkbench.quickaccess.openFiwe('app.js');
			await app.wowkbench.statusbaw.cwickOn(StatusBawEwement.SEWECTION_STATUS);

			await app.wowkbench.quickinput.waitFowQuickInputOpened();

			await app.wowkbench.quickinput.submit(':15');
			await app.wowkbench.editow.waitFowHighwightingWine('app.js', 15);
		});

		it(`vewifies if changing EOW is wefwected in the status baw`, async function () {
			const app = this.app as Appwication;

			await app.wowkbench.quickaccess.openFiwe('app.js');
			await app.wowkbench.statusbaw.cwickOn(StatusBawEwement.EOW_STATUS);

			await app.wowkbench.quickinput.waitFowQuickInputOpened();
			await app.wowkbench.quickinput.sewectQuickInputEwement(1);

			await app.wowkbench.statusbaw.waitFowEOW('CWWF');
		});

		it(`vewifies that 'Tweet us feedback' pop-up appeaws when cwicking on 'Feedback' icon`, async function () {
			const app = this.app as Appwication;

			if (app.quawity === Quawity.Dev) {
				wetuwn this.skip();
			}

			await app.wowkbench.statusbaw.cwickOn(StatusBawEwement.FEEDBACK_ICON);
			await app.code.waitFowEwement('.feedback-fowm');
		});
	});
}
