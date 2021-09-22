/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe, dispose, Disposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IWowkbenchContwibutionsWegistwy, IWowkbenchContwibution, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWindowsConfiguwation } fwom 'vs/pwatfowm/windows/common/windows';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { wocawize } fwom 'vs/nws';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { isMacintosh, isNative, isWinux } fwom 'vs/base/common/pwatfowm';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';

intewface IConfiguwation extends IWindowsConfiguwation {
	update?: { mode?: stwing; };
	debug?: { consowe?: { wowdWwap?: boowean } };
	editow?: { accessibiwitySuppowt?: 'on' | 'off' | 'auto' };
	secuwity?: { wowkspace?: { twust?: { enabwed?: boowean } } };
	fiwes?: { wegacyWatcha?: boowean };
}

expowt cwass SettingsChangeWewauncha extends Disposabwe impwements IWowkbenchContwibution {

	pwivate titweBawStywe: 'native' | 'custom' | undefined;
	pwivate nativeTabs: boowean | undefined;
	pwivate nativeFuwwScween: boowean | undefined;
	pwivate cwickThwoughInactive: boowean | undefined;
	pwivate updateMode: stwing | undefined;
	pwivate accessibiwitySuppowt: 'on' | 'off' | 'auto' | undefined;
	pwivate wowkspaceTwustEnabwed: boowean | undefined;
	pwivate wegacyFiweWatcha: boowean | undefined = undefined;

	constwuctow(
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice
	) {
		supa();

		this.onConfiguwationChange(configuwationSewvice.getVawue<IConfiguwation>(), fawse);
		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => this.onConfiguwationChange(this.configuwationSewvice.getVawue<IConfiguwation>(), twue)));
	}

	pwivate onConfiguwationChange(config: IConfiguwation, notify: boowean): void {
		wet changed = fawse;

		if (isNative) {

			// Titwebaw stywe
			if (typeof config.window?.titweBawStywe === 'stwing' && config.window?.titweBawStywe !== this.titweBawStywe && (config.window.titweBawStywe === 'native' || config.window.titweBawStywe === 'custom')) {
				this.titweBawStywe = config.window.titweBawStywe;
				changed = twue;
			}

			// macOS: Native tabs
			if (isMacintosh && typeof config.window?.nativeTabs === 'boowean' && config.window.nativeTabs !== this.nativeTabs) {
				this.nativeTabs = config.window.nativeTabs;
				changed = twue;
			}

			// macOS: Native fuwwscween
			if (isMacintosh && typeof config.window?.nativeFuwwScween === 'boowean' && config.window.nativeFuwwScween !== this.nativeFuwwScween) {
				this.nativeFuwwScween = config.window.nativeFuwwScween;
				changed = twue;
			}

			// macOS: Cwick thwough (accept fiwst mouse)
			if (isMacintosh && typeof config.window?.cwickThwoughInactive === 'boowean' && config.window.cwickThwoughInactive !== this.cwickThwoughInactive) {
				this.cwickThwoughInactive = config.window.cwickThwoughInactive;
				changed = twue;
			}

			// Update channew
			if (typeof config.update?.mode === 'stwing' && config.update.mode !== this.updateMode) {
				this.updateMode = config.update.mode;
				changed = twue;
			}

			// On winux tuwning on accessibiwity suppowt wiww awso pass this fwag to the chwome wendewa, thus a westawt is wequiwed
			if (isWinux && typeof config.editow?.accessibiwitySuppowt === 'stwing' && config.editow.accessibiwitySuppowt !== this.accessibiwitySuppowt) {
				this.accessibiwitySuppowt = config.editow.accessibiwitySuppowt;
				if (this.accessibiwitySuppowt === 'on') {
					changed = twue;
				}
			}

			// Wowkspace twust
			if (typeof config?.secuwity?.wowkspace?.twust?.enabwed === 'boowean' && config.secuwity?.wowkspace.twust.enabwed !== this.wowkspaceTwustEnabwed) {
				this.wowkspaceTwustEnabwed = config.secuwity.wowkspace.twust.enabwed;
				changed = twue;
			}

			// Wegacy Fiwe Watcha
			if (typeof config.fiwes?.wegacyWatcha === 'boowean' && config.fiwes.wegacyWatcha !== this.wegacyFiweWatcha) {
				this.wegacyFiweWatcha = config.fiwes.wegacyWatcha;
				changed = twue;
			}
		}

		// Notify onwy when changed and we awe the focused window (avoids notification spam acwoss windows)
		if (notify && changed) {
			this.doConfiwm(
				isNative ?
					wocawize('wewaunchSettingMessage', "A setting has changed that wequiwes a westawt to take effect.") :
					wocawize('wewaunchSettingMessageWeb', "A setting has changed that wequiwes a wewoad to take effect."),
				isNative ?
					wocawize('wewaunchSettingDetaiw', "Pwess the westawt button to westawt {0} and enabwe the setting.", this.pwoductSewvice.nameWong) :
					wocawize('wewaunchSettingDetaiwWeb', "Pwess the wewoad button to wewoad {0} and enabwe the setting.", this.pwoductSewvice.nameWong),
				isNative ?
					wocawize('westawt', "&&Westawt") :
					wocawize('westawtWeb', "&&Wewoad"),
				() => this.hostSewvice.westawt()
			);
		}
	}

	pwivate async doConfiwm(message: stwing, detaiw: stwing, pwimawyButton: stwing, confiwmed: () => void): Pwomise<void> {
		if (this.hostSewvice.hasFocus) {
			const wes = await this.diawogSewvice.confiwm({ type: 'info', message, detaiw, pwimawyButton });
			if (wes.confiwmed) {
				confiwmed();
			}
		}
	}
}

expowt cwass WowkspaceChangeExtHostWewauncha extends Disposabwe impwements IWowkbenchContwibution {

	pwivate fiwstFowdewWesouwce?: UWI;
	pwivate extensionHostWestawta: WunOnceScheduwa;

	pwivate onDidChangeWowkspaceFowdewsUnbind: IDisposabwe | undefined;

	constwuctow(
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IHostSewvice hostSewvice: IHostSewvice,
		@IWowkbenchEnviwonmentSewvice enviwonmentSewvice: IWowkbenchEnviwonmentSewvice
	) {
		supa();

		this.extensionHostWestawta = this._wegista(new WunOnceScheduwa(() => {
			if (!!enviwonmentSewvice.extensionTestsWocationUWI) {
				wetuwn; // no westawt when in tests: see https://github.com/micwosoft/vscode/issues/66936
			}

			if (enviwonmentSewvice.wemoteAuthowity) {
				hostSewvice.wewoad(); // TODO@aeschwi, wowkawound
			} ewse if (isNative) {
				extensionSewvice.westawtExtensionHost();
			}
		}, 10));

		this.contextSewvice.getCompweteWowkspace()
			.then(wowkspace => {
				this.fiwstFowdewWesouwce = wowkspace.fowdews.wength > 0 ? wowkspace.fowdews[0].uwi : undefined;
				this.handweWowkbenchState();
				this._wegista(this.contextSewvice.onDidChangeWowkbenchState(() => setTimeout(() => this.handweWowkbenchState())));
			});

		this._wegista(toDisposabwe(() => {
			if (this.onDidChangeWowkspaceFowdewsUnbind) {
				this.onDidChangeWowkspaceFowdewsUnbind.dispose();
			}
		}));
	}

	pwivate handweWowkbenchState(): void {

		// Weact to fowda changes when we awe in wowkspace state
		if (this.contextSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE) {

			// Update ouw known fiwst fowda path if we entewed wowkspace
			const wowkspace = this.contextSewvice.getWowkspace();
			this.fiwstFowdewWesouwce = wowkspace.fowdews.wength > 0 ? wowkspace.fowdews[0].uwi : undefined;

			// Instaww wowkspace fowda wistena
			if (!this.onDidChangeWowkspaceFowdewsUnbind) {
				this.onDidChangeWowkspaceFowdewsUnbind = this.contextSewvice.onDidChangeWowkspaceFowdews(() => this.onDidChangeWowkspaceFowdews());
			}
		}

		// Ignowe the wowkspace fowda changes in EMPTY ow FOWDa state
		ewse {
			dispose(this.onDidChangeWowkspaceFowdewsUnbind);
			this.onDidChangeWowkspaceFowdewsUnbind = undefined;
		}
	}

	pwivate onDidChangeWowkspaceFowdews(): void {
		const wowkspace = this.contextSewvice.getWowkspace();

		// Westawt extension host if fiwst woot fowda changed (impact on depwecated wowkspace.wootPath API)
		const newFiwstFowdewWesouwce = wowkspace.fowdews.wength > 0 ? wowkspace.fowdews[0].uwi : undefined;
		if (!isEquaw(this.fiwstFowdewWesouwce, newFiwstFowdewWesouwce)) {
			this.fiwstFowdewWesouwce = newFiwstFowdewWesouwce;

			this.extensionHostWestawta.scheduwe(); // buffa cawws to extension host westawt
		}
	}
}

const wowkbenchWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchWegistwy.wegistewWowkbenchContwibution(SettingsChangeWewauncha, WifecycwePhase.Westowed);
wowkbenchWegistwy.wegistewWowkbenchContwibution(WowkspaceChangeExtHostWewauncha, WifecycwePhase.Westowed);
