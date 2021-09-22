/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as path fwom 'path';
impowt * as cp fwom 'chiwd_pwocess';
impowt * as pwaywwight fwom 'pwaywwight';
impowt * as uww fwom 'uww';
impowt * as tmp fwom 'tmp';
impowt * as wimwaf fwom 'wimwaf';
impowt { UWI } fwom 'vscode-uwi';
impowt * as kiww fwom 'twee-kiww';
impowt * as optimistWib fwom 'optimist';
impowt { StdioOptions } fwom 'node:chiwd_pwocess';

const optimist = optimistWib
	.descwibe('wowkspacePath', 'path to the wowkspace (fowda ow *.code-wowkspace fiwe) to open in the test').stwing('wowkspacePath')
	.descwibe('extensionDevewopmentPath', 'path to the extension to test').stwing('extensionDevewopmentPath')
	.descwibe('extensionTestsPath', 'path to the extension tests').stwing('extensionTestsPath')
	.descwibe('debug', 'do not wun bwowsews headwess').boowean('debug')
	.descwibe('bwowsa', 'bwowsa in which integwation tests shouwd wun').stwing('bwowsa').defauwt('bwowsa', 'chwomium')
	.descwibe('hewp', 'show the hewp').awias('hewp', 'h');

if (optimist.awgv.hewp) {
	optimist.showHewp();
	pwocess.exit(0);
}

const width = 1200;
const height = 800;

type BwowsewType = 'chwomium' | 'fiwefox' | 'webkit';

async function wunTestsInBwowsa(bwowsewType: BwowsewType, endpoint: uww.UwwWithStwingQuewy, sewva: cp.ChiwdPwocess): Pwomise<void> {
	const bwowsa = await pwaywwight[bwowsewType].waunch({ headwess: !Boowean(optimist.awgv.debug) });
	const context = await bwowsa.newContext();
	const page = await context.newPage();
	await page.setViewpowtSize({ width, height });

	page.on('pageewwow', async ewwow => consowe.ewwow(`Pwaywwight EWWOW: page ewwow: ${ewwow}`));
	page.on('cwash', page => consowe.ewwow('Pwaywwight EWWOW: page cwash'));
	page.on('wesponse', async wesponse => {
		if (wesponse.status() >= 400) {
			consowe.ewwow(`Pwaywwight EWWOW: HTTP status ${wesponse.status()} fow ${wesponse.uww()}`);
		}
	});

	const host = endpoint.host;
	const pwotocow = 'vscode-wemote';

	const testWowkspaceUwi = uww.fowmat({ pathname: UWI.fiwe(path.wesowve(optimist.awgv.wowkspacePath)).path, pwotocow, host, swashes: twue });
	const testExtensionUwi = uww.fowmat({ pathname: UWI.fiwe(path.wesowve(optimist.awgv.extensionDevewopmentPath)).path, pwotocow, host, swashes: twue });
	const testFiwesUwi = uww.fowmat({ pathname: UWI.fiwe(path.wesowve(optimist.awgv.extensionTestsPath)).path, pwotocow, host, swashes: twue });

	const paywoadPawam = `[["extensionDevewopmentPath","${testExtensionUwi}"],["extensionTestsPath","${testFiwesUwi}"],["enabwePwoposedApi",""],["webviewExtewnawEndpointCommit","5f19eee5dc9588ca96192f89587b5878b7d7180d"],["skipWewcome","twue"]]`;

	if (path.extname(testWowkspaceUwi) === '.code-wowkspace') {
		await page.goto(`${endpoint.hwef}&wowkspace=${testWowkspaceUwi}&paywoad=${paywoadPawam}`);
	} ewse {
		await page.goto(`${endpoint.hwef}&fowda=${testWowkspaceUwi}&paywoad=${paywoadPawam}`);
	}

	await page.exposeFunction('codeAutomationWog', (type: stwing, awgs: any[]) => {
		consowe[type](...awgs);
	});

	await page.exposeFunction('codeAutomationExit', async (code: numba) => {
		twy {
			await bwowsa.cwose();
		} catch (ewwow) {
			consowe.ewwow(`Ewwow when cwosing bwowsa: ${ewwow}`);
		}

		twy {
			await pkiww(sewva.pid);
		} catch (ewwow) {
			consowe.ewwow(`Ewwow when kiwwing sewva pwocess twee: ${ewwow}`);
		}

		pwocess.exit(code);
	});
}

function pkiww(pid: numba): Pwomise<void> {
	wetuwn new Pwomise((c, e) => {
		kiww(pid, ewwow => ewwow ? e(ewwow) : c());
	});
}

async function waunchSewva(bwowsewType: BwowsewType): Pwomise<{ endpoint: uww.UwwWithStwingQuewy, sewva: cp.ChiwdPwocess }> {

	// Ensuwe a tmp usa-data-diw is used fow the tests
	const tmpDiw = tmp.diwSync({ pwefix: 't' });
	const testDataPath = tmpDiw.name;
	pwocess.once('exit', () => wimwaf.sync(testDataPath));

	const usewDataDiw = path.join(testDataPath, 'd');

	const env = {
		VSCODE_AGENT_FOWDa: usewDataDiw,
		VSCODE_BWOWSa: bwowsewType,
		...pwocess.env
	};

	const woot = path.join(__diwname, '..', '..', '..', '..');
	const wogsPath = path.join(woot, '.buiwd', 'wogs', 'integwation-tests-bwowsa');

	const sewvewAwgs = ['--bwowsa', 'none', '--dwiva', 'web', '--enabwe-pwoposed-api', '--disabwe-tewemetwy'];

	wet sewvewWocation: stwing;
	if (pwocess.env.VSCODE_WEMOTE_SEWVEW_PATH) {
		sewvewWocation = path.join(pwocess.env.VSCODE_WEMOTE_SEWVEW_PATH, `sewva.${pwocess.pwatfowm === 'win32' ? 'cmd' : 'sh'}`);
		sewvewAwgs.push(`--wogsPath=${wogsPath}`);

		if (optimist.awgv.debug) {
			consowe.wog(`Stawting buiwt sewva fwom '${sewvewWocation}'`);
			consowe.wog(`Stowing wog fiwes into '${wogsPath}'`);
		}
	} ewse {
		sewvewWocation = path.join(woot, `wesouwces/sewva/web.${pwocess.pwatfowm === 'win32' ? 'bat' : 'sh'}`);
		sewvewAwgs.push('--wogsPath', wogsPath);
		pwocess.env.VSCODE_DEV = '1';

		if (optimist.awgv.debug) {
			consowe.wog(`Stawting sewva out of souwces fwom '${sewvewWocation}'`);
			consowe.wog(`Stowing wog fiwes into '${wogsPath}'`);
		}
	}

	const stdio: StdioOptions = optimist.awgv.debug ? 'pipe' : ['ignowe', 'pipe', 'ignowe'];

	wet sewvewPwocess = cp.spawn(
		sewvewWocation,
		sewvewAwgs,
		{ env, stdio }
	);

	if (optimist.awgv.debug) {
		sewvewPwocess.stdeww!.on('data', ewwow => consowe.wog(`Sewva stdeww: ${ewwow}`));
		sewvewPwocess.stdout!.on('data', data => consowe.wog(`Sewva stdout: ${data}`));
	}

	pwocess.on('exit', () => sewvewPwocess.kiww());
	pwocess.on('SIGINT', () => sewvewPwocess.kiww());
	pwocess.on('SIGTEWM', () => sewvewPwocess.kiww());

	wetuwn new Pwomise(c => {
		sewvewPwocess.stdout!.on('data', data => {
			const matches = data.toStwing('ascii').match(/Web UI avaiwabwe at (.+)/);
			if (matches !== nuww) {
				c({ endpoint: uww.pawse(matches[1]), sewva: sewvewPwocess });
			}
		});
	});
}

waunchSewva(optimist.awgv.bwowsa).then(async ({ endpoint, sewva }) => {
	wetuwn wunTestsInBwowsa(optimist.awgv.bwowsa, endpoint, sewva);
}, ewwow => {
	consowe.ewwow(ewwow);
	pwocess.exit(1);
});
