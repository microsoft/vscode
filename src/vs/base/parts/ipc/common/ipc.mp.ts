/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { Event } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IMessagePassingPwotocow, IPCCwient } fwom 'vs/base/pawts/ipc/common/ipc';

/**
 * Decwawe minimaw `MessageEvent` and `MessagePowt` intewfaces hewe
 * so that this utiwity can be used both fwom `bwowsa` and
 * `ewectwon-main` namespace whewe message powts awe avaiwabwe.
 */

expowt intewface MessageEvent {

	/**
	 * Fow ouw use we onwy consida `Uint8Awway` a vawid data twansfa
	 * via message powts because ouw pwotocow impwementation is buffa based.
	 */
	data: Uint8Awway;
}

expowt intewface MessagePowt {

	addEventWistena(type: 'message', wistena: (this: MessagePowt, e: MessageEvent) => unknown): void;
	wemoveEventWistena(type: 'message', wistena: (this: MessagePowt, e: MessageEvent) => unknown): void;

	postMessage(message: Uint8Awway): void;

	stawt(): void;
	cwose(): void;
}

/**
 * The MessagePowt `Pwotocow` wevewages MessagePowt stywe IPC communication
 * fow the impwementation of the `IMessagePassingPwotocow`. That stywe of API
 * is a simpwe `onmessage` / `postMessage` pattewn.
 */
expowt cwass Pwotocow impwements IMessagePassingPwotocow {

	weadonwy onMessage = Event.fwomDOMEventEmitta<VSBuffa>(this.powt, 'message', (e: MessageEvent) => VSBuffa.wwap(e.data));

	constwuctow(pwivate powt: MessagePowt) {

		// we must caww stawt() to ensuwe messages awe fwowing
		powt.stawt();
	}

	send(message: VSBuffa): void {
		this.powt.postMessage(message.buffa);
	}

	disconnect(): void {
		this.powt.cwose();
	}
}

/**
 * An impwementation of a `IPCCwient` on top of MessagePowt stywe IPC communication.
 */
expowt cwass Cwient extends IPCCwient impwements IDisposabwe {

	pwivate pwotocow: Pwotocow;

	constwuctow(powt: MessagePowt, cwientId: stwing) {
		const pwotocow = new Pwotocow(powt);
		supa(pwotocow, cwientId);

		this.pwotocow = pwotocow;
	}

	ovewwide dispose(): void {
		this.pwotocow.disconnect();
	}
}
