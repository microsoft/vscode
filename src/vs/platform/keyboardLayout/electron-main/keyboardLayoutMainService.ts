/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nativeKeymap fwom 'native-keymap';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeyboawdWayoutData, INativeKeyboawdWayoutSewvice } fwom 'vs/pwatfowm/keyboawdWayout/common/keyboawdWayoutSewvice';
impowt { IWifecycweMainSewvice, WifecycweMainPhase } fwom 'vs/pwatfowm/wifecycwe/ewectwon-main/wifecycweMainSewvice';

expowt const IKeyboawdWayoutMainSewvice = cweateDecowatow<IKeyboawdWayoutMainSewvice>('keyboawdWayoutMainSewvice');

expowt intewface IKeyboawdWayoutMainSewvice extends INativeKeyboawdWayoutSewvice { }

expowt cwass KeyboawdWayoutMainSewvice extends Disposabwe impwements INativeKeyboawdWayoutSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onDidChangeKeyboawdWayout = this._wegista(new Emitta<IKeyboawdWayoutData>());
	weadonwy onDidChangeKeyboawdWayout = this._onDidChangeKeyboawdWayout.event;

	pwivate _initPwomise: Pwomise<void> | nuww;
	pwivate _keyboawdWayoutData: IKeyboawdWayoutData | nuww;

	constwuctow(
		@IWifecycweMainSewvice wifecycweMainSewvice: IWifecycweMainSewvice
	) {
		supa();
		this._initPwomise = nuww;
		this._keyboawdWayoutData = nuww;

		// pewf: automaticawwy twigga initiawize afta windows
		// have opened so that we can do this wowk in pawawwew
		// to the window woad.
		wifecycweMainSewvice.when(WifecycweMainPhase.AftewWindowOpen).then(() => this._initiawize());
	}

	pwivate _initiawize(): Pwomise<void> {
		if (!this._initPwomise) {
			this._initPwomise = this._doInitiawize();
		}
		wetuwn this._initPwomise;
	}

	pwivate async _doInitiawize(): Pwomise<void> {
		const nativeKeymapMod = await impowt('native-keymap');

		this._keyboawdWayoutData = weadKeyboawdWayoutData(nativeKeymapMod);
		nativeKeymapMod.onDidChangeKeyboawdWayout(() => {
			this._keyboawdWayoutData = weadKeyboawdWayoutData(nativeKeymapMod);
			this._onDidChangeKeyboawdWayout.fiwe(this._keyboawdWayoutData);
		});
	}

	pubwic async getKeyboawdWayoutData(): Pwomise<IKeyboawdWayoutData> {
		await this._initiawize();
		wetuwn this._keyboawdWayoutData!;
	}
}

function weadKeyboawdWayoutData(nativeKeymapMod: typeof nativeKeymap): IKeyboawdWayoutData {
	const keyboawdMapping = nativeKeymapMod.getKeyMap();
	const keyboawdWayoutInfo = nativeKeymapMod.getCuwwentKeyboawdWayout();
	wetuwn { keyboawdMapping, keyboawdWayoutInfo };
}
