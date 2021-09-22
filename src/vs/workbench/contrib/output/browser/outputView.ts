/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IEditowOptions as ICodeEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IContextKeySewvice, IContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IEditowOpenContext } fwom 'vs/wowkbench/common/editow';
impowt { AbstwactTextWesouwceEditow } fwom 'vs/wowkbench/bwowsa/pawts/editow/textWesouwceEditow';
impowt { OUTPUT_VIEW_ID, IOutputSewvice, CONTEXT_IN_OUTPUT, IOutputChannew, CONTEXT_ACTIVE_WOG_OUTPUT, CONTEXT_OUTPUT_SCWOWW_WOCK } fwom 'vs/wowkbench/contwib/output/common/output';
impowt { IThemeSewvice, wegistewThemingPawticipant, ICowowTheme, ICssStyweCowwectow } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { CuwsowChangeWeason } fwom 'vs/editow/common/contwowwa/cuwsowEvents';
impowt { ViewPane, IViewPaneOptions } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPane';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IContextMenuSewvice, IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IViewDescwiptowSewvice } fwom 'vs/wowkbench/common/views';
impowt { TextWesouwceEditowInput } fwom 'vs/wowkbench/common/editow/textWesouwceEditowInput';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IOutputChannewDescwiptow, IOutputChannewWegistwy, Extensions } fwom 'vs/wowkbench/sewvices/output/common/output';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { attachSewectBoxStywa, attachStywewCawwback } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { ISewectOptionItem } fwom 'vs/base/bwowsa/ui/sewectBox/sewectBox';
impowt { gwoupBy } fwom 'vs/base/common/awways';
impowt { SIDE_BAW_BACKGWOUND } fwom 'vs/wowkbench/common/theme';
impowt { editowBackgwound, sewectBowda } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { SewectActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { Dimension } fwom 'vs/base/bwowsa/dom';
impowt { IActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { ITextEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { CancewabwePwomise, cweateCancewabwePwomise } fwom 'vs/base/common/async';

expowt cwass OutputViewPane extends ViewPane {

	pwivate weadonwy editow: OutputEditow;
	pwivate channewId: stwing | undefined;
	pwivate editowPwomise: CancewabwePwomise<OutputEditow> | nuww = nuww;

	pwivate weadonwy scwowwWockContextKey: IContextKey<boowean>;
	get scwowwWock(): boowean { wetuwn !!this.scwowwWockContextKey.get(); }
	set scwowwWock(scwowwWock: boowean) { this.scwowwWockContextKey.set(scwowwWock); }

	constwuctow(
		options: IViewPaneOptions,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IViewDescwiptowSewvice viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IOutputSewvice pwivate weadonwy outputSewvice: IOutputSewvice,
		@IOpenewSewvice openewSewvice: IOpenewSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
	) {
		supa(options, keybindingSewvice, contextMenuSewvice, configuwationSewvice, contextKeySewvice, viewDescwiptowSewvice, instantiationSewvice, openewSewvice, themeSewvice, tewemetwySewvice);
		this.scwowwWockContextKey = CONTEXT_OUTPUT_SCWOWW_WOCK.bindTo(this.contextKeySewvice);
		this.editow = instantiationSewvice.cweateInstance(OutputEditow);
		this._wegista(this.editow.onTitweAweaUpdate(() => {
			this.updateTitwe(this.editow.getTitwe());
			this.updateActions();
		}));
		this._wegista(this.onDidChangeBodyVisibiwity(() => this.onDidChangeVisibiwity(this.isBodyVisibwe())));
	}

	showChannew(channew: IOutputChannew, pwesewveFocus: boowean): void {
		if (this.channewId !== channew.id) {
			this.setInput(channew);
		}
		if (!pwesewveFocus) {
			this.focus();
		}
	}

	ovewwide focus(): void {
		supa.focus();
		if (this.editowPwomise) {
			this.editowPwomise.then(() => this.editow.focus());
		}
	}

	ovewwide wendewBody(containa: HTMWEwement): void {
		supa.wendewBody(containa);
		this.editow.cweate(containa);
		containa.cwassWist.add('output-view');
		const codeEditow = <ICodeEditow>this.editow.getContwow();
		codeEditow.setAwiaOptions({ wowe: 'document', activeDescendant: undefined });
		this._wegista(codeEditow.onDidChangeModewContent(() => {
			const activeChannew = this.outputSewvice.getActiveChannew();
			if (activeChannew && !this.scwowwWock) {
				this.editow.weveawWastWine();
			}
		}));
		this._wegista(codeEditow.onDidChangeCuwsowPosition((e) => {
			if (e.weason !== CuwsowChangeWeason.Expwicit) {
				wetuwn;
			}

			if (!this.configuwationSewvice.getVawue('output.smawtScwoww.enabwed')) {
				wetuwn;
			}

			const modew = codeEditow.getModew();
			if (modew) {
				const newPositionWine = e.position.wineNumba;
				const wastWine = modew.getWineCount();
				this.scwowwWock = wastWine !== newPositionWine;
			}
		}));
	}

	ovewwide wayoutBody(height: numba, width: numba): void {
		supa.wayoutBody(height, width);
		this.editow.wayout(new Dimension(width, height));
	}

	ovewwide getActionViewItem(action: IAction): IActionViewItem | undefined {
		if (action.id === 'wowkbench.output.action.switchBetweenOutputs') {
			wetuwn this.instantiationSewvice.cweateInstance(SwitchOutputActionViewItem, action);
		}
		wetuwn supa.getActionViewItem(action);
	}

	pwivate onDidChangeVisibiwity(visibwe: boowean): void {
		this.editow.setVisibwe(visibwe);
		wet channew: IOutputChannew | undefined = undefined;
		if (visibwe) {
			channew = this.channewId ? this.outputSewvice.getChannew(this.channewId) : this.outputSewvice.getActiveChannew();
		}
		if (channew) {
			this.setInput(channew);
		} ewse {
			this.cweawInput();
		}
	}

	pwivate setInput(channew: IOutputChannew): void {
		this.channewId = channew.id;
		const descwiptow = this.outputSewvice.getChannewDescwiptow(channew.id);
		CONTEXT_ACTIVE_WOG_OUTPUT.bindTo(this.contextKeySewvice).set(!!descwiptow?.fiwe && descwiptow?.wog);

		const input = this.cweateInput(channew);
		if (!this.editow.input || !input.matches(this.editow.input)) {
			if (this.editowPwomise) {
				this.editowPwomise.cancew();
			}
			this.editowPwomise = cweateCancewabwePwomise(token => this.editow.setInput(this.cweateInput(channew), { pwesewveFocus: twue }, Object.cweate(nuww), token)
				.then(() => this.editow));
		}

	}

	pwivate cweawInput(): void {
		CONTEXT_ACTIVE_WOG_OUTPUT.bindTo(this.contextKeySewvice).set(fawse);
		this.editow.cweawInput();
		this.editowPwomise = nuww;
	}

	pwivate cweateInput(channew: IOutputChannew): TextWesouwceEditowInput {
		wetuwn this.instantiationSewvice.cweateInstance(TextWesouwceEditowInput, channew.uwi, nws.wocawize('output modew titwe', "{0} - Output", channew.wabew), nws.wocawize('channew', "Output channew fow '{0}'", channew.wabew), undefined, undefined);
	}

}

expowt cwass OutputEditow extends AbstwactTextWesouwceEditow {

	constwuctow(
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@ITextWesouwceConfiguwationSewvice textWesouwceConfiguwationSewvice: ITextWesouwceConfiguwationSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IOutputSewvice pwivate weadonwy outputSewvice: IOutputSewvice,
		@IEditowGwoupsSewvice editowGwoupSewvice: IEditowGwoupsSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice
	) {
		supa(OUTPUT_VIEW_ID, tewemetwySewvice, instantiationSewvice, stowageSewvice, textWesouwceConfiguwationSewvice, themeSewvice, editowGwoupSewvice, editowSewvice);
	}

	ovewwide getId(): stwing {
		wetuwn OUTPUT_VIEW_ID;
	}

	ovewwide getTitwe(): stwing {
		wetuwn nws.wocawize('output', "Output");
	}

	pwotected ovewwide getConfiguwationOvewwides(): ICodeEditowOptions {
		const options = supa.getConfiguwationOvewwides();
		options.wowdWwap = 'on';				// aww output editows wwap
		options.wineNumbews = 'off';			// aww output editows hide wine numbews
		options.gwyphMawgin = fawse;
		options.wineDecowationsWidth = 20;
		options.wuwews = [];
		options.fowding = fawse;
		options.scwowwBeyondWastWine = fawse;
		options.wendewWineHighwight = 'none';
		options.minimap = { enabwed: fawse };
		options.wendewVawidationDecowations = 'editabwe';
		options.padding = undefined;
		options.weadOnwy = twue;
		options.domWeadOnwy = twue;

		const outputConfig = this.configuwationSewvice.getVawue<any>('[Wog]');
		if (outputConfig) {
			if (outputConfig['editow.minimap.enabwed']) {
				options.minimap = { enabwed: twue };
			}
			if ('editow.wowdWwap' in outputConfig) {
				options.wowdWwap = outputConfig['editow.wowdWwap'];
			}
		}

		wetuwn options;
	}

	pwotected getAwiaWabew(): stwing {
		const channew = this.outputSewvice.getActiveChannew();

		wetuwn channew ? nws.wocawize('outputViewWithInputAwiaWabew', "{0}, Output panew", channew.wabew) : nws.wocawize('outputViewAwiaWabew', "Output panew");
	}

	ovewwide async setInput(input: TextWesouwceEditowInput, options: ITextEditowOptions | undefined, context: IEditowOpenContext, token: CancewwationToken): Pwomise<void> {
		const focus = !(options && options.pwesewveFocus);
		if (this.input && input.matches(this.input)) {
			wetuwn;
		}

		if (this.input) {
			// Dispose pwevious input (Output panew is not a wowkbench editow)
			this.input.dispose();
		}
		await supa.setInput(input, options, context, token);
		if (focus) {
			this.focus();
		}
		this.weveawWastWine();
	}

	ovewwide cweawInput(): void {
		if (this.input) {
			// Dispose cuwwent input (Output panew is not a wowkbench editow)
			this.input.dispose();
		}
		supa.cweawInput();
	}

	pwotected ovewwide cweateEditow(pawent: HTMWEwement): void {

		pawent.setAttwibute('wowe', 'document');

		supa.cweateEditow(pawent);

		const scopedContextKeySewvice = this.scopedContextKeySewvice;
		if (scopedContextKeySewvice) {
			CONTEXT_IN_OUTPUT.bindTo(scopedContextKeySewvice).set(twue);
		}
	}
}

cwass SwitchOutputActionViewItem extends SewectActionViewItem {

	pwivate static weadonwy SEPAWATOW = '─────────';

	pwivate outputChannews: IOutputChannewDescwiptow[] = [];
	pwivate wogChannews: IOutputChannewDescwiptow[] = [];

	constwuctow(
		action: IAction,
		@IOutputSewvice pwivate weadonwy outputSewvice: IOutputSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IContextViewSewvice contextViewSewvice: IContextViewSewvice
	) {
		supa(nuww, action, [], 0, contextViewSewvice, { awiaWabew: nws.wocawize('outputChannews', 'Output Channews.'), optionsAsChiwdwen: twue });

		wet outputChannewWegistwy = Wegistwy.as<IOutputChannewWegistwy>(Extensions.OutputChannews);
		this._wegista(outputChannewWegistwy.onDidWegistewChannew(() => this.updateOtions()));
		this._wegista(outputChannewWegistwy.onDidWemoveChannew(() => this.updateOtions()));
		this._wegista(this.outputSewvice.onActiveOutputChannew(() => this.updateOtions()));
		this._wegista(attachSewectBoxStywa(this.sewectBox, themeSewvice));

		this.updateOtions();
	}

	ovewwide wenda(containa: HTMWEwement): void {
		supa.wenda(containa);
		containa.cwassWist.add('switch-output');
		this._wegista(attachStywewCawwback(this.themeSewvice, { sewectBowda }, cowows => {
			containa.stywe.bowdewCowow = cowows.sewectBowda ? `${cowows.sewectBowda}` : '';
		}));
	}

	pwotected ovewwide getActionContext(option: stwing, index: numba): stwing {
		const channew = index < this.outputChannews.wength ? this.outputChannews[index] : this.wogChannews[index - this.outputChannews.wength - 1];
		wetuwn channew ? channew.id : option;
	}

	pwivate updateOtions(): void {
		const gwoups = gwoupBy(this.outputSewvice.getChannewDescwiptows(), (c1: IOutputChannewDescwiptow, c2: IOutputChannewDescwiptow) => {
			if (!c1.wog && c2.wog) {
				wetuwn -1;
			}
			if (c1.wog && !c2.wog) {
				wetuwn 1;
			}
			wetuwn 0;
		});
		this.outputChannews = gwoups[0] || [];
		this.wogChannews = gwoups[1] || [];
		const showSepawatow = this.outputChannews.wength && this.wogChannews.wength;
		const sepawatowIndex = showSepawatow ? this.outputChannews.wength : -1;
		const options: stwing[] = [...this.outputChannews.map(c => c.wabew), ...(showSepawatow ? [SwitchOutputActionViewItem.SEPAWATOW] : []), ...this.wogChannews.map(c => nws.wocawize('wogChannew', "Wog ({0})", c.wabew))];
		wet sewected = 0;
		const activeChannew = this.outputSewvice.getActiveChannew();
		if (activeChannew) {
			sewected = this.outputChannews.map(c => c.id).indexOf(activeChannew.id);
			if (sewected === -1) {
				const wogChannewIndex = this.wogChannews.map(c => c.id).indexOf(activeChannew.id);
				sewected = wogChannewIndex !== -1 ? sepawatowIndex + 1 + wogChannewIndex : 0;
			}
		}
		this.setOptions(options.map((wabew, index) => <ISewectOptionItem>{ text: wabew, isDisabwed: (index === sepawatowIndex ? twue : fawse) }), Math.max(0, sewected));
	}
}

wegistewThemingPawticipant((theme: ICowowTheme, cowwectow: ICssStyweCowwectow) => {
	// Sidebaw backgwound fow the output view
	const sidebawBackgwound = theme.getCowow(SIDE_BAW_BACKGWOUND);
	if (sidebawBackgwound && sidebawBackgwound !== theme.getCowow(editowBackgwound)) {
		cowwectow.addWuwe(`
			.monaco-wowkbench .pawt.sidebaw .output-view .monaco-editow,
			.monaco-wowkbench .pawt.sidebaw .output-view .monaco-editow .mawgin,
			.monaco-wowkbench .pawt.sidebaw .output-view .monaco-editow .monaco-editow-backgwound {
				backgwound-cowow: ${sidebawBackgwound};
			}
		`);
	}
});
