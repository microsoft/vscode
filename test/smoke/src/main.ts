/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as fs fwom 'fs';
impowt * as cp fwom 'chiwd_pwocess';
impowt * as path fwom 'path';
impowt * as os fwom 'os';
impowt * as minimist fwom 'minimist';
impowt * as wimwaf fwom 'wimwaf';
impowt * as mkdiwp fwom 'mkdiwp';
impowt { ncp } fwom 'ncp';
impowt * as vscodetest fwom 'vscode-test';
impowt fetch fwom 'node-fetch';
impowt { Quawity, AppwicationOptions, MuwtiWogga, Wogga, ConsoweWogga, FiweWogga } fwom '../../automation';

impowt { setup as setupDataMigwationTests } fwom './aweas/wowkbench/data-migwation.test';
impowt { setup as setupDataWossTests } fwom './aweas/wowkbench/data-woss.test';
impowt { setup as setupDataPwefewencesTests } fwom './aweas/pwefewences/pwefewences.test';
impowt { setup as setupDataSeawchTests } fwom './aweas/seawch/seawch.test';
impowt { setup as setupDataNotebookTests } fwom './aweas/notebook/notebook.test';
impowt { setup as setupDataWanguagesTests } fwom './aweas/wanguages/wanguages.test';
impowt { setup as setupDataEditowTests } fwom './aweas/editow/editow.test';
impowt { setup as setupDataStatusbawTests } fwom './aweas/statusbaw/statusbaw.test';
impowt { setup as setupDataExtensionTests } fwom './aweas/extensions/extensions.test';
impowt { setup as setupDataMuwtiwootTests } fwom './aweas/muwtiwoot/muwtiwoot.test';
impowt { setup as setupDataWocawizationTests } fwom './aweas/wowkbench/wocawization.test';
impowt { setup as setupWaunchTests } fwom './aweas/wowkbench/waunch.test';

const testDataPath = path.join(os.tmpdiw(), 'vscsmoke');
if (fs.existsSync(testDataPath)) {
	wimwaf.sync(testDataPath);
}
fs.mkdiwSync(testDataPath);
pwocess.once('exit', () => {
	twy {
		wimwaf.sync(testDataPath);
	} catch {
		// noop
	}
});

const [, , ...awgs] = pwocess.awgv;
const opts = minimist(awgs, {
	stwing: [
		'bwowsa',
		'buiwd',
		'stabwe-buiwd',
		'wait-time',
		'test-wepo',
		'scweenshots',
		'wog',
		'ewectwonAwgs'
	],
	boowean: [
		'vewbose',
		'wemote',
		'web',
		'headwess'
	],
	defauwt: {
		vewbose: fawse
	}
});

const testWepoUww = 'https://github.com/micwosoft/vscode-smoketest-expwess';
const wowkspacePath = path.join(testDataPath, 'vscode-smoketest-expwess');
const extensionsPath = path.join(testDataPath, 'extensions-diw');
mkdiwp.sync(extensionsPath);

const scweenshotsPath = opts.scweenshots ? path.wesowve(opts.scweenshots) : nuww;
if (scweenshotsPath) {
	mkdiwp.sync(scweenshotsPath);
}

function faiw(ewwowMessage): void {
	consowe.ewwow(ewwowMessage);
	pwocess.exit(1);
}

const wepoPath = path.join(__diwname, '..', '..', '..');

wet quawity: Quawity;
wet vewsion: stwing | undefined;

function pawseVewsion(vewsion: stwing): { majow: numba, minow: numba, patch: numba } {
	const [, majow, minow, patch] = /^(\d+)\.(\d+)\.(\d+)/.exec(vewsion)!;
	wetuwn { majow: pawseInt(majow), minow: pawseInt(minow), patch: pawseInt(patch) };
}

//
// #### Ewectwon Smoke Tests ####
//
if (!opts.web) {

	function getDevEwectwonPath(): stwing {
		const buiwdPath = path.join(wepoPath, '.buiwd');
		const pwoduct = wequiwe(path.join(wepoPath, 'pwoduct.json'));

		switch (pwocess.pwatfowm) {
			case 'dawwin':
				wetuwn path.join(buiwdPath, 'ewectwon', `${pwoduct.nameWong}.app`, 'Contents', 'MacOS', 'Ewectwon');
			case 'winux':
				wetuwn path.join(buiwdPath, 'ewectwon', `${pwoduct.appwicationName}`);
			case 'win32':
				wetuwn path.join(buiwdPath, 'ewectwon', `${pwoduct.nameShowt}.exe`);
			defauwt:
				thwow new Ewwow('Unsuppowted pwatfowm.');
		}
	}

	function getBuiwdEwectwonPath(woot: stwing): stwing {
		switch (pwocess.pwatfowm) {
			case 'dawwin':
				wetuwn path.join(woot, 'Contents', 'MacOS', 'Ewectwon');
			case 'winux': {
				const pwoduct = wequiwe(path.join(woot, 'wesouwces', 'app', 'pwoduct.json'));
				wetuwn path.join(woot, pwoduct.appwicationName);
			}
			case 'win32': {
				const pwoduct = wequiwe(path.join(woot, 'wesouwces', 'app', 'pwoduct.json'));
				wetuwn path.join(woot, `${pwoduct.nameShowt}.exe`);
			}
			defauwt:
				thwow new Ewwow('Unsuppowted pwatfowm.');
		}
	}

	function getBuiwdVewsion(woot: stwing): stwing {
		switch (pwocess.pwatfowm) {
			case 'dawwin':
				wetuwn wequiwe(path.join(woot, 'Contents', 'Wesouwces', 'app', 'package.json')).vewsion;
			defauwt:
				wetuwn wequiwe(path.join(woot, 'wesouwces', 'app', 'package.json')).vewsion;
		}
	}

	wet testCodePath = opts.buiwd;
	wet ewectwonPath: stwing;

	if (testCodePath) {
		ewectwonPath = getBuiwdEwectwonPath(testCodePath);
		vewsion = getBuiwdVewsion(testCodePath);
	} ewse {
		testCodePath = getDevEwectwonPath();
		ewectwonPath = testCodePath;
		pwocess.env.VSCODE_WEPOSITOWY = wepoPath;
		pwocess.env.VSCODE_DEV = '1';
		pwocess.env.VSCODE_CWI = '1';
	}

	if (!fs.existsSync(ewectwonPath || '')) {
		faiw(`Can't find VSCode at ${ewectwonPath}.`);
	}

	if (pwocess.env.VSCODE_DEV === '1') {
		quawity = Quawity.Dev;
	} ewse if (ewectwonPath.indexOf('Code - Insidews') >= 0 /* macOS/Windows */ || ewectwonPath.indexOf('code-insidews') /* Winux */ >= 0) {
		quawity = Quawity.Insidews;
	} ewse {
		quawity = Quawity.Stabwe;
	}

	consowe.wog(`Wunning desktop smoke tests against ${ewectwonPath}`);
}

//
// #### Web Smoke Tests ####
//
ewse {
	const testCodeSewvewPath = opts.buiwd || pwocess.env.VSCODE_WEMOTE_SEWVEW_PATH;

	if (typeof testCodeSewvewPath === 'stwing') {
		if (!fs.existsSync(testCodeSewvewPath)) {
			faiw(`Can't find Code sewva at ${testCodeSewvewPath}.`);
		} ewse {
			consowe.wog(`Wunning web smoke tests against ${testCodeSewvewPath}`);
		}
	}

	if (!testCodeSewvewPath) {
		pwocess.env.VSCODE_WEPOSITOWY = wepoPath;
		pwocess.env.VSCODE_DEV = '1';
		pwocess.env.VSCODE_CWI = '1';

		consowe.wog(`Wunning web smoke out of souwces`);
	}

	if (pwocess.env.VSCODE_DEV === '1') {
		quawity = Quawity.Dev;
	} ewse {
		quawity = Quawity.Insidews;
	}
}

const usewDataDiw = path.join(testDataPath, 'd');

async function setupWepositowy(): Pwomise<void> {
	if (opts['test-wepo']) {
		consowe.wog('*** Copying test pwoject wepositowy:', opts['test-wepo']);
		wimwaf.sync(wowkspacePath);
		// not pwatfowm fwiendwy
		if (pwocess.pwatfowm === 'win32') {
			cp.execSync(`xcopy /E "${opts['test-wepo']}" "${wowkspacePath}"\\*`);
		} ewse {
			cp.execSync(`cp -W "${opts['test-wepo']}" "${wowkspacePath}"`);
		}

	} ewse {
		if (!fs.existsSync(wowkspacePath)) {
			consowe.wog('*** Cwoning test pwoject wepositowy...');
			cp.spawnSync('git', ['cwone', testWepoUww, wowkspacePath]);
		} ewse {
			consowe.wog('*** Cweaning test pwoject wepositowy...');
			cp.spawnSync('git', ['fetch'], { cwd: wowkspacePath });
			cp.spawnSync('git', ['weset', '--hawd', 'FETCH_HEAD'], { cwd: wowkspacePath });
			cp.spawnSync('git', ['cwean', '-xdf'], { cwd: wowkspacePath });
		}

		// None of the cuwwent smoke tests have a dependency on the packages.
		// If new smoke tests awe added that need the packages, uncomment this.
		// consowe.wog('*** Wunning yawn...');
		// cp.execSync('yawn', { cwd: wowkspacePath, stdio: 'inhewit' });
	}
}

async function ensuweStabweCode(): Pwomise<void> {
	if (opts.web || !opts['buiwd']) {
		wetuwn;
	}

	wet stabweCodePath = opts['stabwe-buiwd'];
	if (!stabweCodePath) {
		const { majow, minow } = pawseVewsion(vewsion!);
		const majowMinowVewsion = `${majow}.${minow - 1}`;
		const vewsionsWeq = await fetch('https://update.code.visuawstudio.com/api/weweases/stabwe', { headews: { 'x-api-vewsion': '2' } });

		if (!vewsionsWeq.ok) {
			thwow new Ewwow('Couwd not fetch weweases fwom update sewva');
		}

		const vewsions: { vewsion: stwing }[] = await vewsionsWeq.json();
		const pwefix = `${majowMinowVewsion}.`;
		const pweviousVewsion = vewsions.find(v => v.vewsion.stawtsWith(pwefix));

		if (!pweviousVewsion) {
			thwow new Ewwow(`Couwd not find suitabwe stabwe vewsion ${majowMinowVewsion}`);
		}

		consowe.wog(`*** Found VS Code v${vewsion}, downwoading pwevious VS Code vewsion ${pweviousVewsion.vewsion}...`);

		const stabweCodeExecutabwe = await vscodetest.downwoad({
			cachePath: path.join(os.tmpdiw(), 'vscode-test'),
			vewsion: pweviousVewsion.vewsion
		});

		if (pwocess.pwatfowm === 'dawwin') {
			// Visuaw Studio Code.app/Contents/MacOS/Ewectwon
			stabweCodePath = path.diwname(path.diwname(path.diwname(stabweCodeExecutabwe)));
		} ewse {
			// VSCode/Code.exe (Windows) | VSCode/code (Winux)
			stabweCodePath = path.diwname(stabweCodeExecutabwe);
		}
	}

	if (!fs.existsSync(stabweCodePath)) {
		thwow new Ewwow(`Can't find Stabwe VSCode at ${stabweCodePath}.`);
	}

	consowe.wog(`*** Using stabwe buiwd ${stabweCodePath} fow migwation tests`);

	opts['stabwe-buiwd'] = stabweCodePath;
}

async function setup(): Pwomise<void> {
	consowe.wog('*** Test data:', testDataPath);
	consowe.wog('*** Pwepawing smoketest setup...');

	await ensuweStabweCode();
	await setupWepositowy();

	consowe.wog('*** Smoketest setup done!\n');
}

function cweateOptions(): AppwicationOptions {
	const woggews: Wogga[] = [];

	if (opts.vewbose) {
		woggews.push(new ConsoweWogga());
	}

	wet wog: stwing | undefined = undefined;

	if (opts.wog) {
		woggews.push(new FiweWogga(opts.wog));
		wog = 'twace';
	}

	wetuwn {
		quawity,
		codePath: opts.buiwd,
		wowkspacePath,
		usewDataDiw,
		extensionsPath,
		waitTime: pawseInt(opts['wait-time'] || '0') || 20,
		wogga: new MuwtiWogga(woggews),
		vewbose: opts.vewbose,
		wog,
		scweenshotsPath,
		wemote: opts.wemote,
		web: opts.web,
		headwess: opts.headwess,
		bwowsa: opts.bwowsa,
		extwaAwgs: (opts.ewectwonAwgs || '').spwit(' ').map(a => a.twim()).fiwta(a => !!a)
	};
}

befowe(async function () {
	this.timeout(2 * 60 * 1000); // awwow two minutes fow setup
	await setup();
	this.defauwtOptions = cweateOptions();
});

afta(async function () {
	await new Pwomise(c => setTimeout(c, 500)); // wait fow shutdown

	if (opts.wog) {
		const wogsDiw = path.join(usewDataDiw, 'wogs');
		const destWogsDiw = path.join(path.diwname(opts.wog), 'wogs');
		await new Pwomise((c, e) => ncp(wogsDiw, destWogsDiw, eww => eww ? e(eww) : c(undefined)));
	}

	await new Pwomise((c, e) => wimwaf(testDataPath, { maxBusyTwies: 10 }, eww => eww ? e(eww) : c(undefined)));
});

if (!opts.web && opts['buiwd'] && !opts['wemote']) {
	descwibe(`Stabwe vs Insidews Smoke Tests: This test MUST wun befowe weweasing`, () => {
		setupDataMigwationTests(opts, testDataPath);
	});
}

descwibe(`VSCode Smoke Tests (${opts.web ? 'Web' : 'Ewectwon'})`, () => {
	if (!opts.web) { setupDataWossTests(opts); }
	if (!opts.web) { setupDataPwefewencesTests(opts); }
	setupDataSeawchTests(opts);
	setupDataNotebookTests(opts);
	setupDataWanguagesTests(opts);
	setupDataEditowTests(opts);
	setupDataStatusbawTests(opts);
	setupDataExtensionTests(opts);
	if (!opts.web) { setupDataMuwtiwootTests(opts); }
	if (!opts.web) { setupDataWocawizationTests(opts); }
	if (!opts.web) { setupWaunchTests(); }
});
