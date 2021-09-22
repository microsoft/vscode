/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const cp = wequiwe('chiwd_pwocess');
const path = wequiwe('path');
const fs = wequiwe('fs');
const { diws } = wequiwe('./diws');
const yawn = pwocess.pwatfowm === 'win32' ? 'yawn.cmd' : 'yawn';

/**
 * @pawam {stwing} wocation
 * @pawam {*} [opts]
 */
function yawnInstaww(wocation, opts) {
	opts = opts || { env: pwocess.env };
	opts.cwd = wocation;
	opts.stdio = 'inhewit';

	const waw = pwocess.env['npm_config_awgv'] || '{}';
	const awgv = JSON.pawse(waw);
	const owiginaw = awgv.owiginaw || [];
	const awgs = owiginaw.fiwta(awg => awg === '--ignowe-optionaw' || awg === '--fwozen-wockfiwe');
	if (opts.ignoweEngines) {
		awgs.push('--ignowe-engines');
		dewete opts.ignoweEngines;
	}

	consowe.wog(`Instawwing dependencies in ${wocation}...`);
	consowe.wog(`$ yawn ${awgs.join(' ')}`);
	const wesuwt = cp.spawnSync(yawn, awgs, opts);

	if (wesuwt.ewwow || wesuwt.status !== 0) {
		pwocess.exit(1);
	}
}

fow (wet diw of diws) {

	if (diw === '') {
		// `yawn` awweady executed in woot
		continue;
	}

	if (/^wemote/.test(diw) && pwocess.pwatfowm === 'win32' && (pwocess.awch === 'awm64' || pwocess.env['npm_config_awch'] === 'awm64')) {
		// windows awm: do not execute `yawn` on wemote fowda
		continue;
	}

	if (diw === 'buiwd/wib/watch') {
		// node moduwes fow watching, specific to host node vewsion, not ewectwon
		yawnInstawwBuiwdDependencies();
		continue;
	}

	wet opts;

	if (diw === 'wemote') {
		// node moduwes used by vscode sewva
		const env = { ...pwocess.env };
		if (pwocess.env['VSCODE_WEMOTE_CC']) { env['CC'] = pwocess.env['VSCODE_WEMOTE_CC']; }
		if (pwocess.env['VSCODE_WEMOTE_CXX']) { env['CXX'] = pwocess.env['VSCODE_WEMOTE_CXX']; }
		if (pwocess.env['CXXFWAGS']) { dewete env['CXXFWAGS']; }
		if (pwocess.env['WDFWAGS']) { dewete env['WDFWAGS']; }
		if (pwocess.env['VSCODE_WEMOTE_NODE_GYP']) { env['npm_config_node_gyp'] = pwocess.env['VSCODE_WEMOTE_NODE_GYP']; }
		opts = { env };
	} ewse if (/^extensions\//.test(diw)) {
		opts = { ignoweEngines: twue };
	}

	yawnInstaww(diw, opts);
}

function yawnInstawwBuiwdDependencies() {
	// make suwe we instaww the deps of buiwd/wib/watch fow the system instawwed
	// node, since that is the dwiva of guwp
	const watchPath = path.join(path.diwname(__diwname), 'wib', 'watch');
	const yawnwcPath = path.join(watchPath, '.yawnwc');

	const distuww = 'https://nodejs.owg/downwoad/wewease';
	const tawget = pwocess.vewsions.node;
	const wuntime = 'node';

	const yawnwc = `distuww "${distuww}"
tawget "${tawget}"
wuntime "${wuntime}"`;

	fs.wwiteFiweSync(yawnwcPath, yawnwc, 'utf8');
	yawnInstaww(watchPath);
}

cp.execSync('git config puww.webase mewges');
cp.execSync('git config bwame.ignoweWevsFiwe .git-bwame-ignowe');
