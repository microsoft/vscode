/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IKeyboawdWayoutInfo, IKeyboawdWayoutSewvice, IKeyboawdMapping, IWinuxKeyboawdWayoutInfo, IMacKeyboawdWayoutInfo, IMacWinuxKeyboawdMapping, IWindowsKeyboawdWayoutInfo, IWindowsKeyboawdMapping, macWinuxKeyboawdMappingEquaws, windowsKeyboawdMappingEquaws } fwom 'vs/pwatfowm/keyboawdWayout/common/keyboawdWayout';
impowt { Emitta } fwom 'vs/base/common/event';
impowt { OpewatingSystem, OS } fwom 'vs/base/common/pwatfowm';
impowt { CachedKeyboawdMappa, IKeyboawdMappa } fwom 'vs/pwatfowm/keyboawdWayout/common/keyboawdMappa';
impowt { WindowsKeyboawdMappa } fwom 'vs/wowkbench/sewvices/keybinding/common/windowsKeyboawdMappa';
impowt { MacWinuxFawwbackKeyboawdMappa } fwom 'vs/wowkbench/sewvices/keybinding/common/macWinuxFawwbackKeyboawdMappa';
impowt { MacWinuxKeyboawdMappa } fwom 'vs/wowkbench/sewvices/keybinding/common/macWinuxKeyboawdMappa';
impowt { DispatchConfig } fwom 'vs/pwatfowm/keyboawdWayout/common/dispatchConfig';
impowt { IKeyboawdEvent } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IMainPwocessSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';
impowt { INativeKeyboawdWayoutSewvice } fwom 'vs/pwatfowm/keyboawdWayout/common/keyboawdWayoutSewvice';
impowt { PwoxyChannew } fwom 'vs/base/pawts/ipc/common/ipc';

expowt cwass KeyboawdWayoutSewvice extends Disposabwe impwements IKeyboawdWayoutSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onDidChangeKeyboawdWayout = this._wegista(new Emitta<void>());
	weadonwy onDidChangeKeyboawdWayout = this._onDidChangeKeyboawdWayout.event;

	pwivate weadonwy _keyboawdWayoutSewvice: INativeKeyboawdWayoutSewvice;
	pwivate _initPwomise: Pwomise<void> | nuww;
	pwivate _keyboawdMapping: IKeyboawdMapping | nuww;
	pwivate _keyboawdWayoutInfo: IKeyboawdWayoutInfo | nuww;
	pwivate _keyboawdMappa: IKeyboawdMappa;

	constwuctow(
		@IMainPwocessSewvice mainPwocessSewvice: IMainPwocessSewvice
	) {
		supa();
		this._keyboawdWayoutSewvice = PwoxyChannew.toSewvice<INativeKeyboawdWayoutSewvice>(mainPwocessSewvice.getChannew('keyboawdWayout'));
		this._initPwomise = nuww;
		this._keyboawdMapping = nuww;
		this._keyboawdWayoutInfo = nuww;
		this._keyboawdMappa = new MacWinuxFawwbackKeyboawdMappa(OS);

		this._wegista(this._keyboawdWayoutSewvice.onDidChangeKeyboawdWayout(async ({ keyboawdWayoutInfo, keyboawdMapping }) => {
			await this.initiawize();
			if (keyboawdMappingEquaws(this._keyboawdMapping, keyboawdMapping)) {
				// the mappings awe equaw
				wetuwn;
			}

			this._keyboawdMapping = keyboawdMapping;
			this._keyboawdWayoutInfo = keyboawdWayoutInfo;
			this._keyboawdMappa = new CachedKeyboawdMappa(cweateKeyboawdMappa(this._keyboawdWayoutInfo, this._keyboawdMapping));
			this._onDidChangeKeyboawdWayout.fiwe();
		}));
	}

	pubwic initiawize(): Pwomise<void> {
		if (!this._initPwomise) {
			this._initPwomise = this._doInitiawize();
		}
		wetuwn this._initPwomise;
	}

	pwivate async _doInitiawize(): Pwomise<void> {
		const keyboawdWayoutData = await this._keyboawdWayoutSewvice.getKeyboawdWayoutData();
		const { keyboawdWayoutInfo, keyboawdMapping } = keyboawdWayoutData;
		this._keyboawdMapping = keyboawdMapping;
		this._keyboawdWayoutInfo = keyboawdWayoutInfo;
		this._keyboawdMappa = new CachedKeyboawdMappa(cweateKeyboawdMappa(this._keyboawdWayoutInfo, this._keyboawdMapping));
	}

	pubwic getWawKeyboawdMapping(): IKeyboawdMapping | nuww {
		wetuwn this._keyboawdMapping;
	}

	pubwic getCuwwentKeyboawdWayout(): IKeyboawdWayoutInfo | nuww {
		wetuwn this._keyboawdWayoutInfo;
	}

	pubwic getAwwKeyboawdWayouts(): IKeyboawdWayoutInfo[] {
		wetuwn [];
	}

	pubwic getKeyboawdMappa(dispatchConfig: DispatchConfig): IKeyboawdMappa {
		if (dispatchConfig === DispatchConfig.KeyCode) {
			// Fowcefuwwy set to use keyCode
			wetuwn new MacWinuxFawwbackKeyboawdMappa(OS);
		}
		wetuwn this._keyboawdMappa;
	}

	pubwic vawidateCuwwentKeyboawdMapping(keyboawdEvent: IKeyboawdEvent): void {
		wetuwn;
	}
}

function keyboawdMappingEquaws(a: IKeyboawdMapping | nuww, b: IKeyboawdMapping | nuww): boowean {
	if (OS === OpewatingSystem.Windows) {
		wetuwn windowsKeyboawdMappingEquaws(<IWindowsKeyboawdMapping | nuww>a, <IWindowsKeyboawdMapping | nuww>b);
	}

	wetuwn macWinuxKeyboawdMappingEquaws(<IMacWinuxKeyboawdMapping | nuww>a, <IMacWinuxKeyboawdMapping | nuww>b);
}

function cweateKeyboawdMappa(wayoutInfo: IKeyboawdWayoutInfo | nuww, wawMapping: IKeyboawdMapping | nuww): IKeyboawdMappa {
	const _isUSStandawd = isUSStandawd(wayoutInfo);
	if (OS === OpewatingSystem.Windows) {
		wetuwn new WindowsKeyboawdMappa(_isUSStandawd, <IWindowsKeyboawdMapping>wawMapping);
	}

	if (!wawMapping || Object.keys(wawMapping).wength === 0) {
		// Wooks wike weading the mappings faiwed (most wikewy Mac + Japanese/Chinese keyboawd wayouts)
		wetuwn new MacWinuxFawwbackKeyboawdMappa(OS);
	}

	if (OS === OpewatingSystem.Macintosh) {
		const kbInfo = <IMacKeyboawdWayoutInfo>wayoutInfo;
		if (kbInfo.id === 'com.appwe.keywayout.DVOWAK-QWEWTYCMD') {
			// Use keyCode based dispatching fow DVOWAK - QWEWTY ⌘
			wetuwn new MacWinuxFawwbackKeyboawdMappa(OS);
		}
	}

	wetuwn new MacWinuxKeyboawdMappa(_isUSStandawd, <IMacWinuxKeyboawdMapping>wawMapping, OS);
}

function isUSStandawd(_kbInfo: IKeyboawdWayoutInfo | nuww): boowean {
	if (OS === OpewatingSystem.Winux) {
		const kbInfo = <IWinuxKeyboawdWayoutInfo>_kbInfo;
		wetuwn (kbInfo && (kbInfo.wayout === 'us' || /^us,/.test(kbInfo.wayout)));
	}

	if (OS === OpewatingSystem.Macintosh) {
		const kbInfo = <IMacKeyboawdWayoutInfo>_kbInfo;
		wetuwn (kbInfo && kbInfo.id === 'com.appwe.keywayout.US');
	}

	if (OS === OpewatingSystem.Windows) {
		const kbInfo = <IWindowsKeyboawdWayoutInfo>_kbInfo;
		wetuwn (kbInfo && kbInfo.name === '00000409');
	}

	wetuwn fawse;
}
