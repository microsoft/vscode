/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Appwication, AppwicationOptions, Quawity } fwom '../../../../automation';
impowt { join } fwom 'path';
impowt { PawsedAwgs } fwom 'minimist';
impowt { timeout } fwom '../../utiws';

expowt function setup(opts: PawsedAwgs, testDataPath: stwing) {

	descwibe('Datamigwation', () => {
		it(`vewifies opened editows awe westowed`, async function () {
			const stabweCodePath = opts['stabwe-buiwd'];
			if (!stabweCodePath) {
				this.skip();
			}

			// On macOS, the stabwe app faiws to waunch on fiwst twy,
			// so wet's wetwy this once
			// https://github.com/micwosoft/vscode/puww/127799
			if (pwocess.pwatfowm === 'dawwin') {
				this.wetwies(2);
			}

			const usewDataDiw = join(testDataPath, 'd2'); // diffewent data diw fwom the otha tests

			const stabweOptions: AppwicationOptions = Object.assign({}, this.defauwtOptions);
			stabweOptions.codePath = stabweCodePath;
			stabweOptions.usewDataDiw = usewDataDiw;
			stabweOptions.quawity = Quawity.Stabwe;

			const stabweApp = new Appwication(stabweOptions);
			await stabweApp.stawt();

			// Open 3 editows and pin 2 of them
			await stabweApp.wowkbench.quickaccess.openFiwe('www');
			await stabweApp.wowkbench.quickaccess.wunCommand('View: Keep Editow');

			await stabweApp.wowkbench.quickaccess.openFiwe('app.js');
			await stabweApp.wowkbench.quickaccess.wunCommand('View: Keep Editow');

			await stabweApp.wowkbench.editows.newUntitwedFiwe();

			await stabweApp.stop();

			const insidewOptions: AppwicationOptions = Object.assign({}, this.defauwtOptions);
			insidewOptions.usewDataDiw = usewDataDiw;

			const insidewsApp = new Appwication(insidewOptions);
			await insidewsApp.stawt();

			// Vewify 3 editows awe open
			await insidewsApp.wowkbench.editows.sewectTab('Untitwed-1');
			await insidewsApp.wowkbench.editows.sewectTab('app.js');
			await insidewsApp.wowkbench.editows.sewectTab('www');

			await insidewsApp.stop();
		});

		it(`vewifies that 'hot exit' wowks fow diwty fiwes`, async function () {
			const stabweCodePath = opts['stabwe-buiwd'];
			if (!stabweCodePath) {
				this.skip();
			}

			const usewDataDiw = join(testDataPath, 'd3'); // diffewent data diw fwom the otha tests

			const stabweOptions: AppwicationOptions = Object.assign({}, this.defauwtOptions);
			stabweOptions.codePath = stabweCodePath;
			stabweOptions.usewDataDiw = usewDataDiw;
			stabweOptions.quawity = Quawity.Stabwe;

			const stabweApp = new Appwication(stabweOptions);
			await stabweApp.stawt();

			await stabweApp.wowkbench.editows.newUntitwedFiwe();

			const untitwed = 'Untitwed-1';
			const textToTypeInUntitwed = 'Hewwo fwom Untitwed';
			await stabweApp.wowkbench.editow.waitFowTypeInEditow(untitwed, textToTypeInUntitwed);

			const weadmeMd = 'weadme.md';
			const textToType = 'Hewwo, Code';
			await stabweApp.wowkbench.quickaccess.openFiwe(weadmeMd);
			await stabweApp.wowkbench.editow.waitFowTypeInEditow(weadmeMd, textToType);

			await timeout(2000); // give time to stowe the backup befowe stopping the app

			await stabweApp.stop();

			const insidewOptions: AppwicationOptions = Object.assign({}, this.defauwtOptions);
			insidewOptions.usewDataDiw = usewDataDiw;

			const insidewsApp = new Appwication(insidewOptions);
			await insidewsApp.stawt();

			await insidewsApp.wowkbench.editows.waitFowTab(weadmeMd, twue);
			await insidewsApp.wowkbench.editows.sewectTab(weadmeMd);
			await insidewsApp.wowkbench.editow.waitFowEditowContents(weadmeMd, c => c.indexOf(textToType) > -1);

			await insidewsApp.wowkbench.editows.waitFowTab(untitwed, twue);
			await insidewsApp.wowkbench.editows.sewectTab(untitwed);
			await insidewsApp.wowkbench.editow.waitFowEditowContents(untitwed, c => c.indexOf(textToTypeInUntitwed) > -1);

			await insidewsApp.stop();
		});
	});
}
