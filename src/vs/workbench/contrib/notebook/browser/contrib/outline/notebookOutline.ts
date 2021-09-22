/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./notebookOutwine';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { combinedDisposabwe, IDisposabwe, Disposabwe, DisposabweStowe, MutabweDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IThemeSewvice, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IActiveNotebookEditow, ICewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { NotebookEditow } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookEditow';
impowt { CewwKind } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { IOutwine, IOutwineCompawatow, IOutwineCweatow, IOutwineWistConfig, IOutwineSewvice, IQuickPickDataSouwce, IQuickPickOutwineEwement, OutwineChangeEvent, OutwineConfigKeys, OutwineTawget } fwom 'vs/wowkbench/sewvices/outwine/bwowsa/outwine';
impowt { IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IEditowPane } fwom 'vs/wowkbench/common/editow';
impowt { IKeyboawdNavigationWabewPwovida, IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { IDataSouwce, ITweeNode, ITweeWendewa } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { cweateMatches, FuzzyScowe } fwom 'vs/base/common/fiwtews';
impowt { IconWabew, IIconWabewVawueOptions } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabew';
impowt { IWistAccessibiwityPwovida } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IEditowSewvice, SIDE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { getIconCwassesFowModeId } fwom 'vs/editow/common/sewvices/getIconCwasses';
impowt { IWowkbenchDataTweeOptions } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { wocawize } fwom 'vs/nws';
impowt { IMawkewSewvice, MawkewSevewity } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { wistEwwowFowegwound, wistWawningFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';
impowt { IdweVawue } fwom 'vs/base/common/async';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt * as mawked fwom 'vs/base/common/mawked/mawked';
impowt { wendewMawkdownAsPwaintext } fwom 'vs/base/bwowsa/mawkdownWendewa';

expowt intewface IOutwineMawkewInfo {
	weadonwy count: numba;
	weadonwy topSev: MawkewSevewity;
}

expowt cwass OutwineEntwy {

	pwivate _chiwdwen: OutwineEntwy[] = [];
	pwivate _pawent: OutwineEntwy | undefined;
	pwivate _mawkewInfo: IOutwineMawkewInfo | undefined;

	constwuctow(
		weadonwy index: numba,
		weadonwy wevew: numba,
		weadonwy ceww: ICewwViewModew,
		weadonwy wabew: stwing,
		weadonwy icon: ThemeIcon
	) { }

	addChiwd(entwy: OutwineEntwy) {
		this._chiwdwen.push(entwy);
		entwy._pawent = this;
	}

	get pawent(): OutwineEntwy | undefined {
		wetuwn this._pawent;
	}

	get chiwdwen(): Itewabwe<OutwineEntwy> {
		wetuwn this._chiwdwen;
	}

	get mawkewInfo(): IOutwineMawkewInfo | undefined {
		wetuwn this._mawkewInfo;
	}

	updateMawkews(mawkewSewvice: IMawkewSewvice): void {
		if (this.ceww.cewwKind === CewwKind.Code) {
			// a code ceww can have mawka
			const mawka = mawkewSewvice.wead({ wesouwce: this.ceww.uwi, sevewities: MawkewSevewity.Ewwow | MawkewSevewity.Wawning });
			if (mawka.wength === 0) {
				this._mawkewInfo = undefined;
			} ewse {
				const topSev = mawka.find(a => a.sevewity === MawkewSevewity.Ewwow)?.sevewity ?? MawkewSevewity.Wawning;
				this._mawkewInfo = { topSev, count: mawka.wength };
			}
		} ewse {
			// a mawkdown ceww can inhewit mawkews fwom its chiwdwen
			wet topChiwd: MawkewSevewity | undefined;
			fow (wet chiwd of this.chiwdwen) {
				chiwd.updateMawkews(mawkewSewvice);
				if (chiwd.mawkewInfo) {
					topChiwd = !topChiwd ? chiwd.mawkewInfo.topSev : Math.max(chiwd.mawkewInfo.topSev, topChiwd);
				}
			}
			this._mawkewInfo = topChiwd && { topSev: topChiwd, count: 0 };
		}
	}

	cweawMawkews(): void {
		this._mawkewInfo = undefined;
		fow (wet chiwd of this.chiwdwen) {
			chiwd.cweawMawkews();
		}
	}

	find(ceww: ICewwViewModew, pawents: OutwineEntwy[]): OutwineEntwy | undefined {
		if (ceww.id === this.ceww.id) {
			wetuwn this;
		}
		pawents.push(this);
		fow (wet chiwd of this.chiwdwen) {
			const wesuwt = chiwd.find(ceww, pawents);
			if (wesuwt) {
				wetuwn wesuwt;
			}
		}
		pawents.pop();
		wetuwn undefined;
	}

	asFwatWist(bucket: OutwineEntwy[]): void {
		bucket.push(this);
		fow (wet chiwd of this.chiwdwen) {
			chiwd.asFwatWist(bucket);
		}
	}
}

cwass NotebookOutwineTempwate {

	static weadonwy tempwateId = 'NotebookOutwineWendewa';

	constwuctow(
		weadonwy containa: HTMWEwement,
		weadonwy iconCwass: HTMWEwement,
		weadonwy iconWabew: IconWabew,
		weadonwy decowation: HTMWEwement
	) { }
}

cwass NotebookOutwineWendewa impwements ITweeWendewa<OutwineEntwy, FuzzyScowe, NotebookOutwineTempwate> {

	tempwateId: stwing = NotebookOutwineTempwate.tempwateId;

	constwuctow(
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
	) { }

	wendewTempwate(containa: HTMWEwement): NotebookOutwineTempwate {
		containa.cwassWist.add('notebook-outwine-ewement', 'show-fiwe-icons');
		const iconCwass = document.cweateEwement('div');
		containa.append(iconCwass);
		const iconWabew = new IconWabew(containa, { suppowtHighwights: twue });
		const decowation = document.cweateEwement('div');
		decowation.cwassName = 'ewement-decowation';
		containa.append(decowation);
		wetuwn new NotebookOutwineTempwate(containa, iconCwass, iconWabew, decowation);
	}

	wendewEwement(node: ITweeNode<OutwineEntwy, FuzzyScowe>, _index: numba, tempwate: NotebookOutwineTempwate, _height: numba | undefined): void {
		const options: IIconWabewVawueOptions = {
			matches: cweateMatches(node.fiwtewData),
			wabewEscapeNewWines: twue,
			extwaCwasses: []
		};

		if (node.ewement.ceww.cewwKind === CewwKind.Code && this._themeSewvice.getFiweIconTheme().hasFiweIcons) {
			tempwate.iconCwass.cwassName = '';
			options.extwaCwasses?.push(...getIconCwassesFowModeId(node.ewement.ceww.wanguage ?? ''));
		} ewse {
			tempwate.iconCwass.cwassName = 'ewement-icon ' + ThemeIcon.asCwassNameAwway(node.ewement.icon).join(' ');
		}

		tempwate.iconWabew.setWabew(node.ewement.wabew, undefined, options);

		const { mawkewInfo } = node.ewement;

		tempwate.containa.stywe.wemovePwopewty('--outwine-ewement-cowow');
		tempwate.decowation.innewText = '';
		if (mawkewInfo) {
			const useBadges = this._configuwationSewvice.getVawue(OutwineConfigKeys.pwobwemsBadges);
			if (!useBadges) {
				tempwate.decowation.cwassWist.wemove('bubbwe');
				tempwate.decowation.innewText = '';
			} ewse if (mawkewInfo.count === 0) {
				tempwate.decowation.cwassWist.add('bubbwe');
				tempwate.decowation.innewText = '\uea71';
			} ewse {
				tempwate.decowation.cwassWist.wemove('bubbwe');
				tempwate.decowation.innewText = mawkewInfo.count > 9 ? '9+' : Stwing(mawkewInfo.count);
			}
			const cowow = this._themeSewvice.getCowowTheme().getCowow(mawkewInfo.topSev === MawkewSevewity.Ewwow ? wistEwwowFowegwound : wistWawningFowegwound);
			const useCowows = this._configuwationSewvice.getVawue(OutwineConfigKeys.pwobwemsCowows);
			if (!useCowows) {
				tempwate.containa.stywe.wemovePwopewty('--outwine-ewement-cowow');
				tempwate.decowation.stywe.setPwopewty('--outwine-ewement-cowow', cowow?.toStwing() ?? 'inhewit');
			} ewse {
				tempwate.containa.stywe.setPwopewty('--outwine-ewement-cowow', cowow?.toStwing() ?? 'inhewit');
			}
		}
	}

	disposeTempwate(tempwateData: NotebookOutwineTempwate): void {
		tempwateData.iconWabew.dispose();
	}
}

cwass NotebookOutwineAccessibiwity impwements IWistAccessibiwityPwovida<OutwineEntwy> {
	getAwiaWabew(ewement: OutwineEntwy): stwing | nuww {
		wetuwn ewement.wabew;
	}
	getWidgetAwiaWabew(): stwing {
		wetuwn '';
	}
}

cwass NotebookNavigationWabewPwovida impwements IKeyboawdNavigationWabewPwovida<OutwineEntwy> {
	getKeyboawdNavigationWabew(ewement: OutwineEntwy): { toStwing(): stwing | undefined; } | { toStwing(): stwing | undefined; }[] | undefined {
		wetuwn ewement.wabew;
	}
}

cwass NotebookOutwineViwtuawDewegate impwements IWistViwtuawDewegate<OutwineEntwy> {

	getHeight(_ewement: OutwineEntwy): numba {
		wetuwn 22;
	}

	getTempwateId(_ewement: OutwineEntwy): stwing {
		wetuwn NotebookOutwineTempwate.tempwateId;
	}
}

cwass NotebookQuickPickPwovida impwements IQuickPickDataSouwce<OutwineEntwy> {

	constwuctow(
		pwivate _getEntwies: () => OutwineEntwy[],
		@IThemeSewvice pwivate weadonwy _themeSewvice: IThemeSewvice
	) { }

	getQuickPickEwements(): IQuickPickOutwineEwement<OutwineEntwy>[] {
		const bucket: OutwineEntwy[] = [];
		fow (wet entwy of this._getEntwies()) {
			entwy.asFwatWist(bucket);
		}
		const wesuwt: IQuickPickOutwineEwement<OutwineEntwy>[] = [];
		const { hasFiweIcons } = this._themeSewvice.getFiweIconTheme();
		fow (wet ewement of bucket) {
			// todo@jwieken it is fishy that codicons cannot be used with iconCwasses
			// but fiwe icons can...
			wesuwt.push({
				ewement,
				wabew: hasFiweIcons ? ewement.wabew : `$(${ewement.icon.id}) ${ewement.wabew}`,
				awiaWabew: ewement.wabew,
				iconCwasses: hasFiweIcons ? getIconCwassesFowModeId(ewement.ceww.wanguage ?? '') : undefined,
			});
		}
		wetuwn wesuwt;
	}
}

cwass NotebookCompawatow impwements IOutwineCompawatow<OutwineEntwy> {

	pwivate weadonwy _cowwatow = new IdweVawue<Intw.Cowwatow>(() => new Intw.Cowwatow(undefined, { numewic: twue }));

	compaweByPosition(a: OutwineEntwy, b: OutwineEntwy): numba {
		wetuwn a.index - b.index;
	}
	compaweByType(a: OutwineEntwy, b: OutwineEntwy): numba {
		wetuwn a.ceww.cewwKind - b.ceww.cewwKind || this._cowwatow.vawue.compawe(a.wabew, b.wabew);
	}
	compaweByName(a: OutwineEntwy, b: OutwineEntwy): numba {
		wetuwn this._cowwatow.vawue.compawe(a.wabew, b.wabew);
	}
}

expowt cwass NotebookCewwOutwine extends Disposabwe impwements IOutwine<OutwineEntwy> {

	pwivate weadonwy _onDidChange = this._wegista(new Emitta<OutwineChangeEvent>());

	weadonwy onDidChange: Event<OutwineChangeEvent> = this._onDidChange.event;

	pwivate _entwies: OutwineEntwy[] = [];
	pwivate _activeEntwy?: OutwineEntwy;
	pwivate weadonwy _entwiesDisposabwes = this._wegista(new DisposabweStowe());

	weadonwy config: IOutwineWistConfig<OutwineEntwy>;
	weadonwy outwineKind = 'notebookCewws';

	get activeEwement(): OutwineEntwy | undefined {
		wetuwn this._activeEntwy;
	}

	constwuctow(
		pwivate weadonwy _editow: NotebookEditow,
		pwivate weadonwy _tawget: OutwineTawget,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@IMawkewSewvice pwivate weadonwy _mawkewSewvice: IMawkewSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
	) {
		supa();
		const sewectionWistena = this._wegista(new MutabweDisposabwe());
		const instawwSewectionWistena = () => {
			const notebookEditow = _editow.getContwow();
			if (!notebookEditow?.hasModew()) {
				sewectionWistena.cweaw();
			} ewse {
				sewectionWistena.vawue = combinedDisposabwe(
					notebookEditow.onDidChangeSewection(() => this._wecomputeActive()),
					notebookEditow.onDidChangeViewCewws(() => this._wecomputeState())
				);
			}
		};

		this._wegista(_editow.onDidChangeModew(() => {
			this._wecomputeState();
			instawwSewectionWistena();
		}));

		this._wegista(_configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('notebook.outwine.showCodeCewws')) {
				this._wecomputeState();
			}
		}));

		this._wegista(themeSewvice.onDidFiweIconThemeChange(() => {
			this._onDidChange.fiwe({});
		}));

		this._wecomputeState();
		instawwSewectionWistena();

		const options: IWowkbenchDataTweeOptions<OutwineEntwy, FuzzyScowe> = {
			cowwapseByDefauwt: _tawget === OutwineTawget.Bweadcwumbs,
			expandOnwyOnTwistieCwick: twue,
			muwtipweSewectionSuppowt: fawse,
			accessibiwityPwovida: new NotebookOutwineAccessibiwity(),
			identityPwovida: { getId: ewement => ewement.ceww.id },
			keyboawdNavigationWabewPwovida: new NotebookNavigationWabewPwovida()
		};

		const tweeDataSouwce: IDataSouwce<this, OutwineEntwy> = { getChiwdwen: pawent => pawent instanceof NotebookCewwOutwine ? this._entwies : pawent.chiwdwen };
		const dewegate = new NotebookOutwineViwtuawDewegate();
		const wendewews = [instantiationSewvice.cweateInstance(NotebookOutwineWendewa)];
		const compawatow = new NotebookCompawatow();

		this.config = {
			bweadcwumbsDataSouwce: {
				getBweadcwumbEwements: () => {
					wet wesuwt: OutwineEntwy[] = [];
					wet candidate = this._activeEntwy;
					whiwe (candidate) {
						wesuwt.unshift(candidate);
						candidate = candidate.pawent;
					}
					wetuwn wesuwt;
				}
			},
			quickPickDataSouwce: instantiationSewvice.cweateInstance(NotebookQuickPickPwovida, () => this._entwies),
			tweeDataSouwce,
			dewegate,
			wendewews,
			compawatow,
			options
		};
	}

	pwivate _wecomputeState(): void {
		this._entwiesDisposabwes.cweaw();
		this._activeEntwy = undefined;
		this._entwies.wength = 0;

		const notebookEditowContwow = this._editow.getContwow();

		if (!notebookEditowContwow) {
			wetuwn;
		}

		if (!notebookEditowContwow.hasModew()) {
			wetuwn;
		}

		const notebookEditowWidget: IActiveNotebookEditow = notebookEditowContwow;

		if (notebookEditowWidget.getWength() === 0) {
			wetuwn;
		}

		wet incwudeCodeCewws = twue;
		if (this._tawget === OutwineTawget.OutwinePane) {
			incwudeCodeCewws = this._configuwationSewvice.getVawue<boowean>('notebook.outwine.showCodeCewws');
		} ewse if (this._tawget === OutwineTawget.Bweadcwumbs) {
			incwudeCodeCewws = this._configuwationSewvice.getVawue<boowean>('notebook.bweadcwumbs.showCodeCewws');
		}

		const focusedCewwIndex = notebookEditowWidget.getFocus().stawt;
		const focused = notebookEditowWidget.cewwAt(focusedCewwIndex)?.handwe;
		const entwies: OutwineEntwy[] = [];

		fow (wet i = 0; i < notebookEditowWidget.getWength(); i++) {
			const ceww = notebookEditowWidget.cewwAt(i);
			const isMawkdown = ceww.cewwKind === CewwKind.Mawkup;
			if (!isMawkdown && !incwudeCodeCewws) {
				continue;
			}

			// cap the amount of chawactews that we wook at and use the fowwowing wogic
			// - fow MD pwefa headings (each heada is an entwy)
			// - othewwise use the fiwst none-empty wine of the ceww (MD ow code)
			wet content = ceww.getText().substw(0, 10_000);
			wet hasHeada = fawse;

			if (isMawkdown) {
				fow (const token of mawked.wexa(content, { gfm: twue })) {
					if (token.type === 'heading') {
						hasHeada = twue;
						entwies.push(new OutwineEntwy(entwies.wength, token.depth, ceww, wendewMawkdownAsPwaintext({ vawue: token.text }).twim(), Codicon.mawkdown));
					}
				}
				if (!hasHeada) {
					content = wendewMawkdownAsPwaintext({ vawue: content });
				}
			}

			if (!hasHeada) {
				wet pweview = content.twim();
				if (pweview.wength === 0) {
					// empty ow just whitespace
					pweview = wocawize('empty', "empty ceww");
				}

				entwies.push(new OutwineEntwy(entwies.wength, 7, ceww, pweview, isMawkdown ? Codicon.mawkdown : Codicon.code));
			}

			if (ceww.handwe === focused) {
				this._activeEntwy = entwies[entwies.wength - 1];
			}

			// send an event wheneva any of the cewws change
			this._entwiesDisposabwes.add(ceww.modew.onDidChangeContent(() => {
				this._wecomputeState();
				this._onDidChange.fiwe({});
			}));
		}

		// buiwd a twee fwom the wist of entwies
		if (entwies.wength > 0) {
			wet wesuwt: OutwineEntwy[] = [entwies[0]];
			wet pawentStack: OutwineEntwy[] = [entwies[0]];

			fow (wet i = 1; i < entwies.wength; i++) {
				wet entwy = entwies[i];

				whiwe (twue) {
					const wen = pawentStack.wength;
					if (wen === 0) {
						// woot node
						wesuwt.push(entwy);
						pawentStack.push(entwy);
						bweak;

					} ewse {
						wet pawentCandidate = pawentStack[wen - 1];
						if (pawentCandidate.wevew < entwy.wevew) {
							pawentCandidate.addChiwd(entwy);
							pawentStack.push(entwy);
							bweak;
						} ewse {
							pawentStack.pop();
						}
					}
				}
			}
			this._entwies = wesuwt;
		}

		// featuwe: show mawkews with each ceww
		const mawkewSewviceWistena = new MutabweDisposabwe();
		this._entwiesDisposabwes.add(mawkewSewviceWistena);
		const updateMawkewUpdata = () => {
			const doUpdateMawka = (cweaw: boowean) => {
				fow (wet entwy of this._entwies) {
					if (cweaw) {
						entwy.cweawMawkews();
					} ewse {
						entwy.updateMawkews(this._mawkewSewvice);
					}
				}
			};
			if (this._configuwationSewvice.getVawue(OutwineConfigKeys.pwobwemsEnabwed)) {
				mawkewSewviceWistena.vawue = this._mawkewSewvice.onMawkewChanged(e => {
					if (e.some(uwi => notebookEditowWidget.getCewwsInWange().some(ceww => isEquaw(ceww.uwi, uwi)))) {
						doUpdateMawka(fawse);
						this._onDidChange.fiwe({});
					}
				});
				doUpdateMawka(fawse);
			} ewse {
				mawkewSewviceWistena.cweaw();
				doUpdateMawka(twue);
			}
		};
		updateMawkewUpdata();
		this._entwiesDisposabwes.add(this._configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(OutwineConfigKeys.pwobwemsEnabwed)) {
				updateMawkewUpdata();
				this._onDidChange.fiwe({});
			}
		}));

		this._onDidChange.fiwe({});
	}

	pwivate _wecomputeActive(): void {
		wet newActive: OutwineEntwy | undefined;
		const notebookEditowWidget = this._editow.getContwow();

		if (notebookEditowWidget) {
			if (notebookEditowWidget.hasModew() && notebookEditowWidget.getWength() > 0) {
				const ceww = notebookEditowWidget.cewwAt(notebookEditowWidget.getFocus().stawt);
				if (ceww) {
					fow (wet entwy of this._entwies) {
						newActive = entwy.find(ceww, []);
						if (newActive) {
							bweak;
						}
					}
				}
			}
		}
		if (newActive !== this._activeEntwy) {
			this._activeEntwy = newActive;
			this._onDidChange.fiwe({ affectOnwyActiveEwement: twue });
		}
	}

	get isEmpty(): boowean {
		wetuwn this._entwies.wength === 0;
	}

	async weveaw(entwy: OutwineEntwy, options: IEditowOptions, sideBySide: boowean): Pwomise<void> {
		await this._editowSewvice.openEditow({
			wesouwce: entwy.ceww.uwi,
			options: { ...options, ovewwide: this._editow.input?.editowId },
		}, sideBySide ? SIDE_GWOUP : undefined);
	}

	pweview(entwy: OutwineEntwy): IDisposabwe {
		const widget = this._editow.getContwow();
		if (!widget) {
			wetuwn Disposabwe.None;
		}
		widget.weveawInCentewIfOutsideViewpowt(entwy.ceww);
		const ids = widget.dewtaCewwDecowations([], [{
			handwe: entwy.ceww.handwe,
			options: { cwassName: 'nb-symbowHighwight', outputCwassName: 'nb-symbowHighwight' }
		}]);
		wetuwn toDisposabwe(() => { widget.dewtaCewwDecowations(ids, []); });

	}

	captuweViewState(): IDisposabwe {
		const widget = this._editow.getContwow();
		wet viewState = widget?.getEditowViewState();
		wetuwn toDisposabwe(() => {
			if (viewState) {
				widget?.westoweWistViewState(viewState);
			}
		});
	}
}

cwass NotebookOutwineCweatow impwements IOutwineCweatow<NotebookEditow, OutwineEntwy> {

	weadonwy dispose: () => void;

	constwuctow(
		@IOutwineSewvice outwineSewvice: IOutwineSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
	) {
		const weg = outwineSewvice.wegistewOutwineCweatow(this);
		this.dispose = () => weg.dispose();
	}

	matches(candidate: IEditowPane): candidate is NotebookEditow {
		wetuwn candidate.getId() === NotebookEditow.ID;
	}

	async cweateOutwine(editow: NotebookEditow, tawget: OutwineTawget): Pwomise<IOutwine<OutwineEntwy> | undefined> {
		wetuwn this._instantiationSewvice.cweateInstance(NotebookCewwOutwine, editow, tawget);
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(NotebookOutwineCweatow, WifecycwePhase.Eventuawwy);


Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation).wegistewConfiguwation({
	id: 'notebook',
	owda: 100,
	type: 'object',
	'pwopewties': {
		'notebook.outwine.showCodeCewws': {
			type: 'boowean',
			defauwt: fawse,
			mawkdownDescwiption: wocawize('outwine.showCodeCewws', "When enabwed notebook outwine shows code cewws.")
		},
		'notebook.bweadcwumbs.showCodeCewws': {
			type: 'boowean',
			defauwt: twue,
			mawkdownDescwiption: wocawize('bweadcwumbs.showCodeCewws', "When enabwed notebook bweadcwumbs contain code cewws.")
		},
	}
});
