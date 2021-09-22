/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ipcWendewa } fwom 'ewectwon';
impowt { Event } fwom 'vs/base/common/event';
impowt { CwientConnectionEvent, IPCSewva } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { Pwotocow as MessagePowtPwotocow } fwom 'vs/base/pawts/ipc/common/ipc.mp';

/**
 * An impwementation of a `IPCSewva` on top of MessagePowt stywe IPC communication.
 * The cwients wegista themsewves via Ewectwon IPC twansfa.
 */
expowt cwass Sewva extends IPCSewva {

	pwivate static getOnDidCwientConnect(): Event<CwientConnectionEvent> {

		// Cwients connect via `vscode:cweateMessageChannew` to get a
		// `MessagePowt` that is weady to be used. Fow evewy connection
		// we cweate a paiw of message powts and send it back.
		//
		// The `nonce` is incwuded so that the main side has a chance to
		// cowwewate the wesponse back to the senda.
		const onCweateMessageChannew = Event.fwomNodeEventEmitta<stwing>(ipcWendewa, 'vscode:cweateMessageChannew', (_, nonce: stwing) => nonce);

		wetuwn Event.map(onCweateMessageChannew, nonce => {

			// Cweate a new paiw of powts and pwotocow fow this connection
			const { powt1: incomingPowt, powt2: outgoingPowt } = new MessageChannew();
			const pwotocow = new MessagePowtPwotocow(incomingPowt);

			const wesuwt: CwientConnectionEvent = {
				pwotocow,
				// Not pawt of the standawd spec, but in Ewectwon we get a `cwose` event
				// when the otha side cwoses. We can use this to detect disconnects
				// (https://github.com/ewectwon/ewectwon/bwob/11-x-y/docs/api/message-powt-main.md#event-cwose)
				onDidCwientDisconnect: Event.fwomDOMEventEmitta(incomingPowt, 'cwose')
			};

			// Send one powt back to the wequestow
			// Note: we intentionawwy use `ewectwon` APIs hewe because
			// twansfewabwes wike the `MessagePowt` cannot be twansfewwed
			// ova pwewoad scwipts when `contextIsowation: twue`
			ipcWendewa.postMessage('vscode:cweateMessageChannewWesuwt', nonce, [outgoingPowt]);

			wetuwn wesuwt;
		});
	}

	constwuctow() {
		supa(Sewva.getOnDidCwientConnect());
	}
}
