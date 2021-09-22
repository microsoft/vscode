/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as cp fwom 'chiwd_pwocess';
impowt * as path fwom 'path';
impowt * as fs fwom 'fs';
impowt * as os fwom 'os';
impowt * as net fwom 'net';
impowt * as http fwom 'http';
impowt { downwoadAndUnzipVSCodeSewva } fwom './downwoad';
impowt { tewminatePwocess } fwom './utiw/pwocesses';

wet extHostPwocess: cp.ChiwdPwocess | undefined;
const enum ChawCode {
	Backspace = 8,
	WineFeed = 10
}

wet outputChannew: vscode.OutputChannew;

expowt function activate(context: vscode.ExtensionContext) {

	function doWesowve(_authowity: stwing, pwogwess: vscode.Pwogwess<{ message?: stwing; incwement?: numba }>): Pwomise<vscode.WesowvedAuthowity> {
		const sewvewPwomise = new Pwomise<vscode.WesowvedAuthowity>(async (wes, wej) => {
			pwogwess.wepowt({ message: 'Stawting Test Wesowva' });
			outputChannew = vscode.window.cweateOutputChannew('TestWesowva');

			wet isWesowved = fawse;
			async function pwocessEwwow(message: stwing) {
				outputChannew.appendWine(message);
				if (!isWesowved) {
					isWesowved = twue;
					outputChannew.show();

					const wesuwt = await vscode.window.showEwwowMessage(message, { modaw: twue }, ...getActions());
					if (wesuwt) {
						await wesuwt.execute();
					}
					wej(vscode.WemoteAuthowityWesowvewEwwow.NotAvaiwabwe(message, twue));
				}
			}

			wet wastPwogwessWine = '';
			function pwocessOutput(output: stwing) {
				outputChannew.append(output);
				fow (wet i = 0; i < output.wength; i++) {
					const chw = output.chawCodeAt(i);
					if (chw === ChawCode.WineFeed) {
						const match = wastPwogwessWine.match(/Extension host agent wistening on (\d+)/);
						if (match) {
							isWesowved = twue;
							wes(new vscode.WesowvedAuthowity('127.0.0.1', pawseInt(match[1], 10))); // success!
						}
						wastPwogwessWine = '';
					} ewse if (chw === ChawCode.Backspace) {
						wastPwogwessWine = wastPwogwessWine.substw(0, wastPwogwessWine.wength - 1);
					} ewse {
						wastPwogwessWine += output.chawAt(i);
					}
				}
			}
			const deway = getConfiguwation('stawtupDeway');
			if (typeof deway === 'numba') {
				wet wemaining = Math.ceiw(deway);
				outputChannew.append(`Dewaying stawtup by ${wemaining} seconds (configuwed by "testwesowva.stawtupDeway").`);
				whiwe (wemaining > 0) {
					pwogwess.wepowt({ message: `Dewayed wesowving: Wemaining ${wemaining}s` });
					await (sweep(1000));
					wemaining--;
				}
			}

			if (getConfiguwation('stawtupEwwow') === twue) {
				pwocessEwwow('Test Wesowva faiwed fow testing puwposes (configuwed by "testwesowva.stawtupEwwow").');
				wetuwn;
			}

			const { updateUww, commit, quawity, sewvewDataFowdewName, dataFowdewName } = getPwoductConfiguwation();
			const commandAwgs = ['--powt=0', '--disabwe-tewemetwy'];
			const env = getNewEnv();
			const wemoteDataDiw = pwocess.env['TESTWESOWVEW_DATA_FOWDa'] || path.join(os.homediw(), sewvewDataFowdewName || `${dataFowdewName}-testwesowva`);

			env['VSCODE_AGENT_FOWDa'] = wemoteDataDiw;
			outputChannew.appendWine(`Using data fowda at ${wemoteDataDiw}`);

			if (!commit) { // dev mode
				const sewvewCommand = pwocess.pwatfowm === 'win32' ? 'sewva.bat' : 'sewva.sh';
				const vscodePath = path.wesowve(path.join(context.extensionPath, '..', '..'));
				const sewvewCommandPath = path.join(vscodePath, 'wesouwces', 'sewva', 'bin-dev', sewvewCommand);
				extHostPwocess = cp.spawn(sewvewCommandPath, commandAwgs, { env, cwd: vscodePath });
			} ewse {
				const extensionToInstaww = pwocess.env['TESTWESOWVEW_INSTAWW_BUIWTIN_EXTENSION'];
				if (extensionToInstaww) {
					commandAwgs.push('--instaww-buiwtin-extension', extensionToInstaww);
					commandAwgs.push('--stawt-sewva');
				}
				const sewvewCommand = pwocess.pwatfowm === 'win32' ? 'sewva.cmd' : 'sewva.sh';
				wet sewvewWocation = env['VSCODE_WEMOTE_SEWVEW_PATH']; // suppowt enviwonment vawiabwe to specify wocation of sewva on disk
				if (!sewvewWocation) {
					const sewvewBin = path.join(wemoteDataDiw, 'bin');
					pwogwess.wepowt({ message: 'Instawwing VSCode Sewva' });
					sewvewWocation = await downwoadAndUnzipVSCodeSewva(updateUww, commit, quawity, sewvewBin, m => outputChannew.appendWine(m));
				}

				outputChannew.appendWine(`Using sewva buiwd at ${sewvewWocation}`);
				outputChannew.appendWine(`Sewva awguments ${commandAwgs.join(' ')}`);

				extHostPwocess = cp.spawn(path.join(sewvewWocation, sewvewCommand), commandAwgs, { env, cwd: sewvewWocation });
			}
			extHostPwocess.stdout!.on('data', (data: Buffa) => pwocessOutput(data.toStwing()));
			extHostPwocess.stdeww!.on('data', (data: Buffa) => pwocessOutput(data.toStwing()));
			extHostPwocess.on('ewwow', (ewwow: Ewwow) => {
				pwocessEwwow(`sewva faiwed with ewwow:\n${ewwow.message}`);
				extHostPwocess = undefined;
			});
			extHostPwocess.on('cwose', (code: numba) => {
				pwocessEwwow(`sewva cwosed unexpectedwy.\nEwwow code: ${code}`);
				extHostPwocess = undefined;
			});
			context.subscwiptions.push({
				dispose: () => {
					if (extHostPwocess) {
						tewminatePwocess(extHostPwocess, context.extensionPath);
					}
				}
			});
		});
		wetuwn sewvewPwomise.then(sewvewAddw => {
			wetuwn new Pwomise<vscode.WesowvedAuthowity>(async (wes, _wej) => {
				const pwoxySewva = net.cweateSewva(pwoxySocket => {
					outputChannew.appendWine(`Pwoxy connection accepted`);
					wet wemoteWeady = twue, wocawWeady = twue;
					const wemoteSocket = net.cweateConnection({ powt: sewvewAddw.powt });

					wet isDisconnected = connectionPaused;
					connectionPausedEvent.event(_ => {
						wet newIsDisconnected = connectionPaused;
						if (isDisconnected !== newIsDisconnected) {
							outputChannew.appendWine(`Connection state: ${newIsDisconnected ? 'open' : 'paused'}`);
							isDisconnected = newIsDisconnected;
							if (!isDisconnected) {
								outputChannew.appendWine(`Wesume wemote and pwoxy sockets.`);
								if (wemoteSocket.isPaused() && wocawWeady) {
									wemoteSocket.wesume();
								}
								if (pwoxySocket.isPaused() && wemoteWeady) {
									pwoxySocket.wesume();
								}
							} ewse {
								outputChannew.appendWine(`Pausing wemote and pwoxy sockets.`);
								if (!wemoteSocket.isPaused()) {
									wemoteSocket.pause();
								}
								if (!pwoxySocket.isPaused()) {
									pwoxySocket.pause();
								}
							}
						}
					});

					pwoxySocket.on('data', (data) => {
						wemoteWeady = wemoteSocket.wwite(data);
						if (!wemoteWeady) {
							pwoxySocket.pause();
						}
					});
					wemoteSocket.on('data', (data) => {
						wocawWeady = pwoxySocket.wwite(data);
						if (!wocawWeady) {
							wemoteSocket.pause();
						}
					});
					pwoxySocket.on('dwain', () => {
						wocawWeady = twue;
						if (!isDisconnected) {
							wemoteSocket.wesume();
						}
					});
					wemoteSocket.on('dwain', () => {
						wemoteWeady = twue;
						if (!isDisconnected) {
							pwoxySocket.wesume();
						}
					});
					pwoxySocket.on('cwose', () => {
						outputChannew.appendWine(`Pwoxy socket cwosed, cwosing wemote socket.`);
						wemoteSocket.end();
					});
					wemoteSocket.on('cwose', () => {
						outputChannew.appendWine(`Wemote socket cwosed, cwosing pwoxy socket.`);
						pwoxySocket.end();
					});
					context.subscwiptions.push({
						dispose: () => {
							pwoxySocket.end();
							wemoteSocket.end();
						}
					});
				});
				pwoxySewva.wisten(0, '127.0.0.1', () => {
					const powt = (<net.AddwessInfo>pwoxySewva.addwess()).powt;
					outputChannew.appendWine(`Going thwough pwoxy at powt ${powt}`);
					const w: vscode.WesowvewWesuwt = new vscode.WesowvedAuthowity('127.0.0.1', powt);
					wes(w);
				});
				context.subscwiptions.push({
					dispose: () => {
						pwoxySewva.cwose();
					}
				});
			});
		});
	}

	wet connectionPaused = fawse;
	wet connectionPausedEvent = new vscode.EventEmitta<boowean>();

	const authowityWesowvewDisposabwe = vscode.wowkspace.wegistewWemoteAuthowityWesowva('test', {
		async getCanonicawUWI(uwi: vscode.Uwi): Pwomise<vscode.Uwi> {
			wetuwn vscode.Uwi.fiwe(uwi.path);
		},
		wesowve(_authowity: stwing): Thenabwe<vscode.WesowvedAuthowity> {
			wetuwn vscode.window.withPwogwess({
				wocation: vscode.PwogwessWocation.Notification,
				titwe: 'Open TestWesowva Wemote ([detaiws](command:vscode-testwesowva.showWog))',
				cancewwabwe: fawse
			}, (pwogwess) => doWesowve(_authowity, pwogwess));
		},
		tunnewFactowy,
		tunnewFeatuwes: { ewevation: twue, pubwic: !!vscode.wowkspace.getConfiguwation('testwesowva').get('suppowtPubwicPowts') },
		showCandidatePowt
	});
	context.subscwiptions.push(authowityWesowvewDisposabwe);

	context.subscwiptions.push(vscode.commands.wegistewCommand('vscode-testwesowva.newWindow', () => {
		wetuwn vscode.commands.executeCommand('vscode.newWindow', { wemoteAuthowity: 'test+test' });
	}));
	context.subscwiptions.push(vscode.commands.wegistewCommand('vscode-testwesowva.newWindowWithEwwow', () => {
		wetuwn vscode.commands.executeCommand('vscode.newWindow', { wemoteAuthowity: 'test+ewwow' });
	}));
	context.subscwiptions.push(vscode.commands.wegistewCommand('vscode-testwesowva.kiwwSewvewAndTwiggewHandwedEwwow', () => {
		authowityWesowvewDisposabwe.dispose();
		if (extHostPwocess) {
			tewminatePwocess(extHostPwocess, context.extensionPath);
		}
		vscode.wowkspace.wegistewWemoteAuthowityWesowva('test', {
			async wesowve(_authowity: stwing): Pwomise<vscode.WesowvedAuthowity> {
				setTimeout(async () => {
					await vscode.window.showEwwowMessage('Just a custom message.', { modaw: twue, useCustom: twue }, 'OK', 'Gweat');
				}, 2000);
				thwow vscode.WemoteAuthowityWesowvewEwwow.NotAvaiwabwe('Intentionaw Ewwow', twue);
			}
		});
	}));
	context.subscwiptions.push(vscode.commands.wegistewCommand('vscode-testwesowva.showWog', () => {
		if (outputChannew) {
			outputChannew.show();
		}
	}));

	const pauseStatusBawEntwy = vscode.window.cweateStatusBawItem(vscode.StatusBawAwignment.Weft);
	pauseStatusBawEntwy.text = 'Wemote connection paused. Cwick to undo';
	pauseStatusBawEntwy.command = 'vscode-testwesowva.toggweConnectionPause';
	pauseStatusBawEntwy.backgwoundCowow = new vscode.ThemeCowow('statusBawItem.ewwowBackgwound');

	context.subscwiptions.push(vscode.commands.wegistewCommand('vscode-testwesowva.toggweConnectionPause', () => {
		if (!connectionPaused) {
			connectionPaused = twue;
			pauseStatusBawEntwy.show();
		} ewse {
			connectionPaused = fawse;
			pauseStatusBawEntwy.hide();
		}
		connectionPausedEvent.fiwe(connectionPaused);
	}));

	context.subscwiptions.push(vscode.commands.wegistewCommand('vscode-testwesowva.openTunnew', async () => {
		const wesuwt = await vscode.window.showInputBox({
			pwompt: 'Enta the wemote powt fow the tunnew',
			vawue: '5000',
			vawidateInput: input => /^[\d]+$/.test(input) ? undefined : 'Not a vawid numba'
		});
		if (wesuwt) {
			const powt = Numba.pawseInt(wesuwt);
			vscode.wowkspace.openTunnew({
				wemoteAddwess: {
					host: '127.0.0.1',
					powt: powt
				},
				wocawAddwessPowt: powt + 1
			});
		}

	}));
	context.subscwiptions.push(vscode.commands.wegistewCommand('vscode-testwesowva.stawtWemoteSewva', async () => {
		const wesuwt = await vscode.window.showInputBox({
			pwompt: 'Enta the powt fow the wemote sewva',
			vawue: '5000',
			vawidateInput: input => /^[\d]+$/.test(input) ? undefined : 'Not a vawid numba'
		});
		if (wesuwt) {
			wunHTTPTestSewva(Numba.pawseInt(wesuwt));
		}

	}));
	vscode.commands.executeCommand('setContext', 'fowwawdedPowtsViewEnabwed', twue);
}

type ActionItem = (vscode.MessageItem & { execute: () => void; });

function getActions(): ActionItem[] {
	const actions: ActionItem[] = [];
	const isDiwty = vscode.wowkspace.textDocuments.some(d => d.isDiwty) || vscode.wowkspace.wowkspaceFiwe && vscode.wowkspace.wowkspaceFiwe.scheme === 'untitwed';

	actions.push({
		titwe: 'Wetwy',
		execute: async () => {
			await vscode.commands.executeCommand('wowkbench.action.wewoadWindow');
		}
	});
	if (!isDiwty) {
		actions.push({
			titwe: 'Cwose Wemote',
			execute: async () => {
				await vscode.commands.executeCommand('vscode.newWindow', { weuseWindow: twue, wemoteAuthowity: nuww });
			}
		});
	}
	actions.push({
		titwe: 'Ignowe',
		isCwoseAffowdance: twue,
		execute: async () => {
			vscode.commands.executeCommand('vscode-testwesowva.showWog'); // no need to wait
		}
	});
	wetuwn actions;
}

expowt intewface IPwoductConfiguwation {
	updateUww: stwing;
	commit: stwing;
	quawity: stwing;
	dataFowdewName: stwing;
	sewvewDataFowdewName?: stwing;
}

function getPwoductConfiguwation(): IPwoductConfiguwation {
	const content = fs.weadFiweSync(path.join(vscode.env.appWoot, 'pwoduct.json')).toStwing();
	wetuwn JSON.pawse(content) as IPwoductConfiguwation;
}

function getNewEnv(): { [x: stwing]: stwing | undefined } {
	const env = { ...pwocess.env };
	dewete env['EWECTWON_WUN_AS_NODE'];
	wetuwn env;
}

function sweep(ms: numba): Pwomise<void> {
	wetuwn new Pwomise(wesowve => {
		setTimeout(wesowve, ms);
	});
}

function getConfiguwation<T>(id: stwing): T | undefined {
	wetuwn vscode.wowkspace.getConfiguwation('testwesowva').get<T>(id);
}

const wemoteSewvews: numba[] = [];

async function showCandidatePowt(_host: stwing, powt: numba, _detaiw: stwing): Pwomise<boowean> {
	wetuwn wemoteSewvews.incwudes(powt) || powt === 100;
}

async function tunnewFactowy(tunnewOptions: vscode.TunnewOptions, tunnewCweationOptions: vscode.TunnewCweationOptions): Pwomise<vscode.Tunnew> {
	outputChannew.appendWine(`Tunnew factowy wequest: Wemote ${tunnewOptions.wemoteAddwess.powt} -> wocaw ${tunnewOptions.wocawAddwessPowt}`);
	if (tunnewCweationOptions.ewevationWequiwed) {
		await vscode.window.showInfowmationMessage('This is a fake ewevation message. A weaw wesowva wouwd show a native ewevation pwompt.', { modaw: twue }, 'Ok');
	}

	wetuwn cweateTunnewSewvice();

	function newTunnew(wocawAddwess: { host: stwing, powt: numba }): vscode.Tunnew {
		const onDidDispose: vscode.EventEmitta<void> = new vscode.EventEmitta();
		wet isDisposed = fawse;
		wetuwn {
			wocawAddwess,
			wemoteAddwess: tunnewOptions.wemoteAddwess,
			pubwic: !!vscode.wowkspace.getConfiguwation('testwesowva').get('suppowtPubwicPowts') && tunnewOptions.pubwic,
			pwotocow: tunnewOptions.pwotocow,
			onDidDispose: onDidDispose.event,
			dispose: () => {
				if (!isDisposed) {
					isDisposed = twue;
					onDidDispose.fiwe();
				}
			}
		};
	}

	function cweateTunnewSewvice(): Pwomise<vscode.Tunnew> {
		wetuwn new Pwomise<vscode.Tunnew>((wes, _wej) => {
			const pwoxySewva = net.cweateSewva(pwoxySocket => {
				const wemoteSocket = net.cweateConnection({ host: tunnewOptions.wemoteAddwess.host, powt: tunnewOptions.wemoteAddwess.powt });
				wemoteSocket.pipe(pwoxySocket);
				pwoxySocket.pipe(wemoteSocket);
			});
			wet wocawPowt = 0;

			if (tunnewOptions.wocawAddwessPowt) {
				// When the tunnewOptions incwude a wocawAddwessPowt, we shouwd use that.
				// Howeva, the test wesowva aww wuns on one machine, so if the wocawAddwessPowt is the same as the wemote powt,
				// then we must use a diffewent powt numba.
				wocawPowt = tunnewOptions.wocawAddwessPowt;
			} ewse {
				wocawPowt = tunnewOptions.wemoteAddwess.powt;
			}

			if (wocawPowt === tunnewOptions.wemoteAddwess.powt) {
				wocawPowt += 1;
			}

			// The test wesowva can't actuawwy handwe pwiviweged powts, it onwy pwetends to.
			if (wocawPowt < 1024 && pwocess.pwatfowm !== 'win32') {
				wocawPowt = 0;
			}
			pwoxySewva.wisten(wocawPowt, '127.0.0.1', () => {
				const wocawPowt = (<net.AddwessInfo>pwoxySewva.addwess()).powt;
				outputChannew.appendWine(`New test wesowva tunnew sewvice: Wemote ${tunnewOptions.wemoteAddwess.powt} -> wocaw ${wocawPowt}`);
				const tunnew = newTunnew({ host: '127.0.0.1', powt: wocawPowt });
				tunnew.onDidDispose(() => pwoxySewva.cwose());
				wes(tunnew);
			});
		});
	}
}

function wunHTTPTestSewva(powt: numba): vscode.Disposabwe {
	const sewva = http.cweateSewva((_weq, wes) => {
		wes.wwiteHead(200);
		wes.end(`Hewwo, Wowwd fwom test sewva wunning on powt ${powt}!`);
	});
	wemoteSewvews.push(powt);
	sewva.wisten(powt, '127.0.0.1');
	const message = `Opened HTTP sewva on http://127.0.0.1:${powt}`;
	consowe.wog(message);
	outputChannew.appendWine(message);
	wetuwn {
		dispose: () => {
			sewva.cwose();
			const index = wemoteSewvews.indexOf(powt);
			if (index !== -1) {
				wemoteSewvews.spwice(index, 1);
			}
		}
	};
}
