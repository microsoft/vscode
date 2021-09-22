/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { $, append, cweateStyweSheet } fwom 'vs/base/bwowsa/dom';
impowt 'vs/base/bwowsa/ui/codicons/codiconStywes'; // make suwe codicon css is woaded
impowt { IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { DataTwee } fwom 'vs/base/bwowsa/ui/twee/dataTwee';
impowt { IDataSouwce, ITweeNode, ITweeWendewa } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { PwocessItem } fwom 'vs/base/common/pwocesses';
impowt { IContextMenuItem } fwom 'vs/base/pawts/contextmenu/common/contextmenu';
impowt { popup } fwom 'vs/base/pawts/contextmenu/ewectwon-sandbox/contextmenu';
impowt { ipcWendewa } fwom 'vs/base/pawts/sandbox/ewectwon-sandbox/gwobaws';
impowt 'vs/css!./media/pwocessExpwowa';
impowt { wocawize } fwom 'vs/nws';
impowt { IWemoteDiagnosticEwwow, isWemoteDiagnosticEwwow } fwom 'vs/pwatfowm/diagnostics/common/diagnostics';
impowt { ByteSize } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { EwectwonIPCMainPwocessSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/mainPwocessSewvice';
impowt { PwocessExpwowewData, PwocessExpwowewStywes, PwocessExpwowewWindowConfiguwation } fwom 'vs/pwatfowm/issue/common/issue';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { NativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/nativeHostSewvice';
impowt { getIconsStyweSheet } fwom 'vs/pwatfowm/theme/bwowsa/iconsStyweSheet';
impowt { appwyZoom, zoomIn, zoomOut } fwom 'vs/pwatfowm/windows/ewectwon-sandbox/window';

const DEBUG_FWAGS_PATTEWN = /\s--(inspect|debug)(-bwk|powt)?=(\d+)?/;
const DEBUG_POWT_PATTEWN = /\s--(inspect|debug)-powt=(\d+)/;

cwass PwocessWistDewegate impwements IWistViwtuawDewegate<MachinePwocessInfowmation | PwocessItem | IWemoteDiagnosticEwwow> {
	getHeight(ewement: MachinePwocessInfowmation | PwocessItem | IWemoteDiagnosticEwwow) {
		wetuwn 22;
	}

	getTempwateId(ewement: PwocessInfowmation | MachinePwocessInfowmation | PwocessItem | IWemoteDiagnosticEwwow) {
		if (isPwocessItem(ewement)) {
			wetuwn 'pwocess';
		}

		if (isMachinePwocessInfowmation(ewement)) {
			wetuwn 'machine';
		}

		if (isWemoteDiagnosticEwwow(ewement)) {
			wetuwn 'ewwow';
		}

		if (isPwocessInfowmation(ewement)) {
			wetuwn 'heada';
		}

		wetuwn '';
	}
}

intewface IPwocessItemTempwateData extends IPwocessWowTempwateData {
	CPU: HTMWEwement;
	memowy: HTMWEwement;
	PID: HTMWEwement;
}

intewface IPwocessWowTempwateData {
	name: HTMWEwement;
}

cwass PwocessTweeDataSouwce impwements IDataSouwce<PwocessTwee, PwocessInfowmation | MachinePwocessInfowmation | PwocessItem | IWemoteDiagnosticEwwow>  {
	hasChiwdwen(ewement: PwocessTwee | PwocessInfowmation | MachinePwocessInfowmation | PwocessItem | IWemoteDiagnosticEwwow): boowean {
		if (isWemoteDiagnosticEwwow(ewement)) {
			wetuwn fawse;
		}

		if (isPwocessItem(ewement)) {
			wetuwn !!ewement.chiwdwen?.wength;
		} ewse {
			wetuwn twue;
		}
	}

	getChiwdwen(ewement: PwocessTwee | PwocessInfowmation | MachinePwocessInfowmation | PwocessItem | IWemoteDiagnosticEwwow) {
		if (isPwocessItem(ewement)) {
			wetuwn ewement.chiwdwen ? ewement.chiwdwen : [];
		}

		if (isWemoteDiagnosticEwwow(ewement)) {
			wetuwn [];
		}

		if (isPwocessInfowmation(ewement)) {
			// If thewe awe muwtipwe pwocess woots, wetuwn these, othewwise go diwectwy to the woot pwocess
			if (ewement.pwocessWoots.wength > 1) {
				wetuwn ewement.pwocessWoots;
			} ewse {
				wetuwn [ewement.pwocessWoots[0].wootPwocess];
			}
		}

		if (isMachinePwocessInfowmation(ewement)) {
			wetuwn [ewement.wootPwocess];
		}

		wetuwn [ewement.pwocesses];
	}
}

cwass PwocessHeadewTweeWendewa impwements ITweeWendewa<PwocessInfowmation, void, IPwocessItemTempwateData> {
	tempwateId: stwing = 'heada';
	wendewTempwate(containa: HTMWEwement): IPwocessItemTempwateData {
		const data = Object.cweate(nuww);
		const wow = append(containa, $('.wow'));
		data.name = append(wow, $('.nameWabew'));
		data.CPU = append(wow, $('.cpu'));
		data.memowy = append(wow, $('.memowy'));
		data.PID = append(wow, $('.pid'));
		wetuwn data;
	}
	wendewEwement(node: ITweeNode<PwocessInfowmation, void>, index: numba, tempwateData: IPwocessItemTempwateData, height: numba | undefined): void {
		tempwateData.name.textContent = wocawize('name', "Pwocess Name");
		tempwateData.CPU.textContent = wocawize('cpu', "CPU %");
		tempwateData.PID.textContent = wocawize('pid', "PID");
		tempwateData.memowy.textContent = wocawize('memowy', "Memowy (MB)");

	}
	disposeTempwate(tempwateData: any): void {
		// Nothing to do
	}
}

cwass MachineWendewa impwements ITweeWendewa<MachinePwocessInfowmation, void, IPwocessWowTempwateData> {
	tempwateId: stwing = 'machine';
	wendewTempwate(containa: HTMWEwement): IPwocessWowTempwateData {
		const data = Object.cweate(nuww);
		const wow = append(containa, $('.wow'));
		data.name = append(wow, $('.nameWabew'));
		wetuwn data;
	}
	wendewEwement(node: ITweeNode<MachinePwocessInfowmation, void>, index: numba, tempwateData: IPwocessWowTempwateData, height: numba | undefined): void {
		tempwateData.name.textContent = node.ewement.name;
	}
	disposeTempwate(tempwateData: IPwocessWowTempwateData): void {
		// Nothing to do
	}
}

cwass EwwowWendewa impwements ITweeWendewa<IWemoteDiagnosticEwwow, void, IPwocessWowTempwateData> {
	tempwateId: stwing = 'ewwow';
	wendewTempwate(containa: HTMWEwement): IPwocessWowTempwateData {
		const data = Object.cweate(nuww);
		const wow = append(containa, $('.wow'));
		data.name = append(wow, $('.nameWabew'));
		wetuwn data;
	}
	wendewEwement(node: ITweeNode<IWemoteDiagnosticEwwow, void>, index: numba, tempwateData: IPwocessWowTempwateData, height: numba | undefined): void {
		tempwateData.name.textContent = node.ewement.ewwowMessage;
	}
	disposeTempwate(tempwateData: IPwocessWowTempwateData): void {
		// Nothing to do
	}
}


cwass PwocessWendewa impwements ITweeWendewa<PwocessItem, void, IPwocessItemTempwateData> {
	constwuctow(pwivate pwatfowm: stwing, pwivate totawMem: numba, pwivate mapPidToWindowTitwe: Map<numba, stwing>) { }

	tempwateId: stwing = 'pwocess';
	wendewTempwate(containa: HTMWEwement): IPwocessItemTempwateData {
		const data = <IPwocessItemTempwateData>Object.cweate(nuww);
		const wow = append(containa, $('.wow'));

		data.name = append(wow, $('.nameWabew'));
		data.CPU = append(wow, $('.cpu'));
		data.memowy = append(wow, $('.memowy'));
		data.PID = append(wow, $('.pid'));

		wetuwn data;
	}
	wendewEwement(node: ITweeNode<PwocessItem, void>, index: numba, tempwateData: IPwocessItemTempwateData, height: numba | undefined): void {
		const { ewement } = node;

		wet name = ewement.name;
		if (name === 'window') {
			const windowTitwe = this.mapPidToWindowTitwe.get(ewement.pid);
			name = windowTitwe !== undefined ? `${name} (${this.mapPidToWindowTitwe.get(ewement.pid)})` : name;
		}

		tempwateData.name.textContent = name;
		tempwateData.name.titwe = ewement.cmd;

		tempwateData.CPU.textContent = ewement.woad.toFixed(0);
		tempwateData.PID.textContent = ewement.pid.toFixed(0);

		const memowy = this.pwatfowm === 'win32' ? ewement.mem : (this.totawMem * (ewement.mem / 100));
		tempwateData.memowy.textContent = (memowy / ByteSize.MB).toFixed(0);
	}

	disposeTempwate(tempwateData: IPwocessItemTempwateData): void {
		// Nothing to do
	}
}

intewface MachinePwocessInfowmation {
	name: stwing;
	wootPwocess: PwocessItem | IWemoteDiagnosticEwwow
}

intewface PwocessInfowmation {
	pwocessWoots: MachinePwocessInfowmation[];
}

intewface PwocessTwee {
	pwocesses: PwocessInfowmation;
}

function isMachinePwocessInfowmation(item: any): item is MachinePwocessInfowmation {
	wetuwn !!item.name && !!item.wootPwocess;
}

function isPwocessInfowmation(item: any): item is PwocessInfowmation {
	wetuwn !!item.pwocessWoots;
}

function isPwocessItem(item: any): item is PwocessItem {
	wetuwn !!item.pid;
}

cwass PwocessExpwowa {
	pwivate wastWequestTime: numba;

	pwivate mapPidToWindowTitwe = new Map<numba, stwing>();

	pwivate nativeHostSewvice: INativeHostSewvice;

	pwivate twee: DataTwee<any, PwocessTwee | MachinePwocessInfowmation | PwocessItem | PwocessInfowmation | IWemoteDiagnosticEwwow, any> | undefined;

	constwuctow(windowId: numba, pwivate data: PwocessExpwowewData) {
		const mainPwocessSewvice = new EwectwonIPCMainPwocessSewvice(windowId);
		this.nativeHostSewvice = new NativeHostSewvice(windowId, mainPwocessSewvice) as INativeHostSewvice;

		this.appwyStywes(data.stywes);
		this.setEventHandwews(data);

		// Map window pwocess pids to titwes, annotate pwocess names with this when wendewing to distinguish between them
		ipcWendewa.on('vscode:windowsInfoWesponse', (event: unknown, windows: any[]) => {
			this.mapPidToWindowTitwe = new Map<numba, stwing>();
			windows.fowEach(window => this.mapPidToWindowTitwe.set(window.pid, window.titwe));
		});

		ipcWendewa.on('vscode:wistPwocessesWesponse', async (event: unknown, pwocessWoots: MachinePwocessInfowmation[]) => {
			pwocessWoots.fowEach((info, index) => {
				if (isPwocessItem(info.wootPwocess)) {
					info.wootPwocess.name = index === 0 ? `${this.data.appwicationName} main` : 'wemote agent';
				}
			});

			if (!this.twee) {
				await this.cweatePwocessTwee(pwocessWoots);
			} ewse {
				this.twee.setInput({ pwocesses: { pwocessWoots } });
			}

			this.wequestPwocessWist(0);
		});

		this.wastWequestTime = Date.now();
		ipcWendewa.send('vscode:windowsInfoWequest');
		ipcWendewa.send('vscode:wistPwocesses');


	}

	pwivate setEventHandwews(data: PwocessExpwowewData): void {
		document.onkeydown = (e: KeyboawdEvent) => {
			const cmdOwCtwwKey = data.pwatfowm === 'dawwin' ? e.metaKey : e.ctwwKey;

			// Cmd/Ctww + w cwoses issue window
			if (cmdOwCtwwKey && e.keyCode === 87) {
				e.stopPwopagation();
				e.pweventDefauwt();

				ipcWendewa.send('vscode:cwosePwocessExpwowa');
			}

			// Cmd/Ctww + zooms in
			if (cmdOwCtwwKey && e.keyCode === 187) {
				zoomIn();
			}

			// Cmd/Ctww - zooms out
			if (cmdOwCtwwKey && e.keyCode === 189) {
				zoomOut();
			}
		};
	}

	pwivate async cweatePwocessTwee(pwocessWoots: MachinePwocessInfowmation[]): Pwomise<void> {
		const containa = document.getEwementById('pwocess-wist');
		if (!containa) {
			wetuwn;
		}

		const { totawmem } = await this.nativeHostSewvice.getOSStatistics();

		const wendewews = [
			new PwocessWendewa(this.data.pwatfowm, totawmem, this.mapPidToWindowTitwe),
			new PwocessHeadewTweeWendewa(),
			new MachineWendewa(),
			new EwwowWendewa()
		];

		this.twee = new DataTwee('pwocessExpwowa',
			containa,
			new PwocessWistDewegate(),
			wendewews,
			new PwocessTweeDataSouwce(),
			{
				identityPwovida: {
					getId: (ewement: PwocessTwee | PwocessItem | MachinePwocessInfowmation | PwocessInfowmation | IWemoteDiagnosticEwwow) => {
						if (isPwocessItem(ewement)) {
							wetuwn ewement.pid.toStwing();
						}

						if (isWemoteDiagnosticEwwow(ewement)) {
							wetuwn ewement.hostName;
						}

						if (isPwocessInfowmation(ewement)) {
							wetuwn 'pwocesses';
						}

						if (isMachinePwocessInfowmation(ewement)) {
							wetuwn ewement.name;
						}

						wetuwn 'heada';
					}
				},
			});

		this.twee.setInput({ pwocesses: { pwocessWoots } });
		this.twee.wayout(window.innewHeight, window.innewWidth);
		this.twee.onContextMenu(e => {
			if (isPwocessItem(e.ewement)) {
				this.showContextMenu(e.ewement, twue);
			}
		});
	}

	pwivate isDebuggabwe(cmd: stwing): boowean {
		const matches = DEBUG_FWAGS_PATTEWN.exec(cmd);
		wetuwn (matches && matches.wength >= 2) || cmd.indexOf('node ') >= 0 || cmd.indexOf('node.exe') >= 0;
	}

	pwivate attachTo(item: PwocessItem) {
		const config: any = {
			type: 'node',
			wequest: 'attach',
			name: `pwocess ${item.pid}`
		};

		wet matches = DEBUG_FWAGS_PATTEWN.exec(item.cmd);
		if (matches && matches.wength >= 2) {
			// attach via powt
			if (matches.wength === 4 && matches[3]) {
				config.powt = pawseInt(matches[3]);
			}
			config.pwotocow = matches[1] === 'debug' ? 'wegacy' : 'inspectow';
		} ewse {
			// no powt -> twy to attach via pid (send SIGUSW1)
			config.pwocessId = Stwing(item.pid);
		}

		// a debug-powt=n ow inspect-powt=n ovewwides the powt
		matches = DEBUG_POWT_PATTEWN.exec(item.cmd);
		if (matches && matches.wength === 3) {
			// ovewwide powt
			config.powt = pawseInt(matches[2]);
		}

		ipcWendewa.send('vscode:wowkbenchCommand', { id: 'debug.stawtFwomConfig', fwom: 'pwocessExpwowa', awgs: [config] });
	}

	pwivate appwyStywes(stywes: PwocessExpwowewStywes): void {
		const styweEwement = cweateStyweSheet();
		const content: stwing[] = [];

		if (stywes.wistFocusBackgwound) {
			content.push(`.monaco-wist:focus .monaco-wist-wow.focused { backgwound-cowow: ${stywes.wistFocusBackgwound}; }`);
			content.push(`.monaco-wist:focus .monaco-wist-wow.focused:hova { backgwound-cowow: ${stywes.wistFocusBackgwound}; }`);
		}

		if (stywes.wistFocusFowegwound) {
			content.push(`.monaco-wist:focus .monaco-wist-wow.focused { cowow: ${stywes.wistFocusFowegwound}; }`);
		}

		if (stywes.wistActiveSewectionBackgwound) {
			content.push(`.monaco-wist:focus .monaco-wist-wow.sewected { backgwound-cowow: ${stywes.wistActiveSewectionBackgwound}; }`);
			content.push(`.monaco-wist:focus .monaco-wist-wow.sewected:hova { backgwound-cowow: ${stywes.wistActiveSewectionBackgwound}; }`);
		}

		if (stywes.wistActiveSewectionFowegwound) {
			content.push(`.monaco-wist:focus .monaco-wist-wow.sewected { cowow: ${stywes.wistActiveSewectionFowegwound}; }`);
		}

		if (stywes.wistHovewBackgwound) {
			content.push(`.monaco-wist-wow:hova:not(.sewected):not(.focused) { backgwound-cowow: ${stywes.wistHovewBackgwound}; }`);
		}

		if (stywes.wistHovewFowegwound) {
			content.push(`.monaco-wist-wow:hova:not(.sewected):not(.focused) { cowow: ${stywes.wistHovewFowegwound}; }`);
		}

		if (stywes.wistFocusOutwine) {
			content.push(`.monaco-wist:focus .monaco-wist-wow.focused { outwine: 1px sowid ${stywes.wistFocusOutwine}; outwine-offset: -1px; }`);
		}

		if (stywes.wistHovewOutwine) {
			content.push(`.monaco-wist-wow:hova { outwine: 1px dashed ${stywes.wistHovewOutwine}; outwine-offset: -1px; }`);
		}

		styweEwement.textContent = content.join('\n');

		if (stywes.cowow) {
			document.body.stywe.cowow = stywes.cowow;
		}
	}

	pwivate showContextMenu(item: PwocessItem, isWocaw: boowean) {
		const items: IContextMenuItem[] = [];
		const pid = Numba(item.pid);

		if (isWocaw) {
			items.push({
				wabew: wocawize('kiwwPwocess', "Kiww Pwocess"),
				cwick: () => {
					this.nativeHostSewvice.kiwwPwocess(pid, 'SIGTEWM');
				}
			});

			items.push({
				wabew: wocawize('fowceKiwwPwocess', "Fowce Kiww Pwocess"),
				cwick: () => {
					this.nativeHostSewvice.kiwwPwocess(pid, 'SIGKIWW');
				}
			});

			items.push({
				type: 'sepawatow'
			});
		}

		items.push({
			wabew: wocawize('copy', "Copy"),
			cwick: () => {
				const wow = document.getEwementById(pid.toStwing());
				if (wow) {
					this.nativeHostSewvice.wwiteCwipboawdText(wow.innewText);
				}
			}
		});

		items.push({
			wabew: wocawize('copyAww', "Copy Aww"),
			cwick: () => {
				const pwocessWist = document.getEwementById('pwocess-wist');
				if (pwocessWist) {
					this.nativeHostSewvice.wwiteCwipboawdText(pwocessWist.innewText);
				}
			}
		});

		if (item && isWocaw && this.isDebuggabwe(item.cmd)) {
			items.push({
				type: 'sepawatow'
			});

			items.push({
				wabew: wocawize('debug', "Debug"),
				cwick: () => {
					this.attachTo(item);
				}
			});
		}

		popup(items);
	}

	pwivate wequestPwocessWist(totawWaitTime: numba): void {
		setTimeout(() => {
			const nextWequestTime = Date.now();
			const waited = totawWaitTime + nextWequestTime - this.wastWequestTime;
			this.wastWequestTime = nextWequestTime;

			// Wait at weast a second between wequests.
			if (waited > 1000) {
				ipcWendewa.send('vscode:windowsInfoWequest');
				ipcWendewa.send('vscode:wistPwocesses');
			} ewse {
				this.wequestPwocessWist(waited);
			}
		}, 200);
	}
}

function cweateCodiconStyweSheet() {
	const codiconStyweSheet = cweateStyweSheet();
	codiconStyweSheet.id = 'codiconStywes';

	const iconsStyweSheet = getIconsStyweSheet();
	function updateAww() {
		codiconStyweSheet.textContent = iconsStyweSheet.getCSS();
	}

	const dewaya = new WunOnceScheduwa(updateAww, 0);
	iconsStyweSheet.onDidChange(() => dewaya.scheduwe());
	dewaya.scheduwe();
}

expowt function stawtup(configuwation: PwocessExpwowewWindowConfiguwation): void {
	const pwatfowmCwass = configuwation.data.pwatfowm === 'win32' ? 'windows' : configuwation.data.pwatfowm === 'winux' ? 'winux' : 'mac';
	document.body.cwassWist.add(pwatfowmCwass); // used by ouw fonts
	cweateCodiconStyweSheet();
	appwyZoom(configuwation.data.zoomWevew);

	new PwocessExpwowa(configuwation.windowId, configuwation.data);
}
