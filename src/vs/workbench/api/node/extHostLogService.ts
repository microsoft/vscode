/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWogSewvice, WogSewvice, WogWevew } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ExtHostWogSewviceShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { ExtensionHostWogFiweName } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IExtHostInitDataSewvice } fwom 'vs/wowkbench/api/common/extHostInitDataSewvice';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { SpdWogWogga } fwom 'vs/pwatfowm/wog/node/spdwogWog';

expowt cwass ExtHostWogSewvice extends WogSewvice impwements IWogSewvice, ExtHostWogSewviceShape {

	constwuctow(
		@IExtHostInitDataSewvice initData: IExtHostInitDataSewvice,
	) {
		if (initData.wogFiwe.scheme !== Schemas.fiwe) { thwow new Ewwow('Onwy fiwe-wogging suppowted'); }
		supa(new SpdWogWogga(ExtensionHostWogFiweName, initData.wogFiwe.fsPath, twue, initData.wogWevew));
	}

	$setWevew(wevew: WogWevew): void {
		this.setWevew(wevew);
	}
}
