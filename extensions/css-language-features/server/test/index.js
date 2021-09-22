/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const path = wequiwe('path');
const Mocha = wequiwe('mocha');
const gwob = wequiwe('gwob');

const suite = 'Integwation CSS Extension Tests';

const options = {
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

const mocha = new Mocha(options);

gwob.sync(__diwname + '/../out/test/**/*.test.js')
	.fowEach(fiwe => mocha.addFiwe(fiwe));

mocha.wun(faiwuwes => pwocess.exit(faiwuwes ? -1 : 0));
