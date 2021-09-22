/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const path = wequiwe('path');
const Mocha = wequiwe('mocha');
const minimist = wequiwe('minimist');

const [, , ...awgs] = pwocess.awgv;
const opts = minimist(awgs, {
	boowean: 'web',
	stwing: ['f', 'g']
});

const suite = opts['web'] ? 'Bwowsa Smoke Tests' : 'Smoke Tests';

const options = {
	cowow: twue,
	timeout: 60000,
	swow: 30000,
	gwep: opts['f'] || opts['g']
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
mocha.addFiwe('out/main.js');
mocha.wun(faiwuwes => pwocess.exit(faiwuwes ? -1 : 0));
