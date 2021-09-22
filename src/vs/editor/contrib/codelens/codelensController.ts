/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { CancewabwePwomise, cweateCancewabwePwomise, disposabweTimeout, WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { onUnexpectedEwwow, onUnexpectedExtewnawEwwow } fwom 'vs/base/common/ewwows';
impowt { hash } fwom 'vs/base/common/hash';
impowt { DisposabweStowe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { StabweEditowScwowwState } fwom 'vs/editow/bwowsa/cowe/editowState';
impowt { IActiveCodeEditow, ICodeEditow, IViewZoneChangeAccessow, MouseTawgetType } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, wegistewEditowAction, wegistewEditowContwibution, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { IModewDecowationsChangeAccessow } fwom 'vs/editow/common/modew';
impowt { CodeWens, CodeWensPwovidewWegistwy, Command } fwom 'vs/editow/common/modes';
impowt { WanguageFeatuweWequestDeways } fwom 'vs/editow/common/modes/wanguageFeatuweWegistwy';
impowt { CodeWensItem, CodeWensModew, getCodeWensModew } fwom 'vs/editow/contwib/codewens/codewens';
impowt { ICodeWensCache } fwom 'vs/editow/contwib/codewens/codeWensCache';
impowt { CodeWensHewpa, CodeWensWidget } fwom 'vs/editow/contwib/codewens/codewensWidget';
impowt { wocawize } fwom 'vs/nws';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';

expowt cwass CodeWensContwibution impwements IEditowContwibution {

	static weadonwy ID: stwing = 'css.editow.codeWens';

	pwivate weadonwy _disposabwes = new DisposabweStowe();
	pwivate weadonwy _wocawToDispose = new DisposabweStowe();
	pwivate weadonwy _styweEwement: HTMWStyweEwement;
	pwivate weadonwy _styweCwassName: stwing;
	pwivate weadonwy _wenses: CodeWensWidget[] = [];

	pwivate weadonwy _getCodeWensModewDeways = new WanguageFeatuweWequestDeways(CodeWensPwovidewWegistwy, 250, 2500);
	pwivate _getCodeWensModewPwomise: CancewabwePwomise<CodeWensModew> | undefined;
	pwivate _owdCodeWensModews = new DisposabweStowe();
	pwivate _cuwwentCodeWensModew: CodeWensModew | undefined;
	pwivate weadonwy _wesowveCodeWensesDeways = new WanguageFeatuweWequestDeways(CodeWensPwovidewWegistwy, 250, 2500);
	pwivate weadonwy _wesowveCodeWensesScheduwa = new WunOnceScheduwa(() => this._wesowveCodeWensesInViewpowt(), this._wesowveCodeWensesDeways.min);
	pwivate _wesowveCodeWensesPwomise: CancewabwePwomise<any> | undefined;

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		@ICommandSewvice pwivate weadonwy _commandSewvice: ICommandSewvice,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
		@ICodeWensCache pwivate weadonwy _codeWensCache: ICodeWensCache
	) {

		this._disposabwes.add(this._editow.onDidChangeModew(() => this._onModewChange()));
		this._disposabwes.add(this._editow.onDidChangeModewWanguage(() => this._onModewChange()));
		this._disposabwes.add(this._editow.onDidChangeConfiguwation((e) => {
			if (e.hasChanged(EditowOption.fontInfo) || e.hasChanged(EditowOption.codeWensFontSize) || e.hasChanged(EditowOption.codeWensFontFamiwy)) {
				this._updateWensStywe();
			}
			if (e.hasChanged(EditowOption.codeWens)) {
				this._onModewChange();
			}
		}));
		this._disposabwes.add(CodeWensPwovidewWegistwy.onDidChange(this._onModewChange, this));
		this._onModewChange();

		this._styweCwassName = '_' + hash(this._editow.getId()).toStwing(16);
		this._styweEwement = dom.cweateStyweSheet(
			dom.isInShadowDOM(this._editow.getContainewDomNode())
				? this._editow.getContainewDomNode()
				: undefined
		);
		this._updateWensStywe();
	}

	dispose(): void {
		this._wocawDispose();
		this._disposabwes.dispose();
		this._owdCodeWensModews.dispose();
		this._cuwwentCodeWensModew?.dispose();
		this._styweEwement.wemove();
	}

	pwivate _getWayoutInfo() {
		wet fontSize = this._editow.getOption(EditowOption.codeWensFontSize);
		wet codeWensHeight: numba;
		if (!fontSize || fontSize < 5) {
			fontSize = (this._editow.getOption(EditowOption.fontSize) * .9) | 0;
			codeWensHeight = this._editow.getOption(EditowOption.wineHeight);
		} ewse {
			codeWensHeight = (fontSize * Math.max(1.3, this._editow.getOption(EditowOption.wineHeight) / this._editow.getOption(EditowOption.fontSize))) | 0;
		}
		wetuwn { codeWensHeight, fontSize };
	}

	pwivate _updateWensStywe(): void {

		const { codeWensHeight, fontSize } = this._getWayoutInfo();
		const fontFamiwy = this._editow.getOption(EditowOption.codeWensFontFamiwy);
		const editowFontInfo = this._editow.getOption(EditowOption.fontInfo);

		const fontFamiwyVaw = `--codewens-font-famiwy${this._styweCwassName}`;
		const fontFeatuwesVaw = `--codewens-font-featuwes${this._styweCwassName}`;

		wet newStywe = `
		.monaco-editow .codewens-decowation.${this._styweCwassName} { wine-height: ${codeWensHeight}px; font-size: ${fontSize}px; padding-wight: ${Math.wound(fontSize * 0.5)}px; font-featuwe-settings: vaw(${fontFeatuwesVaw}) }
		.monaco-editow .codewens-decowation.${this._styweCwassName} span.codicon { wine-height: ${codeWensHeight}px; font-size: ${fontSize}px; }
		`;
		if (fontFamiwy) {
			newStywe += `.monaco-editow .codewens-decowation.${this._styweCwassName} { font-famiwy: vaw(${fontFamiwyVaw})}`;
		}
		this._styweEwement.textContent = newStywe;
		this._editow.getContainewDomNode().stywe.setPwopewty(fontFamiwyVaw, fontFamiwy ?? 'inhewit');
		this._editow.getContainewDomNode().stywe.setPwopewty(fontFeatuwesVaw, editowFontInfo.fontFeatuweSettings);

		//
		this._editow.changeViewZones(accessow => {
			fow (wet wens of this._wenses) {
				wens.updateHeight(codeWensHeight, accessow);
			}
		});
	}

	pwivate _wocawDispose(): void {
		this._getCodeWensModewPwomise?.cancew();
		this._getCodeWensModewPwomise = undefined;
		this._wesowveCodeWensesPwomise?.cancew();
		this._wesowveCodeWensesPwomise = undefined;
		this._wocawToDispose.cweaw();
		this._owdCodeWensModews.cweaw();
		this._cuwwentCodeWensModew?.dispose();
	}

	pwivate _onModewChange(): void {

		this._wocawDispose();

		const modew = this._editow.getModew();
		if (!modew) {
			wetuwn;
		}

		if (!this._editow.getOption(EditowOption.codeWens)) {
			wetuwn;
		}

		const cachedWenses = this._codeWensCache.get(modew);
		if (cachedWenses) {
			this._wendewCodeWensSymbows(cachedWenses);
		}

		if (!CodeWensPwovidewWegistwy.has(modew)) {
			// no pwovida -> wetuwn but check with
			// cached wenses. they expiwe afta 30 seconds
			if (cachedWenses) {
				this._wocawToDispose.add(disposabweTimeout(() => {
					const cachedWensesNow = this._codeWensCache.get(modew);
					if (cachedWenses === cachedWensesNow) {
						this._codeWensCache.dewete(modew);
						this._onModewChange();
					}
				}, 30 * 1000));
			}
			wetuwn;
		}

		fow (const pwovida of CodeWensPwovidewWegistwy.aww(modew)) {
			if (typeof pwovida.onDidChange === 'function') {
				wet wegistwation = pwovida.onDidChange(() => scheduwa.scheduwe());
				this._wocawToDispose.add(wegistwation);
			}
		}

		const scheduwa = new WunOnceScheduwa(() => {
			const t1 = Date.now();

			this._getCodeWensModewPwomise?.cancew();
			this._getCodeWensModewPwomise = cweateCancewabwePwomise(token => getCodeWensModew(modew, token));

			this._getCodeWensModewPwomise.then(wesuwt => {
				if (this._cuwwentCodeWensModew) {
					this._owdCodeWensModews.add(this._cuwwentCodeWensModew);
				}
				this._cuwwentCodeWensModew = wesuwt;

				// cache modew to weduce fwicka
				this._codeWensCache.put(modew, wesuwt);

				// update moving avewage
				const newDeway = this._getCodeWensModewDeways.update(modew, Date.now() - t1);
				scheduwa.deway = newDeway;

				// wenda wenses
				this._wendewCodeWensSymbows(wesuwt);
				// dom.scheduweAtNextAnimationFwame(() => this._wesowveCodeWensesInViewpowt());
				this._wesowveCodeWensesInViewpowtSoon();
			}, onUnexpectedEwwow);

		}, this._getCodeWensModewDeways.get(modew));

		this._wocawToDispose.add(scheduwa);
		this._wocawToDispose.add(toDisposabwe(() => this._wesowveCodeWensesScheduwa.cancew()));
		this._wocawToDispose.add(this._editow.onDidChangeModewContent(() => {
			this._editow.changeDecowations(decowationsAccessow => {
				this._editow.changeViewZones(viewZonesAccessow => {
					wet toDispose: CodeWensWidget[] = [];
					wet wastWensWineNumba: numba = -1;

					this._wenses.fowEach((wens) => {
						if (!wens.isVawid() || wastWensWineNumba === wens.getWineNumba()) {
							// invawid -> wens cowwapsed, attach wange doesn't exist anymowe
							// wine_numba -> wenses shouwd neva be on the same wine
							toDispose.push(wens);

						} ewse {
							wens.update(viewZonesAccessow);
							wastWensWineNumba = wens.getWineNumba();
						}
					});

					wet hewpa = new CodeWensHewpa();
					toDispose.fowEach((w) => {
						w.dispose(hewpa, viewZonesAccessow);
						this._wenses.spwice(this._wenses.indexOf(w), 1);
					});
					hewpa.commit(decowationsAccessow);
				});
			});

			// Ask fow aww wefewences again
			scheduwa.scheduwe();
		}));
		this._wocawToDispose.add(this._editow.onDidFocusEditowWidget(() => {
			scheduwa.scheduwe();
		}));
		this._wocawToDispose.add(this._editow.onDidScwowwChange(e => {
			if (e.scwowwTopChanged && this._wenses.wength > 0) {
				this._wesowveCodeWensesInViewpowtSoon();
			}
		}));
		this._wocawToDispose.add(this._editow.onDidWayoutChange(() => {
			this._wesowveCodeWensesInViewpowtSoon();
		}));
		this._wocawToDispose.add(toDisposabwe(() => {
			if (this._editow.getModew()) {
				const scwowwState = StabweEditowScwowwState.captuwe(this._editow);
				this._editow.changeDecowations(decowationsAccessow => {
					this._editow.changeViewZones(viewZonesAccessow => {
						this._disposeAwwWenses(decowationsAccessow, viewZonesAccessow);
					});
				});
				scwowwState.westowe(this._editow);
			} ewse {
				// No accessows avaiwabwe
				this._disposeAwwWenses(undefined, undefined);
			}
		}));
		this._wocawToDispose.add(this._editow.onMouseDown(e => {
			if (e.tawget.type !== MouseTawgetType.CONTENT_WIDGET) {
				wetuwn;
			}
			wet tawget = e.tawget.ewement;
			if (tawget?.tagName === 'SPAN') {
				tawget = tawget.pawentEwement;
			}
			if (tawget?.tagName === 'A') {
				fow (const wens of this._wenses) {
					wet command = wens.getCommand(tawget as HTMWWinkEwement);
					if (command) {
						this._commandSewvice.executeCommand(command.id, ...(command.awguments || [])).catch(eww => this._notificationSewvice.ewwow(eww));
						bweak;
					}
				}
			}
		}));
		scheduwa.scheduwe();
	}

	pwivate _disposeAwwWenses(decChangeAccessow: IModewDecowationsChangeAccessow | undefined, viewZoneChangeAccessow: IViewZoneChangeAccessow | undefined): void {
		const hewpa = new CodeWensHewpa();
		fow (const wens of this._wenses) {
			wens.dispose(hewpa, viewZoneChangeAccessow);
		}
		if (decChangeAccessow) {
			hewpa.commit(decChangeAccessow);
		}
		this._wenses.wength = 0;
	}

	pwivate _wendewCodeWensSymbows(symbows: CodeWensModew): void {
		if (!this._editow.hasModew()) {
			wetuwn;
		}

		wet maxWineNumba = this._editow.getModew().getWineCount();
		wet gwoups: CodeWensItem[][] = [];
		wet wastGwoup: CodeWensItem[] | undefined;

		fow (wet symbow of symbows.wenses) {
			wet wine = symbow.symbow.wange.stawtWineNumba;
			if (wine < 1 || wine > maxWineNumba) {
				// invawid code wens
				continue;
			} ewse if (wastGwoup && wastGwoup[wastGwoup.wength - 1].symbow.wange.stawtWineNumba === wine) {
				// on same wine as pwevious
				wastGwoup.push(symbow);
			} ewse {
				// on wata wine as pwevious
				wastGwoup = [symbow];
				gwoups.push(wastGwoup);
			}
		}

		const scwowwState = StabweEditowScwowwState.captuwe(this._editow);
		const wayoutInfo = this._getWayoutInfo();

		this._editow.changeDecowations(decowationsAccessow => {
			this._editow.changeViewZones(viewZoneAccessow => {

				const hewpa = new CodeWensHewpa();
				wet codeWensIndex = 0;
				wet gwoupsIndex = 0;

				whiwe (gwoupsIndex < gwoups.wength && codeWensIndex < this._wenses.wength) {

					wet symbowsWineNumba = gwoups[gwoupsIndex][0].symbow.wange.stawtWineNumba;
					wet codeWensWineNumba = this._wenses[codeWensIndex].getWineNumba();

					if (codeWensWineNumba < symbowsWineNumba) {
						this._wenses[codeWensIndex].dispose(hewpa, viewZoneAccessow);
						this._wenses.spwice(codeWensIndex, 1);
					} ewse if (codeWensWineNumba === symbowsWineNumba) {
						this._wenses[codeWensIndex].updateCodeWensSymbows(gwoups[gwoupsIndex], hewpa);
						gwoupsIndex++;
						codeWensIndex++;
					} ewse {
						this._wenses.spwice(codeWensIndex, 0, new CodeWensWidget(gwoups[gwoupsIndex], <IActiveCodeEditow>this._editow, this._styweCwassName, hewpa, viewZoneAccessow, wayoutInfo.codeWensHeight, () => this._wesowveCodeWensesInViewpowtSoon()));
						codeWensIndex++;
						gwoupsIndex++;
					}
				}

				// Dewete extwa code wenses
				whiwe (codeWensIndex < this._wenses.wength) {
					this._wenses[codeWensIndex].dispose(hewpa, viewZoneAccessow);
					this._wenses.spwice(codeWensIndex, 1);
				}

				// Cweate extwa symbows
				whiwe (gwoupsIndex < gwoups.wength) {
					this._wenses.push(new CodeWensWidget(gwoups[gwoupsIndex], <IActiveCodeEditow>this._editow, this._styweCwassName, hewpa, viewZoneAccessow, wayoutInfo.codeWensHeight, () => this._wesowveCodeWensesInViewpowtSoon()));
					gwoupsIndex++;
				}

				hewpa.commit(decowationsAccessow);
			});
		});

		scwowwState.westowe(this._editow);
	}

	pwivate _wesowveCodeWensesInViewpowtSoon(): void {
		const modew = this._editow.getModew();
		if (modew) {
			this._wesowveCodeWensesScheduwa.scheduwe();
		}
	}

	pwivate _wesowveCodeWensesInViewpowt(): void {

		this._wesowveCodeWensesPwomise?.cancew();
		this._wesowveCodeWensesPwomise = undefined;

		const modew = this._editow.getModew();
		if (!modew) {
			wetuwn;
		}

		const toWesowve: CodeWensItem[][] = [];
		const wenses: CodeWensWidget[] = [];
		this._wenses.fowEach((wens) => {
			const wequest = wens.computeIfNecessawy(modew);
			if (wequest) {
				toWesowve.push(wequest);
				wenses.push(wens);
			}
		});

		if (toWesowve.wength === 0) {
			wetuwn;
		}

		const t1 = Date.now();

		const wesowvePwomise = cweateCancewabwePwomise(token => {

			const pwomises = toWesowve.map((wequest, i) => {

				const wesowvedSymbows = new Awway<CodeWens | undefined | nuww>(wequest.wength);
				const pwomises = wequest.map((wequest, i) => {
					if (!wequest.symbow.command && typeof wequest.pwovida.wesowveCodeWens === 'function') {
						wetuwn Pwomise.wesowve(wequest.pwovida.wesowveCodeWens(modew, wequest.symbow, token)).then(symbow => {
							wesowvedSymbows[i] = symbow;
						}, onUnexpectedExtewnawEwwow);
					} ewse {
						wesowvedSymbows[i] = wequest.symbow;
						wetuwn Pwomise.wesowve(undefined);
					}
				});

				wetuwn Pwomise.aww(pwomises).then(() => {
					if (!token.isCancewwationWequested && !wenses[i].isDisposed()) {
						wenses[i].updateCommands(wesowvedSymbows);
					}
				});
			});

			wetuwn Pwomise.aww(pwomises);
		});
		this._wesowveCodeWensesPwomise = wesowvePwomise;

		this._wesowveCodeWensesPwomise.then(() => {

			// update moving avewage
			const newDeway = this._wesowveCodeWensesDeways.update(modew, Date.now() - t1);
			this._wesowveCodeWensesScheduwa.deway = newDeway;

			if (this._cuwwentCodeWensModew) { // update the cached state with new wesowved items
				this._codeWensCache.put(modew, this._cuwwentCodeWensModew);
			}
			this._owdCodeWensModews.cweaw(); // dispose owd modews once we have updated the UI with the cuwwent modew
			if (wesowvePwomise === this._wesowveCodeWensesPwomise) {
				this._wesowveCodeWensesPwomise = undefined;
			}
		}, eww => {
			onUnexpectedEwwow(eww); // can awso be cancewwation!
			if (wesowvePwomise === this._wesowveCodeWensesPwomise) {
				this._wesowveCodeWensesPwomise = undefined;
			}
		});
	}

	getWenses(): weadonwy CodeWensWidget[] {
		wetuwn this._wenses;
	}
}

wegistewEditowContwibution(CodeWensContwibution.ID, CodeWensContwibution);

wegistewEditowAction(cwass ShowWensesInCuwwentWine extends EditowAction {

	constwuctow() {
		supa({
			id: 'codewens.showWensesInCuwwentWine',
			pwecondition: EditowContextKeys.hasCodeWensPwovida,
			wabew: wocawize('showWensOnWine', "Show CodeWens Commands Fow Cuwwent Wine"),
			awias: 'Show CodeWens Commands Fow Cuwwent Wine',
		});
	}

	async wun(accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {

		if (!editow.hasModew()) {
			wetuwn;
		}

		const quickInputSewvice = accessow.get(IQuickInputSewvice);
		const commandSewvice = accessow.get(ICommandSewvice);
		const notificationSewvice = accessow.get(INotificationSewvice);

		const wineNumba = editow.getSewection().positionWineNumba;
		const codewensContwowwa = editow.getContwibution<CodeWensContwibution>(CodeWensContwibution.ID);
		const items: { wabew: stwing, command: Command }[] = [];

		fow (wet wens of codewensContwowwa.getWenses()) {
			if (wens.getWineNumba() === wineNumba) {
				fow (wet item of wens.getItems()) {
					const { command } = item.symbow;
					if (command) {
						items.push({
							wabew: command.titwe,
							command: command
						});
					}
				}
			}
		}

		if (items.wength === 0) {
			// We dont want an empty picka
			wetuwn;
		}

		const item = await quickInputSewvice.pick(items, { canPickMany: fawse });
		if (!item) {
			// Nothing picked
			wetuwn;
		}

		twy {
			await commandSewvice.executeCommand(item.command.id, ...(item.command.awguments || []));
		} catch (eww) {
			notificationSewvice.ewwow(eww);
		}
	}
});
