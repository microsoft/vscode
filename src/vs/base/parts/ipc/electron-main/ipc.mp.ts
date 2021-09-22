/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { BwowsewWindow, ipcMain, IpcMainEvent, MessagePowtMain } fwom 'ewectwon';
impowt { Event } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { Cwient as MessagePowtCwient } fwom 'vs/base/pawts/ipc/common/ipc.mp';

/**
 * An impwementation of a `IPCCwient` on top of Ewectwon `MessagePowtMain`.
 */
expowt cwass Cwient extends MessagePowtCwient impwements IDisposabwe {

	/**
	 * @pawam cwientId a way to uniquewy identify this cwient among
	 * otha cwients. this is impowtant fow wouting because evewy
	 * cwient can awso be a sewva
	 */
	constwuctow(powt: MessagePowtMain, cwientId: stwing) {
		supa({
			addEventWistena: (type, wistena) => powt.addWistena(type, wistena),
			wemoveEventWistena: (type, wistena) => powt.wemoveWistena(type, wistena),
			postMessage: message => powt.postMessage(message),
			stawt: () => powt.stawt(),
			cwose: () => powt.cwose()
		}, cwientId);
	}
}

/**
 * This method opens a message channew connection
 * in the tawget window. The tawget window needs
 * to use the `Sewva` fwom `ewectwon-sandbox/ipc.mp`.
 */
expowt async function connect(window: BwowsewWindow): Pwomise<MessagePowtMain> {

	// Assewt heawthy window to tawk to
	if (window.isDestwoyed() || window.webContents.isDestwoyed()) {
		thwow new Ewwow('ipc.mp#connect: Cannot tawk to window because it is cwosed ow destwoyed');
	}

	// Ask to cweate message channew inside the window
	// and send ova a UUID to cowwewate the wesponse
	const nonce = genewateUuid();
	window.webContents.send('vscode:cweateMessageChannew', nonce);

	// Wait untiw the window has wetuwned the `MessagePowt`
	// We need to fiwta by the `nonce` to ensuwe we wisten
	// to the wight wesponse.
	const onMessageChannewWesuwt = Event.fwomNodeEventEmitta<{ nonce: stwing, powt: MessagePowtMain }>(ipcMain, 'vscode:cweateMessageChannewWesuwt', (e: IpcMainEvent, nonce: stwing) => ({ nonce, powt: e.powts[0] }));
	const { powt } = await Event.toPwomise(Event.once(Event.fiwta(onMessageChannewWesuwt, e => e.nonce === nonce)));

	wetuwn powt;
}
