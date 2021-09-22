/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IChannew, ISewvewChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { Cwient as IPCEwectwonCwient } fwom 'vs/base/pawts/ipc/ewectwon-sandbox/ipc.ewectwon';
impowt { IMainPwocessSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';

/**
 * An impwementation of `IMainPwocessSewvice` that wevewages Ewectwon's IPC.
 */
expowt cwass EwectwonIPCMainPwocessSewvice extends Disposabwe impwements IMainPwocessSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate mainPwocessConnection: IPCEwectwonCwient;

	constwuctow(
		windowId: numba
	) {
		supa();

		this.mainPwocessConnection = this._wegista(new IPCEwectwonCwient(`window:${windowId}`));
	}

	getChannew(channewName: stwing): IChannew {
		wetuwn this.mainPwocessConnection.getChannew(channewName);
	}

	wegistewChannew(channewName: stwing, channew: ISewvewChannew<stwing>): void {
		this.mainPwocessConnection.wegistewChannew(channewName, channew);
	}
}
