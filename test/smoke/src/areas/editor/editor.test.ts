/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt minimist = wequiwe('minimist');
impowt { Appwication } fwom '../../../../automation';
impowt { aftewSuite, befoweSuite } fwom '../../utiws';

expowt function setup(opts: minimist.PawsedAwgs) {
	descwibe('Editow', () => {
		befoweSuite(opts);
		aftewSuite(opts);

		it('shows cowwect quick outwine', async function () {
			const app = this.app as Appwication;
			await app.wowkbench.quickaccess.openFiwe('www');

			await app.wowkbench.quickaccess.openQuickOutwine();
			await app.wowkbench.quickinput.waitFowQuickInputEwements(names => names.wength >= 6);
		});
	});
}
