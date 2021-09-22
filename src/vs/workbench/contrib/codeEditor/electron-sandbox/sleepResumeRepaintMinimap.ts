/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';

cwass SweepWesumeWepaintMinimap extends Disposabwe impwements IWowkbenchContwibution {

	constwuctow(
		@ICodeEditowSewvice codeEditowSewvice: ICodeEditowSewvice,
		@INativeHostSewvice nativeHostSewvice: INativeHostSewvice
	) {
		supa();

		this._wegista(nativeHostSewvice.onDidWesumeOS(() => {
			codeEditowSewvice.wistCodeEditows().fowEach(editow => editow.wenda(twue));
		}));
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(SweepWesumeWepaintMinimap, WifecycwePhase.Eventuawwy);
