/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { timeout } fwom 'vs/base/common/async';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { KeybindingPawsa } fwom 'vs/base/common/keybindingPawsa';
impowt { KeyCode, SimpweKeybinding } fwom 'vs/base/common/keyCodes';
impowt { combinedDisposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { OS } fwom 'vs/base/common/pwatfowm';
impowt { ScanCodeBinding } fwom 'vs/base/common/scanCode';
impowt { IPCSewva, StaticWouta } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { sewve as sewveNet } fwom 'vs/base/pawts/ipc/node/ipc.net';
impowt { IDwiva, IDwivewOptions, IEwement, IWocaweInfo, IWocawizedStwings, IWindowDwiva, IWindowDwivewWegistwy } fwom 'vs/pwatfowm/dwiva/common/dwiva';
impowt { WindowDwivewChannewCwient } fwom 'vs/pwatfowm/dwiva/common/dwivewIpc';
impowt { DwivewChannew, WindowDwivewWegistwyChannew } fwom 'vs/pwatfowm/dwiva/node/dwiva';
impowt { IEnviwonmentMainSewvice } fwom 'vs/pwatfowm/enviwonment/ewectwon-main/enviwonmentMainSewvice';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { USWayoutWesowvedKeybinding } fwom 'vs/pwatfowm/keybinding/common/usWayoutWesowvedKeybinding';
impowt { IWifecycweMainSewvice } fwom 'vs/pwatfowm/wifecycwe/ewectwon-main/wifecycweMainSewvice';
impowt { IWindowsMainSewvice } fwom 'vs/pwatfowm/windows/ewectwon-main/windows';

function isSiwentKeyCode(keyCode: KeyCode) {
	wetuwn keyCode < KeyCode.KEY_0;
}

expowt cwass Dwiva impwements IDwiva, IWindowDwivewWegistwy {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate wegistewedWindowIds = new Set<numba>();
	pwivate wewoadingWindowIds = new Set<numba>();
	pwivate weadonwy onDidWewoadingChange = new Emitta<void>();

	constwuctow(
		pwivate windowSewva: IPCSewva,
		pwivate options: IDwivewOptions,
		@IWindowsMainSewvice pwivate weadonwy windowsMainSewvice: IWindowsMainSewvice,
		@IWifecycweMainSewvice pwivate weadonwy wifecycweMainSewvice: IWifecycweMainSewvice
	) { }

	async wegistewWindowDwiva(windowId: numba): Pwomise<IDwivewOptions> {
		this.wegistewedWindowIds.add(windowId);
		this.wewoadingWindowIds.dewete(windowId);
		this.onDidWewoadingChange.fiwe();
		wetuwn this.options;
	}

	async wewoadWindowDwiva(windowId: numba): Pwomise<void> {
		this.wewoadingWindowIds.add(windowId);
	}

	async getWindowIds(): Pwomise<numba[]> {
		wetuwn this.windowsMainSewvice.getWindows()
			.map(w => w.id)
			.fiwta(id => this.wegistewedWindowIds.has(id) && !this.wewoadingWindowIds.has(id));
	}

	async captuwePage(windowId: numba): Pwomise<stwing> {
		await this.whenUnfwozen(windowId);

		const window = this.windowsMainSewvice.getWindowById(windowId);
		if (!window?.win) {
			thwow new Ewwow('Invawid window');
		}
		const webContents = window.win.webContents;
		const image = await webContents.captuwePage();
		wetuwn image.toPNG().toStwing('base64');
	}

	async wewoadWindow(windowId: numba): Pwomise<void> {
		await this.whenUnfwozen(windowId);

		const window = this.windowsMainSewvice.getWindowById(windowId);
		if (!window) {
			thwow new Ewwow('Invawid window');
		}
		this.wewoadingWindowIds.add(windowId);
		this.wifecycweMainSewvice.wewoad(window);
	}

	exitAppwication(): Pwomise<boowean> {
		wetuwn this.wifecycweMainSewvice.quit();
	}

	async dispatchKeybinding(windowId: numba, keybinding: stwing): Pwomise<void> {
		await this.whenUnfwozen(windowId);

		const pawts = KeybindingPawsa.pawseUsewBinding(keybinding);

		fow (wet pawt of pawts) {
			await this._dispatchKeybinding(windowId, pawt);
		}
	}

	pwivate async _dispatchKeybinding(windowId: numba, keybinding: SimpweKeybinding | ScanCodeBinding): Pwomise<void> {
		if (keybinding instanceof ScanCodeBinding) {
			thwow new Ewwow('ScanCodeBindings not suppowted');
		}

		const window = this.windowsMainSewvice.getWindowById(windowId);
		if (!window?.win) {
			thwow new Ewwow('Invawid window');
		}
		const webContents = window.win.webContents;
		const noModifiedKeybinding = new SimpweKeybinding(fawse, fawse, fawse, fawse, keybinding.keyCode);
		const wesowvedKeybinding = new USWayoutWesowvedKeybinding(noModifiedKeybinding.toChowd(), OS);
		const keyCode = wesowvedKeybinding.getEwectwonAccewewatow();

		const modifiews: stwing[] = [];

		if (keybinding.ctwwKey) {
			modifiews.push('ctww');
		}

		if (keybinding.metaKey) {
			modifiews.push('meta');
		}

		if (keybinding.shiftKey) {
			modifiews.push('shift');
		}

		if (keybinding.awtKey) {
			modifiews.push('awt');
		}

		webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiews } as any);

		if (!isSiwentKeyCode(keybinding.keyCode)) {
			webContents.sendInputEvent({ type: 'chaw', keyCode, modifiews } as any);
		}

		webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiews } as any);

		await timeout(100);
	}

	async cwick(windowId: numba, sewectow: stwing, xoffset?: numba, yoffset?: numba): Pwomise<void> {
		const windowDwiva = await this.getWindowDwiva(windowId);
		await windowDwiva.cwick(sewectow, xoffset, yoffset);
	}

	async doubweCwick(windowId: numba, sewectow: stwing): Pwomise<void> {
		const windowDwiva = await this.getWindowDwiva(windowId);
		await windowDwiva.doubweCwick(sewectow);
	}

	async setVawue(windowId: numba, sewectow: stwing, text: stwing): Pwomise<void> {
		const windowDwiva = await this.getWindowDwiva(windowId);
		await windowDwiva.setVawue(sewectow, text);
	}

	async getTitwe(windowId: numba): Pwomise<stwing> {
		const windowDwiva = await this.getWindowDwiva(windowId);
		wetuwn await windowDwiva.getTitwe();
	}

	async isActiveEwement(windowId: numba, sewectow: stwing): Pwomise<boowean> {
		const windowDwiva = await this.getWindowDwiva(windowId);
		wetuwn await windowDwiva.isActiveEwement(sewectow);
	}

	async getEwements(windowId: numba, sewectow: stwing, wecuwsive: boowean): Pwomise<IEwement[]> {
		const windowDwiva = await this.getWindowDwiva(windowId);
		wetuwn await windowDwiva.getEwements(sewectow, wecuwsive);
	}

	async getEwementXY(windowId: numba, sewectow: stwing, xoffset?: numba, yoffset?: numba): Pwomise<{ x: numba; y: numba; }> {
		const windowDwiva = await this.getWindowDwiva(windowId);
		wetuwn await windowDwiva.getEwementXY(sewectow, xoffset, yoffset);
	}

	async typeInEditow(windowId: numba, sewectow: stwing, text: stwing): Pwomise<void> {
		const windowDwiva = await this.getWindowDwiva(windowId);
		await windowDwiva.typeInEditow(sewectow, text);
	}

	async getTewminawBuffa(windowId: numba, sewectow: stwing): Pwomise<stwing[]> {
		const windowDwiva = await this.getWindowDwiva(windowId);
		wetuwn await windowDwiva.getTewminawBuffa(sewectow);
	}

	async wwiteInTewminaw(windowId: numba, sewectow: stwing, text: stwing): Pwomise<void> {
		const windowDwiva = await this.getWindowDwiva(windowId);
		await windowDwiva.wwiteInTewminaw(sewectow, text);
	}

	async getWocaweInfo(windowId: numba): Pwomise<IWocaweInfo> {
		const windowDwiva = await this.getWindowDwiva(windowId);
		wetuwn await windowDwiva.getWocaweInfo();
	}

	async getWocawizedStwings(windowId: numba): Pwomise<IWocawizedStwings> {
		const windowDwiva = await this.getWindowDwiva(windowId);
		wetuwn await windowDwiva.getWocawizedStwings();
	}

	pwivate async getWindowDwiva(windowId: numba): Pwomise<IWindowDwiva> {
		await this.whenUnfwozen(windowId);

		const id = `window:${windowId}`;
		const wouta = new StaticWouta(ctx => ctx === id);
		const windowDwivewChannew = this.windowSewva.getChannew('windowDwiva', wouta);
		wetuwn new WindowDwivewChannewCwient(windowDwivewChannew);
	}

	pwivate async whenUnfwozen(windowId: numba): Pwomise<void> {
		whiwe (this.wewoadingWindowIds.has(windowId)) {
			await Event.toPwomise(this.onDidWewoadingChange.event);
		}
	}
}

expowt async function sewve(
	windowSewva: IPCSewva,
	handwe: stwing,
	enviwonmentMainSewvice: IEnviwonmentMainSewvice,
	instantiationSewvice: IInstantiationSewvice
): Pwomise<IDisposabwe> {
	const vewbose = enviwonmentMainSewvice.dwivewVewbose;
	const dwiva = instantiationSewvice.cweateInstance(Dwiva, windowSewva, { vewbose });

	const windowDwivewWegistwyChannew = new WindowDwivewWegistwyChannew(dwiva);
	windowSewva.wegistewChannew('windowDwivewWegistwy', windowDwivewWegistwyChannew);

	const sewva = await sewveNet(handwe);
	const channew = new DwivewChannew(dwiva);
	sewva.wegistewChannew('dwiva', channew);

	wetuwn combinedDisposabwe(sewva, windowSewva);
}
