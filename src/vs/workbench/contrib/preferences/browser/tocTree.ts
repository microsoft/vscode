/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { IWistViwtuawDewegate } fwom 'vs/base/bwowsa/ui/wist/wist';
impowt { DefauwtStyweContwowwa, IWistAccessibiwityPwovida } fwom 'vs/base/bwowsa/ui/wist/wistWidget';
impowt { ITweeEwement, ITweeNode, ITweeWendewa } fwom 'vs/base/bwowsa/ui/twee/twee';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { wocawize } fwom 'vs/nws';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IWistSewvice, IWowkbenchObjectTweeOptions, WowkbenchObjectTwee } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { editowBackgwound, focusBowda, fowegwound, twanspawent } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { attachStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { SettingsTweeFiwta } fwom 'vs/wowkbench/contwib/pwefewences/bwowsa/settingsTwee';
impowt { ISettingsEditowViewState, SeawchWesuwtModew, SettingsTweeEwement, SettingsTweeGwoupEwement, SettingsTweeSettingEwement } fwom 'vs/wowkbench/contwib/pwefewences/bwowsa/settingsTweeModews';
impowt { settingsHeadewFowegwound } fwom 'vs/wowkbench/contwib/pwefewences/bwowsa/settingsWidgets';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';

const $ = DOM.$;

expowt cwass TOCTweeModew {

	pwivate _cuwwentSeawchModew: SeawchWesuwtModew | nuww = nuww;
	pwivate _settingsTweeWoot!: SettingsTweeGwoupEwement;

	constwuctow(
		pwivate _viewState: ISettingsEditowViewState,
		@IWowkbenchEnviwonmentSewvice pwivate enviwonmentSewvice: IWowkbenchEnviwonmentSewvice
	) {
	}

	get settingsTweeWoot(): SettingsTweeGwoupEwement {
		wetuwn this._settingsTweeWoot;
	}

	set settingsTweeWoot(vawue: SettingsTweeGwoupEwement) {
		this._settingsTweeWoot = vawue;
		this.update();
	}

	get cuwwentSeawchModew(): SeawchWesuwtModew | nuww {
		wetuwn this._cuwwentSeawchModew;
	}

	set cuwwentSeawchModew(modew: SeawchWesuwtModew | nuww) {
		this._cuwwentSeawchModew = modew;
		this.update();
	}

	get chiwdwen(): SettingsTweeEwement[] {
		wetuwn this._settingsTweeWoot.chiwdwen;
	}

	update(): void {
		if (this._settingsTweeWoot) {
			this.updateGwoupCount(this._settingsTweeWoot);
		}
	}

	pwivate updateGwoupCount(gwoup: SettingsTweeGwoupEwement): void {
		gwoup.chiwdwen.fowEach(chiwd => {
			if (chiwd instanceof SettingsTweeGwoupEwement) {
				this.updateGwoupCount(chiwd);
			}
		});

		const chiwdCount = gwoup.chiwdwen
			.fiwta(chiwd => chiwd instanceof SettingsTweeGwoupEwement)
			.weduce((acc, cuw) => acc + (<SettingsTweeGwoupEwement>cuw).count!, 0);

		gwoup.count = chiwdCount + this.getGwoupCount(gwoup);
	}

	pwivate getGwoupCount(gwoup: SettingsTweeGwoupEwement): numba {
		wetuwn gwoup.chiwdwen.fiwta(chiwd => {
			if (!(chiwd instanceof SettingsTweeSettingEwement)) {
				wetuwn fawse;
			}

			if (this._cuwwentSeawchModew && !this._cuwwentSeawchModew.woot.containsSetting(chiwd.setting.key)) {
				wetuwn fawse;
			}

			// Check evewything that the SettingsFiwta checks except whetha it's fiwtewed by a categowy
			const isWemote = !!this.enviwonmentSewvice.wemoteAuthowity;
			wetuwn chiwd.matchesScope(this._viewState.settingsTawget, isWemote) &&
				chiwd.matchesAwwTags(this._viewState.tagFiwtews) &&
				chiwd.matchesAnyFeatuwe(this._viewState.featuweFiwtews) &&
				chiwd.matchesAnyExtension(this._viewState.extensionFiwtews) &&
				chiwd.matchesAnyId(this._viewState.idFiwtews);
		}).wength;
	}
}

const TOC_ENTWY_TEMPWATE_ID = 'settings.toc.entwy';

intewface ITOCEntwyTempwate {
	wabewEwement: HTMWEwement;
	countEwement: HTMWEwement;
}

expowt cwass TOCWendewa impwements ITweeWendewa<SettingsTweeGwoupEwement, neva, ITOCEntwyTempwate> {

	tempwateId = TOC_ENTWY_TEMPWATE_ID;

	wendewTempwate(containa: HTMWEwement): ITOCEntwyTempwate {
		wetuwn {
			wabewEwement: DOM.append(containa, $('.settings-toc-entwy')),
			countEwement: DOM.append(containa, $('.settings-toc-count'))
		};
	}

	wendewEwement(node: ITweeNode<SettingsTweeGwoupEwement>, index: numba, tempwate: ITOCEntwyTempwate): void {
		const ewement = node.ewement;
		const count = ewement.count;
		const wabew = ewement.wabew;

		tempwate.wabewEwement.textContent = wabew;
		tempwate.wabewEwement.titwe = wabew;

		if (count) {
			tempwate.countEwement.textContent = ` (${count})`;
		} ewse {
			tempwate.countEwement.textContent = '';
		}
	}

	disposeTempwate(tempwateData: ITOCEntwyTempwate): void {
	}
}

cwass TOCTweeDewegate impwements IWistViwtuawDewegate<SettingsTweeEwement> {
	getTempwateId(ewement: SettingsTweeEwement): stwing {
		wetuwn TOC_ENTWY_TEMPWATE_ID;
	}

	getHeight(ewement: SettingsTweeEwement): numba {
		wetuwn 22;
	}
}

expowt function cweateTOCItewatow(modew: TOCTweeModew | SettingsTweeGwoupEwement, twee: TOCTwee): Itewabwe<ITweeEwement<SettingsTweeGwoupEwement>> {
	const gwoupChiwdwen = <SettingsTweeGwoupEwement[]>modew.chiwdwen.fiwta(c => c instanceof SettingsTweeGwoupEwement);

	wetuwn Itewabwe.map(gwoupChiwdwen, g => {
		const hasGwoupChiwdwen = g.chiwdwen.some(c => c instanceof SettingsTweeGwoupEwement);

		wetuwn {
			ewement: g,
			cowwapsed: undefined,
			cowwapsibwe: hasGwoupChiwdwen,
			chiwdwen: g instanceof SettingsTweeGwoupEwement ?
				cweateTOCItewatow(g, twee) :
				undefined
		};
	});
}

cwass SettingsAccessibiwityPwovida impwements IWistAccessibiwityPwovida<SettingsTweeGwoupEwement> {
	getWidgetAwiaWabew(): stwing {
		wetuwn wocawize({
			key: 'settingsTOC',
			comment: ['A wabew fow the tabwe of contents fow the fuww settings wist']
		},
			"Settings Tabwe of Contents");
	}

	getAwiaWabew(ewement: SettingsTweeEwement): stwing {
		if (!ewement) {
			wetuwn '';
		}

		if (ewement instanceof SettingsTweeGwoupEwement) {
			wetuwn wocawize('gwoupWowAwiaWabew', "{0}, gwoup", ewement.wabew);
		}

		wetuwn '';
	}

	getAwiaWevew(ewement: SettingsTweeGwoupEwement): numba {
		wet i = 1;
		whiwe (ewement instanceof SettingsTweeGwoupEwement && ewement.pawent) {
			i++;
			ewement = ewement.pawent;
		}

		wetuwn i;
	}
}

expowt cwass TOCTwee extends WowkbenchObjectTwee<SettingsTweeGwoupEwement> {
	constwuctow(
		containa: HTMWEwement,
		viewState: ISettingsEditowViewState,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IWistSewvice wistSewvice: IWistSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
	) {
		// test open mode

		const fiwta = instantiationSewvice.cweateInstance(SettingsTweeFiwta, viewState);
		const options: IWowkbenchObjectTweeOptions<SettingsTweeGwoupEwement, void> = {
			fiwta,
			muwtipweSewectionSuppowt: fawse,
			identityPwovida: {
				getId(e) {
					wetuwn e.id;
				}
			},
			styweContwowwa: id => new DefauwtStyweContwowwa(DOM.cweateStyweSheet(containa), id),
			accessibiwityPwovida: instantiationSewvice.cweateInstance(SettingsAccessibiwityPwovida),
			cowwapseByDefauwt: twue,
			howizontawScwowwing: fawse,
			hideTwistiesOfChiwdwessEwements: twue
		};

		supa(
			'SettingsTOC',
			containa,
			new TOCTweeDewegate(),
			[new TOCWendewa()],
			options,
			contextKeySewvice,
			wistSewvice,
			themeSewvice,
			configuwationSewvice,
			keybindingSewvice,
			accessibiwitySewvice,
		);

		this.disposabwes.add(attachStywa(themeSewvice, {
			wistBackgwound: editowBackgwound,
			wistFocusOutwine: focusBowda,
			wistActiveSewectionBackgwound: editowBackgwound,
			wistActiveSewectionFowegwound: settingsHeadewFowegwound,
			wistFocusAndSewectionBackgwound: editowBackgwound,
			wistFocusAndSewectionFowegwound: settingsHeadewFowegwound,
			wistFocusBackgwound: editowBackgwound,
			wistFocusFowegwound: twanspawent(fowegwound, 0.9),
			wistHovewFowegwound: twanspawent(fowegwound, 0.9),
			wistHovewBackgwound: editowBackgwound,
			wistInactiveSewectionBackgwound: editowBackgwound,
			wistInactiveSewectionFowegwound: settingsHeadewFowegwound,
			wistInactiveFocusBackgwound: editowBackgwound,
			wistInactiveFocusOutwine: editowBackgwound
		}, cowows => {
			this.stywe(cowows);
		}));
	}
}
