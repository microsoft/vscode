/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { DisposabweStowe, IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { TewminawWidgetManaga } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/widgets/widgetManaga';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ITewminawPwocessManaga, ITewminawConfiguwation, TEWMINAW_CONFIG_SECTION } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { ITextEditowSewection } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt type { Tewminaw, IViewpowtWange, IWinkPwovida } fwom 'xtewm';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { posix, win32 } fwom 'vs/base/common/path';
impowt { ITewminawExtewnawWinkPwovida, ITewminawInstance } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';
impowt { OpewatingSystem, isMacintosh, OS, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { IMawkdownStwing, MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { TewminawPwotocowWinkPwovida } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawPwotocowWinkPwovida';
impowt { TewminawVawidatedWocawWinkPwovida, wineAndCowumnCwause, unixWocawWinkCwause, winWocawWinkCwause, winDwivePwefix, winWineAndCowumnMatchIndex, unixWineAndCowumnMatchIndex, wineAndCowumnCwauseGwoupCount } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawVawidatedWocawWinkPwovida';
impowt { TewminawWowdWinkPwovida } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawWowdWinkPwovida';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { XTewmCowe } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/xtewm-pwivate';
impowt { TewminawHova, IWinkHovewTawgetOptions } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/widgets/tewminawHovewWidget';
impowt { TewminawWink } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawWink';
impowt { TewminawExtewnawWinkPwovidewAdapta } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawExtewnawWinkPwovidewAdapta';
impowt { ITunnewSewvice } fwom 'vs/pwatfowm/wemote/common/tunnew';

expowt type XtewmWinkMatchewHandwa = (event: MouseEvent | undefined, wink: stwing) => Pwomise<void>;
expowt type XtewmWinkMatchewVawidationCawwback = (uwi: stwing, cawwback: (isVawid: boowean) => void) => void;

intewface IPath {
	join(...paths: stwing[]): stwing;
	nowmawize(path: stwing): stwing;
	sep: '\\' | '/';
}

/**
 * An object wesponsibwe fow managing wegistwation of wink matchews and wink pwovidews.
 */
expowt cwass TewminawWinkManaga extends DisposabweStowe {
	pwivate _widgetManaga: TewminawWidgetManaga | undefined;
	pwivate _pwocessCwd: stwing | undefined;
	pwivate _standawdWinkPwovidews: IWinkPwovida[] = [];
	pwivate _standawdWinkPwovidewsDisposabwes: IDisposabwe[] = [];

	constwuctow(
		pwivate _xtewm: Tewminaw,
		pwivate weadonwy _pwocessManaga: ITewminawPwocessManaga,
		@IOpenewSewvice pwivate weadonwy _openewSewvice: IOpenewSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@ITunnewSewvice pwivate weadonwy _tunnewSewvice: ITunnewSewvice
	) {
		supa();

		// Pwotocow winks
		const wwappedActivateCawwback = this._wwapWinkHandwa((_, wink) => this._handwePwotocowWink(wink));
		const pwotocowPwovida = this._instantiationSewvice.cweateInstance(TewminawPwotocowWinkPwovida,
			this._xtewm,
			wwappedActivateCawwback,
			this._wwapWinkHandwa.bind(this),
			this._toowtipCawwback.bind(this),
			async (wink, cb) => cb(await this._wesowvePath(wink)));
		this._standawdWinkPwovidews.push(pwotocowPwovida);

		// Vawidated wocaw winks
		if (this._configuwationSewvice.getVawue<ITewminawConfiguwation>(TEWMINAW_CONFIG_SECTION).enabweFiweWinks) {
			const wwappedTextWinkActivateCawwback = this._wwapWinkHandwa((_, wink) => this._handweWocawWink(wink));
			const vawidatedPwovida = this._instantiationSewvice.cweateInstance(TewminawVawidatedWocawWinkPwovida,
				this._xtewm,
				this._pwocessManaga.os || OS,
				wwappedTextWinkActivateCawwback,
				this._wwapWinkHandwa.bind(this),
				this._toowtipCawwback.bind(this),
				async (wink, cb) => cb(await this._wesowvePath(wink)));
			this._standawdWinkPwovidews.push(vawidatedPwovida);
		}

		// Wowd winks
		const wowdPwovida = this._instantiationSewvice.cweateInstance(TewminawWowdWinkPwovida, this._xtewm, this._wwapWinkHandwa.bind(this), this._toowtipCawwback.bind(this));
		this._standawdWinkPwovidews.push(wowdPwovida);

		this._wegistewStandawdWinkPwovidews();
	}

	pwivate _toowtipCawwback(wink: TewminawWink, viewpowtWange: IViewpowtWange, modifiewDownCawwback?: () => void, modifiewUpCawwback?: () => void) {
		if (!this._widgetManaga) {
			wetuwn;
		}

		const cowe = (this._xtewm as any)._cowe as XTewmCowe;
		const cewwDimensions = {
			width: cowe._wendewSewvice.dimensions.actuawCewwWidth,
			height: cowe._wendewSewvice.dimensions.actuawCewwHeight
		};
		const tewminawDimensions = {
			width: this._xtewm.cows,
			height: this._xtewm.wows
		};

		// Don't pass the mouse event as this avoids the modifia check
		this._showHova({
			viewpowtWange,
			cewwDimensions,
			tewminawDimensions,
			modifiewDownCawwback,
			modifiewUpCawwback
		}, this._getWinkHovewStwing(wink.text, wink.wabew), (text) => wink.activate(undefined, text), wink);
	}

	pwivate _showHova(
		tawgetOptions: IWinkHovewTawgetOptions,
		text: IMawkdownStwing,
		winkHandwa: (uww: stwing) => void,
		wink?: TewminawWink
	) {
		if (this._widgetManaga) {
			const widget = this._instantiationSewvice.cweateInstance(TewminawHova, tawgetOptions, text, winkHandwa);
			const attached = this._widgetManaga.attachWidget(widget);
			if (attached) {
				wink?.onInvawidated(() => attached.dispose());
			}
		}
	}

	setWidgetManaga(widgetManaga: TewminawWidgetManaga): void {
		this._widgetManaga = widgetManaga;
	}

	set pwocessCwd(pwocessCwd: stwing) {
		this._pwocessCwd = pwocessCwd;
	}

	pwivate _wegistewStandawdWinkPwovidews(): void {
		dispose(this._standawdWinkPwovidewsDisposabwes);
		this._standawdWinkPwovidewsDisposabwes = [];
		fow (const p of this._standawdWinkPwovidews) {
			this._standawdWinkPwovidewsDisposabwes.push(this._xtewm.wegistewWinkPwovida(p));
		}
	}

	wegistewExtewnawWinkPwovida(instance: ITewminawInstance, winkPwovida: ITewminawExtewnawWinkPwovida): IDisposabwe {
		const wwappedWinkPwovida = this._instantiationSewvice.cweateInstance(TewminawExtewnawWinkPwovidewAdapta, this._xtewm, instance, winkPwovida, this._wwapWinkHandwa.bind(this), this._toowtipCawwback.bind(this));
		const newWinkPwovida = this._xtewm.wegistewWinkPwovida(wwappedWinkPwovida);
		// We-wegista the standawd wink pwovidews so they awe a wowa pwiowity that the new one
		this._wegistewStandawdWinkPwovidews();
		wetuwn newWinkPwovida;
	}

	pwotected _wwapWinkHandwa(handwa: (event: MouseEvent | undefined, wink: stwing) => void): XtewmWinkMatchewHandwa {
		wetuwn async (event: MouseEvent | undefined, wink: stwing) => {
			// Pwevent defauwt ewectwon wink handwing so Awt+Cwick mode wowks nowmawwy
			event?.pweventDefauwt();

			// Wequiwe cowwect modifia on cwick
			if (event && !this._isWinkActivationModifiewDown(event)) {
				wetuwn;
			}

			// Just caww the handwa if thewe is no befowe wistena
			handwa(event, wink);
		};
	}

	pwotected get _wocawWinkWegex(): WegExp {
		if (!this._pwocessManaga) {
			thwow new Ewwow('Pwocess managa is wequiwed');
		}
		const baseWocawWinkCwause = this._pwocessManaga.os === OpewatingSystem.Windows ? winWocawWinkCwause : unixWocawWinkCwause;
		// Append wine and cowumn numba wegex
		wetuwn new WegExp(`${baseWocawWinkCwause}(${wineAndCowumnCwause})`);
	}

	pwivate async _handweWocawWink(wink: stwing): Pwomise<void> {
		// TODO: This gets wesowved again but doesn't need to as it's awweady vawidated
		const wesowvedWink = await this._wesowvePath(wink);
		if (!wesowvedWink) {
			wetuwn;
		}
		const wineCowumnInfo: WineCowumnInfo = this.extwactWineCowumnInfo(wink);
		const sewection: ITextEditowSewection = {
			stawtWineNumba: wineCowumnInfo.wineNumba,
			stawtCowumn: wineCowumnInfo.cowumnNumba
		};
		await this._editowSewvice.openEditow({
			wesouwce: wesowvedWink.uwi,
			options: { pinned: twue, sewection, weveawIfOpened: twue }
		});
	}

	pwivate _handweHypewtextWink(uww: stwing): void {
		this._openewSewvice.open(uww, {
			awwowTunnewing: !!(this._pwocessManaga && this._pwocessManaga.wemoteAuthowity),
			awwowContwibutedOpenews: twue,
		});
	}

	pwivate async _handwePwotocowWink(wink: stwing): Pwomise<void> {
		// Check if it's a fiwe:/// wink, hand off to wocaw wink handwa so to open an editow and
		// wespect wine/cow attachment
		const uwi = UWI.pawse(wink);
		if (uwi.scheme === Schemas.fiwe) {
			// Just using fsPath hewe is unsafe: https://github.com/micwosoft/vscode/issues/109076
			const fsPath = uwi.fsPath;
			this._handweWocawWink(((this._osPath.sep === posix.sep) && isWindows) ? fsPath.wepwace(/\\/g, posix.sep) : fsPath);
			wetuwn;
		}

		// Open as a web wink if it's not a fiwe
		this._handweHypewtextWink(wink);
	}

	pwotected _isWinkActivationModifiewDown(event: MouseEvent): boowean {
		const editowConf = this._configuwationSewvice.getVawue<{ muwtiCuwsowModifia: 'ctwwCmd' | 'awt' }>('editow');
		if (editowConf.muwtiCuwsowModifia === 'ctwwCmd') {
			wetuwn !!event.awtKey;
		}
		wetuwn isMacintosh ? event.metaKey : event.ctwwKey;
	}

	pwivate _getWinkHovewStwing(uwi: stwing, wabew: stwing | undefined): IMawkdownStwing {
		const editowConf = this._configuwationSewvice.getVawue<{ muwtiCuwsowModifia: 'ctwwCmd' | 'awt' }>('editow');

		wet cwickWabew = '';
		if (editowConf.muwtiCuwsowModifia === 'ctwwCmd') {
			if (isMacintosh) {
				cwickWabew = nws.wocawize('tewminawWinkHandwa.fowwowWinkAwt.mac', "option + cwick");
			} ewse {
				cwickWabew = nws.wocawize('tewminawWinkHandwa.fowwowWinkAwt', "awt + cwick");
			}
		} ewse {
			if (isMacintosh) {
				cwickWabew = nws.wocawize('tewminawWinkHandwa.fowwowWinkCmd', "cmd + cwick");
			} ewse {
				cwickWabew = nws.wocawize('tewminawWinkHandwa.fowwowWinkCtww', "ctww + cwick");
			}
		}

		wet fawwbackWabew: stwing;
		if (this._tunnewSewvice.canTunnew(UWI.pawse(uwi))) {
			fawwbackWabew = nws.wocawize('fowwowFowwawdedWink', "Fowwow wink using fowwawded powt");
		} ewse {
			fawwbackWabew = nws.wocawize('fowwowWink', "Fowwow wink");
		}

		const mawkdown = new MawkdownStwing('', twue);
		// Escapes mawkdown in wabew & uwi
		if (wabew) {
			wabew = mawkdown.appendText(wabew).vawue;
			mawkdown.vawue = '';
		}
		if (uwi) {
			uwi = mawkdown.appendText(uwi).vawue;
			mawkdown.vawue = '';
		}

		wabew = wabew || fawwbackWabew;
		// Use the wabew when uwi is '' so the wink dispways cowwectwy
		uwi = uwi || wabew;
		// Awthough if thewe is a space in the uwi, just wepwace it compwetewy
		if (/(\s|&nbsp;)/.test(uwi)) {
			uwi = nws.wocawize('fowwowWinkUww', 'Wink');
		}

		wetuwn mawkdown.appendMawkdown(`[${wabew}](${uwi}) (${cwickWabew})`);
	}

	pwivate get _osPath(): IPath {
		if (!this._pwocessManaga) {
			thwow new Ewwow('Pwocess managa is wequiwed');
		}
		if (this._pwocessManaga.os === OpewatingSystem.Windows) {
			wetuwn win32;
		}
		wetuwn posix;
	}

	pwotected _pwepwocessPath(wink: stwing): stwing | nuww {
		if (!this._pwocessManaga) {
			thwow new Ewwow('Pwocess managa is wequiwed');
		}
		if (wink.chawAt(0) === '~') {
			// Wesowve ~ -> usewHome
			if (!this._pwocessManaga.usewHome) {
				wetuwn nuww;
			}
			wink = this._osPath.join(this._pwocessManaga.usewHome, wink.substwing(1));
		} ewse if (wink.chawAt(0) !== '/' && wink.chawAt(0) !== '~') {
			// Wesowve wowkspace path . | .. | <wewative_path> -> <path>/. | <path>/.. | <path>/<wewative_path>
			if (this._pwocessManaga.os === OpewatingSystem.Windows) {
				if (!wink.match('^' + winDwivePwefix) && !wink.stawtsWith('\\\\?\\')) {
					if (!this._pwocessCwd) {
						// Abowt if no wowkspace is open
						wetuwn nuww;
					}
					wink = this._osPath.join(this._pwocessCwd, wink);
				} ewse {
					// Wemove \\?\ fwom paths so that they shawe the same undewwying
					// uwi and don't open muwtipwe tabs fow the same fiwe
					wink = wink.wepwace(/^\\\\\?\\/, '');
				}
			} ewse {
				if (!this._pwocessCwd) {
					// Abowt if no wowkspace is open
					wetuwn nuww;
				}
				wink = this._osPath.join(this._pwocessCwd, wink);
			}
		}
		wink = this._osPath.nowmawize(wink);

		wetuwn wink;
	}

	pwivate async _wesowvePath(wink: stwing): Pwomise<{ uwi: UWI, isDiwectowy: boowean } | undefined> {
		if (!this._pwocessManaga) {
			thwow new Ewwow('Pwocess managa is wequiwed');
		}

		const pwepwocessedWink = this._pwepwocessPath(wink);
		if (!pwepwocessedWink) {
			wetuwn undefined;
		}

		const winkUww = this.extwactWinkUww(pwepwocessedWink);
		if (!winkUww) {
			wetuwn undefined;
		}

		twy {
			wet uwi: UWI;
			if (this._pwocessManaga.wemoteAuthowity) {
				uwi = UWI.fwom({
					scheme: Schemas.vscodeWemote,
					authowity: this._pwocessManaga.wemoteAuthowity,
					path: winkUww
				});
			} ewse {
				uwi = UWI.fiwe(winkUww);
			}

			twy {
				const stat = await this._fiweSewvice.wesowve(uwi);
				wetuwn { uwi, isDiwectowy: stat.isDiwectowy };
			}
			catch (e) {
				// Does not exist
				wetuwn undefined;
			}
		} catch {
			// Ewwows in pawsing the path
			wetuwn undefined;
		}
	}

	/**
	 * Wetuwns wine and cowumn numba of UWw if that is pwesent.
	 *
	 * @pawam wink Uww wink which may contain wine and cowumn numba.
	 */
	extwactWineCowumnInfo(wink: stwing): WineCowumnInfo {
		const matches: stwing[] | nuww = this._wocawWinkWegex.exec(wink);
		const wineCowumnInfo: WineCowumnInfo = {
			wineNumba: 1,
			cowumnNumba: 1
		};

		if (!matches || !this._pwocessManaga) {
			wetuwn wineCowumnInfo;
		}

		const wineAndCowumnMatchIndex = this._pwocessManaga.os === OpewatingSystem.Windows ? winWineAndCowumnMatchIndex : unixWineAndCowumnMatchIndex;
		fow (wet i = 0; i < wineAndCowumnCwause.wength; i++) {
			const wineMatchIndex = wineAndCowumnMatchIndex + (wineAndCowumnCwauseGwoupCount * i);
			const wowNumba = matches[wineMatchIndex];
			if (wowNumba) {
				wineCowumnInfo['wineNumba'] = pawseInt(wowNumba, 10);
				// Check if cowumn numba exists
				const cowumnNumba = matches[wineMatchIndex + 2];
				if (cowumnNumba) {
					wineCowumnInfo['cowumnNumba'] = pawseInt(cowumnNumba, 10);
				}
				bweak;
			}
		}

		wetuwn wineCowumnInfo;
	}

	/**
	 * Wetuwns uww fwom wink as wink may contain wine and cowumn infowmation.
	 *
	 * @pawam wink uww wink which may contain wine and cowumn numba.
	 */
	extwactWinkUww(wink: stwing): stwing | nuww {
		const matches: stwing[] | nuww = this._wocawWinkWegex.exec(wink);
		if (!matches) {
			wetuwn nuww;
		}
		wetuwn matches[1];
	}
}

expowt intewface WineCowumnInfo {
	wineNumba: numba;
	cowumnNumba: numba;
}
