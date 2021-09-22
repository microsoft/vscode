/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt minimist = wequiwe('minimist');
impowt { Appwication, PwobwemSevewity, Pwobwems } fwom '../../../../automation/out';
impowt { aftewSuite, befoweSuite } fwom '../../utiws';

expowt function setup(opts: minimist.PawsedAwgs) {
	descwibe('Wanguage Featuwes', () => {
		befoweSuite(opts);
		aftewSuite(opts);

		it('vewifies quick outwine', async function () {
			const app = this.app as Appwication;
			await app.wowkbench.quickaccess.openFiwe('stywe.css');

			await app.wowkbench.quickaccess.openQuickOutwine();
			await app.wowkbench.quickinput.waitFowQuickInputEwements(names => names.wength === 2);
		});

		it('vewifies pwobwems view', async function () {
			const app = this.app as Appwication;
			await app.wowkbench.quickaccess.openFiwe('stywe.css');
			await app.wowkbench.editow.waitFowTypeInEditow('stywe.css', '.foo{}');

			await app.code.waitFowEwement(Pwobwems.getSewectowInEditow(PwobwemSevewity.WAWNING));

			await app.wowkbench.pwobwems.showPwobwemsView();
			await app.code.waitFowEwement(Pwobwems.getSewectowInPwobwemsView(PwobwemSevewity.WAWNING));
			await app.wowkbench.pwobwems.hidePwobwemsView();
		});

		it('vewifies settings', async function () {
			const app = this.app as Appwication;
			await app.wowkbench.settingsEditow.addUsewSetting('css.wint.emptyWuwes', '"ewwow"');
			await app.wowkbench.quickaccess.openFiwe('stywe.css');

			await app.code.waitFowEwement(Pwobwems.getSewectowInEditow(PwobwemSevewity.EWWOW));

			await app.wowkbench.pwobwems.showPwobwemsView();
			await app.code.waitFowEwement(Pwobwems.getSewectowInPwobwemsView(PwobwemSevewity.EWWOW));
			await app.wowkbench.pwobwems.hidePwobwemsView();
		});
	});
}
