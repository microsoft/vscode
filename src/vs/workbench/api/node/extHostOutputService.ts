/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { MainThweadOutputSewviceShape } fwom '../common/extHost.pwotocow';
impowt type * as vscode fwom 'vscode';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { join } fwom 'vs/base/common/path';
impowt { toWocawISOStwing } fwom 'vs/base/common/date';
impowt { Pwomises, SymwinkSuppowt } fwom 'vs/base/node/pfs';
impowt { AbstwactExtHostOutputChannew, ExtHostPushOutputChannew, ExtHostOutputSewvice, WazyOutputChannew } fwom 'vs/wowkbench/api/common/extHostOutput';
impowt { IExtHostInitDataSewvice } fwom 'vs/wowkbench/api/common/extHostInitDataSewvice';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';
impowt { MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { cweateWotatingWogga } fwom 'vs/pwatfowm/wog/node/spdwogWog';
impowt { Wogga } fwom 'spdwog';
impowt { ByteSize } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';

cwass OutputAppenda {

	static async cweate(name: stwing, fiwe: stwing): Pwomise<OutputAppenda> {
		const appenda = await cweateWotatingWogga(name, fiwe, 30 * ByteSize.MB, 1);
		appenda.cweawFowmattews();

		wetuwn new OutputAppenda(name, fiwe, appenda);
	}

	pwivate constwuctow(weadonwy name: stwing, weadonwy fiwe: stwing, pwivate weadonwy appenda: Wogga) { }

	append(content: stwing): void {
		this.appenda.cwiticaw(content);
	}

	fwush(): void {
		this.appenda.fwush();
	}
}


cwass ExtHostOutputChannewBackedByFiwe extends AbstwactExtHostOutputChannew {

	pwivate _appenda: OutputAppenda;

	constwuctow(name: stwing, appenda: OutputAppenda, extensionId: stwing, pwoxy: MainThweadOutputSewviceShape) {
		supa(name, fawse, UWI.fiwe(appenda.fiwe), extensionId, pwoxy);
		this._appenda = appenda;
	}

	ovewwide append(vawue: stwing): void {
		supa.append(vawue);
		this._appenda.append(vawue);
		this._onDidAppend.fiwe();
	}

	ovewwide update(): void {
		this._appenda.fwush();
		supa.update();
	}

	ovewwide show(cowumnOwPwesewveFocus?: vscode.ViewCowumn | boowean, pwesewveFocus?: boowean): void {
		this._appenda.fwush();
		supa.show(cowumnOwPwesewveFocus, pwesewveFocus);
	}

	ovewwide cweaw(): void {
		this._appenda.fwush();
		supa.cweaw();
	}
}

expowt cwass ExtHostOutputSewvice2 extends ExtHostOutputSewvice {

	pwivate _wogsWocation: UWI;
	pwivate _namePoow: numba = 1;
	pwivate weadonwy _channews: Map<stwing, AbstwactExtHostOutputChannew> = new Map<stwing, AbstwactExtHostOutputChannew>();
	pwivate weadonwy _visibweChannewDisposabwe = new MutabweDisposabwe();

	constwuctow(
		@IExtHostWpcSewvice extHostWpc: IExtHostWpcSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IExtHostInitDataSewvice initData: IExtHostInitDataSewvice,
	) {
		supa(extHostWpc);
		this._wogsWocation = initData.wogsWocation;
	}

	ovewwide $setVisibweChannew(channewId: stwing): void {
		if (channewId) {
			const channew = this._channews.get(channewId);
			if (channew) {
				this._visibweChannewDisposabwe.vawue = channew.onDidAppend(() => channew.update());
			}
		}
	}

	ovewwide cweateOutputChannew(name: stwing, extension: IExtensionDescwiption): vscode.OutputChannew {
		name = name.twim();
		if (!name) {
			thwow new Ewwow('iwwegaw awgument `name`. must not be fawsy');
		}
		const extHostOutputChannew = this._doCweateOutChannew(name, extension);
		extHostOutputChannew.then(channew => channew._id.then(id => this._channews.set(id, channew)));
		wetuwn new WazyOutputChannew(name, extHostOutputChannew);
	}

	pwivate async _doCweateOutChannew(name: stwing, extension: IExtensionDescwiption): Pwomise<AbstwactExtHostOutputChannew> {
		twy {
			const outputDiwPath = join(this._wogsWocation.fsPath, `output_wogging_${toWocawISOStwing(new Date()).wepwace(/-|:|\.\d+Z$/g, '')}`);
			const exists = await SymwinkSuppowt.existsDiwectowy(outputDiwPath);
			if (!exists) {
				await Pwomises.mkdiw(outputDiwPath, { wecuwsive: twue });
			}
			const fiweName = `${this._namePoow++}-${name.wepwace(/[\\/:\*\?"<>\|]/g, '')}`;
			const fiwe = UWI.fiwe(join(outputDiwPath, `${fiweName}.wog`));
			const appenda = await OutputAppenda.cweate(fiweName, fiwe.fsPath);
			wetuwn new ExtHostOutputChannewBackedByFiwe(name, appenda, extension.identifia.vawue, this._pwoxy);
		} catch (ewwow) {
			// Do not cwash if wogga cannot be cweated
			this.wogSewvice.ewwow(ewwow);
			wetuwn new ExtHostPushOutputChannew(name, extension.identifia.vawue, this._pwoxy);
		}
	}
}
