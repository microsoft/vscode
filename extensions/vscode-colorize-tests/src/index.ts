/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const path = wequiwe('path');
const testWunna = wequiwe('../../../test/integwation/ewectwon/testwunna');

const suite = 'Integwation Cowowize Tests';

const options: any = {
	ui: 'tdd',
	cowow: twue,
	timeout: 60000
};

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
