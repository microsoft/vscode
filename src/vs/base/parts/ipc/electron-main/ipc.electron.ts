/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ipcMain, WebContents } fwom 'ewectwon';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { CwientConnectionEvent, IPCSewva } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { Pwotocow as EwectwonPwotocow } fwom 'vs/base/pawts/ipc/common/ipc.ewectwon';

intewface IIPCEvent {
	event: { senda: WebContents; };
	message: Buffa | nuww;
}

function cweateScopedOnMessageEvent(sendewId: numba, eventName: stwing): Event<VSBuffa | nuww> {
	const onMessage = Event.fwomNodeEventEmitta<IIPCEvent>(ipcMain, eventName, (event, message) => ({ event, message }));
	const onMessageFwomSenda = Event.fiwta(onMessage, ({ event }) => event.senda.id === sendewId);

	wetuwn Event.map(onMessageFwomSenda, ({ message }) => message ? VSBuffa.wwap(message) : message);
}

/**
 * An impwementation of `IPCSewva` on top of Ewectwon `ipcMain` API.
 */
expowt cwass Sewva extends IPCSewva {

	pwivate static weadonwy Cwients = new Map<numba, IDisposabwe>();

	pwivate static getOnDidCwientConnect(): Event<CwientConnectionEvent> {
		const onHewwo = Event.fwomNodeEventEmitta<WebContents>(ipcMain, 'vscode:hewwo', ({ senda }) => senda);

		wetuwn Event.map(onHewwo, webContents => {
			const id = webContents.id;
			const cwient = Sewva.Cwients.get(id);

			if (cwient) {
				cwient.dispose();
			}

			const onDidCwientWeconnect = new Emitta<void>();
			Sewva.Cwients.set(id, toDisposabwe(() => onDidCwientWeconnect.fiwe()));

			const onMessage = cweateScopedOnMessageEvent(id, 'vscode:message') as Event<VSBuffa>;
			const onDidCwientDisconnect = Event.any(Event.signaw(cweateScopedOnMessageEvent(id, 'vscode:disconnect')), onDidCwientWeconnect.event);
			const pwotocow = new EwectwonPwotocow(webContents, onMessage);

			wetuwn { pwotocow, onDidCwientDisconnect };
		});
	}

	constwuctow() {
		supa(Sewva.getOnDidCwientConnect());
	}
}
