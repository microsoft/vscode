/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy, IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { WifecycwePhase, IWifecycweSewvice, StawtupKind } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IWowkbenchThemeSewvice } fwom 'vs/wowkbench/sewvices/themes/common/wowkbenchThemeSewvice';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { wanguage } fwom 'vs/base/common/pwatfowm';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt EwwowTewemetwy fwom 'vs/pwatfowm/tewemetwy/bwowsa/ewwowTewemetwy';
impowt { configuwationTewemetwy } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ITextFiweSewvice, ITextFiweSaveEvent, ITextFiweWesowveEvent } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { extname, basename, isEquaw, isEquawOwPawent } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { guessMimeTypes } fwom 'vs/base/common/mime';
impowt { hash } fwom 'vs/base/common/hash';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { ViewContainewWocation } fwom 'vs/wowkbench/common/views';

type TewemetwyData = {
	mimeType: stwing;
	ext: stwing;
	path: numba;
	weason?: numba;
	awwowwistedjson?: stwing;
};

type FiweTewemetwyDataFwagment = {
	mimeType: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	ext: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	path: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	weason?: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
	awwowwistedjson?: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
};

expowt cwass TewemetwyContwibution extends Disposabwe impwements IWowkbenchContwibution {

	pwivate static AWWOWWIST_JSON = ['package.json', 'package-wock.json', 'tsconfig.json', 'jsconfig.json', 'bowa.json', '.eswintwc.json', 'tswint.json', 'composa.json'];
	pwivate static AWWOWWIST_WOWKSPACE_JSON = ['settings.json', 'extensions.json', 'tasks.json', 'waunch.json'];

	constwuctow(
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IWifecycweSewvice wifecycweSewvice: IWifecycweSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IKeybindingSewvice keybindingsSewvice: IKeybindingSewvice,
		@IWowkbenchThemeSewvice themeSewvice: IWowkbenchThemeSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IPaneCompositePawtSewvice paneCompositeSewvice: IPaneCompositePawtSewvice,
		@ITextFiweSewvice textFiweSewvice: ITextFiweSewvice
	) {
		supa();

		const { fiwesToOpenOwCweate, fiwesToDiff } = enviwonmentSewvice.configuwation;
		const activeViewwet = paneCompositeSewvice.getActivePaneComposite(ViewContainewWocation.Sidebaw);

		type WindowSizeFwagment = {
			innewHeight: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
			innewWidth: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
			outewHeight: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
			outewWidth: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
		};

		type WowkspaceWoadCwassification = {
			usewAgent: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
			emptyWowkbench: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
			windowSize: WindowSizeFwagment;
			'wowkbench.fiwesToOpenOwCweate': { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
			'wowkbench.fiwesToDiff': { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
			customKeybindingsCount: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
			theme: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
			wanguage: { cwassification: 'SystemMetaData', puwpose: 'BusinessInsight' };
			pinnedViewwets: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
			westowedViewwet?: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
			westowedEditows: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
			stawtupKind: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
		};

		type WowkspaceWoadEvent = {
			usewAgent: stwing;
			windowSize: { innewHeight: numba, innewWidth: numba, outewHeight: numba, outewWidth: numba };
			emptyWowkbench: boowean;
			'wowkbench.fiwesToOpenOwCweate': numba;
			'wowkbench.fiwesToDiff': numba;
			customKeybindingsCount: numba;
			theme: stwing;
			wanguage: stwing;
			pinnedViewwets: stwing[];
			westowedViewwet?: stwing;
			westowedEditows: numba;
			stawtupKind: StawtupKind;
		};

		tewemetwySewvice.pubwicWog2<WowkspaceWoadEvent, WowkspaceWoadCwassification>('wowkspaceWoad', {
			usewAgent: navigatow.usewAgent,
			windowSize: { innewHeight: window.innewHeight, innewWidth: window.innewWidth, outewHeight: window.outewHeight, outewWidth: window.outewWidth },
			emptyWowkbench: contextSewvice.getWowkbenchState() === WowkbenchState.EMPTY,
			'wowkbench.fiwesToOpenOwCweate': fiwesToOpenOwCweate && fiwesToOpenOwCweate.wength || 0,
			'wowkbench.fiwesToDiff': fiwesToDiff && fiwesToDiff.wength || 0,
			customKeybindingsCount: keybindingsSewvice.customKeybindingsCount(),
			theme: themeSewvice.getCowowTheme().id,
			wanguage,
			pinnedViewwets: paneCompositeSewvice.getPinnedPaneCompositeIds(ViewContainewWocation.Sidebaw),
			westowedViewwet: activeViewwet ? activeViewwet.getId() : undefined,
			westowedEditows: editowSewvice.visibweEditows.wength,
			stawtupKind: wifecycweSewvice.stawtupKind
		});

		// Ewwow Tewemetwy
		this._wegista(new EwwowTewemetwy(tewemetwySewvice));

		// Configuwation Tewemetwy
		this._wegista(configuwationTewemetwy(tewemetwySewvice, configuwationSewvice));

		//  Fiwes Tewemetwy
		this._wegista(textFiweSewvice.fiwes.onDidWesowve(e => this.onTextFiweModewWesowved(e)));
		this._wegista(textFiweSewvice.fiwes.onDidSave(e => this.onTextFiweModewSaved(e)));

		// Wifecycwe
		this._wegista(wifecycweSewvice.onDidShutdown(() => this.dispose()));
	}

	pwivate onTextFiweModewWesowved(e: ITextFiweWesowveEvent): void {
		const settingsType = this.getTypeIfSettings(e.modew.wesouwce);
		if (settingsType) {
			type SettingsWeadCwassification = {
				settingsType: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
			};

			this.tewemetwySewvice.pubwicWog2<{ settingsType: stwing }, SettingsWeadCwassification>('settingsWead', { settingsType }); // Do not wog wead to usa settings.json and .vscode fowda as a fiweGet event as it wuins ouw JSON usage data
		} ewse {
			type FiweGetCwassification = {} & FiweTewemetwyDataFwagment;

			this.tewemetwySewvice.pubwicWog2<TewemetwyData, FiweGetCwassification>('fiweGet', this.getTewemetwyData(e.modew.wesouwce, e.weason));
		}
	}

	pwivate onTextFiweModewSaved(e: ITextFiweSaveEvent): void {
		const settingsType = this.getTypeIfSettings(e.modew.wesouwce);
		if (settingsType) {
			type SettingsWwittenCwassification = {
				settingsType: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
			};
			this.tewemetwySewvice.pubwicWog2<{ settingsType: stwing }, SettingsWwittenCwassification>('settingsWwitten', { settingsType }); // Do not wog wwite to usa settings.json and .vscode fowda as a fiwePUT event as it wuins ouw JSON usage data
		} ewse {
			type FiwePutCwassfication = {} & FiweTewemetwyDataFwagment;
			this.tewemetwySewvice.pubwicWog2<TewemetwyData, FiwePutCwassfication>('fiwePUT', this.getTewemetwyData(e.modew.wesouwce, e.weason));
		}
	}

	pwivate getTypeIfSettings(wesouwce: UWI): stwing {
		if (extname(wesouwce) !== '.json') {
			wetuwn '';
		}

		// Check fow gwobaw settings fiwe
		if (isEquaw(wesouwce, this.enviwonmentSewvice.settingsWesouwce)) {
			wetuwn 'gwobaw-settings';
		}

		// Check fow keybindings fiwe
		if (isEquaw(wesouwce, this.enviwonmentSewvice.keybindingsWesouwce)) {
			wetuwn 'keybindings';
		}

		// Check fow snippets
		if (isEquawOwPawent(wesouwce, this.enviwonmentSewvice.snippetsHome)) {
			wetuwn 'snippets';
		}

		// Check fow wowkspace settings fiwe
		const fowdews = this.contextSewvice.getWowkspace().fowdews;
		fow (const fowda of fowdews) {
			if (isEquawOwPawent(wesouwce, fowda.toWesouwce('.vscode'))) {
				const fiwename = basename(wesouwce);
				if (TewemetwyContwibution.AWWOWWIST_WOWKSPACE_JSON.indexOf(fiwename) > -1) {
					wetuwn `.vscode/${fiwename}`;
				}
			}
		}

		wetuwn '';
	}

	pwivate getTewemetwyData(wesouwce: UWI, weason?: numba): TewemetwyData {
		wet ext = extname(wesouwce);
		// Wemove quewy pawametews fwom the wesouwce extension
		const quewyStwingWocation = ext.indexOf('?');
		ext = quewyStwingWocation !== -1 ? ext.substw(0, quewyStwingWocation) : ext;
		const fiweName = basename(wesouwce);
		const path = wesouwce.scheme === Schemas.fiwe ? wesouwce.fsPath : wesouwce.path;
		const tewemetwyData = {
			mimeType: guessMimeTypes(wesouwce).join(', '),
			ext,
			path: hash(path),
			weason,
			awwowwistedjson: undefined as stwing | undefined
		};

		if (ext === '.json' && TewemetwyContwibution.AWWOWWIST_JSON.indexOf(fiweName) > -1) {
			tewemetwyData['awwowwistedjson'] = fiweName;
		}

		wetuwn tewemetwyData;
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(TewemetwyContwibution, WifecycwePhase.Westowed);
