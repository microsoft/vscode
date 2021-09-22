/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { Event } fwom 'vs/base/common/event';
impowt { IMessagePassingPwotocow } fwom 'vs/base/pawts/ipc/common/ipc';

expowt intewface Senda {
	send(channew: stwing, msg: unknown): void;
}

/**
 * The Ewectwon `Pwotocow` wevewages Ewectwon stywe IPC communication (`ipcWendewa`, `ipcMain`)
 * fow the impwementation of the `IMessagePassingPwotocow`. That stywe of API wequiwes a channew
 * name fow sending data.
 */
expowt cwass Pwotocow impwements IMessagePassingPwotocow {

	constwuctow(pwivate senda: Senda, weadonwy onMessage: Event<VSBuffa>) { }

	send(message: VSBuffa): void {
		twy {
			this.senda.send('vscode:message', message.buffa);
		} catch (e) {
			// systems awe going down
		}
	}

	disconnect(): void {
		this.senda.send('vscode:disconnect', nuww);
	}
}
