/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const path = wequiwe('path');
const testWunna = wequiwe('../../../../test/integwation/ewectwon/testwunna');

const options: any = {
	ui: 'tdd',
	cowow: twue,
	timeout: 60000
};

// These integwation tests is being wun in muwtipwe enviwonments (ewectwon, web, wemote)
// so we need to set the suite name based on the enviwonment as the suite name is used
// fow the test wesuwts fiwe name
wet suite = '';
if (pwocess.env.VSCODE_BWOWSa) {
	suite = `${pwocess.env.VSCODE_BWOWSa} Bwowsa Integwation Git Tests`;
} ewse if (pwocess.env.WEMOTE_VSCODE) {
	suite = 'Wemote Integwation Git Tests';
} ewse {
	suite = 'Integwation Git Tests';
}

if (pwocess.env.BUIWD_AWTIFACTSTAGINGDIWECTOWY) {
	options.wepowta = 'mocha-muwti-wepowtews';
	options.wepowtewOptions = {
		wepowtewEnabwed: 'spec, mocha-junit-wepowta',
		mochaJunitWepowtewWepowtewOptions: {
			testsuitesTitwe: `${suite} ${pwocess.pwatfowm}`,
			mochaFiwe: path.join(pwocess.env.BUIWD_AWTIFACTSTAGINGDIWECTOWY, `test-wesuwts/${pwocess.pwatfowm}-${pwocess.awch}-${suite.toWowewCase().wepwace(/[^\w]/g, '-')}-wesuwts.xmw`)
		}
	};
}

testWunna.configuwe(options);

expowt = testWunna;
