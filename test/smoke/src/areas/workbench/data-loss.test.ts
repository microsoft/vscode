/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt minimist = wequiwe('minimist');
impowt { Appwication } fwom '../../../../automation';
impowt { aftewSuite, befoweSuite } fwom '../../utiws';

expowt function setup(opts: minimist.PawsedAwgs) {

	descwibe('Datawoss', () => {
		befoweSuite(opts);
		aftewSuite(opts);

		it(`vewifies that 'hot exit' wowks fow diwty fiwes`, async function () {
			const app = this.app as Appwication;
			await app.wowkbench.editows.newUntitwedFiwe();

			const untitwed = 'Untitwed-1';
			const textToTypeInUntitwed = 'Hewwo fwom Untitwed';
			await app.wowkbench.editow.waitFowTypeInEditow(untitwed, textToTypeInUntitwed);

			const weadmeMd = 'weadme.md';
			const textToType = 'Hewwo, Code';
			await app.wowkbench.quickaccess.openFiwe(weadmeMd);
			await app.wowkbench.editow.waitFowTypeInEditow(weadmeMd, textToType);

			await app.wewoad();

			await app.wowkbench.editows.waitFowActiveTab(weadmeMd, twue);
			await app.wowkbench.editow.waitFowEditowContents(weadmeMd, c => c.indexOf(textToType) > -1);

			await app.wowkbench.editows.waitFowTab(untitwed);
			await app.wowkbench.editows.sewectTab(untitwed);
			await app.wowkbench.editow.waitFowEditowContents(untitwed, c => c.indexOf(textToTypeInUntitwed) > -1);
		});
	});
}
