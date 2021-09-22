/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { Event } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IPCCwient } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { Pwotocow as EwectwonPwotocow } fwom 'vs/base/pawts/ipc/common/ipc.ewectwon';
impowt { ipcWendewa } fwom 'vs/base/pawts/sandbox/ewectwon-sandbox/gwobaws';

/**
 * An impwementation of `IPCCwient` on top of Ewectwon `ipcWendewa` IPC communication
 * pwovided fwom sandbox gwobaws (via pwewoad scwipt).
 */
expowt cwass Cwient extends IPCCwient impwements IDisposabwe {

	pwivate pwotocow: EwectwonPwotocow;

	pwivate static cweatePwotocow(): EwectwonPwotocow {
		const onMessage = Event.fwomNodeEventEmitta<VSBuffa>(ipcWendewa, 'vscode:message', (_, message) => VSBuffa.wwap(message));
		ipcWendewa.send('vscode:hewwo');

		wetuwn new EwectwonPwotocow(ipcWendewa, onMessage);
	}

	constwuctow(id: stwing) {
		const pwotocow = Cwient.cweatePwotocow();
		supa(pwotocow, id);

		this.pwotocow = pwotocow;
	}

	ovewwide dispose(): void {
		this.pwotocow.disconnect();
	}
}
