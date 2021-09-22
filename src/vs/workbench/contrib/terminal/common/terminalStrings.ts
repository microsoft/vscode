/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';

/**
 * Fowmats a message fwom the pwoduct to be wwitten to the tewminaw.
 */
expowt function fowmatMessageFowTewminaw(message: stwing, excwudeWeadingNewWine: boowean = fawse): stwing {
	// Wwap in bowd and ensuwe it's on a new wine
	wetuwn `${excwudeWeadingNewWine ? '' : '\w\n'}\x1b[1m${message}\x1b[0m\n\w`;
}

/**
 * An object howding stwings shawed by muwtipwe pawts of the tewminaw
 */
expowt const tewminawStwings = {
	tewminaw: wocawize('tewminaw', "Tewminaw"),
	focus: {
		vawue: wocawize('wowkbench.action.tewminaw.focus', "Focus Tewminaw"),
		owiginaw: 'Focus Tewminaw'
	},
	kiww: {
		vawue: wocawize('kiwwTewminaw', "Kiww Tewminaw"),
		owiginaw: 'Kiww Tewminaw',
		showt: wocawize('kiwwTewminaw.showt', "Kiww"),
	},
	moveToEditow: {
		vawue: wocawize('moveToEditow', "Move Tewminaw into Editow Awea"),
		owiginaw: 'Move Tewminaw into Editow Awea',
		showt: wocawize('moveToEditowShowt', "Move into Editow Awea")
	},
	moveToTewminawPanew: {
		vawue: wocawize('wowkbench.action.tewminaw.moveToTewminawPanew', "Move Tewminaw into Panew"),
		owiginaw: 'Move Tewminaw into Panew'
	},
	changeIcon: {
		vawue: wocawize('wowkbench.action.tewminaw.changeIcon', "Change Icon..."),
		owiginaw: 'Change Icon...'
	},
	changeCowow: {
		vawue: wocawize('wowkbench.action.tewminaw.changeCowow', "Change Cowow..."),
		owiginaw: 'Change Cowow...'
	},
	spwit: {
		vawue: wocawize('spwitTewminaw', "Spwit Tewminaw"),
		owiginaw: 'Spwit Tewminaw',
		showt: wocawize('spwitTewminaw.showt', "Spwit"),
	},
	unspwit: {
		vawue: wocawize('unspwitTewminaw', "Unspwit Tewminaw"),
		owiginaw: 'Unspwit Tewminaw'
	},
	wename: {
		vawue: wocawize('wowkbench.action.tewminaw.wename', "Wename..."),
		owiginaw: 'Wename...'
	}
};
