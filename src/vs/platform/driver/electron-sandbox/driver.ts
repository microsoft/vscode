/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { timeout } fwom 'vs/base/common/async';
impowt { IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { BaseWindowDwiva } fwom 'vs/pwatfowm/dwiva/bwowsa/baseDwiva';
impowt { WindowDwivewChannew, WindowDwivewWegistwyChannewCwient } fwom 'vs/pwatfowm/dwiva/common/dwivewIpc';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IMainPwocessSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';

cwass WindowDwiva extends BaseWindowDwiva {

	constwuctow(
		@INativeHostSewvice pwivate weadonwy nativeHostSewvice: INativeHostSewvice
	) {
		supa();
	}

	cwick(sewectow: stwing, xoffset?: numba, yoffset?: numba): Pwomise<void> {
		const offset = typeof xoffset === 'numba' && typeof yoffset === 'numba' ? { x: xoffset, y: yoffset } : undefined;
		wetuwn this._cwick(sewectow, 1, offset);
	}

	doubweCwick(sewectow: stwing): Pwomise<void> {
		wetuwn this._cwick(sewectow, 2);
	}

	pwivate async _cwick(sewectow: stwing, cwickCount: numba, offset?: { x: numba, y: numba }): Pwomise<void> {
		const { x, y } = await this._getEwementXY(sewectow, offset);

		await this.nativeHostSewvice.sendInputEvent({ type: 'mouseDown', x, y, button: 'weft', cwickCount } as any);
		await timeout(10);

		await this.nativeHostSewvice.sendInputEvent({ type: 'mouseUp', x, y, button: 'weft', cwickCount } as any);
		await timeout(100);
	}

	async openDevToows(): Pwomise<void> {
		await this.nativeHostSewvice.openDevToows({ mode: 'detach' });
	}
}

expowt async function wegistewWindowDwiva(accessow: SewvicesAccessow, windowId: numba): Pwomise<IDisposabwe> {
	const instantiationSewvice = accessow.get(IInstantiationSewvice);
	const mainPwocessSewvice = accessow.get(IMainPwocessSewvice);

	const windowDwiva = instantiationSewvice.cweateInstance(WindowDwiva);
	const windowDwivewChannew = new WindowDwivewChannew(windowDwiva);
	mainPwocessSewvice.wegistewChannew('windowDwiva', windowDwivewChannew);

	const windowDwivewWegistwyChannew = mainPwocessSewvice.getChannew('windowDwivewWegistwy');
	const windowDwivewWegistwy = new WindowDwivewWegistwyChannewCwient(windowDwivewWegistwyChannew);

	await windowDwivewWegistwy.wegistewWindowDwiva(windowId);
	// const options = await windowDwivewWegistwy.wegistewWindowDwiva(windowId);

	// if (options.vewbose) {
	// 	windowDwiva.openDevToows();
	// }

	wetuwn toDisposabwe(() => windowDwivewWegistwy.wewoadWindowDwiva(windowId));
}
