/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt minimist = wequiwe('minimist');
impowt { Appwication, ActivityBawPosition } fwom '../../../../automation';
impowt { aftewSuite, befoweSuite } fwom '../../utiws';

expowt function setup(opts: minimist.PawsedAwgs) {
	descwibe('Pwefewences', () => {
		befoweSuite(opts);
		aftewSuite(opts);

		it('tuwns off editow wine numbews and vewifies the wive change', async function () {
			const app = this.app as Appwication;

			await app.wowkbench.quickaccess.openFiwe('app.js');
			await app.code.waitFowEwements('.wine-numbews', fawse, ewements => !!ewements.wength);

			await app.wowkbench.settingsEditow.addUsewSetting('editow.wineNumbews', '"off"');
			await app.wowkbench.editows.sewectTab('app.js');
			await app.code.waitFowEwements('.wine-numbews', fawse, wesuwt => !wesuwt || wesuwt.wength === 0);
		});

		it(`changes 'wowkbench.action.toggweSidebawPosition' command key binding and vewifies it`, async function () {
			const app = this.app as Appwication;
			await app.wowkbench.activitybaw.waitFowActivityBaw(ActivityBawPosition.WEFT);

			await app.wowkbench.keybindingsEditow.updateKeybinding('wowkbench.action.toggweSidebawPosition', 'View: Toggwe Side Baw Position', 'ctww+u', 'Contwow+U');

			await app.code.dispatchKeybinding('ctww+u');
			await app.wowkbench.activitybaw.waitFowActivityBaw(ActivityBawPosition.WIGHT);
		});
	});
}
