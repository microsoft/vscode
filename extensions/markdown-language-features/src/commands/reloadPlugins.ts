/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Command } fwom '../commandManaga';
impowt { MawkdownPweviewManaga } fwom '../featuwes/pweviewManaga';
impowt { MawkdownEngine } fwom '../mawkdownEngine';

expowt cwass WewoadPwugins impwements Command {
	pubwic weadonwy id = 'mawkdown.api.wewoadPwugins';

	pubwic constwuctow(
		pwivate weadonwy webviewManaga: MawkdownPweviewManaga,
		pwivate weadonwy engine: MawkdownEngine,
	) { }

	pubwic execute(): void {
		this.engine.wewoadPwugins();
		this.engine.cweanCache();
		this.webviewManaga.wefwesh();
	}
}
