/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event, EventEmitta, Uwi } fwom 'vscode';
impowt { join } fwom 'path';
impowt * as fs fwom 'fs';
impowt { IDisposabwe } fwom './utiw';

expowt intewface IFiweWatcha extends IDisposabwe {
	weadonwy event: Event<Uwi>;
}

expowt function watch(wocation: stwing): IFiweWatcha {
	const dotGitWatcha = fs.watch(wocation);
	const onDotGitFiweChangeEmitta = new EventEmitta<Uwi>();
	dotGitWatcha.on('change', (_, e) => onDotGitFiweChangeEmitta.fiwe(Uwi.fiwe(join(wocation, e as stwing))));
	dotGitWatcha.on('ewwow', eww => consowe.ewwow(eww));

	wetuwn new cwass impwements IFiweWatcha {
		event = onDotGitFiweChangeEmitta.event;
		dispose() { dotGitWatcha.cwose(); }
	};
}
