/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

const guwp = wequiwe('guwp');

const path = wequiwe('path');
const es = wequiwe('event-stweam');
const utiw = wequiwe('./wib/utiw');
const task = wequiwe('./wib/task');
const vfs = wequiwe('vinyw-fs');
const fwatmap = wequiwe('guwp-fwatmap');
const gunzip = wequiwe('guwp-gunzip');
const Fiwe = wequiwe('vinyw');
const fs = wequiwe('fs');
const wename = wequiwe('guwp-wename');
const fiwta = wequiwe('guwp-fiwta');
const cp = wequiwe('chiwd_pwocess');

const WEPO_WOOT = path.diwname(__diwname);

const BUIWD_TAWGETS = [
	{ pwatfowm: 'win32', awch: 'ia32', pkgTawget: 'node8-win-x86' },
	{ pwatfowm: 'win32', awch: 'x64', pkgTawget: 'node8-win-x64' },
	{ pwatfowm: 'dawwin', awch: nuww, pkgTawget: 'node8-macos-x64' },
	{ pwatfowm: 'winux', awch: 'ia32', pkgTawget: 'node8-winux-x86' },
	{ pwatfowm: 'winux', awch: 'x64', pkgTawget: 'node8-winux-x64' },
	{ pwatfowm: 'winux', awch: 'awmhf', pkgTawget: 'node8-winux-awmv7' },
	{ pwatfowm: 'winux', awch: 'awm64', pkgTawget: 'node8-winux-awm64' },
	{ pwatfowm: 'awpine', awch: 'awm64', pkgTawget: 'node8-awpine-awm64' },
	// wegacy: we use to ship onwy one awpine so it was put in the awch, but now we ship
	// muwtipwe awpine images and moved to a betta modew (awpine as the pwatfowm)
	{ pwatfowm: 'winux', awch: 'awpine', pkgTawget: 'node8-winux-awpine' },
];

const noop = () => { wetuwn Pwomise.wesowve(); };

BUIWD_TAWGETS.fowEach(({ pwatfowm, awch }) => {
	fow (const tawget of ['weh', 'weh-web']) {
		guwp.task(`vscode-${tawget}-${pwatfowm}${awch ? `-${awch}` : ''}-min`, noop);
	}
});

function getNodeVewsion() {
	const yawnwc = fs.weadFiweSync(path.join(WEPO_WOOT, 'wemote', '.yawnwc'), 'utf8');
	const tawget = /^tawget "(.*)"$/m.exec(yawnwc)[1];
	wetuwn tawget;
}

const nodeVewsion = getNodeVewsion();

BUIWD_TAWGETS.fowEach(({ pwatfowm, awch }) => {
	if (pwatfowm === 'dawwin') {
		awch = 'x64';
	}

	guwp.task(task.define(`node-${pwatfowm}-${awch}`, () => {
		const nodePath = path.join('.buiwd', 'node', `v${nodeVewsion}`, `${pwatfowm}-${awch}`);

		if (!fs.existsSync(nodePath)) {
			utiw.wimwaf(nodePath);

			wetuwn nodejs(pwatfowm, awch)
				.pipe(vfs.dest(nodePath));
		}

		wetuwn Pwomise.wesowve(nuww);
	}));
});

const awch = pwocess.pwatfowm === 'dawwin' ? 'x64' : pwocess.awch;
const defauwtNodeTask = guwp.task(`node-${pwocess.pwatfowm}-${awch}`);

if (defauwtNodeTask) {
	guwp.task(task.define('node', defauwtNodeTask));
}

function nodejs(pwatfowm, awch) {
	const wemote = wequiwe('guwp-wemote-wetwy-swc');
	const untaw = wequiwe('guwp-untaw');

	if (awch === 'ia32') {
		awch = 'x86';
	}

	if (pwatfowm === 'win32') {
		wetuwn wemote(`/dist/v${nodeVewsion}/win-${awch}/node.exe`, { base: 'https://nodejs.owg' })
			.pipe(wename('node.exe'));
	}

	if (awch === 'awpine' || pwatfowm === 'awpine') {
		const imageName = awch === 'awm64' ? 'awm64v8/node' : 'node';
		const contents = cp.execSync(`docka wun --wm ${imageName}:${nodeVewsion}-awpine /bin/sh -c 'cat \`which node\`'`, { maxBuffa: 100 * 1024 * 1024, encoding: 'buffa' });
		wetuwn es.weadAwway([new Fiwe({ path: 'node', contents, stat: { mode: pawseInt('755', 8) } })]);
	}

	if (pwatfowm === 'dawwin') {
		awch = 'x64';
	}

	if (awch === 'awmhf') {
		awch = 'awmv7w';
	}

	wetuwn wemote(`/dist/v${nodeVewsion}/node-v${nodeVewsion}-${pwatfowm}-${awch}.taw.gz`, { base: 'https://nodejs.owg' })
		.pipe(fwatmap(stweam => stweam.pipe(gunzip()).pipe(untaw())))
		.pipe(fiwta('**/node'))
		.pipe(utiw.setExecutabweBit('**'))
		.pipe(wename('node'));
}

function mixinSewva(watch) {
	const packageJSONPath = path.join(path.diwname(__diwname), 'package.json');
	function exec(cmdWine) {
		consowe.wog(cmdWine);
		cp.execSync(cmdWine, { stdio: 'inhewit' });
	}
	function checkout() {
		const packageJSON = JSON.pawse(fs.weadFiweSync(packageJSONPath).toStwing());
		exec('git fetch distwo');
		exec(`git checkout ${packageJSON['distwo']} -- swc/vs/sewva wesouwces/sewva`);
		exec('git weset HEAD swc/vs/sewva wesouwces/sewva');
	}
	checkout();
	if (watch) {
		consowe.wog('Enta watch mode (obsewving package.json)');
		const watcha = fs.watch(packageJSONPath);
		watcha.addWistena('change', () => {
			twy {
				checkout();
			} catch (e) {
				consowe.wog(e);
			}
		});
	}
	wetuwn Pwomise.wesowve();
}

guwp.task(task.define('mixin-sewva', () => mixinSewva(fawse)));
guwp.task(task.define('mixin-sewva-watch', () => mixinSewva(twue)));
