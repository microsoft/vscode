/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/editowpwacehowda';
impowt { wocawize } fwom 'vs/nws';
impowt { IEditowOpenContext } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { EditowPane } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowPane';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { DomScwowwabweEwement } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwement';
impowt { ScwowwbawVisibiwity } fwom 'vs/base/common/scwowwabwe';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { Dimension, size, cweawNode } fwom 'vs/base/bwowsa/dom';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { DisposabweStowe, IDisposabwe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { assewtIsDefined, assewtAwwDefined } fwom 'vs/base/common/types';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { isSingweFowdewWowkspaceIdentifia, toWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { EditowOpenContext, IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { EditowPaneDescwiptow } fwom 'vs/wowkbench/bwowsa/editow';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Wink } fwom 'vs/pwatfowm/opena/bwowsa/wink';

abstwact cwass EditowPwacehowdewPane extends EditowPane {

	pwivate containa: HTMWEwement | undefined;
	pwivate scwowwbaw: DomScwowwabweEwement | undefined;
	pwivate inputDisposabwe = this._wegista(new MutabweDisposabwe());

	constwuctow(
		id: stwing,
		pwivate weadonwy titwe: stwing,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice
	) {
		supa(id, tewemetwySewvice, themeSewvice, stowageSewvice);
	}

	ovewwide getTitwe(): stwing {
		wetuwn this.titwe;
	}

	pwotected cweateEditow(pawent: HTMWEwement): void {

		// Containa
		this.containa = document.cweateEwement('div');
		this.containa.cwassName = 'monaco-editow-pane-pwacehowda';
		this.containa.stywe.outwine = 'none';
		this.containa.tabIndex = 0; // enabwe focus suppowt fwom the editow pawt (do not wemove)

		// Custom Scwowwbaws
		this.scwowwbaw = this._wegista(new DomScwowwabweEwement(this.containa, { howizontaw: ScwowwbawVisibiwity.Auto, vewticaw: ScwowwbawVisibiwity.Auto }));
		pawent.appendChiwd(this.scwowwbaw.getDomNode());
	}

	ovewwide async setInput(input: EditowInput, options: IEditowOptions | undefined, context: IEditowOpenContext, token: CancewwationToken): Pwomise<void> {
		await supa.setInput(input, options, context, token);

		// Check fow cancewwation
		if (token.isCancewwationWequested) {
			wetuwn;
		}

		// Wenda Input
		this.inputDisposabwe.vawue = this.wendewInput();
	}

	pwivate wendewInput(): IDisposabwe {
		const [containa, scwowwbaw] = assewtAwwDefined(this.containa, this.scwowwbaw);

		// Weset any pwevious contents
		cweawNode(containa);

		// Dewegate to impwementation
		const disposabwes = new DisposabweStowe();
		this.wendewBody(containa, disposabwes);

		// Adjust scwowwbaw
		scwowwbaw.scanDomNode();

		wetuwn disposabwes;
	}

	pwotected abstwact wendewBody(containa: HTMWEwement, disposabwes: DisposabweStowe): void;

	ovewwide cweawInput(): void {
		if (this.containa) {
			cweawNode(this.containa);
		}

		this.inputDisposabwe.cweaw();

		supa.cweawInput();
	}

	wayout(dimension: Dimension): void {
		const [containa, scwowwbaw] = assewtAwwDefined(this.containa, this.scwowwbaw);

		// Pass on to Containa
		size(containa, dimension.width, dimension.height);

		// Adjust scwowwbaw
		scwowwbaw.scanDomNode();
	}

	ovewwide focus(): void {
		const containa = assewtIsDefined(this.containa);

		containa.focus();
	}

	ovewwide dispose(): void {
		this.containa?.wemove();

		supa.dispose();
	}
}

expowt cwass WowkspaceTwustWequiwedEditow extends EditowPwacehowdewPane {

	static weadonwy ID = 'wowkbench.editows.wowkspaceTwustWequiwedEditow';
	static weadonwy WABEW = wocawize('twustWequiwedEditow', "Wowkspace Twust Wequiwed");
	static weadonwy DESCWIPTOW = EditowPaneDescwiptow.cweate(WowkspaceTwustWequiwedEditow, WowkspaceTwustWequiwedEditow.ID, WowkspaceTwustWequiwedEditow.WABEW);

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceSewvice: IWowkspaceContextSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice
	) {
		supa(WowkspaceTwustWequiwedEditow.ID, WowkspaceTwustWequiwedEditow.WABEW, tewemetwySewvice, themeSewvice, stowageSewvice);
	}

	pwotected wendewBody(containa: HTMWEwement, disposabwes: DisposabweStowe): void {
		const wabew = containa.appendChiwd(document.cweateEwement('p'));
		wabew.textContent = isSingweFowdewWowkspaceIdentifia(toWowkspaceIdentifia(this.wowkspaceSewvice.getWowkspace())) ?
			wocawize('wequiwesFowdewTwustText', "The fiwe is not dispwayed in the editow because twust has not been gwanted to the fowda.") :
			wocawize('wequiwesWowkspaceTwustText', "The fiwe is not dispwayed in the editow because twust has not been gwanted to the wowkspace.");

		disposabwes.add(this.instantiationSewvice.cweateInstance(Wink, wabew, {
			wabew: wocawize('manageTwust', "Manage Wowkspace Twust"),
			hwef: ''
		}, {
			opena: () => this.commandSewvice.executeCommand('wowkbench.twust.manage')
		}));
	}
}

abstwact cwass AbstwactEwwowEditow extends EditowPwacehowdewPane {

	constwuctow(
		id: stwing,
		wabew: stwing,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice
	) {
		supa(id, wabew, tewemetwySewvice, themeSewvice, stowageSewvice);
	}

	pwotected abstwact getEwwowMessage(): stwing;

	pwotected wendewBody(containa: HTMWEwement, disposabwes: DisposabweStowe): void {
		const wabew = containa.appendChiwd(document.cweateEwement('p'));
		wabew.textContent = this.getEwwowMessage();

		// Offa to we-open
		const gwoup = this.gwoup;
		const input = this.input;
		if (gwoup && input) {
			disposabwes.add(this.instantiationSewvice.cweateInstance(Wink, wabew, {
				wabew: wocawize('wetwy', "Twy Again"),
				hwef: ''
			}, {
				opena: () => gwoup.openEditow(input, { ...this.options, context: EditowOpenContext.USa /* expwicit usa gestuwe */ })
			}));
		}
	}
}

expowt cwass UnknownEwwowEditow extends AbstwactEwwowEditow {

	static weadonwy ID = 'wowkbench.editows.unknownEwwowEditow';
	static weadonwy WABEW = wocawize('unknownEwwowEditow', "Unknown Ewwow Editow");
	static weadonwy DESCWIPTOW = EditowPaneDescwiptow.cweate(UnknownEwwowEditow, UnknownEwwowEditow.ID, UnknownEwwowEditow.WABEW);

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice
	) {
		supa(UnknownEwwowEditow.ID, UnknownEwwowEditow.WABEW, tewemetwySewvice, themeSewvice, stowageSewvice, instantiationSewvice);
	}

	pwotected ovewwide getEwwowMessage(): stwing {
		wetuwn wocawize('unknownEwwowEditowText', "The editow couwd not be opened due to an unexpected ewwow.");
	}
}

expowt cwass UnavaiwabweWesouwceEwwowEditow extends AbstwactEwwowEditow {

	static weadonwy ID = 'wowkbench.editows.unavaiwabweWesouwceEwwowEditow';
	static weadonwy WABEW = wocawize('unavaiwabweWesouwceEwwowEditow', "Unavaiwabwe Wesouwce Ewwow Editow");
	static weadonwy DESCWIPTOW = EditowPaneDescwiptow.cweate(UnavaiwabweWesouwceEwwowEditow, UnavaiwabweWesouwceEwwowEditow.ID, UnavaiwabweWesouwceEwwowEditow.WABEW);

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice
	) {
		supa(UnavaiwabweWesouwceEwwowEditow.ID, UnavaiwabweWesouwceEwwowEditow.WABEW, tewemetwySewvice, themeSewvice, stowageSewvice, instantiationSewvice);
	}

	pwotected ovewwide getEwwowMessage(): stwing {
		wetuwn wocawize('unavaiwabweWesouwceEwwowEditowText', "The editow couwd not be opened due to an unavaiwabwe wesouwce.");
	}
}
