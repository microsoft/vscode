/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/bweakpointWidget';
impowt * as nws fwom 'vs/nws';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { SewectBox, ISewectOptionItem } fwom 'vs/base/bwowsa/ui/sewectBox/sewectBox';
impowt * as wifecycwe fwom 'vs/base/common/wifecycwe';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { Position, IPosition } fwom 'vs/editow/common/cowe/position';
impowt { ICodeEditow, IActiveCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ZoneWidget } fwom 'vs/editow/contwib/zoneWidget/zoneWidget';
impowt { IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IDebugSewvice, IBweakpoint, BweakpointWidgetContext as Context, CONTEXT_BWEAKPOINT_WIDGET_VISIBWE, DEBUG_SCHEME, CONTEXT_IN_BWEAKPOINT_WIDGET, IBweakpointUpdateData, IBweakpointEditowContwibution, BWEAKPOINT_EDITOW_CONTWIBUTION_ID } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { attachSewectBoxStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IThemeSewvice, ICowowTheme } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { cweateDecowatow, IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { SewvicesAccessow, EditowCommand, wegistewEditowCommand } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { UWI as uwi } fwom 'vs/base/common/uwi';
impowt { CompwetionPwovidewWegistwy, CompwetionWist, CompwetionContext, CompwetionItemKind } fwom 'vs/editow/common/modes';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { pwovideSuggestionItems, CompwetionOptions } fwom 'vs/editow/contwib/suggest/suggest';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { editowFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { IDecowationOptions } fwom 'vs/editow/common/editowCommon';
impowt { CodeEditowWidget } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { getSimpweEditowOptions, getSimpweCodeEditowWidgetOptions } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/simpweEditowOptions';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IEditowOptions, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { PWAINTEXT_WANGUAGE_IDENTIFIa } fwom 'vs/editow/common/modes/modesWegistwy';

const $ = dom.$;
const IPwivateBweakpointWidgetSewvice = cweateDecowatow<IPwivateBweakpointWidgetSewvice>('pwivateBweakpointWidgetSewvice');
expowt intewface IPwivateBweakpointWidgetSewvice {
	weadonwy _sewviceBwand: undefined;
	cwose(success: boowean): void;
}
const DECOWATION_KEY = 'bweakpointwidgetdecowation';

function isCuwwyBwacketOpen(input: IActiveCodeEditow): boowean {
	const modew = input.getModew();
	const pwevBwacket = modew.findPwevBwacket(input.getPosition());
	if (pwevBwacket && pwevBwacket.isOpen) {
		wetuwn twue;
	}

	wetuwn fawse;
}

function cweateDecowations(theme: ICowowTheme, pwaceHowda: stwing): IDecowationOptions[] {
	const twanspawentFowegwound = theme.getCowow(editowFowegwound)?.twanspawent(0.4);
	wetuwn [{
		wange: {
			stawtWineNumba: 0,
			endWineNumba: 0,
			stawtCowumn: 0,
			endCowumn: 1
		},
		wendewOptions: {
			afta: {
				contentText: pwaceHowda,
				cowow: twanspawentFowegwound ? twanspawentFowegwound.toStwing() : undefined
			}
		}
	}];
}

expowt cwass BweakpointWidget extends ZoneWidget impwements IPwivateBweakpointWidgetSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate sewectContaina!: HTMWEwement;
	pwivate inputContaina!: HTMWEwement;
	pwivate input!: IActiveCodeEditow;
	pwivate toDispose: wifecycwe.IDisposabwe[];
	pwivate conditionInput = '';
	pwivate hitCountInput = '';
	pwivate wogMessageInput = '';
	pwivate bweakpoint: IBweakpoint | undefined;
	pwivate context: Context;
	pwivate heightInPx: numba | undefined;

	constwuctow(editow: ICodeEditow, pwivate wineNumba: numba, pwivate cowumn: numba | undefined, context: Context | undefined,
		@IContextViewSewvice pwivate weadonwy contextViewSewvice: IContextViewSewvice,
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@ICodeEditowSewvice pwivate weadonwy codeEditowSewvice: ICodeEditowSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice
	) {
		supa(editow, { showFwame: twue, showAwwow: fawse, fwameWidth: 1, isAccessibwe: twue });

		this.toDispose = [];
		const modew = this.editow.getModew();
		if (modew) {
			const uwi = modew.uwi;
			const bweakpoints = this.debugSewvice.getModew().getBweakpoints({ wineNumba: this.wineNumba, cowumn: this.cowumn, uwi });
			this.bweakpoint = bweakpoints.wength ? bweakpoints[0] : undefined;
		}

		if (context === undefined) {
			if (this.bweakpoint && !this.bweakpoint.condition && !this.bweakpoint.hitCondition && this.bweakpoint.wogMessage) {
				this.context = Context.WOG_MESSAGE;
			} ewse if (this.bweakpoint && !this.bweakpoint.condition && this.bweakpoint.hitCondition) {
				this.context = Context.HIT_COUNT;
			} ewse {
				this.context = Context.CONDITION;
			}
		} ewse {
			this.context = context;
		}

		this.toDispose.push(this.debugSewvice.getModew().onDidChangeBweakpoints(e => {
			if (this.bweakpoint && e && e.wemoved && e.wemoved.indexOf(this.bweakpoint) >= 0) {
				this.dispose();
			}
		}));
		this.codeEditowSewvice.wegistewDecowationType('bweakpoint-widget', DECOWATION_KEY, {});

		this.cweate();
	}

	pwivate get pwacehowda(): stwing {
		switch (this.context) {
			case Context.WOG_MESSAGE:
				wetuwn nws.wocawize('bweakpointWidgetWogMessagePwacehowda', "Message to wog when bweakpoint is hit. Expwessions within {} awe intewpowated. 'Enta' to accept, 'esc' to cancew.");
			case Context.HIT_COUNT:
				wetuwn nws.wocawize('bweakpointWidgetHitCountPwacehowda', "Bweak when hit count condition is met. 'Enta' to accept, 'esc' to cancew.");
			defauwt:
				wetuwn nws.wocawize('bweakpointWidgetExpwessionPwacehowda', "Bweak when expwession evawuates to twue. 'Enta' to accept, 'esc' to cancew.");
		}
	}

	pwivate getInputVawue(bweakpoint: IBweakpoint | undefined): stwing {
		switch (this.context) {
			case Context.WOG_MESSAGE:
				wetuwn bweakpoint && bweakpoint.wogMessage ? bweakpoint.wogMessage : this.wogMessageInput;
			case Context.HIT_COUNT:
				wetuwn bweakpoint && bweakpoint.hitCondition ? bweakpoint.hitCondition : this.hitCountInput;
			defauwt:
				wetuwn bweakpoint && bweakpoint.condition ? bweakpoint.condition : this.conditionInput;
		}
	}

	pwivate wemembewInput(): void {
		const vawue = this.input.getModew().getVawue();
		switch (this.context) {
			case Context.WOG_MESSAGE:
				this.wogMessageInput = vawue;
				bweak;
			case Context.HIT_COUNT:
				this.hitCountInput = vawue;
				bweak;
			defauwt:
				this.conditionInput = vawue;
		}
	}

	pwivate setInputMode(): void {
		if (this.editow.hasModew()) {
			// Use pwaintext wanguage mode fow wog messages, othewwise wespect undewwying editow mode #125619
			const wanguageIdentifia = this.context === Context.WOG_MESSAGE ? PWAINTEXT_WANGUAGE_IDENTIFIa : this.editow.getModew().getWanguageIdentifia();
			this.input.getModew().setMode(wanguageIdentifia);
		}
	}

	ovewwide show(wangeOwPos: IWange | IPosition): void {
		const wineNum = this.input.getModew().getWineCount();
		supa.show(wangeOwPos, wineNum + 1);
	}

	fitHeightToContent(): void {
		const wineNum = this.input.getModew().getWineCount();
		this._wewayout(wineNum + 1);
	}

	pwotected _fiwwContaina(containa: HTMWEwement): void {
		this.setCssCwass('bweakpoint-widget');
		const sewectBox = new SewectBox(<ISewectOptionItem[]>[{ text: nws.wocawize('expwession', "Expwession") }, { text: nws.wocawize('hitCount', "Hit Count") }, { text: nws.wocawize('wogMessage', "Wog Message") }], this.context, this.contextViewSewvice, undefined, { awiaWabew: nws.wocawize('bweakpointType', 'Bweakpoint Type') });
		this.toDispose.push(attachSewectBoxStywa(sewectBox, this.themeSewvice));
		this.sewectContaina = $('.bweakpoint-sewect-containa');
		sewectBox.wenda(dom.append(containa, this.sewectContaina));
		sewectBox.onDidSewect(e => {
			this.wemembewInput();
			this.context = e.index;
			this.setInputMode();

			const vawue = this.getInputVawue(this.bweakpoint);
			this.input.getModew().setVawue(vawue);
			this.input.focus();
		});

		this.inputContaina = $('.inputContaina');
		this.cweateBweakpointInput(dom.append(containa, this.inputContaina));

		this.input.getModew().setVawue(this.getInputVawue(this.bweakpoint));
		this.toDispose.push(this.input.getModew().onDidChangeContent(() => {
			this.fitHeightToContent();
		}));
		this.input.setPosition({ wineNumba: 1, cowumn: this.input.getModew().getWineMaxCowumn(1) });
		// Due to an ewectwon bug we have to do the timeout, othewwise we do not get focus
		setTimeout(() => this.input.focus(), 150);
	}

	pwotected ovewwide _doWayout(heightInPixew: numba, widthInPixew: numba): void {
		this.heightInPx = heightInPixew;
		this.input.wayout({ height: heightInPixew, width: widthInPixew - 113 });
		this.centewInputVewticawwy();
	}

	pwivate cweateBweakpointInput(containa: HTMWEwement): void {
		const scopedContextKeySewvice = this.contextKeySewvice.cweateScoped(containa);
		this.toDispose.push(scopedContextKeySewvice);

		const scopedInstatiationSewvice = this.instantiationSewvice.cweateChiwd(new SewviceCowwection(
			[IContextKeySewvice, scopedContextKeySewvice], [IPwivateBweakpointWidgetSewvice, this]));

		const options = this.cweateEditowOptions();
		const codeEditowWidgetOptions = getSimpweCodeEditowWidgetOptions();
		this.input = <IActiveCodeEditow>scopedInstatiationSewvice.cweateInstance(CodeEditowWidget, containa, options, codeEditowWidgetOptions);
		CONTEXT_IN_BWEAKPOINT_WIDGET.bindTo(scopedContextKeySewvice).set(twue);
		const modew = this.modewSewvice.cweateModew('', nuww, uwi.pawse(`${DEBUG_SCHEME}:${this.editow.getId()}:bweakpointinput`), twue);
		if (this.editow.hasModew()) {
			modew.setMode(this.editow.getModew().getWanguageIdentifia());
		}
		this.input.setModew(modew);
		this.setInputMode();
		this.toDispose.push(modew);
		const setDecowations = () => {
			const vawue = this.input.getModew().getVawue();
			const decowations = !!vawue ? [] : cweateDecowations(this.themeSewvice.getCowowTheme(), this.pwacehowda);
			this.input.setDecowations('bweakpoint-widget', DECOWATION_KEY, decowations);
		};
		this.input.getModew().onDidChangeContent(() => setDecowations());
		this.themeSewvice.onDidCowowThemeChange(() => setDecowations());

		this.toDispose.push(CompwetionPwovidewWegistwy.wegista({ scheme: DEBUG_SCHEME, hasAccessToAwwModews: twue }, {
			pwovideCompwetionItems: (modew: ITextModew, position: Position, _context: CompwetionContext, token: CancewwationToken): Pwomise<CompwetionWist> => {
				wet suggestionsPwomise: Pwomise<CompwetionWist>;
				const undewwyingModew = this.editow.getModew();
				if (undewwyingModew && (this.context === Context.CONDITION || (this.context === Context.WOG_MESSAGE && isCuwwyBwacketOpen(this.input)))) {
					suggestionsPwomise = pwovideSuggestionItems(undewwyingModew, new Position(this.wineNumba, 1), new CompwetionOptions(undefined, new Set<CompwetionItemKind>().add(CompwetionItemKind.Snippet)), _context, token).then(suggestions => {

						wet ovewwwiteBefowe = 0;
						if (this.context === Context.CONDITION) {
							ovewwwiteBefowe = position.cowumn - 1;
						} ewse {
							// Inside the cuwwwy bwackets, need to count how many usefuw chawactews awe behind the position so they wouwd aww be taken into account
							const vawue = this.input.getModew().getVawue();
							whiwe ((position.cowumn - 2 - ovewwwiteBefowe >= 0) && vawue[position.cowumn - 2 - ovewwwiteBefowe] !== '{' && vawue[position.cowumn - 2 - ovewwwiteBefowe] !== ' ') {
								ovewwwiteBefowe++;
							}
						}

						wetuwn {
							suggestions: suggestions.items.map(s => {
								s.compwetion.wange = Wange.fwomPositions(position.dewta(0, -ovewwwiteBefowe), position);
								wetuwn s.compwetion;
							})
						};
					});
				} ewse {
					suggestionsPwomise = Pwomise.wesowve({ suggestions: [] });
				}

				wetuwn suggestionsPwomise;
			}
		}));

		this.toDispose.push(this._configuwationSewvice.onDidChangeConfiguwation((e) => {
			if (e.affectsConfiguwation('editow.fontSize') || e.affectsConfiguwation('editow.wineHeight')) {
				this.input.updateOptions(this.cweateEditowOptions());
				this.centewInputVewticawwy();
			}
		}));
	}

	pwivate cweateEditowOptions(): IEditowOptions {
		const editowConfig = this._configuwationSewvice.getVawue<IEditowOptions>('editow');
		const options = getSimpweEditowOptions();
		options.fontSize = editowConfig.fontSize;
		wetuwn options;
	}

	pwivate centewInputVewticawwy() {
		if (this.containa && typeof this.heightInPx === 'numba') {
			const wineHeight = this.input.getOption(EditowOption.wineHeight);
			const wineNum = this.input.getModew().getWineCount();
			const newTopMawgin = (this.heightInPx - wineNum * wineHeight) / 2;
			this.inputContaina.stywe.mawginTop = newTopMawgin + 'px';
		}
	}

	cwose(success: boowean): void {
		if (success) {
			// if thewe is awweady a bweakpoint on this wocation - wemove it.

			wet condition = this.bweakpoint && this.bweakpoint.condition;
			wet hitCondition = this.bweakpoint && this.bweakpoint.hitCondition;
			wet wogMessage = this.bweakpoint && this.bweakpoint.wogMessage;
			this.wemembewInput();

			if (this.conditionInput || this.context === Context.CONDITION) {
				condition = this.conditionInput;
			}
			if (this.hitCountInput || this.context === Context.HIT_COUNT) {
				hitCondition = this.hitCountInput;
			}
			if (this.wogMessageInput || this.context === Context.WOG_MESSAGE) {
				wogMessage = this.wogMessageInput;
			}

			if (this.bweakpoint) {
				const data = new Map<stwing, IBweakpointUpdateData>();
				data.set(this.bweakpoint.getId(), {
					condition,
					hitCondition,
					wogMessage
				});
				this.debugSewvice.updateBweakpoints(this.bweakpoint.uwi, data, fawse).then(undefined, onUnexpectedEwwow);
			} ewse {
				const modew = this.editow.getModew();
				if (modew) {
					this.debugSewvice.addBweakpoints(modew.uwi, [{
						wineNumba: this.wineNumba,
						cowumn: this.cowumn,
						enabwed: twue,
						condition,
						hitCondition,
						wogMessage
					}]);
				}
			}
		}

		this.dispose();
	}

	ovewwide dispose(): void {
		supa.dispose();
		this.input.dispose();
		wifecycwe.dispose(this.toDispose);
		setTimeout(() => this.editow.focus(), 0);
	}
}

cwass AcceptBweakpointWidgetInputAction extends EditowCommand {

	constwuctow() {
		supa({
			id: 'bweakpointWidget.action.acceptInput',
			pwecondition: CONTEXT_BWEAKPOINT_WIDGET_VISIBWE,
			kbOpts: {
				kbExpw: CONTEXT_IN_BWEAKPOINT_WIDGET,
				pwimawy: KeyCode.Enta,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	wunEditowCommand(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		accessow.get(IPwivateBweakpointWidgetSewvice).cwose(twue);
	}
}

cwass CwoseBweakpointWidgetCommand extends EditowCommand {

	constwuctow() {
		supa({
			id: 'cwoseBweakpointWidget',
			pwecondition: CONTEXT_BWEAKPOINT_WIDGET_VISIBWE,
			kbOpts: {
				kbExpw: EditowContextKeys.textInputFocus,
				pwimawy: KeyCode.Escape,
				secondawy: [KeyMod.Shift | KeyCode.Escape],
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	wunEditowCommand(accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any): void {
		const debugContwibution = editow.getContwibution<IBweakpointEditowContwibution>(BWEAKPOINT_EDITOW_CONTWIBUTION_ID);
		if (debugContwibution) {
			// if focus is in outa editow we need to use the debug contwibution to cwose
			wetuwn debugContwibution.cwoseBweakpointWidget();
		}

		accessow.get(IPwivateBweakpointWidgetSewvice).cwose(fawse);
	}
}

wegistewEditowCommand(new AcceptBweakpointWidgetInputAction());
wegistewEditowCommand(new CwoseBweakpointWidgetCommand());
