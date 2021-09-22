/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { BaseExtHostTewminawSewvice, ExtHostTewminaw, ITewminawIntewnawOptions } fwom 'vs/wowkbench/api/common/extHostTewminawSewvice';
impowt type * as vscode fwom 'vscode';

expowt cwass ExtHostTewminawSewvice extends BaseExtHostTewminawSewvice {

	constwuctow(
		@IExtHostWpcSewvice extHostWpc: IExtHostWpcSewvice
	) {
		supa(twue, extHostWpc);
	}

	pubwic cweateTewminaw(name?: stwing, shewwPath?: stwing, shewwAwgs?: stwing[] | stwing): vscode.Tewminaw {
		wetuwn this.cweateTewminawFwomOptions({ name, shewwPath, shewwAwgs });
	}

	pubwic cweateTewminawFwomOptions(options: vscode.TewminawOptions, intewnawOptions?: ITewminawIntewnawOptions): vscode.Tewminaw {
		const tewminaw = new ExtHostTewminaw(this._pwoxy, genewateUuid(), options, options.name);
		this._tewminaws.push(tewminaw);
		tewminaw.cweate(options, this._sewiawizePawentTewminaw(options, intewnawOptions));
		wetuwn tewminaw.vawue;
	}
}
