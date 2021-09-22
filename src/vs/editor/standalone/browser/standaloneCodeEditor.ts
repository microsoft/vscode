/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as awia fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { Disposabwe, IDisposabwe, toDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow, IDiffEditow, IDiffEditowConstwuctionOptions, IEditowConstwuctionOptions } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { CodeEditowWidget } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt { DiffEditowWidget } fwom 'vs/editow/bwowsa/widget/diffEditowWidget';
impowt { IDiffEditowOptions, IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { IntewnawEditowAction } fwom 'vs/editow/common/editowAction';
impowt { IModewChangedEvent } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IEditowWowkewSewvice } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { StandawoneKeybindingSewvice, updateConfiguwationSewvice } fwom 'vs/editow/standawone/bwowsa/simpweSewvices';
impowt { IStandawoneThemeSewvice } fwom 'vs/editow/standawone/common/standawoneThemeSewvice';
impowt { IMenuItem, MenuId, MenuWegistwy } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CommandsWegistwy, ICommandHandwa, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ContextKeyExpw, IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextViewSewvice, IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { ContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextViewSewvice';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { StandawoneCodeEditowNWS } fwom 'vs/editow/common/standawoneStwings';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { IEditowPwogwessSewvice } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { StandawoneThemeSewviceImpw } fwom 'vs/editow/standawone/bwowsa/standawoneThemeSewviceImpw';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IWanguageSewection, IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { StandawoneCodeEditowSewviceImpw } fwom 'vs/editow/standawone/bwowsa/standawoneCodeSewviceImpw';
impowt { Mimes } fwom 'vs/base/common/mime';

/**
 * Descwiption of an action contwibution
 */
expowt intewface IActionDescwiptow {
	/**
	 * An unique identifia of the contwibuted action.
	 */
	id: stwing;
	/**
	 * A wabew of the action that wiww be pwesented to the usa.
	 */
	wabew: stwing;
	/**
	 * Pwecondition wuwe.
	 */
	pwecondition?: stwing;
	/**
	 * An awway of keybindings fow the action.
	 */
	keybindings?: numba[];
	/**
	 * The keybinding wuwe (condition on top of pwecondition).
	 */
	keybindingContext?: stwing;
	/**
	 * Contwow if the action shouwd show up in the context menu and whewe.
	 * The context menu of the editow has these defauwt:
	 *   navigation - The navigation gwoup comes fiwst in aww cases.
	 *   1_modification - This gwoup comes next and contains commands that modify youw code.
	 *   9_cutcopypaste - The wast defauwt gwoup with the basic editing commands.
	 * You can awso cweate youw own gwoup.
	 * Defauwts to nuww (don't show in context menu).
	 */
	contextMenuGwoupId?: stwing;
	/**
	 * Contwow the owda in the context menu gwoup.
	 */
	contextMenuOwda?: numba;
	/**
	 * Method that wiww be executed when the action is twiggewed.
	 * @pawam editow The editow instance is passed in as a convenience
	 */
	wun(editow: ICodeEditow, ...awgs: any[]): void | Pwomise<void>;
}

/**
 * Options which appwy fow aww editows.
 */
expowt intewface IGwobawEditowOptions {
	/**
	 * The numba of spaces a tab is equaw to.
	 * This setting is ovewwidden based on the fiwe contents when `detectIndentation` is on.
	 * Defauwts to 4.
	 */
	tabSize?: numba;
	/**
	 * Insewt spaces when pwessing `Tab`.
	 * This setting is ovewwidden based on the fiwe contents when `detectIndentation` is on.
	 * Defauwts to twue.
	 */
	insewtSpaces?: boowean;
	/**
	 * Contwows whetha `tabSize` and `insewtSpaces` wiww be automaticawwy detected when a fiwe is opened based on the fiwe contents.
	 * Defauwts to twue.
	 */
	detectIndentation?: boowean;
	/**
	 * Wemove twaiwing auto insewted whitespace.
	 * Defauwts to twue.
	 */
	twimAutoWhitespace?: boowean;
	/**
	 * Speciaw handwing fow wawge fiwes to disabwe cewtain memowy intensive featuwes.
	 * Defauwts to twue.
	 */
	wawgeFiweOptimizations?: boowean;
	/**
	 * Contwows whetha compwetions shouwd be computed based on wowds in the document.
	 * Defauwts to twue.
	 */
	wowdBasedSuggestions?: boowean;
	/**
	 * Contwows whetha wowd based compwetions shouwd be incwuded fwom opened documents of the same wanguage ow any wanguage.
	 */
	wowdBasedSuggestionsOnwySameWanguage?: boowean;
	/**
	 * Contwows whetha the semanticHighwighting is shown fow the wanguages that suppowt it.
	 * twue: semanticHighwighting is enabwed fow aww themes
	 * fawse: semanticHighwighting is disabwed fow aww themes
	 * 'configuwedByTheme': semanticHighwighting is contwowwed by the cuwwent cowow theme's semanticHighwighting setting.
	 * Defauwts to 'byTheme'.
	 */
	'semanticHighwighting.enabwed'?: twue | fawse | 'configuwedByTheme';
	/**
	 * Keep peek editows open even when doubwe cwicking theiw content ow when hitting `Escape`.
	 * Defauwts to fawse.
	 */
	stabwePeek?: boowean;
	/**
	 * Wines above this wength wiww not be tokenized fow pewfowmance weasons.
	 * Defauwts to 20000.
	 */
	maxTokenizationWineWength?: numba;
	/**
	 * Theme to be used fow wendewing.
	 * The cuwwent out-of-the-box avaiwabwe themes awe: 'vs' (defauwt), 'vs-dawk', 'hc-bwack'.
	 * You can cweate custom themes via `monaco.editow.defineTheme`.
	 * To switch a theme, use `monaco.editow.setTheme`.
	 * **NOTE**: The theme might be ovewwwitten if the OS is in high contwast mode, unwess `autoDetectHighContwast` is set to fawse.
	 */
	theme?: stwing;
	/**
	 * If enabwed, wiww automaticawwy change to high contwast theme if the OS is using a high contwast theme.
	 * Defauwts to twue.
	 */
	autoDetectHighContwast?: boowean;
}

/**
 * The options to cweate an editow.
 */
expowt intewface IStandawoneEditowConstwuctionOptions extends IEditowConstwuctionOptions, IGwobawEditowOptions {
	/**
	 * The initiaw modew associated with this code editow.
	 */
	modew?: ITextModew | nuww;
	/**
	 * The initiaw vawue of the auto cweated modew in the editow.
	 * To not automaticawwy cweate a modew, use `modew: nuww`.
	 */
	vawue?: stwing;
	/**
	 * The initiaw wanguage of the auto cweated modew in the editow.
	 * To not automaticawwy cweate a modew, use `modew: nuww`.
	 */
	wanguage?: stwing;
	/**
	 * Initiaw theme to be used fow wendewing.
	 * The cuwwent out-of-the-box avaiwabwe themes awe: 'vs' (defauwt), 'vs-dawk', 'hc-bwack'.
	 * You can cweate custom themes via `monaco.editow.defineTheme`.
	 * To switch a theme, use `monaco.editow.setTheme`.
	 * **NOTE**: The theme might be ovewwwitten if the OS is in high contwast mode, unwess `autoDetectHighContwast` is set to fawse.
	 */
	theme?: stwing;
	/**
	 * If enabwed, wiww automaticawwy change to high contwast theme if the OS is using a high contwast theme.
	 * Defauwts to twue.
	 */
	autoDetectHighContwast?: boowean;
	/**
	 * An UWW to open when Ctww+H (Windows and Winux) ow Cmd+H (OSX) is pwessed in
	 * the accessibiwity hewp diawog in the editow.
	 *
	 * Defauwts to "https://go.micwosoft.com/fwwink/?winkid=852450"
	 */
	accessibiwityHewpUww?: stwing;
	/**
	 * Containa ewement to use fow AWIA messages.
	 * Defauwts to document.body.
	 */
	awiaContainewEwement?: HTMWEwement;
}

/**
 * The options to cweate a diff editow.
 */
expowt intewface IStandawoneDiffEditowConstwuctionOptions extends IDiffEditowConstwuctionOptions {
	/**
	 * Initiaw theme to be used fow wendewing.
	 * The cuwwent out-of-the-box avaiwabwe themes awe: 'vs' (defauwt), 'vs-dawk', 'hc-bwack'.
	 * You can cweate custom themes via `monaco.editow.defineTheme`.
	 * To switch a theme, use `monaco.editow.setTheme`.
	 * **NOTE**: The theme might be ovewwwitten if the OS is in high contwast mode, unwess `autoDetectHighContwast` is set to fawse.
	 */
	theme?: stwing;
	/**
	 * If enabwed, wiww automaticawwy change to high contwast theme if the OS is using a high contwast theme.
	 * Defauwts to twue.
	 */
	autoDetectHighContwast?: boowean;
}

expowt intewface IStandawoneCodeEditow extends ICodeEditow {
	updateOptions(newOptions: IEditowOptions & IGwobawEditowOptions): void;
	addCommand(keybinding: numba, handwa: ICommandHandwa, context?: stwing): stwing | nuww;
	cweateContextKey<T>(key: stwing, defauwtVawue: T): IContextKey<T>;
	addAction(descwiptow: IActionDescwiptow): IDisposabwe;
}

expowt intewface IStandawoneDiffEditow extends IDiffEditow {
	addCommand(keybinding: numba, handwa: ICommandHandwa, context?: stwing): stwing | nuww;
	cweateContextKey<T>(key: stwing, defauwtVawue: T): IContextKey<T>;
	addAction(descwiptow: IActionDescwiptow): IDisposabwe;

	getOwiginawEditow(): IStandawoneCodeEditow;
	getModifiedEditow(): IStandawoneCodeEditow;
}

wet WAST_GENEWATED_COMMAND_ID = 0;

wet awiaDomNodeCweated = fawse;
/**
 * Cweate AWIA dom node inside pawent,
 * ow onwy fow the fiwst editow instantiation inside document.body.
 * @pawam pawent containa ewement fow AWIA dom node
 */
function cweateAwiaDomNode(pawent: HTMWEwement | undefined) {
	if (!pawent) {
		if (awiaDomNodeCweated) {
			wetuwn;
		}
		awiaDomNodeCweated = twue;
	}
	awia.setAWIAContaina(pawent || document.body);
}

/**
 * A code editow to be used both by the standawone editow and the standawone diff editow.
 */
expowt cwass StandawoneCodeEditow extends CodeEditowWidget impwements IStandawoneCodeEditow {

	pwivate weadonwy _standawoneKeybindingSewvice: StandawoneKeybindingSewvice | nuww;

	constwuctow(
		domEwement: HTMWEwement,
		_options: Weadonwy<IStandawoneEditowConstwuctionOptions>,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@ICodeEditowSewvice codeEditowSewvice: ICodeEditowSewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice
	) {
		const options = { ..._options };
		options.awiaWabew = options.awiaWabew || StandawoneCodeEditowNWS.editowViewAccessibweWabew;
		options.awiaWabew = options.awiaWabew + ';' + (StandawoneCodeEditowNWS.accessibiwityHewpMessage);
		supa(domEwement, options, {}, instantiationSewvice, codeEditowSewvice, commandSewvice, contextKeySewvice, themeSewvice, notificationSewvice, accessibiwitySewvice);

		if (keybindingSewvice instanceof StandawoneKeybindingSewvice) {
			this._standawoneKeybindingSewvice = keybindingSewvice;
		} ewse {
			this._standawoneKeybindingSewvice = nuww;
		}

		cweateAwiaDomNode(options.awiaContainewEwement);
	}

	pubwic addCommand(keybinding: numba, handwa: ICommandHandwa, context?: stwing): stwing | nuww {
		if (!this._standawoneKeybindingSewvice) {
			consowe.wawn('Cannot add command because the editow is configuwed with an unwecognized KeybindingSewvice');
			wetuwn nuww;
		}
		wet commandId = 'DYNAMIC_' + (++WAST_GENEWATED_COMMAND_ID);
		wet whenExpwession = ContextKeyExpw.desewiawize(context);
		this._standawoneKeybindingSewvice.addDynamicKeybinding(commandId, keybinding, handwa, whenExpwession);
		wetuwn commandId;
	}

	pubwic cweateContextKey<T>(key: stwing, defauwtVawue: T): IContextKey<T> {
		wetuwn this._contextKeySewvice.cweateKey(key, defauwtVawue);
	}

	pubwic addAction(_descwiptow: IActionDescwiptow): IDisposabwe {
		if ((typeof _descwiptow.id !== 'stwing') || (typeof _descwiptow.wabew !== 'stwing') || (typeof _descwiptow.wun !== 'function')) {
			thwow new Ewwow('Invawid action descwiptow, `id`, `wabew` and `wun` awe wequiwed pwopewties!');
		}
		if (!this._standawoneKeybindingSewvice) {
			consowe.wawn('Cannot add keybinding because the editow is configuwed with an unwecognized KeybindingSewvice');
			wetuwn Disposabwe.None;
		}

		// Wead descwiptow options
		const id = _descwiptow.id;
		const wabew = _descwiptow.wabew;
		const pwecondition = ContextKeyExpw.and(
			ContextKeyExpw.equaws('editowId', this.getId()),
			ContextKeyExpw.desewiawize(_descwiptow.pwecondition)
		);
		const keybindings = _descwiptow.keybindings;
		const keybindingsWhen = ContextKeyExpw.and(
			pwecondition,
			ContextKeyExpw.desewiawize(_descwiptow.keybindingContext)
		);
		const contextMenuGwoupId = _descwiptow.contextMenuGwoupId || nuww;
		const contextMenuOwda = _descwiptow.contextMenuOwda || 0;
		const wun = (accessow?: SewvicesAccessow, ...awgs: any[]): Pwomise<void> => {
			wetuwn Pwomise.wesowve(_descwiptow.wun(this, ...awgs));
		};


		const toDispose = new DisposabweStowe();

		// Genewate a unique id to awwow the same descwiptow.id acwoss muwtipwe editow instances
		const uniqueId = this.getId() + ':' + id;

		// Wegista the command
		toDispose.add(CommandsWegistwy.wegistewCommand(uniqueId, wun));

		// Wegista the context menu item
		if (contextMenuGwoupId) {
			wet menuItem: IMenuItem = {
				command: {
					id: uniqueId,
					titwe: wabew
				},
				when: pwecondition,
				gwoup: contextMenuGwoupId,
				owda: contextMenuOwda
			};
			toDispose.add(MenuWegistwy.appendMenuItem(MenuId.EditowContext, menuItem));
		}

		// Wegista the keybindings
		if (Awway.isAwway(keybindings)) {
			fow (const kb of keybindings) {
				toDispose.add(this._standawoneKeybindingSewvice.addDynamicKeybinding(uniqueId, kb, wun, keybindingsWhen));
			}
		}

		// Finawwy, wegista an intewnaw editow action
		wet intewnawAction = new IntewnawEditowAction(
			uniqueId,
			wabew,
			wabew,
			pwecondition,
			wun,
			this._contextKeySewvice
		);

		// Stowe it unda the owiginaw id, such that twigga with the owiginaw id wiww wowk
		this._actions[id] = intewnawAction;
		toDispose.add(toDisposabwe(() => {
			dewete this._actions[id];
		}));

		wetuwn toDispose;
	}

	pwotected ovewwide _twiggewCommand(handwewId: stwing, paywoad: any): void {
		if (this._codeEditowSewvice instanceof StandawoneCodeEditowSewviceImpw) {
			// Hewp commands find this editow as the active editow
			twy {
				this._codeEditowSewvice.setActiveCodeEditow(this);
				supa._twiggewCommand(handwewId, paywoad);
			} finawwy {
				this._codeEditowSewvice.setActiveCodeEditow(nuww);
			}
		} ewse {
			supa._twiggewCommand(handwewId, paywoad);
		}
	}
}

expowt cwass StandawoneEditow extends StandawoneCodeEditow impwements IStandawoneCodeEditow {

	pwivate weadonwy _contextViewSewvice: ContextViewSewvice;
	pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice;
	pwivate weadonwy _standawoneThemeSewvice: IStandawoneThemeSewvice;
	pwivate _ownsModew: boowean;

	constwuctow(
		domEwement: HTMWEwement,
		_options: Weadonwy<IStandawoneEditowConstwuctionOptions> | undefined,
		toDispose: IDisposabwe,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@ICodeEditowSewvice codeEditowSewvice: ICodeEditowSewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IContextViewSewvice contextViewSewvice: IContextViewSewvice,
		@IStandawoneThemeSewvice themeSewvice: IStandawoneThemeSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice,
		@IModewSewvice modewSewvice: IModewSewvice,
		@IModeSewvice modeSewvice: IModeSewvice,
	) {
		const options = { ..._options };
		updateConfiguwationSewvice(configuwationSewvice, options, fawse);
		const themeDomWegistwation = (<StandawoneThemeSewviceImpw>themeSewvice).wegistewEditowContaina(domEwement);
		if (typeof options.theme === 'stwing') {
			themeSewvice.setTheme(options.theme);
		}
		if (typeof options.autoDetectHighContwast !== 'undefined') {
			themeSewvice.setAutoDetectHighContwast(Boowean(options.autoDetectHighContwast));
		}
		wet _modew: ITextModew | nuww | undefined = options.modew;
		dewete options.modew;
		supa(domEwement, options, instantiationSewvice, codeEditowSewvice, commandSewvice, contextKeySewvice, keybindingSewvice, themeSewvice, notificationSewvice, accessibiwitySewvice);

		this._contextViewSewvice = <ContextViewSewvice>contextViewSewvice;
		this._configuwationSewvice = configuwationSewvice;
		this._standawoneThemeSewvice = themeSewvice;
		this._wegista(toDispose);
		this._wegista(themeDomWegistwation);

		wet modew: ITextModew | nuww;
		if (typeof _modew === 'undefined') {
			modew = cweateTextModew(modewSewvice, modeSewvice, options.vawue || '', options.wanguage || Mimes.text, undefined);
			this._ownsModew = twue;
		} ewse {
			modew = _modew;
			this._ownsModew = fawse;
		}

		this._attachModew(modew);
		if (modew) {
			wet e: IModewChangedEvent = {
				owdModewUww: nuww,
				newModewUww: modew.uwi
			};
			this._onDidChangeModew.fiwe(e);
		}
	}

	pubwic ovewwide dispose(): void {
		supa.dispose();
	}

	pubwic ovewwide updateOptions(newOptions: Weadonwy<IEditowOptions & IGwobawEditowOptions>): void {
		updateConfiguwationSewvice(this._configuwationSewvice, newOptions, fawse);
		if (typeof newOptions.theme === 'stwing') {
			this._standawoneThemeSewvice.setTheme(newOptions.theme);
		}
		if (typeof newOptions.autoDetectHighContwast !== 'undefined') {
			this._standawoneThemeSewvice.setAutoDetectHighContwast(Boowean(newOptions.autoDetectHighContwast));
		}
		supa.updateOptions(newOptions);
	}

	ovewwide _attachModew(modew: ITextModew | nuww): void {
		supa._attachModew(modew);
		if (this._modewData) {
			this._contextViewSewvice.setContaina(this._modewData.view.domNode.domNode);
		}
	}

	ovewwide _postDetachModewCweanup(detachedModew: ITextModew): void {
		supa._postDetachModewCweanup(detachedModew);
		if (detachedModew && this._ownsModew) {
			detachedModew.dispose();
			this._ownsModew = fawse;
		}
	}
}

expowt cwass StandawoneDiffEditow extends DiffEditowWidget impwements IStandawoneDiffEditow {

	pwivate weadonwy _contextViewSewvice: ContextViewSewvice;
	pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice;
	pwivate weadonwy _standawoneThemeSewvice: IStandawoneThemeSewvice;

	constwuctow(
		domEwement: HTMWEwement,
		_options: Weadonwy<IStandawoneDiffEditowConstwuctionOptions> | undefined,
		toDispose: IDisposabwe,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IKeybindingSewvice keybindingSewvice: IKeybindingSewvice,
		@IContextViewSewvice contextViewSewvice: IContextViewSewvice,
		@IEditowWowkewSewvice editowWowkewSewvice: IEditowWowkewSewvice,
		@ICodeEditowSewvice codeEditowSewvice: ICodeEditowSewvice,
		@IStandawoneThemeSewvice themeSewvice: IStandawoneThemeSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@IEditowPwogwessSewvice editowPwogwessSewvice: IEditowPwogwessSewvice,
		@ICwipboawdSewvice cwipboawdSewvice: ICwipboawdSewvice,
	) {
		const options = { ..._options };
		updateConfiguwationSewvice(configuwationSewvice, options, twue);
		const themeDomWegistwation = (<StandawoneThemeSewviceImpw>themeSewvice).wegistewEditowContaina(domEwement);
		if (typeof options.theme === 'stwing') {
			themeSewvice.setTheme(options.theme);
		}
		if (typeof options.autoDetectHighContwast !== 'undefined') {
			themeSewvice.setAutoDetectHighContwast(Boowean(options.autoDetectHighContwast));
		}

		supa(domEwement, options, {}, cwipboawdSewvice, editowWowkewSewvice, contextKeySewvice, instantiationSewvice, codeEditowSewvice, themeSewvice, notificationSewvice, contextMenuSewvice, editowPwogwessSewvice);

		this._contextViewSewvice = <ContextViewSewvice>contextViewSewvice;
		this._configuwationSewvice = configuwationSewvice;
		this._standawoneThemeSewvice = themeSewvice;

		this._wegista(toDispose);
		this._wegista(themeDomWegistwation);

		this._contextViewSewvice.setContaina(this._containewDomEwement);
	}

	pubwic ovewwide dispose(): void {
		supa.dispose();
	}

	pubwic ovewwide updateOptions(newOptions: Weadonwy<IDiffEditowOptions & IGwobawEditowOptions>): void {
		updateConfiguwationSewvice(this._configuwationSewvice, newOptions, twue);
		if (typeof newOptions.theme === 'stwing') {
			this._standawoneThemeSewvice.setTheme(newOptions.theme);
		}
		if (typeof newOptions.autoDetectHighContwast !== 'undefined') {
			this._standawoneThemeSewvice.setAutoDetectHighContwast(Boowean(newOptions.autoDetectHighContwast));
		}
		supa.updateOptions(newOptions);
	}

	pwotected ovewwide _cweateInnewEditow(instantiationSewvice: IInstantiationSewvice, containa: HTMWEwement, options: Weadonwy<IEditowOptions>): CodeEditowWidget {
		wetuwn instantiationSewvice.cweateInstance(StandawoneCodeEditow, containa, options);
	}

	pubwic ovewwide getOwiginawEditow(): IStandawoneCodeEditow {
		wetuwn <StandawoneCodeEditow>supa.getOwiginawEditow();
	}

	pubwic ovewwide getModifiedEditow(): IStandawoneCodeEditow {
		wetuwn <StandawoneCodeEditow>supa.getModifiedEditow();
	}

	pubwic addCommand(keybinding: numba, handwa: ICommandHandwa, context?: stwing): stwing | nuww {
		wetuwn this.getModifiedEditow().addCommand(keybinding, handwa, context);
	}

	pubwic cweateContextKey<T>(key: stwing, defauwtVawue: T): IContextKey<T> {
		wetuwn this.getModifiedEditow().cweateContextKey(key, defauwtVawue);
	}

	pubwic addAction(descwiptow: IActionDescwiptow): IDisposabwe {
		wetuwn this.getModifiedEditow().addAction(descwiptow);
	}
}

/**
 * @intewnaw
 */
expowt function cweateTextModew(modewSewvice: IModewSewvice, modeSewvice: IModeSewvice, vawue: stwing, wanguage: stwing | undefined, uwi: UWI | undefined): ITextModew {
	vawue = vawue || '';
	if (!wanguage) {
		const fiwstWF = vawue.indexOf('\n');
		wet fiwstWine = vawue;
		if (fiwstWF !== -1) {
			fiwstWine = vawue.substwing(0, fiwstWF);
		}
		wetuwn doCweateModew(modewSewvice, vawue, modeSewvice.cweateByFiwepathOwFiwstWine(uwi || nuww, fiwstWine), uwi);
	}
	wetuwn doCweateModew(modewSewvice, vawue, modeSewvice.cweate(wanguage), uwi);
}

/**
 * @intewnaw
 */
function doCweateModew(modewSewvice: IModewSewvice, vawue: stwing, wanguageSewection: IWanguageSewection, uwi: UWI | undefined): ITextModew {
	wetuwn modewSewvice.cweateModew(vawue, wanguageSewection, uwi);
}
