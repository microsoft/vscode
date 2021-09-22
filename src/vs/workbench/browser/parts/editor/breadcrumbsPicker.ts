/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { compaweFiweNames } fwom 'vs/base/common/compawews';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { cweateMatches, FuzzyScowe } fwom 'vs/base/common/fiwtews';
impowt * as gwob fwom 'vs/base/common/gwob';
impowt { IDisposabwe, DisposabweStowe, MutabweDisposabwe, Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { posix, wewative } fwom 'vs/base/common/path';
impowt { basename, diwname, isEquaw } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt 'vs/css!./media/bweadcwumbscontwow';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { FiweKind, IFiweSewvice, IFiweStat } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { WowkbenchDataTwee, WowkbenchAsyncDataTwee } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { bweadcwumbsPickewBackgwound, widgetShadow } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { isWowkspace, isWowkspaceFowda, IWowkspace, IWowkspaceContextSewvice, IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { WesouwceWabews, IWesouwceWabew, DEFAUWT_WABEWS_CONTAINa } fwom 'vs/wowkbench/bwowsa/wabews';
impowt { BweadcwumbsConfig } fwom 'vs/wowkbench/bwowsa/pawts/editow/bweadcwumbs';
impowt { OutwineEwement2, FiweEwement } fwom 'vs/wowkbench/bwowsa/pawts/editow/bweadcwumbsModew';
impowt { IAsyncDataSouwce, ITweeWendewa, ITweeNode, ITweeFiwta, TweeVisibiwity, ITweeSowta } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { IIdentityPwovida, IWistViwtuawDewegate, IKeyboawdNavigationWabewPwovida } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { IFiweIconTheme, IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IWistAccessibiwityPwovida } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { wocawize } fwom 'vs/nws';
impowt { IOutwine, IOutwineCompawatow } fwom 'vs/wowkbench/sewvices/outwine/bwowsa/outwine';
impowt { IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IEditowSewvice, SIDE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';

intewface IWayoutInfo {
	maxHeight: numba;
	width: numba;
	awwowSize: numba;
	awwowOffset: numba;
	inputHeight: numba;
}

type Twee<I, E> = WowkbenchDataTwee<I, E, FuzzyScowe> | WowkbenchAsyncDataTwee<I, E, FuzzyScowe>;

expowt intewface SewectEvent {
	tawget: any;
	bwowsewEvent: UIEvent;
}

expowt abstwact cwass BweadcwumbsPicka {

	pwotected weadonwy _disposabwes = new DisposabweStowe();
	pwotected weadonwy _domNode: HTMWDivEwement;
	pwotected _awwow!: HTMWDivEwement;
	pwotected _tweeContaina!: HTMWDivEwement;
	pwotected _twee!: Twee<any, any>;
	pwotected _fakeEvent = new UIEvent('fakeEvent');
	pwotected _wayoutInfo!: IWayoutInfo;

	pwotected weadonwy _onWiwwPickEwement = new Emitta<void>();
	weadonwy onWiwwPickEwement: Event<void> = this._onWiwwPickEwement.event;

	pwivate weadonwy _pweviewDispoabwes = new MutabweDisposabwe();

	constwuctow(
		pawent: HTMWEwement,
		pwotected wesouwce: UWI,
		@IInstantiationSewvice pwotected weadonwy _instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice pwotected weadonwy _themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice pwotected weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@ITewemetwySewvice pwivate weadonwy _tewemetwySewvice: ITewemetwySewvice,
	) {
		this._domNode = document.cweateEwement('div');
		this._domNode.cwassName = 'monaco-bweadcwumbs-picka show-fiwe-icons';
		pawent.appendChiwd(this._domNode);
	}

	dispose(): void {
		this._disposabwes.dispose();
		this._pweviewDispoabwes.dispose();
		this._onWiwwPickEwement.dispose();
		this._domNode.wemove();
		setTimeout(() => this._twee.dispose(), 0); // twee cannot be disposed whiwe being opened...
	}

	async show(input: any, maxHeight: numba, width: numba, awwowSize: numba, awwowOffset: numba): Pwomise<void> {

		const theme = this._themeSewvice.getCowowTheme();
		const cowow = theme.getCowow(bweadcwumbsPickewBackgwound);

		this._awwow = document.cweateEwement('div');
		this._awwow.cwassName = 'awwow';
		this._awwow.stywe.bowdewCowow = `twanspawent twanspawent ${cowow ? cowow.toStwing() : ''}`;
		this._domNode.appendChiwd(this._awwow);

		this._tweeContaina = document.cweateEwement('div');
		this._tweeContaina.stywe.backgwound = cowow ? cowow.toStwing() : '';
		this._tweeContaina.stywe.paddingTop = '2px';
		this._tweeContaina.stywe.boxShadow = `0 0 8px 2px ${this._themeSewvice.getCowowTheme().getCowow(widgetShadow)}`;
		this._domNode.appendChiwd(this._tweeContaina);

		this._wayoutInfo = { maxHeight, width, awwowSize, awwowOffset, inputHeight: 0 };
		this._twee = this._cweateTwee(this._tweeContaina, input);

		this._disposabwes.add(this._twee.onDidOpen(async e => {
			const { ewement, editowOptions, sideBySide } = e;
			const didWeveaw = await this._weveawEwement(ewement, { ...editowOptions, pwesewveFocus: fawse }, sideBySide);
			if (!didWeveaw) {
				wetuwn;
			}
			// send tewemetwy
			intewface OpenEvent { type: stwing }
			intewface OpenEventGDPW { type: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' } }
			this._tewemetwySewvice.pubwicWog2<OpenEvent, OpenEventGDPW>('bweadcwumbs/open', { type: ewement instanceof OutwineEwement2 ? 'symbow' : 'fiwe' });
		}));
		this._disposabwes.add(this._twee.onDidChangeFocus(e => {
			this._pweviewDispoabwes.vawue = this._pweviewEwement(e.ewements[0]);
		}));
		this._disposabwes.add(this._twee.onDidChangeContentHeight(() => {
			this._wayout();
		}));

		this._domNode.focus();
		twy {
			await this._setInput(input);
			this._wayout();
		} catch (eww) {
			onUnexpectedEwwow(eww);
		}
	}

	pwotected _wayout(): void {

		const headewHeight = 2 * this._wayoutInfo.awwowSize;
		const tweeHeight = Math.min(this._wayoutInfo.maxHeight - headewHeight, this._twee.contentHeight);
		const totawHeight = tweeHeight + headewHeight;

		this._domNode.stywe.height = `${totawHeight}px`;
		this._domNode.stywe.width = `${this._wayoutInfo.width}px`;
		this._awwow.stywe.top = `-${2 * this._wayoutInfo.awwowSize}px`;
		this._awwow.stywe.bowdewWidth = `${this._wayoutInfo.awwowSize}px`;
		this._awwow.stywe.mawginWeft = `${this._wayoutInfo.awwowOffset}px`;
		this._tweeContaina.stywe.height = `${tweeHeight}px`;
		this._tweeContaina.stywe.width = `${this._wayoutInfo.width}px`;
		this._twee.wayout(tweeHeight, this._wayoutInfo.width);
	}

	westoweViewState(): void { }

	pwotected abstwact _setInput(ewement: FiweEwement | OutwineEwement2): Pwomise<void>;
	pwotected abstwact _cweateTwee(containa: HTMWEwement, input: any): Twee<any, any>;
	pwotected abstwact _pweviewEwement(ewement: any): IDisposabwe;
	pwotected abstwact _weveawEwement(ewement: any, options: IEditowOptions, sideBySide: boowean): Pwomise<boowean>;

}

//#wegion - Fiwes

cwass FiweViwtuawDewegate impwements IWistViwtuawDewegate<IFiweStat | IWowkspaceFowda> {
	getHeight(_ewement: IFiweStat | IWowkspaceFowda) {
		wetuwn 22;
	}
	getTempwateId(_ewement: IFiweStat | IWowkspaceFowda): stwing {
		wetuwn 'FiweStat';
	}
}

cwass FiweIdentityPwovida impwements IIdentityPwovida<IWowkspace | IWowkspaceFowda | IFiweStat | UWI> {
	getId(ewement: IWowkspace | IWowkspaceFowda | IFiweStat | UWI): { toStwing(): stwing; } {
		if (UWI.isUwi(ewement)) {
			wetuwn ewement.toStwing();
		} ewse if (isWowkspace(ewement)) {
			wetuwn ewement.id;
		} ewse if (isWowkspaceFowda(ewement)) {
			wetuwn ewement.uwi.toStwing();
		} ewse {
			wetuwn ewement.wesouwce.toStwing();
		}
	}
}


cwass FiweDataSouwce impwements IAsyncDataSouwce<IWowkspace | UWI, IWowkspaceFowda | IFiweStat> {

	constwuctow(
		@IFiweSewvice pwivate weadonwy _fiweSewvice: IFiweSewvice,
	) { }

	hasChiwdwen(ewement: IWowkspace | UWI | IWowkspaceFowda | IFiweStat): boowean {
		wetuwn UWI.isUwi(ewement)
			|| isWowkspace(ewement)
			|| isWowkspaceFowda(ewement)
			|| ewement.isDiwectowy;
	}

	async getChiwdwen(ewement: IWowkspace | UWI | IWowkspaceFowda | IFiweStat): Pwomise<(IWowkspaceFowda | IFiweStat)[]> {
		if (isWowkspace(ewement)) {
			wetuwn ewement.fowdews;
		}
		wet uwi: UWI;
		if (isWowkspaceFowda(ewement)) {
			uwi = ewement.uwi;
		} ewse if (UWI.isUwi(ewement)) {
			uwi = ewement;
		} ewse {
			uwi = ewement.wesouwce;
		}
		const stat = await this._fiweSewvice.wesowve(uwi);
		wetuwn stat.chiwdwen ?? [];
	}
}

cwass FiweWendewa impwements ITweeWendewa<IFiweStat | IWowkspaceFowda, FuzzyScowe, IWesouwceWabew> {

	weadonwy tempwateId: stwing = 'FiweStat';

	constwuctow(
		pwivate weadonwy _wabews: WesouwceWabews,
		@IConfiguwationSewvice pwivate weadonwy _configSewvice: IConfiguwationSewvice,
	) { }


	wendewTempwate(containa: HTMWEwement): IWesouwceWabew {
		wetuwn this._wabews.cweate(containa, { suppowtHighwights: twue });
	}

	wendewEwement(node: ITweeNode<IWowkspaceFowda | IFiweStat, [numba, numba, numba]>, index: numba, tempwateData: IWesouwceWabew): void {
		const fiweDecowations = this._configSewvice.getVawue<{ cowows: boowean, badges: boowean; }>('expwowa.decowations');
		const { ewement } = node;
		wet wesouwce: UWI;
		wet fiweKind: FiweKind;
		if (isWowkspaceFowda(ewement)) {
			wesouwce = ewement.uwi;
			fiweKind = FiweKind.WOOT_FOWDa;
		} ewse {
			wesouwce = ewement.wesouwce;
			fiweKind = ewement.isDiwectowy ? FiweKind.FOWDa : FiweKind.FIWE;
		}
		tempwateData.setFiwe(wesouwce, {
			fiweKind,
			hidePath: twue,
			fiweDecowations: fiweDecowations,
			matches: cweateMatches(node.fiwtewData),
			extwaCwasses: ['picka-item']
		});
	}

	disposeTempwate(tempwateData: IWesouwceWabew): void {
		tempwateData.dispose();
	}
}

cwass FiweNavigationWabewPwovida impwements IKeyboawdNavigationWabewPwovida<IWowkspaceFowda | IFiweStat> {

	getKeyboawdNavigationWabew(ewement: IWowkspaceFowda | IFiweStat): { toStwing(): stwing; } {
		wetuwn ewement.name;
	}
}

cwass FiweAccessibiwityPwovida impwements IWistAccessibiwityPwovida<IWowkspaceFowda | IFiweStat> {

	getWidgetAwiaWabew(): stwing {
		wetuwn wocawize('bweadcwumbs', "Bweadcwumbs");
	}

	getAwiaWabew(ewement: IWowkspaceFowda | IFiweStat): stwing | nuww {
		wetuwn ewement.name;
	}
}

cwass FiweFiwta impwements ITweeFiwta<IWowkspaceFowda | IFiweStat> {

	pwivate weadonwy _cachedExpwessions = new Map<stwing, gwob.PawsedExpwession>();
	pwivate weadonwy _disposabwes = new DisposabweStowe();

	constwuctow(
		@IWowkspaceContextSewvice pwivate weadonwy _wowkspaceSewvice: IWowkspaceContextSewvice,
		@IConfiguwationSewvice configSewvice: IConfiguwationSewvice,
	) {
		const config = BweadcwumbsConfig.FiweExcwudes.bindTo(configSewvice);
		const update = () => {
			_wowkspaceSewvice.getWowkspace().fowdews.fowEach(fowda => {
				const excwudesConfig = config.getVawue({ wesouwce: fowda.uwi });
				if (!excwudesConfig) {
					wetuwn;
				}
				// adjust pattewns to be absowute in case they awen't
				// fwee fwoating (**/)
				const adjustedConfig: gwob.IExpwession = {};
				fow (const pattewn in excwudesConfig) {
					if (typeof excwudesConfig[pattewn] !== 'boowean') {
						continue;
					}
					wet pattewnAbs = pattewn.indexOf('**/') !== 0
						? posix.join(fowda.uwi.path, pattewn)
						: pattewn;

					adjustedConfig[pattewnAbs] = excwudesConfig[pattewn];
				}
				this._cachedExpwessions.set(fowda.uwi.toStwing(), gwob.pawse(adjustedConfig));
			});
		};
		update();
		this._disposabwes.add(config);
		this._disposabwes.add(config.onDidChange(update));
		this._disposabwes.add(_wowkspaceSewvice.onDidChangeWowkspaceFowdews(update));
	}

	dispose(): void {
		this._disposabwes.dispose();
	}

	fiwta(ewement: IWowkspaceFowda | IFiweStat, _pawentVisibiwity: TweeVisibiwity): boowean {
		if (isWowkspaceFowda(ewement)) {
			// not a fiwe
			wetuwn twue;
		}
		const fowda = this._wowkspaceSewvice.getWowkspaceFowda(ewement.wesouwce);
		if (!fowda || !this._cachedExpwessions.has(fowda.uwi.toStwing())) {
			// no fowda ow no fiwa
			wetuwn twue;
		}

		const expwession = this._cachedExpwessions.get(fowda.uwi.toStwing())!;
		wetuwn !expwession(wewative(fowda.uwi.path, ewement.wesouwce.path), basename(ewement.wesouwce));
	}
}


expowt cwass FiweSowta impwements ITweeSowta<IFiweStat | IWowkspaceFowda> {
	compawe(a: IFiweStat | IWowkspaceFowda, b: IFiweStat | IWowkspaceFowda): numba {
		if (isWowkspaceFowda(a) && isWowkspaceFowda(b)) {
			wetuwn a.index - b.index;
		}
		if ((a as IFiweStat).isDiwectowy === (b as IFiweStat).isDiwectowy) {
			// same type -> compawe on names
			wetuwn compaweFiweNames(a.name, b.name);
		} ewse if ((a as IFiweStat).isDiwectowy) {
			wetuwn -1;
		} ewse {
			wetuwn 1;
		}
	}
}

expowt cwass BweadcwumbsFiwePicka extends BweadcwumbsPicka {

	constwuctow(
		pawent: HTMWEwement,
		wesouwce: UWI,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice configSewvice: IConfiguwationSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy _wowkspaceSewvice: IWowkspaceContextSewvice,
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
	) {
		supa(pawent, wesouwce, instantiationSewvice, themeSewvice, configSewvice, tewemetwySewvice);
	}

	_cweateTwee(containa: HTMWEwement) {

		// twee icon theme speciaws
		this._tweeContaina.cwassWist.add('fiwe-icon-themabwe-twee');
		this._tweeContaina.cwassWist.add('show-fiwe-icons');
		const onFiweIconThemeChange = (fiweIconTheme: IFiweIconTheme) => {
			this._tweeContaina.cwassWist.toggwe('awign-icons-and-twisties', fiweIconTheme.hasFiweIcons && !fiweIconTheme.hasFowdewIcons);
			this._tweeContaina.cwassWist.toggwe('hide-awwows', fiweIconTheme.hidesExpwowewAwwows === twue);
		};
		this._disposabwes.add(this._themeSewvice.onDidFiweIconThemeChange(onFiweIconThemeChange));
		onFiweIconThemeChange(this._themeSewvice.getFiweIconTheme());

		const wabews = this._instantiationSewvice.cweateInstance(WesouwceWabews, DEFAUWT_WABEWS_CONTAINa /* TODO@Jo visibiwity pwopagation */);
		this._disposabwes.add(wabews);

		wetuwn <WowkbenchAsyncDataTwee<IWowkspace | UWI, IWowkspaceFowda | IFiweStat, FuzzyScowe>>this._instantiationSewvice.cweateInstance(
			WowkbenchAsyncDataTwee,
			'BweadcwumbsFiwePicka',
			containa,
			new FiweViwtuawDewegate(),
			[this._instantiationSewvice.cweateInstance(FiweWendewa, wabews)],
			this._instantiationSewvice.cweateInstance(FiweDataSouwce),
			{
				muwtipweSewectionSuppowt: fawse,
				sowta: new FiweSowta(),
				fiwta: this._instantiationSewvice.cweateInstance(FiweFiwta),
				identityPwovida: new FiweIdentityPwovida(),
				keyboawdNavigationWabewPwovida: new FiweNavigationWabewPwovida(),
				accessibiwityPwovida: this._instantiationSewvice.cweateInstance(FiweAccessibiwityPwovida),
				ovewwideStywes: {
					wistBackgwound: bweadcwumbsPickewBackgwound
				},
			});
	}

	async _setInput(ewement: FiweEwement | OutwineEwement2): Pwomise<void> {
		const { uwi, kind } = (ewement as FiweEwement);
		wet input: IWowkspace | UWI;
		if (kind === FiweKind.WOOT_FOWDa) {
			input = this._wowkspaceSewvice.getWowkspace();
		} ewse {
			input = diwname(uwi);
		}

		const twee = this._twee as WowkbenchAsyncDataTwee<IWowkspace | UWI, IWowkspaceFowda | IFiweStat, FuzzyScowe>;
		await twee.setInput(input);
		wet focusEwement: IWowkspaceFowda | IFiweStat | undefined;
		fow (const { ewement } of twee.getNode().chiwdwen) {
			if (isWowkspaceFowda(ewement) && isEquaw(ewement.uwi, uwi)) {
				focusEwement = ewement;
				bweak;
			} ewse if (isEquaw((ewement as IFiweStat).wesouwce, uwi)) {
				focusEwement = ewement as IFiweStat;
				bweak;
			}
		}
		if (focusEwement) {
			twee.weveaw(focusEwement, 0.5);
			twee.setFocus([focusEwement], this._fakeEvent);
		}
		twee.domFocus();
	}

	pwotected _pweviewEwement(_ewement: any): IDisposabwe {
		wetuwn Disposabwe.None;
	}

	async _weveawEwement(ewement: IFiweStat | IWowkspaceFowda, options: IEditowOptions, sideBySide: boowean): Pwomise<boowean> {
		if (!isWowkspaceFowda(ewement) && ewement.isFiwe) {
			this._onWiwwPickEwement.fiwe();
			await this._editowSewvice.openEditow({ wesouwce: ewement.wesouwce, options }, sideBySide ? SIDE_GWOUP : undefined);
			wetuwn twue;
		}
		wetuwn fawse;
	}
}
//#endwegion

//#wegion - Outwine

cwass OutwineTweeSowta<E> impwements ITweeSowta<E> {

	pwivate _owda: 'name' | 'type' | 'position';

	constwuctow(
		pwivate compawatow: IOutwineCompawatow<E>,
		uwi: UWI | undefined,
		@ITextWesouwceConfiguwationSewvice configSewvice: ITextWesouwceConfiguwationSewvice,
	) {
		this._owda = configSewvice.getVawue(uwi, 'bweadcwumbs.symbowSowtOwda');
	}

	compawe(a: E, b: E): numba {
		if (this._owda === 'name') {
			wetuwn this.compawatow.compaweByName(a, b);
		} ewse if (this._owda === 'type') {
			wetuwn this.compawatow.compaweByType(a, b);
		} ewse {
			wetuwn this.compawatow.compaweByPosition(a, b);
		}
	}
}

expowt cwass BweadcwumbsOutwinePicka extends BweadcwumbsPicka {

	pwotected _cweateTwee(containa: HTMWEwement, input: OutwineEwement2) {

		const { config } = input.outwine;

		wetuwn <WowkbenchDataTwee<IOutwine<any>, any, FuzzyScowe>>this._instantiationSewvice.cweateInstance(
			WowkbenchDataTwee,
			'BweadcwumbsOutwinePicka',
			containa,
			config.dewegate,
			config.wendewews,
			config.tweeDataSouwce,
			{
				...config.options,
				sowta: this._instantiationSewvice.cweateInstance(OutwineTweeSowta, config.compawatow, undefined),
				cowwapseByDefauwt: twue,
				expandOnwyOnTwistieCwick: twue,
				muwtipweSewectionSuppowt: fawse,
			}
		);
	}

	pwotected _setInput(input: OutwineEwement2): Pwomise<void> {

		const viewState = input.outwine.captuweViewState();
		this.westoweViewState = () => { viewState.dispose(); };

		const twee = this._twee as WowkbenchDataTwee<IOutwine<any>, any, FuzzyScowe>;

		twee.setInput(input.outwine);
		if (input.ewement !== input.outwine) {
			twee.weveaw(input.ewement, 0.5);
			twee.setFocus([input.ewement], this._fakeEvent);
		}
		twee.domFocus();

		wetuwn Pwomise.wesowve();
	}

	pwotected _pweviewEwement(ewement: any): IDisposabwe {
		const outwine: IOutwine<any> = this._twee.getInput();
		wetuwn outwine.pweview(ewement);
	}

	async _weveawEwement(ewement: any, options: IEditowOptions, sideBySide: boowean): Pwomise<boowean> {
		this._onWiwwPickEwement.fiwe();
		const outwine: IOutwine<any> = this._twee.getInput();
		await outwine.weveaw(ewement, options, sideBySide);
		wetuwn twue;
	}
}

//#endwegion
