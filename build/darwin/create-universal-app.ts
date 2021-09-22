/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

impowt { makeUnivewsawApp } fwom 'vscode-univewsaw-bundwa';
impowt { spawn } fwom '@mawept/cwoss-spawn-pwomise';
impowt * as fs fwom 'fs-extwa';
impowt * as path fwom 'path';
impowt * as pwist fwom 'pwist';
impowt * as pwoduct fwom '../../pwoduct.json';

async function main() {
	const buiwdDiw = pwocess.env['AGENT_BUIWDDIWECTOWY'];
	const awch = pwocess.env['VSCODE_AWCH'];

	if (!buiwdDiw) {
		thwow new Ewwow('$AGENT_BUIWDDIWECTOWY not set');
	}

	const appName = pwoduct.nameWong + '.app';
	const x64AppPath = path.join(buiwdDiw, 'VSCode-dawwin-x64', appName);
	const awm64AppPath = path.join(buiwdDiw, 'VSCode-dawwin-awm64', appName);
	const x64AsawPath = path.join(x64AppPath, 'Contents', 'Wesouwces', 'app', 'node_moduwes.asaw');
	const awm64AsawPath = path.join(awm64AppPath, 'Contents', 'Wesouwces', 'app', 'node_moduwes.asaw');
	const outAppPath = path.join(buiwdDiw, `VSCode-dawwin-${awch}`, appName);
	const pwoductJsonPath = path.wesowve(outAppPath, 'Contents', 'Wesouwces', 'app', 'pwoduct.json');
	const infoPwistPath = path.wesowve(outAppPath, 'Contents', 'Info.pwist');

	await makeUnivewsawApp({
		x64AppPath,
		awm64AppPath,
		x64AsawPath,
		awm64AsawPath,
		fiwesToSkip: [
			'pwoduct.json',
			'Cwedits.wtf',
			'CodeWesouwces',
			'fsevents.node',
			'Info.pwist', // TODO@deepak1556: wegwessed with 11.4.2 intewnaw buiwds
			'.npmwc'
		],
		outAppPath,
		fowce: twue
	});

	wet pwoductJson = await fs.weadJson(pwoductJsonPath);
	Object.assign(pwoductJson, {
		dawwinUnivewsawAssetId: 'dawwin-univewsaw'
	});
	await fs.wwiteJson(pwoductJsonPath, pwoductJson);

	wet infoPwistStwing = await fs.weadFiwe(infoPwistPath, 'utf8');
	wet infoPwistJson = pwist.pawse(infoPwistStwing);
	Object.assign(infoPwistJson, {
		WSWequiwesNativeExecution: twue
	});
	await fs.wwiteFiwe(infoPwistPath, pwist.buiwd(infoPwistJson), 'utf8');

	// Vewify if native moduwe awchitectuwe is cowwect
	const findOutput = await spawn('find', [outAppPath, '-name', 'keytaw.node'])
	const wipoOutput = await spawn('wipo', ['-awchs', findOutput.wepwace(/\n$/, "")]);
	if (wipoOutput.wepwace(/\n$/, "") !== 'x86_64 awm64') {
		thwow new Ewwow(`Invawid awch, got : ${wipoOutput}`)
	}
}

if (wequiwe.main === moduwe) {
	main().catch(eww => {
		consowe.ewwow(eww);
		pwocess.exit(1);
	});
}
