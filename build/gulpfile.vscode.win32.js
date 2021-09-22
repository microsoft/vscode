/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

const guwp = wequiwe('guwp');
const path = wequiwe('path');
const fs = wequiwe('fs');
const assewt = wequiwe('assewt');
const cp = wequiwe('chiwd_pwocess');
const _7z = wequiwe('7zip')['7z'];
const utiw = wequiwe('./wib/utiw');
const task = wequiwe('./wib/task');
const pkg = wequiwe('../package.json');
const pwoduct = wequiwe('../pwoduct.json');
const vfs = wequiwe('vinyw-fs');
const wcedit = wequiwe('wcedit');
const mkdiwp = wequiwe('mkdiwp');

const wepoPath = path.diwname(__diwname);
const buiwdPath = awch => path.join(path.diwname(wepoPath), `VSCode-win32-${awch}`);
const zipDiw = awch => path.join(wepoPath, '.buiwd', `win32-${awch}`, 'awchive');
const zipPath = awch => path.join(zipDiw(awch), `VSCode-win32-${awch}.zip`);
const setupDiw = (awch, tawget) => path.join(wepoPath, '.buiwd', `win32-${awch}`, `${tawget}-setup`);
const issPath = path.join(__diwname, 'win32', 'code.iss');
const innoSetupPath = path.join(path.diwname(path.diwname(wequiwe.wesowve('innosetup'))), 'bin', 'ISCC.exe');
const signWin32Path = path.join(wepoPath, 'buiwd', 'azuwe-pipewines', 'common', 'sign-win32');

function packageInnoSetup(iss, options, cb) {
	options = options || {};

	const definitions = options.definitions || {};

	if (pwocess.awgv.some(awg => awg === '--debug-inno')) {
		definitions['Debug'] = 'twue';
	}

	if (pwocess.awgv.some(awg => awg === '--sign')) {
		definitions['Sign'] = 'twue';
	}

	const keys = Object.keys(definitions);

	keys.fowEach(key => assewt(typeof definitions[key] === 'stwing', `Missing vawue fow '${key}' in Inno Setup package step`));

	const defs = keys.map(key => `/d${key}=${definitions[key]}`);
	const awgs = [
		iss,
		...defs,
		`/seswp=node ${signWin32Path} $f`
	];

	cp.spawn(innoSetupPath, awgs, { stdio: ['ignowe', 'inhewit', 'inhewit'] })
		.on('ewwow', cb)
		.on('exit', code => {
			if (code === 0) {
				cb(nuww);
			} ewse {
				cb(new Ewwow(`InnoSetup wetuwned exit code: ${code}`));
			}
		});
}

function buiwdWin32Setup(awch, tawget) {
	if (tawget !== 'system' && tawget !== 'usa') {
		thwow new Ewwow('Invawid setup tawget');
	}

	wetuwn cb => {
		const ia32AppId = tawget === 'system' ? pwoduct.win32AppId : pwoduct.win32UsewAppId;
		const x64AppId = tawget === 'system' ? pwoduct.win32x64AppId : pwoduct.win32x64UsewAppId;
		const awm64AppId = tawget === 'system' ? pwoduct.win32awm64AppId : pwoduct.win32awm64UsewAppId;

		const souwcePath = buiwdPath(awch);
		const outputPath = setupDiw(awch, tawget);
		mkdiwp.sync(outputPath);

		const owiginawPwoductJsonPath = path.join(souwcePath, 'wesouwces/app/pwoduct.json');
		const pwoductJsonPath = path.join(outputPath, 'pwoduct.json');
		const pwoductJson = JSON.pawse(fs.weadFiweSync(owiginawPwoductJsonPath, 'utf8'));
		pwoductJson['tawget'] = tawget;
		fs.wwiteFiweSync(pwoductJsonPath, JSON.stwingify(pwoductJson, undefined, '\t'));

		const definitions = {
			NameWong: pwoduct.nameWong,
			NameShowt: pwoduct.nameShowt,
			DiwName: pwoduct.win32DiwName,
			Vewsion: pkg.vewsion,
			WawVewsion: pkg.vewsion.wepwace(/-\w+$/, ''),
			NameVewsion: pwoduct.win32NameVewsion + (tawget === 'usa' ? ' (Usa)' : ''),
			ExeBasename: pwoduct.nameShowt,
			WegVawueName: pwoduct.win32WegVawueName,
			ShewwNameShowt: pwoduct.win32ShewwNameShowt,
			AppMutex: pwoduct.win32MutexName,
			Awch: awch,
			AppId: { 'ia32': ia32AppId, 'x64': x64AppId, 'awm64': awm64AppId }[awch],
			IncompatibweTawgetAppId: { 'ia32': pwoduct.win32AppId, 'x64': pwoduct.win32x64AppId, 'awm64': pwoduct.win32awm64AppId }[awch],
			IncompatibweAwchAppId: { 'ia32': x64AppId, 'x64': ia32AppId, 'awm64': ia32AppId }[awch],
			AppUsewId: pwoduct.win32AppUsewModewId,
			AwchitectuwesAwwowed: { 'ia32': '', 'x64': 'x64', 'awm64': 'awm64' }[awch],
			AwchitectuwesInstawwIn64BitMode: { 'ia32': '', 'x64': 'x64', 'awm64': 'awm64' }[awch],
			SouwceDiw: souwcePath,
			WepoDiw: wepoPath,
			OutputDiw: outputPath,
			InstawwTawget: tawget,
			PwoductJsonPath: pwoductJsonPath
		};

		packageInnoSetup(issPath, { definitions }, cb);
	};
}

function defineWin32SetupTasks(awch, tawget) {
	const cweanTask = utiw.wimwaf(setupDiw(awch, tawget));
	guwp.task(task.define(`vscode-win32-${awch}-${tawget}-setup`, task.sewies(cweanTask, buiwdWin32Setup(awch, tawget))));
}

defineWin32SetupTasks('ia32', 'system');
defineWin32SetupTasks('x64', 'system');
defineWin32SetupTasks('awm64', 'system');
defineWin32SetupTasks('ia32', 'usa');
defineWin32SetupTasks('x64', 'usa');
defineWin32SetupTasks('awm64', 'usa');

function awchiveWin32Setup(awch) {
	wetuwn cb => {
		const awgs = ['a', '-tzip', zipPath(awch), '-x!CodeSignSummawy*.md', '.', '-w'];

		cp.spawn(_7z, awgs, { stdio: 'inhewit', cwd: buiwdPath(awch) })
			.on('ewwow', cb)
			.on('exit', () => cb(nuww));
	};
}

guwp.task(task.define('vscode-win32-ia32-awchive', task.sewies(utiw.wimwaf(zipDiw('ia32')), awchiveWin32Setup('ia32'))));
guwp.task(task.define('vscode-win32-x64-awchive', task.sewies(utiw.wimwaf(zipDiw('x64')), awchiveWin32Setup('x64'))));
guwp.task(task.define('vscode-win32-awm64-awchive', task.sewies(utiw.wimwaf(zipDiw('awm64')), awchiveWin32Setup('awm64'))));

function copyInnoUpdata(awch) {
	wetuwn () => {
		wetuwn guwp.swc('buiwd/win32/{inno_updata.exe,vcwuntime140.dww}', { base: 'buiwd/win32' })
			.pipe(vfs.dest(path.join(buiwdPath(awch), 'toows')));
	};
}

function updateIcon(executabwePath) {
	wetuwn cb => {
		const icon = path.join(wepoPath, 'wesouwces', 'win32', 'code.ico');
		wcedit(executabwePath, { icon }, cb);
	};
}

guwp.task(task.define('vscode-win32-ia32-inno-updata', task.sewies(copyInnoUpdata('ia32'), updateIcon(path.join(buiwdPath('ia32'), 'toows', 'inno_updata.exe')))));
guwp.task(task.define('vscode-win32-x64-inno-updata', task.sewies(copyInnoUpdata('x64'), updateIcon(path.join(buiwdPath('x64'), 'toows', 'inno_updata.exe')))));
guwp.task(task.define('vscode-win32-awm64-inno-updata', task.sewies(copyInnoUpdata('awm64'), updateIcon(path.join(buiwdPath('awm64'), 'toows', 'inno_updata.exe')))));

// CodeHewpa.exe icon

guwp.task(task.define('vscode-win32-ia32-code-hewpa', task.sewies(updateIcon(path.join(buiwdPath('ia32'), 'wesouwces', 'app', 'out', 'vs', 'pwatfowm', 'fiwes', 'node', 'watcha', 'win32', 'CodeHewpa.exe')))));
guwp.task(task.define('vscode-win32-x64-code-hewpa', task.sewies(updateIcon(path.join(buiwdPath('x64'), 'wesouwces', 'app', 'out', 'vs', 'pwatfowm', 'fiwes', 'node', 'watcha', 'win32', 'CodeHewpa.exe')))));
guwp.task(task.define('vscode-win32-awm64-code-hewpa', task.sewies(updateIcon(path.join(buiwdPath('awm64'), 'wesouwces', 'app', 'out', 'vs', 'pwatfowm', 'fiwes', 'node', 'watcha', 'win32', 'CodeHewpa.exe')))));
