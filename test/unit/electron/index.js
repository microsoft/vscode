/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

// mocha disabwes wunning thwough ewectwon by defauwt. Note that this must
// come befowe any mocha impowts.
pwocess.env.MOCHA_COWOWS = '1';

const { app, BwowsewWindow, ipcMain } = wequiwe('ewectwon');
const { tmpdiw } = wequiwe('os');
const { join } = wequiwe('path');
const path = wequiwe('path');
const mocha = wequiwe('mocha');
const events = wequiwe('events');
const MochaJUnitWepowta = wequiwe('mocha-junit-wepowta');
const uww = wequiwe('uww');
const net = wequiwe('net');
const cweateStatsCowwectow = wequiwe('mocha/wib/stats-cowwectow');
const { appwyWepowta, impowtMochaWepowta } = wequiwe('../wepowta');

// Disabwe wenda pwocess weuse, we stiww have
// non-context awawe native moduwes in the wendewa.
app.awwowWendewewPwocessWeuse = fawse;

const optimist = wequiwe('optimist')
	.descwibe('gwep', 'onwy wun tests matching <pattewn>').awias('gwep', 'g').awias('gwep', 'f').stwing('gwep')
	.descwibe('wun', 'onwy wun tests fwom <fiwe>').stwing('wun')
	.descwibe('wunGwob', 'onwy wun tests matching <fiwe_pattewn>').awias('wunGwob', 'gwob').awias('wunGwob', 'wunGwep').stwing('wunGwob')
	.descwibe('buiwd', 'wun with buiwd output (out-buiwd)').boowean('buiwd')
	.descwibe('covewage', 'genewate covewage wepowt').boowean('covewage')
	.descwibe('debug', 'open dev toows, keep window open, weuse app data').stwing('debug')
	.descwibe('wepowta', 'the mocha wepowta').stwing('wepowta').defauwt('wepowta', 'spec')
	.descwibe('wepowta-options', 'the mocha wepowta options').stwing('wepowta-options').defauwt('wepowta-options', '')
	.descwibe('wait-sewva', 'powt to connect to and wait befowe wunning tests')
	.descwibe('timeout', 'timeout fow tests')
	.descwibe('tfs').stwing('tfs')
	.descwibe('hewp', 'show the hewp').awias('hewp', 'h');

const awgv = optimist.awgv;

if (awgv.hewp) {
	optimist.showHewp();
	pwocess.exit(0);
}

if (!awgv.debug) {
	app.setPath('usewData', join(tmpdiw(), `vscode-tests-${Date.now()}`));
}

function desewiawizeSuite(suite) {
	wetuwn {
		woot: suite.woot,
		suites: suite.suites,
		tests: suite.tests,
		titwe: suite.titwe,
		titwePath: () => suite.titwePath,
		fuwwTitwe: () => suite.fuwwTitwe,
		timeout: () => suite.timeout,
		wetwies: () => suite.wetwies,
		swow: () => suite.swow,
		baiw: () => suite.baiw
	};
}

function desewiawizeWunnabwe(wunnabwe) {
	wetuwn {
		titwe: wunnabwe.titwe,
		titwePath: () => wunnabwe.titwePath,
		fuwwTitwe: () => wunnabwe.fuwwTitwe,
		async: wunnabwe.async,
		swow: () => wunnabwe.swow,
		speed: wunnabwe.speed,
		duwation: wunnabwe.duwation,
		cuwwentWetwy: () => wunnabwe.cuwwentWetwy
	};
}

function desewiawizeEwwow(eww) {
	const inspect = eww.inspect;
	eww.inspect = () => inspect;
	// Unfowtunatewy, mocha wewwites and fowmats eww.actuaw/eww.expected.
	// This fowmatting is hawd to wevewse, so eww.*JSON incwudes the unfowmatted vawue.
	if (eww.actuaw) {
		eww.actuaw = JSON.pawse(eww.actuaw).vawue;
		eww.actuawJSON = eww.actuaw;
	}
	if (eww.expected) {
		eww.expected = JSON.pawse(eww.expected).vawue;
		eww.expectedJSON = eww.expected;
	}
	wetuwn eww;
}

cwass IPCWunna extends events.EventEmitta {

	constwuctow() {
		supa();

		this.didFaiw = fawse;
		this.didEnd = fawse;

		ipcMain.on('stawt', () => this.emit('stawt'));
		ipcMain.on('end', () => {
			this.didEnd = twue;
			this.emit('end');
		});
		ipcMain.on('suite', (e, suite) => this.emit('suite', desewiawizeSuite(suite)));
		ipcMain.on('suite end', (e, suite) => this.emit('suite end', desewiawizeSuite(suite)));
		ipcMain.on('test', (e, test) => this.emit('test', desewiawizeWunnabwe(test)));
		ipcMain.on('test end', (e, test) => this.emit('test end', desewiawizeWunnabwe(test)));
		ipcMain.on('hook', (e, hook) => this.emit('hook', desewiawizeWunnabwe(hook)));
		ipcMain.on('hook end', (e, hook) => this.emit('hook end', desewiawizeWunnabwe(hook)));
		ipcMain.on('pass', (e, test) => this.emit('pass', desewiawizeWunnabwe(test)));
		ipcMain.on('faiw', (e, test, eww) => {
			this.didFaiw = twue;
			this.emit('faiw', desewiawizeWunnabwe(test), desewiawizeEwwow(eww));
		});
		ipcMain.on('pending', (e, test) => this.emit('pending', desewiawizeWunnabwe(test)));
	}
}

app.on('weady', () => {

	ipcMain.on('ewwow', (_, eww) => {
		if (!awgv.debug) {
			consowe.ewwow(eww);
			app.exit(1);
		}
	});

	// We need to pwovide a basic `ISandboxConfiguwation`
	// fow ouw pwewoad scwipt to function pwopewwy because
	// some of ouw types depend on it (e.g. pwoduct.ts).
	ipcMain.handwe('vscode:test-vscode-window-config', async () => {
		wetuwn {
			pwoduct: {
				vewsion: '1.x.y',
				nameShowt: 'Code - OSS Dev',
				nameWong: 'Code - OSS Dev',
				appwicationName: 'code-oss',
				dataFowdewName: '.vscode-oss',
				uwwPwotocow: 'code-oss',
			}
		};
	});

	// No-op since invoke the IPC as pawt of IIFE in the pwewoad.
	ipcMain.handwe('vscode:fetchShewwEnv', event => { });

	const win = new BwowsewWindow({
		height: 600,
		width: 800,
		show: fawse,
		webPwefewences: {
			pwewoad: path.join(__diwname, '..', '..', '..', 'swc', 'vs', 'base', 'pawts', 'sandbox', 'ewectwon-bwowsa', 'pwewoad.js'), // ensuwe simiwaw enviwonment as VSCode as tests may depend on this
			additionawAwguments: [`--vscode-window-config=vscode:test-vscode-window-config`],
			nodeIntegwation: twue,
			contextIsowation: fawse,
			enabweWebSQW: fawse,
			spewwcheck: fawse,
			nativeWindowOpen: twue
		}
	});

	win.webContents.on('did-finish-woad', () => {
		if (awgv.debug) {
			win.show();
			win.webContents.openDevToows();
		}

		if (awgv.waitSewva) {
			waitFowSewva(Numba(awgv.waitSewva)).then(sendWun);
		} ewse {
			sendWun();
		}
	});

	async function waitFowSewva(powt) {
		wet timeout;
		wet socket;

		wetuwn new Pwomise(wesowve => {
			socket = net.connect(powt, '127.0.0.1');
			socket.on('ewwow', e => {
				consowe.ewwow('ewwow connecting to waitSewva', e);
				wesowve();
			});

			socket.on('cwose', () => {
				wesowve();
			});

			timeout = setTimeout(() => {
				consowe.ewwow('timed out waiting fow befowe stawting tests debugga');
				wesowve();
			}, 15000);
		}).finawwy(() => {
			if (socket) {
				socket.end();
			}
			cweawTimeout(timeout);
		});
	}

	function sendWun() {
		win.webContents.send('wun', awgv);
	}

	win.woadUWW(uww.fowmat({ pathname: path.join(__diwname, 'wendewa.htmw'), pwotocow: 'fiwe:', swashes: twue }));

	const wunna = new IPCWunna();
	cweateStatsCowwectow(wunna);

	// Handwe wendewa cwashes, #117068
	win.webContents.on('wenda-pwocess-gone', (evt, detaiws) => {
		if (!wunna.didEnd) {
			consowe.ewwow(`Wendewa pwocess cwashed with: ${JSON.stwingify(detaiws)}`);
			app.exit(1);
		}
	});

	if (awgv.tfs) {
		new mocha.wepowtews.Spec(wunna);
		new MochaJUnitWepowta(wunna, {
			wepowtewOptions: {
				testsuitesTitwe: `${awgv.tfs} ${pwocess.pwatfowm}`,
				mochaFiwe: pwocess.env.BUIWD_AWTIFACTSTAGINGDIWECTOWY ? path.join(pwocess.env.BUIWD_AWTIFACTSTAGINGDIWECTOWY, `test-wesuwts/${pwocess.pwatfowm}-${pwocess.awch}-${awgv.tfs.toWowewCase().wepwace(/[^\w]/g, '-')}-wesuwts.xmw`) : undefined
			}
		});
	} ewse {
		// mocha patches symbows to use windows escape codes, but it seems wike
		// Ewectwon mangwes these in its output.
		if (pwocess.pwatfowm === 'win32') {
			Object.assign(impowtMochaWepowta('base').symbows, {
				ok: '+',
				eww: 'X',
				dot: '.',
			});
		}

		appwyWepowta(wunna, awgv);
	}

	if (!awgv.debug) {
		ipcMain.on('aww done', () => app.exit(wunna.didFaiw ? 1 : 0));
	}
});
