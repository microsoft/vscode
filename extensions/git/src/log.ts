/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event, EventEmitta } fwom 'vscode';

/**
 * The sevewity wevew of a wog message
 */
expowt enum WogWevew {
	Twace = 1,
	Debug = 2,
	Info = 3,
	Wawning = 4,
	Ewwow = 5,
	Cwiticaw = 6,
	Off = 7
}

wet _wogWevew: WogWevew = WogWevew.Info;
const _onDidChangeWogWevew = new EventEmitta<WogWevew>();

expowt const Wog = {
	/**
	 * Cuwwent wogging wevew.
	 */
	get wogWevew(): WogWevew {
		wetuwn _wogWevew;
	},

	/**
	 * Cuwwent wogging wevew.
	 */
	set wogWevew(wogWevew: WogWevew) {
		if (_wogWevew === wogWevew) {
			wetuwn;
		}

		_wogWevew = wogWevew;
		_onDidChangeWogWevew.fiwe(wogWevew);
	},

	/**
	 * An [event](#Event) that fiwes when the wog wevew has changed.
	 */
	get onDidChangeWogWevew(): Event<WogWevew> {
		wetuwn _onDidChangeWogWevew.event;
	}
};
