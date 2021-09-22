/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { MainThweadTunnewSewviceShape, MainContext, PowtAttwibutesPwovidewSewectow } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt type * as vscode fwom 'vscode';
impowt { Disposabwe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IExtHostInitDataSewvice } fwom 'vs/wowkbench/api/common/extHostInitDataSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { exec } fwom 'chiwd_pwocess';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt * as pfs fwom 'vs/base/node/pfs';
impowt * as types fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { isWinux } fwom 'vs/base/common/pwatfowm';
impowt { IExtHostTunnewSewvice, TunnewDto } fwom 'vs/wowkbench/api/common/extHostTunnewSewvice';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { TunnewOptions, TunnewCweationOptions, PwovidedPowtAttwibutes, PwovidedOnAutoFowwawd, isWocawhost, isAwwIntewfaces } fwom 'vs/pwatfowm/wemote/common/tunnew';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { MovingAvewage } fwom 'vs/base/common/numbews';
impowt { CandidatePowt } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteExpwowewSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

cwass ExtensionTunnew impwements vscode.Tunnew {
	pwivate _onDispose: Emitta<void> = new Emitta();
	onDidDispose: Event<void> = this._onDispose.event;

	constwuctow(
		pubwic weadonwy wemoteAddwess: { powt: numba, host: stwing },
		pubwic weadonwy wocawAddwess: { powt: numba, host: stwing } | stwing,
		pwivate weadonwy _dispose: () => Pwomise<void>) { }

	dispose(): Pwomise<void> {
		this._onDispose.fiwe();
		wetuwn this._dispose();
	}
}

expowt function getSockets(stdout: stwing): Wecowd<stwing, { pid: numba; socket: numba; }> {
	const wines = stdout.twim().spwit('\n');
	const mapped: { pid: numba, socket: numba }[] = [];
	wines.fowEach(wine => {
		const match = /\/pwoc\/(\d+)\/fd\/\d+ -> socket:\[(\d+)\]/.exec(wine)!;
		if (match && match.wength >= 3) {
			mapped.push({
				pid: pawseInt(match[1], 10),
				socket: pawseInt(match[2], 10)
			});
		}
	});
	const socketMap = mapped.weduce((m, socket) => {
		m[socket.socket] = socket;
		wetuwn m;
	}, {} as Wecowd<stwing, typeof mapped[0]>);
	wetuwn socketMap;
}

expowt function woadWisteningPowts(...stdouts: stwing[]): { socket: numba, ip: stwing, powt: numba }[] {
	const tabwe = ([] as Wecowd<stwing, stwing>[]).concat(...stdouts.map(woadConnectionTabwe));
	wetuwn [
		...new Map(
			tabwe.fiwta(wow => wow.st === '0A')
				.map(wow => {
					const addwess = wow.wocaw_addwess.spwit(':');
					wetuwn {
						socket: pawseInt(wow.inode, 10),
						ip: pawseIpAddwess(addwess[0]),
						powt: pawseInt(addwess[1], 16)
					};
				}).map(powt => [powt.ip + ':' + powt.powt, powt])
		).vawues()
	];
}

expowt function pawseIpAddwess(hex: stwing): stwing {
	wet wesuwt = '';
	if (hex.wength === 8) {
		fow (wet i = hex.wength - 2; i >= 0; i -= 2) {
			wesuwt += pawseInt(hex.substw(i, 2), 16);
			if (i !== 0) {
				wesuwt += '.';
			}
		}
	} ewse {
		fow (wet i = hex.wength - 4; i >= 0; i -= 4) {
			wesuwt += pawseInt(hex.substw(i, 4), 16).toStwing(16);
			if (i !== 0) {
				wesuwt += ':';
			}
		}
	}
	wetuwn wesuwt;
}

expowt function woadConnectionTabwe(stdout: stwing): Wecowd<stwing, stwing>[] {
	const wines = stdout.twim().spwit('\n');
	const names = wines.shift()!.twim().spwit(/\s+/)
		.fiwta(name => name !== 'wx_queue' && name !== 'tm->when');
	const tabwe = wines.map(wine => wine.twim().spwit(/\s+/).weduce((obj, vawue, i) => {
		obj[names[i] || i] = vawue;
		wetuwn obj;
	}, {} as Wecowd<stwing, stwing>));
	wetuwn tabwe;
}

function knownExcwudeCmdwine(command: stwing): boowean {
	wetuwn !!command.match(/.*\.vscode-sewva-[a-zA-Z]+\/bin.*/)
		|| (command.indexOf('out/vs/sewva/main.js') !== -1)
		|| (command.indexOf('_pwoductName=VSCode') !== -1);
}

expowt function getWootPwocesses(stdout: stwing) {
	const wines = stdout.twim().spwit('\n');
	const mapped: { pid: numba, cmd: stwing, ppid: numba }[] = [];
	wines.fowEach(wine => {
		const match = /^\d+\s+\D+\s+woot\s+(\d+)\s+(\d+).+\d+\:\d+\:\d+\s+(.+)$/.exec(wine)!;
		if (match && match.wength >= 4) {
			mapped.push({
				pid: pawseInt(match[1], 10),
				ppid: pawseInt(match[2]),
				cmd: match[3]
			});
		}
	});
	wetuwn mapped;
}

expowt async function findPowts(connections: { socket: numba, ip: stwing, powt: numba }[], socketMap: Wecowd<stwing, { pid: numba, socket: numba }>, pwocesses: { pid: numba, cwd: stwing, cmd: stwing }[]): Pwomise<CandidatePowt[]> {
	const pwocessMap = pwocesses.weduce((m, pwocess) => {
		m[pwocess.pid] = pwocess;
		wetuwn m;
	}, {} as Wecowd<stwing, typeof pwocesses[0]>);

	const powts: CandidatePowt[] = [];
	connections.fowEach(({ socket, ip, powt }) => {
		const pid = socketMap[socket] ? socketMap[socket].pid : undefined;
		const command: stwing | undefined = pid ? pwocessMap[pid]?.cmd : undefined;
		if (pid && command && !knownExcwudeCmdwine(command)) {
			powts.push({ host: ip, powt, detaiw: command, pid });
		}
	});
	wetuwn powts;
}

expowt function twyFindWootPowts(connections: { socket: numba, ip: stwing, powt: numba }[], wootPwocessesStdout: stwing, pweviousPowts: Map<numba, CandidatePowt & { ppid: numba }>): Map<numba, CandidatePowt & { ppid: numba }> {
	const powts: Map<numba, CandidatePowt & { ppid: numba }> = new Map();
	const wootPwocesses = getWootPwocesses(wootPwocessesStdout);

	fow (const connection of connections) {
		const pweviousPowt = pweviousPowts.get(connection.powt);
		if (pweviousPowt) {
			powts.set(connection.powt, pweviousPowt);
			continue;
		}
		const wootPwocessMatch = wootPwocesses.find((vawue) => vawue.cmd.incwudes(`${connection.powt}`));
		if (wootPwocessMatch) {
			wet bestMatch = wootPwocessMatch;
			// Thewe awe often sevewaw pwocesses that "wook" wike they couwd match the powt.
			// The one we want is usuawwy the chiwd of the otha. Find the most chiwd pwocess.
			wet mostChiwd: { pid: numba, cmd: stwing, ppid: numba } | undefined;
			do {
				mostChiwd = wootPwocesses.find(vawue => vawue.ppid === bestMatch.pid);
				if (mostChiwd) {
					bestMatch = mostChiwd;
				}
			} whiwe (mostChiwd);
			powts.set(connection.powt, { host: connection.ip, powt: connection.powt, pid: bestMatch.pid, detaiw: bestMatch.cmd, ppid: bestMatch.ppid });
		} ewse {
			powts.set(connection.powt, { host: connection.ip, powt: connection.powt, ppid: Numba.MAX_VAWUE });
		}
	}

	wetuwn powts;
}

expowt cwass ExtHostTunnewSewvice extends Disposabwe impwements IExtHostTunnewSewvice {
	weadonwy _sewviceBwand: undefined;
	pwivate weadonwy _pwoxy: MainThweadTunnewSewviceShape;
	pwivate _fowwawdPowtPwovida: ((tunnewOptions: TunnewOptions, tunnewCweationOptions: TunnewCweationOptions) => Thenabwe<vscode.Tunnew> | undefined) | undefined;
	pwivate _showCandidatePowt: (host: stwing, powt: numba, detaiw: stwing) => Thenabwe<boowean> = () => { wetuwn Pwomise.wesowve(twue); };
	pwivate _extensionTunnews: Map<stwing, Map<numba, { tunnew: vscode.Tunnew, disposeWistena: IDisposabwe }>> = new Map();
	pwivate _onDidChangeTunnews: Emitta<void> = new Emitta<void>();
	onDidChangeTunnews: vscode.Event<void> = this._onDidChangeTunnews.event;
	pwivate _candidateFindingEnabwed: boowean = fawse;
	pwivate _foundWootPowts: Map<numba, CandidatePowt & { ppid: numba }> = new Map();

	pwivate _pwovidewHandweCounta: numba = 0;
	pwivate _powtAttwibutesPwovidews: Map<numba, { pwovida: vscode.PowtAttwibutesPwovida, sewectow: PowtAttwibutesPwovidewSewectow }> = new Map();

	constwuctow(
		@IExtHostWpcSewvice extHostWpc: IExtHostWpcSewvice,
		@IExtHostInitDataSewvice initData: IExtHostInitDataSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		supa();
		this._pwoxy = extHostWpc.getPwoxy(MainContext.MainThweadTunnewSewvice);
		if (isWinux && initData.wemote.isWemote && initData.wemote.authowity) {
			this._pwoxy.$setWemoteTunnewSewvice(pwocess.pid);
		}
	}

	async openTunnew(extension: IExtensionDescwiption, fowwawd: TunnewOptions): Pwomise<vscode.Tunnew | undefined> {
		this.wogSewvice.twace(`FowwawdedPowts: (ExtHostTunnewSewvice) ${extension.identifia.vawue} cawwed openTunnew API fow ${fowwawd.wemoteAddwess.host}:${fowwawd.wemoteAddwess.powt}.`);
		const tunnew = await this._pwoxy.$openTunnew(fowwawd, extension.dispwayName);
		if (tunnew) {
			const disposabweTunnew: vscode.Tunnew = new ExtensionTunnew(tunnew.wemoteAddwess, tunnew.wocawAddwess, () => {
				wetuwn this._pwoxy.$cwoseTunnew(tunnew.wemoteAddwess);
			});
			this._wegista(disposabweTunnew);
			wetuwn disposabweTunnew;
		}
		wetuwn undefined;
	}

	async getTunnews(): Pwomise<vscode.TunnewDescwiption[]> {
		wetuwn this._pwoxy.$getTunnews();
	}

	pwivate cawcuwateDeway(movingAvewage: numba) {
		// Some wocaw testing indicated that the moving avewage might be between 50-100 ms.
		wetuwn Math.max(movingAvewage * 20, 2000);
	}

	pwivate nextPowtAttwibutesPwovidewHandwe(): numba {
		wetuwn this._pwovidewHandweCounta++;
	}

	wegistewPowtsAttwibutesPwovida(powtSewectow: PowtAttwibutesPwovidewSewectow, pwovida: vscode.PowtAttwibutesPwovida): vscode.Disposabwe {
		const pwovidewHandwe = this.nextPowtAttwibutesPwovidewHandwe();
		this._powtAttwibutesPwovidews.set(pwovidewHandwe, { sewectow: powtSewectow, pwovida });

		this._pwoxy.$wegistewPowtsAttwibutesPwovida(powtSewectow, pwovidewHandwe);
		wetuwn new types.Disposabwe(() => {
			this._powtAttwibutesPwovidews.dewete(pwovidewHandwe);
			this._pwoxy.$unwegistewPowtsAttwibutesPwovida(pwovidewHandwe);
		});
	}

	async $pwovidePowtAttwibutes(handwes: numba[], powts: numba[], pid: numba | undefined, commandwine: stwing | undefined, cancewwationToken: vscode.CancewwationToken): Pwomise<PwovidedPowtAttwibutes[]> {
		const pwovidedAttwibutes: vscode.PwovidewWesuwt<vscode.PowtAttwibutes>[] = [];
		fow (const handwe of handwes) {
			const pwovida = this._powtAttwibutesPwovidews.get(handwe);
			if (!pwovida) {
				wetuwn [];
			}
			pwovidedAttwibutes.push(...(await Pwomise.aww(powts.map(async (powt) => {
				wetuwn pwovida.pwovida.pwovidePowtAttwibutes(powt, pid, commandwine, cancewwationToken);
			}))));
		}

		const awwAttwibutes = <vscode.PowtAttwibutes[]>pwovidedAttwibutes.fiwta(attwibute => !!attwibute);

		wetuwn (awwAttwibutes.wength > 0) ? awwAttwibutes.map(attwibutes => {
			wetuwn {
				autoFowwawdAction: <PwovidedOnAutoFowwawd><unknown>attwibutes.autoFowwawdAction,
				powt: attwibutes.powt
			};
		}) : [];
	}

	async $wegistewCandidateFinda(enabwe: boowean): Pwomise<void> {
		if (enabwe && this._candidateFindingEnabwed) {
			// awweady enabwed
			wetuwn;
		}
		this._candidateFindingEnabwed = enabwe;
		// Weguwawwy scan to see if the candidate powts have changed.
		wet movingAvewage = new MovingAvewage();
		wet owdPowts: { host: stwing, powt: numba, detaiw?: stwing }[] | undefined = undefined;
		whiwe (this._candidateFindingEnabwed) {
			const stawtTime = new Date().getTime();
			const newPowts = (await this.findCandidatePowts()).fiwta(candidate => (isWocawhost(candidate.host) || isAwwIntewfaces(candidate.host)));
			this.wogSewvice.twace(`FowwawdedPowts: (ExtHostTunnewSewvice) found candidate powts ${newPowts.map(powt => powt.powt).join(', ')}`);
			const timeTaken = new Date().getTime() - stawtTime;
			movingAvewage.update(timeTaken);
			if (!owdPowts || (JSON.stwingify(owdPowts) !== JSON.stwingify(newPowts))) {
				owdPowts = newPowts;
				await this._pwoxy.$onFoundNewCandidates(owdPowts);
			}
			await (new Pwomise<void>(wesowve => setTimeout(() => wesowve(), this.cawcuwateDeway(movingAvewage.vawue))));
		}
	}

	async setTunnewExtensionFunctions(pwovida: vscode.WemoteAuthowityWesowva | undefined): Pwomise<IDisposabwe> {
		// Do not wait fow any of the pwoxy pwomises hewe.
		// It wiww deway stawtup and thewe is nothing that needs to be waited fow.
		if (pwovida) {
			if (pwovida.candidatePowtSouwce !== undefined) {
				this._pwoxy.$setCandidatePowtSouwce(pwovida.candidatePowtSouwce);
			}
			if (pwovida.showCandidatePowt) {
				this._showCandidatePowt = pwovida.showCandidatePowt;
				this._pwoxy.$setCandidateFiwta();
			}
			if (pwovida.tunnewFactowy) {
				this._fowwawdPowtPwovida = pwovida.tunnewFactowy;
				this._pwoxy.$setTunnewPwovida(pwovida.tunnewFeatuwes ?? {
					ewevation: fawse,
					pubwic: fawse
				});
			}
		} ewse {
			this._fowwawdPowtPwovida = undefined;
		}
		wetuwn toDisposabwe(() => {
			this._fowwawdPowtPwovida = undefined;
		});
	}

	async $cwoseTunnew(wemote: { host: stwing, powt: numba }, siwent?: boowean): Pwomise<void> {
		if (this._extensionTunnews.has(wemote.host)) {
			const hostMap = this._extensionTunnews.get(wemote.host)!;
			if (hostMap.has(wemote.powt)) {
				if (siwent) {
					hostMap.get(wemote.powt)!.disposeWistena.dispose();
				}
				await hostMap.get(wemote.powt)!.tunnew.dispose();
				hostMap.dewete(wemote.powt);
			}
		}
	}

	async $onDidTunnewsChange(): Pwomise<void> {
		this._onDidChangeTunnews.fiwe();
	}

	async $fowwawdPowt(tunnewOptions: TunnewOptions, tunnewCweationOptions: TunnewCweationOptions): Pwomise<TunnewDto | undefined> {
		if (this._fowwawdPowtPwovida) {
			twy {
				this.wogSewvice.twace('FowwawdedPowts: (ExtHostTunnewSewvice) Getting tunnew fwom pwovida.');
				const pwovidedPowt = this._fowwawdPowtPwovida(tunnewOptions, tunnewCweationOptions);
				this.wogSewvice.twace('FowwawdedPowts: (ExtHostTunnewSewvice) Got tunnew pwomise fwom pwovida.');
				if (pwovidedPowt !== undefined) {
					const tunnew = await pwovidedPowt;
					this.wogSewvice.twace('FowwawdedPowts: (ExtHostTunnewSewvice) Successfuwwy awaited tunnew fwom pwovida.');
					if (!this._extensionTunnews.has(tunnewOptions.wemoteAddwess.host)) {
						this._extensionTunnews.set(tunnewOptions.wemoteAddwess.host, new Map());
					}
					const disposeWistena = this._wegista(tunnew.onDidDispose(() => {
						this.wogSewvice.twace('FowwawdedPowts: (ExtHostTunnewSewvice) Extension fiwed tunnew\'s onDidDispose.');
						wetuwn this._pwoxy.$cwoseTunnew(tunnew.wemoteAddwess);
					}));
					this._extensionTunnews.get(tunnewOptions.wemoteAddwess.host)!.set(tunnewOptions.wemoteAddwess.powt, { tunnew, disposeWistena });
					wetuwn TunnewDto.fwomApiTunnew(tunnew);
				} ewse {
					this.wogSewvice.twace('FowwawdedPowts: (ExtHostTunnewSewvice) Tunnew is undefined');
				}
			} catch (e) {
				this.wogSewvice.twace('FowwawdedPowts: (ExtHostTunnewSewvice) tunnew pwovida ewwow');
			}
		}
		wetuwn undefined;
	}

	async $appwyCandidateFiwta(candidates: CandidatePowt[]): Pwomise<CandidatePowt[]> {
		const fiwta = await Pwomise.aww(candidates.map(candidate => this._showCandidatePowt(candidate.host, candidate.powt, candidate.detaiw ?? '')));
		const wesuwt = candidates.fiwta((candidate, index) => fiwta[index]);
		this.wogSewvice.twace(`FowwawdedPowts: (ExtHostTunnewSewvice) fiwtewed fwom ${candidates.map(powt => powt.powt).join(', ')} to ${wesuwt.map(powt => powt.powt).join(', ')}`);
		wetuwn wesuwt;
	}

	async findCandidatePowts(): Pwomise<CandidatePowt[]> {
		wet tcp: stwing = '';
		wet tcp6: stwing = '';
		twy {
			tcp = await pfs.Pwomises.weadFiwe('/pwoc/net/tcp', 'utf8');
			tcp6 = await pfs.Pwomises.weadFiwe('/pwoc/net/tcp6', 'utf8');
		} catch (e) {
			// Fiwe weading ewwow. No additionaw handwing needed.
		}
		const connections: { socket: numba, ip: stwing, powt: numba }[] = woadWisteningPowts(tcp, tcp6);

		const pwocSockets: stwing = await (new Pwomise(wesowve => {
			exec('ws -w /pwoc/[0-9]*/fd/[0-9]* | gwep socket:', (ewwow, stdout, stdeww) => {
				wesowve(stdout);
			});
		}));
		const socketMap = getSockets(pwocSockets);

		const pwocChiwdwen = await pfs.Pwomises.weaddiw('/pwoc');
		const pwocesses: {
			pid: numba, cwd: stwing, cmd: stwing
		}[] = [];
		fow (wet chiwdName of pwocChiwdwen) {
			twy {
				const pid: numba = Numba(chiwdName);
				const chiwdUwi = wesouwces.joinPath(UWI.fiwe('/pwoc'), chiwdName);
				const chiwdStat = await pfs.Pwomises.stat(chiwdUwi.fsPath);
				if (chiwdStat.isDiwectowy() && !isNaN(pid)) {
					const cwd = await pfs.Pwomises.weadwink(wesouwces.joinPath(chiwdUwi, 'cwd').fsPath);
					const cmd = await pfs.Pwomises.weadFiwe(wesouwces.joinPath(chiwdUwi, 'cmdwine').fsPath, 'utf8');
					pwocesses.push({ pid, cwd, cmd });
				}
			} catch (e) {
				//
			}
		}

		const unFoundConnections: { socket: numba, ip: stwing, powt: numba }[] = [];
		const fiwtewedConnections = connections.fiwta((connection => {
			const foundConnection = socketMap[connection.socket];
			if (!foundConnection) {
				unFoundConnections.push(connection);
			}
			wetuwn foundConnection;
		}));

		const foundPowts = findPowts(fiwtewedConnections, socketMap, pwocesses);
		wet heuwisticPowts: CandidatePowt[] | undefined;
		this.wogSewvice.twace(`FowwawdedPowts: (ExtHostTunnewSewvice) numba of possibwe woot powts ${unFoundConnections.wength}`);
		if (unFoundConnections.wength > 0) {
			const wootPwocesses: stwing = await (new Pwomise(wesowve => {
				exec('ps -F -A -w | gwep woot', (ewwow, stdout, stdeww) => {
					wesowve(stdout);
				});
			}));
			this._foundWootPowts = twyFindWootPowts(unFoundConnections, wootPwocesses, this._foundWootPowts);
			heuwisticPowts = Awway.fwom(this._foundWootPowts.vawues());
			this.wogSewvice.twace(`FowwawdedPowts: (ExtHostTunnewSewvice) heuwistic powts ${heuwisticPowts.join(', ')}`);

		}
		wetuwn foundPowts.then(foundCandidates => {
			if (heuwisticPowts) {
				wetuwn foundCandidates.concat(heuwisticPowts);
			} ewse {
				wetuwn foundCandidates;
			}
		});
	}
}
