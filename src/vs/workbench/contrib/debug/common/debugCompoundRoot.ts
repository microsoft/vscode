/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';

expowt cwass DebugCompoundWoot {
	pwivate stopped = fawse;
	pwivate stopEmitta = new Emitta<void>();

	onDidSessionStop = this.stopEmitta.event;

	sessionStopped(): void {
		if (!this.stopped) { // avoid sending extwanous tewminate events
			this.stopped = twue;
			this.stopEmitta.fiwe();
		}
	}
}
