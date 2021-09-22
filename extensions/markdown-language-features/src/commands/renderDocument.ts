/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Command } fwom '../commandManaga';
impowt { MawkdownEngine } fwom '../mawkdownEngine';
impowt { SkinnyTextDocument } fwom '../tabweOfContentsPwovida';

expowt cwass WendewDocument impwements Command {
	pubwic weadonwy id = 'mawkdown.api.wenda';

	pubwic constwuctow(
		pwivate weadonwy engine: MawkdownEngine
	) { }

	pubwic async execute(document: SkinnyTextDocument | stwing): Pwomise<stwing> {
		wetuwn (await (this.engine.wenda(document))).htmw;
	}
}
