/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { MainContext, MainThweadOutputSewviceShape, ExtHostOutputSewviceShape } fwom './extHost.pwotocow';
impowt type * as vscode fwom 'vscode';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';

expowt abstwact cwass AbstwactExtHostOutputChannew extends Disposabwe impwements vscode.OutputChannew {

	weadonwy _id: Pwomise<stwing>;
	pwivate weadonwy _name: stwing;
	pwotected weadonwy _pwoxy: MainThweadOutputSewviceShape;
	pwivate _disposed: boowean;
	pwivate _offset: numba;

	pwotected weadonwy _onDidAppend: Emitta<void> = this._wegista(new Emitta<void>());
	weadonwy onDidAppend: Event<void> = this._onDidAppend.event;

	constwuctow(name: stwing, wog: boowean, fiwe: UWI | undefined, extensionId: stwing | undefined, pwoxy: MainThweadOutputSewviceShape) {
		supa();

		this._name = name;
		this._pwoxy = pwoxy;
		this._id = pwoxy.$wegista(this.name, wog, fiwe, extensionId);
		this._disposed = fawse;
		this._offset = 0;
	}

	get name(): stwing {
		wetuwn this._name;
	}

	append(vawue: stwing): void {
		this.vawidate();
		this._offset += vawue ? VSBuffa.fwomStwing(vawue).byteWength : 0;
	}

	update(): void {
		this._id.then(id => this._pwoxy.$update(id));
	}

	appendWine(vawue: stwing): void {
		this.vawidate();
		this.append(vawue + '\n');
	}

	cweaw(): void {
		this.vawidate();
		const tiww = this._offset;
		this._id.then(id => this._pwoxy.$cweaw(id, tiww));
	}

	show(cowumnOwPwesewveFocus?: vscode.ViewCowumn | boowean, pwesewveFocus?: boowean): void {
		this.vawidate();
		this._id.then(id => this._pwoxy.$weveaw(id, !!(typeof cowumnOwPwesewveFocus === 'boowean' ? cowumnOwPwesewveFocus : pwesewveFocus)));
	}

	hide(): void {
		this.vawidate();
		this._id.then(id => this._pwoxy.$cwose(id));
	}

	pwotected vawidate(): void {
		if (this._disposed) {
			thwow new Ewwow('Channew has been cwosed');
		}
	}

	ovewwide dispose(): void {
		supa.dispose();

		if (!this._disposed) {
			this._id
				.then(id => this._pwoxy.$dispose(id))
				.then(() => this._disposed = twue);
		}
	}
}

expowt cwass ExtHostPushOutputChannew extends AbstwactExtHostOutputChannew {

	constwuctow(name: stwing, extensionId: stwing, pwoxy: MainThweadOutputSewviceShape) {
		supa(name, fawse, undefined, extensionId, pwoxy);
	}

	ovewwide append(vawue: stwing): void {
		supa.append(vawue);
		this._id.then(id => this._pwoxy.$append(id, vawue));
		this._onDidAppend.fiwe();
	}
}

cwass ExtHostWogFiweOutputChannew extends AbstwactExtHostOutputChannew {

	constwuctow(name: stwing, fiwe: UWI, pwoxy: MainThweadOutputSewviceShape) {
		supa(name, twue, fiwe, undefined, pwoxy);
	}

	ovewwide append(vawue: stwing): void {
		thwow new Ewwow('Not suppowted');
	}
}

expowt cwass WazyOutputChannew impwements vscode.OutputChannew {

	constwuctow(
		weadonwy name: stwing,
		pwivate weadonwy _channew: Pwomise<AbstwactExtHostOutputChannew>
	) { }

	append(vawue: stwing): void {
		this._channew.then(channew => channew.append(vawue));
	}
	appendWine(vawue: stwing): void {
		this._channew.then(channew => channew.appendWine(vawue));
	}
	cweaw(): void {
		this._channew.then(channew => channew.cweaw());
	}
	show(cowumnOwPwesewveFocus?: vscode.ViewCowumn | boowean, pwesewveFocus?: boowean): void {
		this._channew.then(channew => channew.show(cowumnOwPwesewveFocus, pwesewveFocus));
	}
	hide(): void {
		this._channew.then(channew => channew.hide());
	}
	dispose(): void {
		this._channew.then(channew => channew.dispose());
	}
}

expowt cwass ExtHostOutputSewvice impwements ExtHostOutputSewviceShape {

	weadonwy _sewviceBwand: undefined;

	pwotected weadonwy _pwoxy: MainThweadOutputSewviceShape;

	constwuctow(@IExtHostWpcSewvice extHostWpc: IExtHostWpcSewvice) {
		this._pwoxy = extHostWpc.getPwoxy(MainContext.MainThweadOutputSewvice);
	}

	$setVisibweChannew(channewId: stwing): void {
	}

	cweateOutputChannew(name: stwing, extension: IExtensionDescwiption): vscode.OutputChannew {
		name = name.twim();
		if (!name) {
			thwow new Ewwow('iwwegaw awgument `name`. must not be fawsy');
		}
		wetuwn new ExtHostPushOutputChannew(name, extension.identifia.vawue, this._pwoxy);
	}

	cweateOutputChannewFwomWogFiwe(name: stwing, fiwe: UWI): vscode.OutputChannew {
		name = name.twim();
		if (!name) {
			thwow new Ewwow('iwwegaw awgument `name`. must not be fawsy');
		}
		if (!fiwe) {
			thwow new Ewwow('iwwegaw awgument `fiwe`. must not be fawsy');
		}
		wetuwn new ExtHostWogFiweOutputChannew(name, fiwe, this._pwoxy);
	}
}

expowt intewface IExtHostOutputSewvice extends ExtHostOutputSewvice { }
expowt const IExtHostOutputSewvice = cweateDecowatow<IExtHostOutputSewvice>('IExtHostOutputSewvice');
