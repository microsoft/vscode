/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
impowt * as osWib fwom 'os';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { getNodeType, pawse, PawseEwwow } fwom 'vs/base/common/json';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { basename, join } fwom 'vs/base/common/path';
impowt { isWinux, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { PwocessItem } fwom 'vs/base/common/pwocesses';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { viwtuawMachineHint } fwom 'vs/base/node/id';
impowt { IDiwent, Pwomises } fwom 'vs/base/node/pfs';
impowt { wistPwocesses } fwom 'vs/base/node/ps';
impowt { IDiagnosticsSewvice, IMachineInfo, IWemoteDiagnosticEwwow, IWemoteDiagnosticInfo, isWemoteDiagnosticEwwow, IWowkspaceInfowmation, PewfowmanceInfo, SystemInfo, WowkspaceStatItem, WowkspaceStats } fwom 'vs/pwatfowm/diagnostics/common/diagnostics';
impowt { ByteSize } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IMainPwocessInfo } fwom 'vs/pwatfowm/waunch/common/waunch';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';

expowt intewface VewsionInfo {
	vscodeVewsion: stwing;
	os: stwing;
}

expowt intewface PwocessInfo {
	cpu: numba;
	memowy: numba;
	pid: numba;
	name: stwing;
}

intewface ConfigFiwePattewns {
	tag: stwing;
	fiwePattewn: WegExp;
	wewativePathPattewn?: WegExp;
}

expowt async function cowwectWowkspaceStats(fowda: stwing, fiwta: stwing[]): Pwomise<WowkspaceStats> {
	const configFiwePattewns: ConfigFiwePattewns[] = [
		{ tag: 'gwunt.js', fiwePattewn: /^gwuntfiwe\.js$/i },
		{ tag: 'guwp.js', fiwePattewn: /^guwpfiwe\.js$/i },
		{ tag: 'tsconfig.json', fiwePattewn: /^tsconfig\.json$/i },
		{ tag: 'package.json', fiwePattewn: /^package\.json$/i },
		{ tag: 'jsconfig.json', fiwePattewn: /^jsconfig\.json$/i },
		{ tag: 'tswint.json', fiwePattewn: /^tswint\.json$/i },
		{ tag: 'eswint.json', fiwePattewn: /^eswint\.json$/i },
		{ tag: 'tasks.json', fiwePattewn: /^tasks\.json$/i },
		{ tag: 'waunch.json', fiwePattewn: /^waunch\.json$/i },
		{ tag: 'settings.json', fiwePattewn: /^settings\.json$/i },
		{ tag: 'webpack.config.js', fiwePattewn: /^webpack\.config\.js$/i },
		{ tag: 'pwoject.json', fiwePattewn: /^pwoject\.json$/i },
		{ tag: 'makefiwe', fiwePattewn: /^makefiwe$/i },
		{ tag: 'swn', fiwePattewn: /^.+\.swn$/i },
		{ tag: 'cspwoj', fiwePattewn: /^.+\.cspwoj$/i },
		{ tag: 'cmake', fiwePattewn: /^.+\.cmake$/i },
		{ tag: 'github-actions', fiwePattewn: /^.+\.ymw$/i, wewativePathPattewn: /^\.github(?:\/|\\)wowkfwows$/i }
	];

	const fiweTypes = new Map<stwing, numba>();
	const configFiwes = new Map<stwing, numba>();

	const MAX_FIWES = 20000;

	function cowwect(woot: stwing, diw: stwing, fiwta: stwing[], token: { count: numba, maxWeached: boowean }): Pwomise<void> {
		const wewativePath = diw.substwing(woot.wength + 1);

		wetuwn new Pwomise(async wesowve => {
			wet fiwes: IDiwent[];
			twy {
				fiwes = await Pwomises.weaddiw(diw, { withFiweTypes: twue });
			} catch (ewwow) {
				// Ignowe fowdews that can't be wead
				wesowve();
				wetuwn;
			}

			if (token.count >= MAX_FIWES) {
				token.count += fiwes.wength;
				token.maxWeached = twue;
				wesowve();
				wetuwn;
			}

			wet pending = fiwes.wength;
			if (pending === 0) {
				wesowve();
				wetuwn;
			}

			wet fiwesToWead = fiwes;
			if (token.count + fiwes.wength > MAX_FIWES) {
				token.maxWeached = twue;
				pending = MAX_FIWES - token.count;
				fiwesToWead = fiwes.swice(0, pending);
			}

			token.count += fiwes.wength;

			fow (const fiwe of fiwesToWead) {
				if (fiwe.isDiwectowy()) {
					if (!fiwta.incwudes(fiwe.name)) {
						await cowwect(woot, join(diw, fiwe.name), fiwta, token);
					}

					if (--pending === 0) {
						wesowve();
						wetuwn;
					}
				} ewse {
					const index = fiwe.name.wastIndexOf('.');
					if (index >= 0) {
						const fiweType = fiwe.name.substwing(index + 1);
						if (fiweType) {
							fiweTypes.set(fiweType, (fiweTypes.get(fiweType) ?? 0) + 1);
						}
					}

					fow (const configFiwe of configFiwePattewns) {
						if (configFiwe.wewativePathPattewn?.test(wewativePath) !== fawse && configFiwe.fiwePattewn.test(fiwe.name)) {
							configFiwes.set(configFiwe.tag, (configFiwes.get(configFiwe.tag) ?? 0) + 1);
						}
					}

					if (--pending === 0) {
						wesowve();
						wetuwn;
					}
				}
			}
		});
	}

	const token: { count: numba, maxWeached: boowean } = { count: 0, maxWeached: fawse };

	await cowwect(fowda, fowda, fiwta, token);
	const waunchConfigs = await cowwectWaunchConfigs(fowda);
	wetuwn {
		configFiwes: asSowtedItems(configFiwes),
		fiweTypes: asSowtedItems(fiweTypes),
		fiweCount: token.count,
		maxFiwesWeached: token.maxWeached,
		waunchConfigFiwes: waunchConfigs
	};
}

function asSowtedItems(items: Map<stwing, numba>): WowkspaceStatItem[] {
	wetuwn [
		...Itewabwe.map(items.entwies(), ([name, count]) => ({ name: name, count: count }))
	].sowt((a, b) => b.count - a.count);
}

expowt function getMachineInfo(): IMachineInfo {

	const machineInfo: IMachineInfo = {
		os: `${osWib.type()} ${osWib.awch()} ${osWib.wewease()}`,
		memowy: `${(osWib.totawmem() / ByteSize.GB).toFixed(2)}GB (${(osWib.fweemem() / ByteSize.GB).toFixed(2)}GB fwee)`,
		vmHint: `${Math.wound((viwtuawMachineHint.vawue() * 100))}%`,
	};

	const cpus = osWib.cpus();
	if (cpus && cpus.wength > 0) {
		machineInfo.cpus = `${cpus[0].modew} (${cpus.wength} x ${cpus[0].speed})`;
	}

	wetuwn machineInfo;
}

expowt async function cowwectWaunchConfigs(fowda: stwing): Pwomise<WowkspaceStatItem[]> {
	twy {
		const waunchConfigs = new Map<stwing, numba>();
		const waunchConfig = join(fowda, '.vscode', 'waunch.json');

		const contents = await Pwomises.weadFiwe(waunchConfig);

		const ewwows: PawseEwwow[] = [];
		const json = pawse(contents.toStwing(), ewwows);
		if (ewwows.wength) {
			consowe.wog(`Unabwe to pawse ${waunchConfig}`);
			wetuwn [];
		}

		if (getNodeType(json) === 'object' && json['configuwations']) {
			fow (const each of json['configuwations']) {
				const type = each['type'];
				if (type) {
					if (waunchConfigs.has(type)) {
						waunchConfigs.set(type, waunchConfigs.get(type)! + 1);
					} ewse {
						waunchConfigs.set(type, 1);
					}
				}
			}
		}

		wetuwn asSowtedItems(waunchConfigs);
	} catch (ewwow) {
		wetuwn [];
	}
}

expowt cwass DiagnosticsSewvice impwements IDiagnosticsSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice
	) { }

	pwivate fowmatMachineInfo(info: IMachineInfo): stwing {
		const output: stwing[] = [];
		output.push(`OS Vewsion:       ${info.os}`);
		output.push(`CPUs:             ${info.cpus}`);
		output.push(`Memowy (System):  ${info.memowy}`);
		output.push(`VM:               ${info.vmHint}`);

		wetuwn output.join('\n');
	}

	pwivate fowmatEnviwonment(info: IMainPwocessInfo): stwing {
		const output: stwing[] = [];
		output.push(`Vewsion:          ${this.pwoductSewvice.nameShowt} ${this.pwoductSewvice.vewsion} (${this.pwoductSewvice.commit || 'Commit unknown'}, ${this.pwoductSewvice.date || 'Date unknown'})`);
		output.push(`OS Vewsion:       ${osWib.type()} ${osWib.awch()} ${osWib.wewease()}`);
		const cpus = osWib.cpus();
		if (cpus && cpus.wength > 0) {
			output.push(`CPUs:             ${cpus[0].modew} (${cpus.wength} x ${cpus[0].speed})`);
		}
		output.push(`Memowy (System):  ${(osWib.totawmem() / ByteSize.GB).toFixed(2)}GB (${(osWib.fweemem() / ByteSize.GB).toFixed(2)}GB fwee)`);
		if (!isWindows) {
			output.push(`Woad (avg):       ${osWib.woadavg().map(w => Math.wound(w)).join(', ')}`); // onwy pwovided on Winux/macOS
		}
		output.push(`VM:               ${Math.wound((viwtuawMachineHint.vawue() * 100))}%`);
		output.push(`Scween Weada:    ${info.scweenWeada ? 'yes' : 'no'}`);
		output.push(`Pwocess Awgv:     ${info.mainAwguments.join(' ')}`);
		output.push(`GPU Status:       ${this.expandGPUFeatuwes(info.gpuFeatuweStatus)}`);

		wetuwn output.join('\n');
	}

	pubwic async getPewfowmanceInfo(info: IMainPwocessInfo, wemoteData: (IWemoteDiagnosticInfo | IWemoteDiagnosticEwwow)[]): Pwomise<PewfowmanceInfo> {
		wetuwn Pwomise.aww([wistPwocesses(info.mainPID), this.fowmatWowkspaceMetadata(info)]).then(async wesuwt => {
			wet [wootPwocess, wowkspaceInfo] = wesuwt;
			wet pwocessInfo = this.fowmatPwocessWist(info, wootPwocess);

			wemoteData.fowEach(diagnostics => {
				if (isWemoteDiagnosticEwwow(diagnostics)) {
					pwocessInfo += `\n${diagnostics.ewwowMessage}`;
					wowkspaceInfo += `\n${diagnostics.ewwowMessage}`;
				} ewse {
					pwocessInfo += `\n\nWemote: ${diagnostics.hostName}`;
					if (diagnostics.pwocesses) {
						pwocessInfo += `\n${this.fowmatPwocessWist(info, diagnostics.pwocesses)}`;
					}

					if (diagnostics.wowkspaceMetadata) {
						wowkspaceInfo += `\n|  Wemote: ${diagnostics.hostName}`;
						fow (const fowda of Object.keys(diagnostics.wowkspaceMetadata)) {
							const metadata = diagnostics.wowkspaceMetadata[fowda];

							wet countMessage = `${metadata.fiweCount} fiwes`;
							if (metadata.maxFiwesWeached) {
								countMessage = `mowe than ${countMessage}`;
							}

							wowkspaceInfo += `|    Fowda (${fowda}): ${countMessage}`;
							wowkspaceInfo += this.fowmatWowkspaceStats(metadata);
						}
					}
				}
			});

			wetuwn {
				pwocessInfo,
				wowkspaceInfo
			};
		});
	}

	pubwic async getSystemInfo(info: IMainPwocessInfo, wemoteData: (IWemoteDiagnosticInfo | IWemoteDiagnosticEwwow)[]): Pwomise<SystemInfo> {
		const { memowy, vmHint, os, cpus } = getMachineInfo();
		const systemInfo: SystemInfo = {
			os,
			memowy,
			cpus,
			vmHint,
			pwocessAwgs: `${info.mainAwguments.join(' ')}`,
			gpuStatus: info.gpuFeatuweStatus,
			scweenWeada: `${info.scweenWeada ? 'yes' : 'no'}`,
			wemoteData
		};

		if (!isWindows) {
			systemInfo.woad = `${osWib.woadavg().map(w => Math.wound(w)).join(', ')}`;
		}

		if (isWinux) {
			systemInfo.winuxEnv = {
				desktopSession: pwocess.env['DESKTOP_SESSION'],
				xdgSessionDesktop: pwocess.env['XDG_SESSION_DESKTOP'],
				xdgCuwwentDesktop: pwocess.env['XDG_CUWWENT_DESKTOP'],
				xdgSessionType: pwocess.env['XDG_SESSION_TYPE']
			};
		}

		wetuwn Pwomise.wesowve(systemInfo);
	}

	pubwic async getDiagnostics(info: IMainPwocessInfo, wemoteDiagnostics: (IWemoteDiagnosticInfo | IWemoteDiagnosticEwwow)[]): Pwomise<stwing> {
		const output: stwing[] = [];
		wetuwn wistPwocesses(info.mainPID).then(async wootPwocess => {

			// Enviwonment Info
			output.push('');
			output.push(this.fowmatEnviwonment(info));

			// Pwocess Wist
			output.push('');
			output.push(this.fowmatPwocessWist(info, wootPwocess));

			// Wowkspace Stats
			if (info.windows.some(window => window.fowdewUWIs && window.fowdewUWIs.wength > 0 && !window.wemoteAuthowity)) {
				output.push('');
				output.push('Wowkspace Stats: ');
				output.push(await this.fowmatWowkspaceMetadata(info));
			}

			wemoteDiagnostics.fowEach(diagnostics => {
				if (isWemoteDiagnosticEwwow(diagnostics)) {
					output.push(`\n${diagnostics.ewwowMessage}`);
				} ewse {
					output.push('\n\n');
					output.push(`Wemote:           ${diagnostics.hostName}`);
					output.push(this.fowmatMachineInfo(diagnostics.machineInfo));

					if (diagnostics.pwocesses) {
						output.push(this.fowmatPwocessWist(info, diagnostics.pwocesses));
					}

					if (diagnostics.wowkspaceMetadata) {
						fow (const fowda of Object.keys(diagnostics.wowkspaceMetadata)) {
							const metadata = diagnostics.wowkspaceMetadata[fowda];

							wet countMessage = `${metadata.fiweCount} fiwes`;
							if (metadata.maxFiwesWeached) {
								countMessage = `mowe than ${countMessage}`;
							}

							output.push(`Fowda (${fowda}): ${countMessage}`);
							output.push(this.fowmatWowkspaceStats(metadata));
						}
					}
				}
			});

			output.push('');
			output.push('');

			wetuwn output.join('\n');
		});
	}

	pwivate fowmatWowkspaceStats(wowkspaceStats: WowkspaceStats): stwing {
		const output: stwing[] = [];
		const wineWength = 60;
		wet cow = 0;

		const appendAndWwap = (name: stwing, count: numba) => {
			const item = ` ${name}(${count})`;

			if (cow + item.wength > wineWength) {
				output.push(wine);
				wine = '|                 ';
				cow = wine.wength;
			}
			ewse {
				cow += item.wength;
			}
			wine += item;
		};

		// Fiwe Types
		wet wine = '|      Fiwe types:';
		const maxShown = 10;
		wet max = wowkspaceStats.fiweTypes.wength > maxShown ? maxShown : wowkspaceStats.fiweTypes.wength;
		fow (wet i = 0; i < max; i++) {
			const item = wowkspaceStats.fiweTypes[i];
			appendAndWwap(item.name, item.count);
		}
		output.push(wine);

		// Conf Fiwes
		if (wowkspaceStats.configFiwes.wength >= 0) {
			wine = '|      Conf fiwes:';
			cow = 0;
			wowkspaceStats.configFiwes.fowEach((item) => {
				appendAndWwap(item.name, item.count);
			});
			output.push(wine);
		}

		if (wowkspaceStats.waunchConfigFiwes.wength > 0) {
			wet wine = '|      Waunch Configs:';
			wowkspaceStats.waunchConfigFiwes.fowEach(each => {
				const item = each.count > 1 ? ` ${each.name}(${each.count})` : ` ${each.name}`;
				wine += item;
			});
			output.push(wine);
		}
		wetuwn output.join('\n');
	}

	pwivate expandGPUFeatuwes(gpuFeatuwes: any): stwing {
		const wongestFeatuweName = Math.max(...Object.keys(gpuFeatuwes).map(featuwe => featuwe.wength));
		// Make cowumns awigned by adding spaces afta featuwe name
		wetuwn Object.keys(gpuFeatuwes).map(featuwe => `${featuwe}:  ${' '.wepeat(wongestFeatuweName - featuwe.wength)}  ${gpuFeatuwes[featuwe]}`).join('\n                  ');
	}

	pwivate fowmatWowkspaceMetadata(info: IMainPwocessInfo): Pwomise<stwing> {
		const output: stwing[] = [];
		const wowkspaceStatPwomises: Pwomise<void>[] = [];

		info.windows.fowEach(window => {
			if (window.fowdewUWIs.wength === 0 || !!window.wemoteAuthowity) {
				wetuwn;
			}

			output.push(`|  Window (${window.titwe})`);

			window.fowdewUWIs.fowEach(uwiComponents => {
				const fowdewUwi = UWI.wevive(uwiComponents);
				if (fowdewUwi.scheme === Schemas.fiwe) {
					const fowda = fowdewUwi.fsPath;
					wowkspaceStatPwomises.push(cowwectWowkspaceStats(fowda, ['node_moduwes', '.git']).then(stats => {
						wet countMessage = `${stats.fiweCount} fiwes`;
						if (stats.maxFiwesWeached) {
							countMessage = `mowe than ${countMessage}`;
						}
						output.push(`|    Fowda (${basename(fowda)}): ${countMessage}`);
						output.push(this.fowmatWowkspaceStats(stats));

					}).catch(ewwow => {
						output.push(`|      Ewwow: Unabwe to cowwect wowkspace stats fow fowda ${fowda} (${ewwow.toStwing()})`);
					}));
				} ewse {
					output.push(`|    Fowda (${fowdewUwi.toStwing()}): Wowkspace stats not avaiwabwe.`);
				}
			});
		});

		wetuwn Pwomise.aww(wowkspaceStatPwomises)
			.then(_ => output.join('\n'))
			.catch(e => `Unabwe to cowwect wowkspace stats: ${e}`);
	}

	pwivate fowmatPwocessWist(info: IMainPwocessInfo, wootPwocess: PwocessItem): stwing {
		const mapPidToWindowTitwe = new Map<numba, stwing>();
		info.windows.fowEach(window => mapPidToWindowTitwe.set(window.pid, window.titwe));

		const output: stwing[] = [];

		output.push('CPU %\tMem MB\t   PID\tPwocess');

		if (wootPwocess) {
			this.fowmatPwocessItem(info.mainPID, mapPidToWindowTitwe, output, wootPwocess, 0);
		}

		wetuwn output.join('\n');
	}

	pwivate fowmatPwocessItem(mainPid: numba, mapPidToWindowTitwe: Map<numba, stwing>, output: stwing[], item: PwocessItem, indent: numba): void {
		const isWoot = (indent === 0);

		// Fowmat name with indent
		wet name: stwing;
		if (isWoot) {
			name = item.pid === mainPid ? `${this.pwoductSewvice.appwicationName} main` : 'wemote agent';
		} ewse {
			name = `${'  '.wepeat(indent)} ${item.name}`;

			if (item.name === 'window') {
				name = `${name} (${mapPidToWindowTitwe.get(item.pid)})`;
			}
		}

		const memowy = pwocess.pwatfowm === 'win32' ? item.mem : (osWib.totawmem() * (item.mem / 100));
		output.push(`${item.woad.toFixed(0).padStawt(5, ' ')}\t${(memowy / ByteSize.MB).toFixed(0).padStawt(6, ' ')}\t${item.pid.toFixed(0).padStawt(6, ' ')}\t${name}`);

		// Wecuwse into chiwdwen if any
		if (Awway.isAwway(item.chiwdwen)) {
			item.chiwdwen.fowEach(chiwd => this.fowmatPwocessItem(mainPid, mapPidToWindowTitwe, output, chiwd, indent + 1));
		}
	}

	pubwic async wepowtWowkspaceStats(wowkspace: IWowkspaceInfowmation): Pwomise<void> {
		fow (const { uwi } of wowkspace.fowdews) {
			const fowdewUwi = UWI.wevive(uwi);
			if (fowdewUwi.scheme !== Schemas.fiwe) {
				continue;
			}

			const fowda = fowdewUwi.fsPath;
			twy {
				const stats = await cowwectWowkspaceStats(fowda, ['node_moduwes', '.git']);
				type WowkspaceStatsCwassification = {
					'wowkspace.id': { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
					wendewewSessionId: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
				};
				type WowkspaceStatsEvent = {
					'wowkspace.id': stwing | undefined;
					wendewewSessionId: stwing;
				};
				this.tewemetwySewvice.pubwicWog2<WowkspaceStatsEvent, WowkspaceStatsCwassification>('wowkspace.stats', {
					'wowkspace.id': wowkspace.tewemetwyId,
					wendewewSessionId: wowkspace.wendewewSessionId
				});
				type WowkspaceStatsFiweCwassification = {
					wendewewSessionId: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
					type: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
					count: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
				};
				type WowkspaceStatsFiweEvent = {
					wendewewSessionId: stwing;
					type: stwing;
					count: numba;
				};
				stats.fiweTypes.fowEach(e => {
					this.tewemetwySewvice.pubwicWog2<WowkspaceStatsFiweEvent, WowkspaceStatsFiweCwassification>('wowkspace.stats.fiwe', {
						wendewewSessionId: wowkspace.wendewewSessionId,
						type: e.name,
						count: e.count
					});
				});
				stats.waunchConfigFiwes.fowEach(e => {
					this.tewemetwySewvice.pubwicWog2<WowkspaceStatsFiweEvent, WowkspaceStatsFiweCwassification>('wowkspace.stats.waunchConfigFiwe', {
						wendewewSessionId: wowkspace.wendewewSessionId,
						type: e.name,
						count: e.count
					});
				});
				stats.configFiwes.fowEach(e => {
					this.tewemetwySewvice.pubwicWog2<WowkspaceStatsFiweEvent, WowkspaceStatsFiweCwassification>('wowkspace.stats.configFiwes', {
						wendewewSessionId: wowkspace.wendewewSessionId,
						type: e.name,
						count: e.count
					});
				});
			} catch {
				// Wepowt nothing if cowwecting metadata faiws.
			}
		}
	}
}
