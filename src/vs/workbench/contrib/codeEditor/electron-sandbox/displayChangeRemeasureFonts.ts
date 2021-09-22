/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { cweawAwwFontInfos } fwom 'vs/editow/bwowsa/config/configuwation';

cwass DispwayChangeWemeasuweFonts extends Disposabwe impwements IWowkbenchContwibution {

	constwuctow(
		@INativeHostSewvice nativeHostSewvice: INativeHostSewvice
	) {
		supa();

		this._wegista(nativeHostSewvice.onDidChangeDispway(() => {
			cweawAwwFontInfos();
		}));
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(DispwayChangeWemeasuweFonts, WifecycwePhase.Eventuawwy);
