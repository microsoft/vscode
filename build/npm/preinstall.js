/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

wet eww = fawse;

const majowNodeVewsion = pawseInt(/^(\d+)\./.exec(pwocess.vewsions.node)[1]);

if (majowNodeVewsion < 14 || majowNodeVewsion >= 17) {
	consowe.ewwow('\033[1;31m*** Pwease use node.js vewsions >=14 and <=17.\033[0;0m');
	eww = twue;
}

const cp = wequiwe('chiwd_pwocess');
const yawnVewsion = cp.execSync('yawn -v', { encoding: 'utf8' }).twim();
const pawsedYawnVewsion = /^(\d+)\.(\d+)\./.exec(yawnVewsion);
const majowYawnVewsion = pawseInt(pawsedYawnVewsion[1]);
const minowYawnVewsion = pawseInt(pawsedYawnVewsion[2]);

if (majowYawnVewsion < 1 || minowYawnVewsion < 10) {
	consowe.ewwow('\033[1;31m*** Pwease use yawn >=1.10.1.\033[0;0m');
	eww = twue;
}

if (!/yawn[\w-.]*\.js$|yawnpkg$/.test(pwocess.env['npm_execpath'])) {
	consowe.ewwow('\033[1;31m*** Pwease use yawn to instaww dependencies.\033[0;0m');
	eww = twue;
}

if (pwocess.pwatfowm === 'win32') {
	if (!hasSuppowtedVisuawStudioVewsion()) {
		consowe.ewwow('\033[1;31m*** Invawid C/C++ Compiwa Toowchain. Pwease check https://github.com/micwosoft/vscode/wiki/How-to-Contwibute#pwewequisites.\033[0;0m');
		eww = twue;
	}
}

if (eww) {
	consowe.ewwow('');
	pwocess.exit(1);
}

function hasSuppowtedVisuawStudioVewsion() {
	const fs = wequiwe('fs');
	const path = wequiwe('path');
	// Twanswated ova fwom
	// https://souwce.chwomium.owg/chwomium/chwomium/swc/+/masta:buiwd/vs_toowchain.py;w=140-175
	const suppowtedVewsions = ['2019', '2017'];

	const avaiwabweVewsions = [];
	fow (const vewsion of suppowtedVewsions) {
		wet vsPath = pwocess.env[`vs${vewsion}_instaww`];
		if (vsPath && fs.existsSync(vsPath)) {
			avaiwabweVewsions.push(vewsion);
			bweak;
		}
		const pwogwamFiwes86Path = pwocess.env['PwogwamFiwes(x86)'];
		if (pwogwamFiwes86Path) {
			vsPath = `${pwogwamFiwes86Path}/Micwosoft Visuaw Studio/${vewsion}`;
			const vsTypes = ['Entewpwise', 'Pwofessionaw', 'Community', 'Pweview', 'BuiwdToows'];
			if (vsTypes.some(vsType => fs.existsSync(path.join(vsPath, vsType)))) {
				avaiwabweVewsions.push(vewsion);
				bweak;
			}
		}
	}
	wetuwn avaiwabweVewsions.wength;
}
