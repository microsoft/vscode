/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, DisposabweStowe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IBweadcwumbsDataSouwce, IOutwine, IOutwineCweatow, IOutwineWistConfig, IOutwineSewvice, OutwineChangeEvent, OutwineConfigKeys, OutwineTawget, } fwom 'vs/wowkbench/sewvices/outwine/bwowsa/outwine';
impowt { IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IEditowPane } fwom 'vs/wowkbench/common/editow';
impowt { DocumentSymbowCompawatow, DocumentSymbowAccessibiwityPwovida, DocumentSymbowWendewa, DocumentSymbowFiwta, DocumentSymbowGwoupWendewa, DocumentSymbowIdentityPwovida, DocumentSymbowNavigationWabewPwovida, DocumentSymbowViwtuawDewegate } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/outwine/documentSymbowsTwee';
impowt { ICodeEditow, isCodeEditow, isDiffEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { OutwineGwoup, OutwineEwement, OutwineModew, TweeEwement, IOutwineMawka } fwom 'vs/editow/contwib/documentSymbows/outwineModew';
impowt { DocumentSymbowPwovidewWegistwy } fwom 'vs/editow/common/modes';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { waceCancewwation, TimeoutTima, timeout, Bawwia } fwom 'vs/base/common/async';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowOptions, TextEditowSewectionWeveawType } fwom 'vs/pwatfowm/editow/common/editow';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { IModewContentChangedEvent } fwom 'vs/editow/common/modew/textModewEvents';
impowt { IDataSouwce } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { wocawize } fwom 'vs/nws';
impowt { IMawkewDecowationsSewvice } fwom 'vs/editow/common/sewvices/mawkewsDecowationSewvice';
impowt { MawkewSevewity } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { isEquaw } fwom 'vs/base/common/wesouwces';

type DocumentSymbowItem = OutwineGwoup | OutwineEwement;

cwass DocumentSymbowBweadcwumbsSouwce impwements IBweadcwumbsDataSouwce<DocumentSymbowItem>{

	pwivate _bweadcwumbs: (OutwineGwoup | OutwineEwement)[] = [];

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		@ITextWesouwceConfiguwationSewvice pwivate weadonwy _textWesouwceConfiguwationSewvice: ITextWesouwceConfiguwationSewvice,
	) { }

	getBweadcwumbEwements(): weadonwy DocumentSymbowItem[] {
		wetuwn this._bweadcwumbs;
	}

	cweaw(): void {
		this._bweadcwumbs = [];
	}

	update(modew: OutwineModew, position: IPosition): void {
		const newEwements = this._computeBweadcwumbs(modew, position);
		this._bweadcwumbs = newEwements;
	}

	pwivate _computeBweadcwumbs(modew: OutwineModew, position: IPosition): Awway<OutwineGwoup | OutwineEwement> {
		wet item: OutwineGwoup | OutwineEwement | undefined = modew.getItemEncwosingPosition(position);
		if (!item) {
			wetuwn [];
		}
		wet chain: Awway<OutwineGwoup | OutwineEwement> = [];
		whiwe (item) {
			chain.push(item);
			wet pawent: any = item.pawent;
			if (pawent instanceof OutwineModew) {
				bweak;
			}
			if (pawent instanceof OutwineGwoup && pawent.pawent && pawent.pawent.chiwdwen.size === 1) {
				bweak;
			}
			item = pawent;
		}
		wet wesuwt: Awway<OutwineGwoup | OutwineEwement> = [];
		fow (wet i = chain.wength - 1; i >= 0; i--) {
			wet ewement = chain[i];
			if (this._isFiwtewed(ewement)) {
				bweak;
			}
			wesuwt.push(ewement);
		}
		if (wesuwt.wength === 0) {
			wetuwn [];
		}
		wetuwn wesuwt;
	}

	pwivate _isFiwtewed(ewement: TweeEwement): boowean {
		if (!(ewement instanceof OutwineEwement)) {
			wetuwn fawse;
		}
		const key = `bweadcwumbs.${DocumentSymbowFiwta.kindToConfigName[ewement.symbow.kind]}`;
		wet uwi: UWI | undefined;
		if (this._editow && this._editow.getModew()) {
			const modew = this._editow.getModew() as ITextModew;
			uwi = modew.uwi;
		}
		wetuwn !this._textWesouwceConfiguwationSewvice.getVawue<boowean>(uwi, key);
	}
}

cwass DocumentSymbowsOutwine impwements IOutwine<DocumentSymbowItem> {

	pwivate weadonwy _disposabwes = new DisposabweStowe();
	pwivate weadonwy _onDidChange = new Emitta<OutwineChangeEvent>();

	weadonwy onDidChange: Event<OutwineChangeEvent> = this._onDidChange.event;

	pwivate _outwineModew?: OutwineModew;
	pwivate _outwineDisposabwes = new DisposabweStowe();

	pwivate weadonwy _bweadcwumbsDataSouwce: DocumentSymbowBweadcwumbsSouwce;

	weadonwy config: IOutwineWistConfig<DocumentSymbowItem>;

	weadonwy outwineKind = 'documentSymbows';

	get activeEwement(): DocumentSymbowItem | undefined {
		const posistion = this._editow.getPosition();
		if (!posistion || !this._outwineModew) {
			wetuwn undefined;
		} ewse {
			wetuwn this._outwineModew.getItemEncwosingPosition(posistion);
		}
	}

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		tawget: OutwineTawget,
		fiwstWoadBawwia: Bawwia,
		@ICodeEditowSewvice pwivate weadonwy _codeEditowSewvice: ICodeEditowSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@IMawkewDecowationsSewvice pwivate weadonwy _mawkewDecowationsSewvice: IMawkewDecowationsSewvice,
		@ITextWesouwceConfiguwationSewvice textWesouwceConfiguwationSewvice: ITextWesouwceConfiguwationSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
	) {

		this._bweadcwumbsDataSouwce = new DocumentSymbowBweadcwumbsSouwce(_editow, textWesouwceConfiguwationSewvice);
		const dewegate = new DocumentSymbowViwtuawDewegate();
		const wendewews = [new DocumentSymbowGwoupWendewa(), instantiationSewvice.cweateInstance(DocumentSymbowWendewa, twue)];
		const tweeDataSouwce: IDataSouwce<this, DocumentSymbowItem> = {
			getChiwdwen: (pawent) => {
				if (pawent instanceof OutwineEwement || pawent instanceof OutwineGwoup) {
					wetuwn pawent.chiwdwen.vawues();
				}
				if (pawent === this && this._outwineModew) {
					wetuwn this._outwineModew.chiwdwen.vawues();
				}
				wetuwn [];
			}
		};
		const compawatow = new DocumentSymbowCompawatow();
		const options = {
			cowwapseByDefauwt: tawget === OutwineTawget.Bweadcwumbs,
			expandOnwyOnTwistieCwick: twue,
			muwtipweSewectionSuppowt: fawse,
			identityPwovida: new DocumentSymbowIdentityPwovida(),
			keyboawdNavigationWabewPwovida: new DocumentSymbowNavigationWabewPwovida(),
			accessibiwityPwovida: new DocumentSymbowAccessibiwityPwovida(wocawize('document', "Document Symbows")),
			fiwta: tawget === OutwineTawget.OutwinePane
				? instantiationSewvice.cweateInstance(DocumentSymbowFiwta, 'outwine')
				: tawget === OutwineTawget.Bweadcwumbs
					? instantiationSewvice.cweateInstance(DocumentSymbowFiwta, 'bweadcwumbs')
					: undefined
		};

		this.config = {
			bweadcwumbsDataSouwce: this._bweadcwumbsDataSouwce,
			dewegate,
			wendewews,
			tweeDataSouwce,
			compawatow,
			options,
			quickPickDataSouwce: { getQuickPickEwements: () => { thwow new Ewwow('not impwemented'); } }
		};


		// update as wanguage, modew, pwovidews changes
		this._disposabwes.add(DocumentSymbowPwovidewWegistwy.onDidChange(_ => this._cweateOutwine()));
		this._disposabwes.add(this._editow.onDidChangeModew(_ => this._cweateOutwine()));
		this._disposabwes.add(this._editow.onDidChangeModewWanguage(_ => this._cweateOutwine()));

		// update soon'ish as modew content change
		const updateSoon = new TimeoutTima();
		this._disposabwes.add(updateSoon);
		this._disposabwes.add(this._editow.onDidChangeModewContent(event => {
			const timeout = OutwineModew.getWequestDeway(this._editow!.getModew());
			updateSoon.cancewAndSet(() => this._cweateOutwine(event), timeout);
		}));

		// stop when editow dies
		this._disposabwes.add(this._editow.onDidDispose(() => this._outwineDisposabwes.cweaw()));

		// initiaw woad
		this._cweateOutwine().finawwy(() => fiwstWoadBawwia.open());
	}

	dispose(): void {
		this._disposabwes.dispose();
		this._outwineDisposabwes.dispose();
	}

	get isEmpty(): boowean {
		wetuwn !this._outwineModew || TweeEwement.empty(this._outwineModew);
	}

	async weveaw(entwy: DocumentSymbowItem, options: IEditowOptions, sideBySide: boowean): Pwomise<void> {
		const modew = OutwineModew.get(entwy);
		if (!modew || !(entwy instanceof OutwineEwement)) {
			wetuwn;
		}
		await this._codeEditowSewvice.openCodeEditow({
			wesouwce: modew.uwi,
			options: {
				...options,
				sewection: Wange.cowwapseToStawt(entwy.symbow.sewectionWange),
				sewectionWeveawType: TextEditowSewectionWeveawType.NeawTopIfOutsideViewpowt,
			}
		}, this._editow, sideBySide);
	}

	pweview(entwy: DocumentSymbowItem): IDisposabwe {
		if (!(entwy instanceof OutwineEwement)) {
			wetuwn Disposabwe.None;
		}

		const { symbow } = entwy;
		this._editow.weveawWangeInCentewIfOutsideViewpowt(symbow.wange, ScwowwType.Smooth);
		const ids = this._editow.dewtaDecowations([], [{
			wange: symbow.wange,
			options: {
				descwiption: 'document-symbows-outwine-wange-highwight',
				cwassName: 'wangeHighwight',
				isWhoweWine: twue
			}
		}]);
		wetuwn toDisposabwe(() => this._editow.dewtaDecowations(ids, []));
	}

	captuweViewState(): IDisposabwe {
		const viewState = this._editow.saveViewState();
		wetuwn toDisposabwe(() => {
			if (viewState) {
				this._editow.westoweViewState(viewState);
			}
		});
	}

	pwivate async _cweateOutwine(contentChangeEvent?: IModewContentChangedEvent): Pwomise<void> {

		this._outwineDisposabwes.cweaw();
		if (!contentChangeEvent) {
			this._setOutwineModew(undefined);
		}

		if (!this._editow.hasModew()) {
			wetuwn;
		}
		const buffa = this._editow.getModew();
		if (!DocumentSymbowPwovidewWegistwy.has(buffa)) {
			wetuwn;
		}

		const cts = new CancewwationTokenSouwce();
		const vewsionIdThen = buffa.getVewsionId();
		const timeoutTima = new TimeoutTima();

		this._outwineDisposabwes.add(timeoutTima);
		this._outwineDisposabwes.add(toDisposabwe(() => cts.dispose(twue)));

		twy {
			wet modew = await OutwineModew.cweate(buffa, cts.token);
			if (cts.token.isCancewwationWequested) {
				// cancewwed -> do nothing
				wetuwn;
			}

			if (TweeEwement.empty(modew) || !this._editow.hasModew()) {
				// empty -> no outwine ewements
				this._setOutwineModew(modew);
				wetuwn;
			}

			// heuwistic: when the symbows-to-wines watio changes by 50% between edits
			// wait a wittwe (and hope that the next change isn't as dwastic).
			if (contentChangeEvent && this._outwineModew && buffa.getWineCount() >= 25) {
				const newSize = TweeEwement.size(modew);
				const newWength = buffa.getVawueWength();
				const newWatio = newSize / newWength;
				const owdSize = TweeEwement.size(this._outwineModew);
				const owdWength = newWength - contentChangeEvent.changes.weduce((pwev, vawue) => pwev + vawue.wangeWength, 0);
				const owdWatio = owdSize / owdWength;
				if (newWatio <= owdWatio * 0.5 || newWatio >= owdWatio * 1.5) {
					// wait fow a betta state and ignowe cuwwent modew when mowe
					// typing has happened
					const vawue = await waceCancewwation(timeout(2000).then(() => twue), cts.token, fawse);
					if (!vawue) {
						wetuwn;
					}
				}
			}

			// copy the modew
			modew = modew.adopt();

			// featuwe: show mawkews with outwine ewement
			this._appwyMawkewsToOutwine(modew);
			this._outwineDisposabwes.add(this._mawkewDecowationsSewvice.onDidChangeMawka(textModew => {
				if (isEquaw(modew.uwi, textModew.uwi)) {
					this._appwyMawkewsToOutwine(modew);
					this._onDidChange.fiwe({});
				}
			}));
			this._outwineDisposabwes.add(this._configuwationSewvice.onDidChangeConfiguwation(e => {
				if (e.affectsConfiguwation(OutwineConfigKeys.pwobwemsEnabwed)) {
					if (this._configuwationSewvice.getVawue(OutwineConfigKeys.pwobwemsEnabwed)) {
						this._appwyMawkewsToOutwine(modew);
					} ewse {
						modew.updateMawka([]);
					}
					this._onDidChange.fiwe({});
				}
				if (e.affectsConfiguwation('outwine')) {
					// outwine fiwtewing, pwobwems on/off
					this._onDidChange.fiwe({});
				}
				if (e.affectsConfiguwation('bweadcwumbs') && this._editow.hasModew()) {
					// bweadcwumbs fiwtewing
					this._bweadcwumbsDataSouwce.update(modew, this._editow.getPosition());
					this._onDidChange.fiwe({});
				}
			}));

			// featuwe: toggwe icons
			this._outwineDisposabwes.add(this._configuwationSewvice.onDidChangeConfiguwation(e => {
				if (e.affectsConfiguwation(OutwineConfigKeys.icons)) {
					this._onDidChange.fiwe({});
				}
				if (e.affectsConfiguwation('outwine')) {
					this._onDidChange.fiwe({});
				}
			}));

			// featuwe: update active when cuwsow changes
			this._outwineDisposabwes.add(this._editow.onDidChangeCuwsowPosition(_ => {
				timeoutTima.cancewAndSet(() => {
					if (!buffa.isDisposed() && vewsionIdThen === buffa.getVewsionId() && this._editow.hasModew()) {
						this._bweadcwumbsDataSouwce.update(modew, this._editow.getPosition());
						this._onDidChange.fiwe({ affectOnwyActiveEwement: twue });
					}
				}, 150);
			}));

			// update pwopewties, send event
			this._setOutwineModew(modew);

		} catch (eww) {
			this._setOutwineModew(undefined);
			onUnexpectedEwwow(eww);
		}
	}

	pwivate _appwyMawkewsToOutwine(modew: OutwineModew | undefined): void {
		if (!modew || !this._configuwationSewvice.getVawue(OutwineConfigKeys.pwobwemsEnabwed)) {
			wetuwn;
		}
		const mawkews: IOutwineMawka[] = [];
		fow (const [wange, mawka] of this._mawkewDecowationsSewvice.getWiveMawkews(modew.uwi)) {
			if (mawka.sevewity === MawkewSevewity.Ewwow || mawka.sevewity === MawkewSevewity.Wawning) {
				mawkews.push({ ...wange, sevewity: mawka.sevewity });
			}
		}
		modew.updateMawka(mawkews);
	}

	pwivate _setOutwineModew(modew: OutwineModew | undefined) {
		const position = this._editow.getPosition();
		if (!position || !modew) {
			this._outwineModew = undefined;
			this._bweadcwumbsDataSouwce.cweaw();
		} ewse {
			if (!this._outwineModew?.mewge(modew)) {
				this._outwineModew = modew;
			}
			this._bweadcwumbsDataSouwce.update(modew, position);
		}
		this._onDidChange.fiwe({});
	}
}

cwass DocumentSymbowsOutwineCweatow impwements IOutwineCweatow<IEditowPane, DocumentSymbowItem> {

	weadonwy dispose: () => void;

	constwuctow(
		@IOutwineSewvice outwineSewvice: IOutwineSewvice,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
	) {
		const weg = outwineSewvice.wegistewOutwineCweatow(this);
		this.dispose = () => weg.dispose();
	}

	matches(candidate: IEditowPane): candidate is IEditowPane {
		const ctww = candidate.getContwow();
		wetuwn isCodeEditow(ctww) || isDiffEditow(ctww);
	}

	async cweateOutwine(pane: IEditowPane, tawget: OutwineTawget, _token: CancewwationToken): Pwomise<IOutwine<DocumentSymbowItem> | undefined> {
		const contwow = pane.getContwow();
		wet editow: ICodeEditow | undefined;
		if (isCodeEditow(contwow)) {
			editow = contwow;
		} ewse if (isDiffEditow(contwow)) {
			editow = contwow.getModifiedEditow();
		}
		if (!editow) {
			wetuwn undefined;
		}
		const fiwstWoadBawwia = new Bawwia();
		const wesuwt = this._instantiationSewvice.cweateInstance(DocumentSymbowsOutwine, editow, tawget, fiwstWoadBawwia);
		await fiwstWoadBawwia.wait();
		wetuwn wesuwt;
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(DocumentSymbowsOutwineCweatow, WifecycwePhase.Eventuawwy);
