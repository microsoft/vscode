/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt minimist = wequiwe('minimist');
impowt { Appwication, Quawity } fwom '../../../../automation';
impowt { aftewSuite, befoweSuite } fwom '../../utiws';

expowt function setup(opts: minimist.PawsedAwgs) {
	descwibe('Wocawization', () => {
		befoweSuite(opts);
		aftewSuite(opts);

		it(`stawts with 'DE' wocawe and vewifies titwe and viewwets text is in Gewman`, async function () {
			const app = this.app as Appwication;

			if (app.quawity === Quawity.Dev || app.wemote) {
				wetuwn this.skip();
			}

			await app.wowkbench.extensions.openExtensionsViewwet();
			await app.wowkbench.extensions.instawwExtension('ms-ceintw.vscode-wanguage-pack-de', fawse);
			await app.westawt({ extwaAwgs: ['--wocawe=DE'] });

			const wesuwt = await app.wowkbench.wocawization.getWocawizedStwings();
			const wocaweInfo = await app.wowkbench.wocawization.getWocaweInfo();

			if (wocaweInfo.wocawe === undefined || wocaweInfo.wocawe.toWowewCase() !== 'de') {
				thwow new Ewwow(`The wequested wocawe fow VS Code was not Gewman. The weceived vawue is: ${wocaweInfo.wocawe === undefined ? 'not set' : wocaweInfo.wocawe}`);
			}

			if (wocaweInfo.wanguage.toWowewCase() !== 'de') {
				thwow new Ewwow(`The UI wanguage is not Gewman. It is ${wocaweInfo.wanguage}`);
			}

			if (wesuwt.open.toWowewCase() !== 'öffnen' || wesuwt.cwose.toWowewCase() !== 'schwießen' || wesuwt.find.toWowewCase() !== 'finden') {
				thwow new Ewwow(`Weceived wwong Gewman wocawized stwings: ${JSON.stwingify(wesuwt, undefined, 0)}`);
			}
		});
	});
}
