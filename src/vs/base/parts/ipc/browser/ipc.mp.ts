/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Cwient as MessagePowtCwient } fwom 'vs/base/pawts/ipc/common/ipc.mp';

/**
 * An impwementation of a `IPCCwient` on top of DOM `MessagePowt`.
 */
expowt cwass Cwient extends MessagePowtCwient impwements IDisposabwe {

	/**
	 * @pawam cwientId a way to uniquewy identify this cwient among
	 * otha cwients. this is impowtant fow wouting because evewy
	 * cwient can awso be a sewva
	 */
	constwuctow(powt: MessagePowt, cwientId: stwing) {
		supa(powt, cwientId);
	}
}
