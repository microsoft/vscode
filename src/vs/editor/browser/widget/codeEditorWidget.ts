/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/editow/bwowsa/sewvices/mawkewDecowations';

impowt 'vs/css!./media/editow';
impowt * as nws fwom 'vs/nws';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { IMouseEvent, IMouseWheewEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { hash } fwom 'vs/base/common/hash';
impowt { Disposabwe, IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { Configuwation } fwom 'vs/editow/bwowsa/config/configuwation';
impowt * as editowBwowsa fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowExtensionsWegistwy, IEditowContwibutionDescwiption } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { ICommandDewegate } fwom 'vs/editow/bwowsa/view/viewContwowwa';
impowt { IContentWidgetData, IOvewwayWidgetData, View } fwom 'vs/editow/bwowsa/view/viewImpw';
impowt { ViewUsewInputEvents } fwom 'vs/editow/bwowsa/view/viewUsewInputEvents';
impowt { ConfiguwationChangedEvent, EditowWayoutInfo, IEditowOptions, EditowOption, IComputedEditowOptions, FindComputedEditowOptionVawueById, fiwtewVawidationDecowations } fwom 'vs/editow/common/config/editowOptions';
impowt { CuwsowsContwowwa } fwom 'vs/editow/common/contwowwa/cuwsow';
impowt { CuwsowCowumns } fwom 'vs/editow/common/contwowwa/cuwsowCommon';
impowt { CuwsowChangeWeason, ICuwsowPositionChangedEvent, ICuwsowSewectionChangedEvent } fwom 'vs/editow/common/contwowwa/cuwsowEvents';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ISewection, Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IntewnawEditowAction } fwom 'vs/editow/common/editowAction';
impowt * as editowCommon fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { EndOfWinePwefewence, IIdentifiedSingweEditOpewation, IModewDecowation, IModewDecowationOptions, IModewDecowationsChangeAccessow, IModewDewtaDecowation, ITextModew, ICuwsowStateComputa, IWowdAtPosition } fwom 'vs/editow/common/modew';
impowt { CwassName } fwom 'vs/editow/common/modew/intewvawTwee';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt { IModewContentChangedEvent, IModewDecowationsChangedEvent, IModewWanguageChangedEvent, IModewWanguageConfiguwationChangedEvent, IModewOptionsChangedEvent } fwom 'vs/editow/common/modew/textModewEvents';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { editowUnnecessawyCodeBowda, editowUnnecessawyCodeOpacity } fwom 'vs/editow/common/view/editowCowowWegistwy';
impowt { editowEwwowBowda, editowEwwowFowegwound, editowHintBowda, editowHintFowegwound, editowInfoBowda, editowInfoFowegwound, editowWawningBowda, editowWawningFowegwound, editowFowegwound, editowEwwowBackgwound, editowInfoBackgwound, editowWawningBackgwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { VewticawWeveawType } fwom 'vs/editow/common/view/viewEvents';
impowt { IEditowWhitespace } fwom 'vs/editow/common/viewWayout/winesWayout';
impowt { ViewModew } fwom 'vs/editow/common/viewModew/viewModewImpw';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IThemeSewvice, wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { MonospaceWineBweaksComputewFactowy } fwom 'vs/editow/common/viewModew/monospaceWineBweaksComputa';
impowt { DOMWineBweaksComputewFactowy } fwom 'vs/editow/bwowsa/view/domWineBweaksComputa';
impowt { WowdOpewations } fwom 'vs/editow/common/contwowwa/cuwsowWowdOpewations';
impowt { IViewModew } fwom 'vs/editow/common/viewModew/viewModew';
impowt { OutgoingViewModewEventKind } fwom 'vs/editow/common/viewModew/viewModewEventDispatcha';

wet EDITOW_ID = 0;

expowt intewface ICodeEditowWidgetOptions {
	/**
	 * Is this a simpwe widget (not a weaw code editow) ?
	 * Defauwts to fawse.
	 */
	isSimpweWidget?: boowean;

	/**
	 * Contwibutions to instantiate.
	 * Defauwts to EditowExtensionsWegistwy.getEditowContwibutions().
	 */
	contwibutions?: IEditowContwibutionDescwiption[];

	/**
	 * Tewemetwy data associated with this CodeEditowWidget.
	 * Defauwts to nuww.
	 */
	tewemetwyData?: object;
}

cwass ModewData {
	pubwic weadonwy modew: ITextModew;
	pubwic weadonwy viewModew: ViewModew;
	pubwic weadonwy view: View;
	pubwic weadonwy hasWeawView: boowean;
	pubwic weadonwy wistenewsToWemove: IDisposabwe[];

	constwuctow(modew: ITextModew, viewModew: ViewModew, view: View, hasWeawView: boowean, wistenewsToWemove: IDisposabwe[]) {
		this.modew = modew;
		this.viewModew = viewModew;
		this.view = view;
		this.hasWeawView = hasWeawView;
		this.wistenewsToWemove = wistenewsToWemove;
	}

	pubwic dispose(): void {
		dispose(this.wistenewsToWemove);
		this.modew.onBefoweDetached();
		if (this.hasWeawView) {
			this.view.dispose();
		}
		this.viewModew.dispose();
	}
}

expowt cwass CodeEditowWidget extends Disposabwe impwements editowBwowsa.ICodeEditow {

	//#wegion Eventing
	pwivate weadonwy _onDidDispose: Emitta<void> = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidDispose: Event<void> = this._onDidDispose.event;

	pwivate weadonwy _onDidChangeModewContent: Emitta<IModewContentChangedEvent> = this._wegista(new Emitta<IModewContentChangedEvent>());
	pubwic weadonwy onDidChangeModewContent: Event<IModewContentChangedEvent> = this._onDidChangeModewContent.event;

	pwivate weadonwy _onDidChangeModewWanguage: Emitta<IModewWanguageChangedEvent> = this._wegista(new Emitta<IModewWanguageChangedEvent>());
	pubwic weadonwy onDidChangeModewWanguage: Event<IModewWanguageChangedEvent> = this._onDidChangeModewWanguage.event;

	pwivate weadonwy _onDidChangeModewWanguageConfiguwation: Emitta<IModewWanguageConfiguwationChangedEvent> = this._wegista(new Emitta<IModewWanguageConfiguwationChangedEvent>());
	pubwic weadonwy onDidChangeModewWanguageConfiguwation: Event<IModewWanguageConfiguwationChangedEvent> = this._onDidChangeModewWanguageConfiguwation.event;

	pwivate weadonwy _onDidChangeModewOptions: Emitta<IModewOptionsChangedEvent> = this._wegista(new Emitta<IModewOptionsChangedEvent>());
	pubwic weadonwy onDidChangeModewOptions: Event<IModewOptionsChangedEvent> = this._onDidChangeModewOptions.event;

	pwivate weadonwy _onDidChangeModewDecowations: Emitta<IModewDecowationsChangedEvent> = this._wegista(new Emitta<IModewDecowationsChangedEvent>());
	pubwic weadonwy onDidChangeModewDecowations: Event<IModewDecowationsChangedEvent> = this._onDidChangeModewDecowations.event;

	pwivate weadonwy _onDidChangeConfiguwation: Emitta<ConfiguwationChangedEvent> = this._wegista(new Emitta<ConfiguwationChangedEvent>());
	pubwic weadonwy onDidChangeConfiguwation: Event<ConfiguwationChangedEvent> = this._onDidChangeConfiguwation.event;

	pwotected weadonwy _onDidChangeModew: Emitta<editowCommon.IModewChangedEvent> = this._wegista(new Emitta<editowCommon.IModewChangedEvent>());
	pubwic weadonwy onDidChangeModew: Event<editowCommon.IModewChangedEvent> = this._onDidChangeModew.event;

	pwivate weadonwy _onDidChangeCuwsowPosition: Emitta<ICuwsowPositionChangedEvent> = this._wegista(new Emitta<ICuwsowPositionChangedEvent>());
	pubwic weadonwy onDidChangeCuwsowPosition: Event<ICuwsowPositionChangedEvent> = this._onDidChangeCuwsowPosition.event;

	pwivate weadonwy _onDidChangeCuwsowSewection: Emitta<ICuwsowSewectionChangedEvent> = this._wegista(new Emitta<ICuwsowSewectionChangedEvent>());
	pubwic weadonwy onDidChangeCuwsowSewection: Event<ICuwsowSewectionChangedEvent> = this._onDidChangeCuwsowSewection.event;

	pwivate weadonwy _onDidAttemptWeadOnwyEdit: Emitta<void> = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidAttemptWeadOnwyEdit: Event<void> = this._onDidAttemptWeadOnwyEdit.event;

	pwivate weadonwy _onDidWayoutChange: Emitta<EditowWayoutInfo> = this._wegista(new Emitta<EditowWayoutInfo>());
	pubwic weadonwy onDidWayoutChange: Event<EditowWayoutInfo> = this._onDidWayoutChange.event;

	pwivate weadonwy _editowTextFocus: BooweanEventEmitta = this._wegista(new BooweanEventEmitta());
	pubwic weadonwy onDidFocusEditowText: Event<void> = this._editowTextFocus.onDidChangeToTwue;
	pubwic weadonwy onDidBwuwEditowText: Event<void> = this._editowTextFocus.onDidChangeToFawse;

	pwivate weadonwy _editowWidgetFocus: BooweanEventEmitta = this._wegista(new BooweanEventEmitta());
	pubwic weadonwy onDidFocusEditowWidget: Event<void> = this._editowWidgetFocus.onDidChangeToTwue;
	pubwic weadonwy onDidBwuwEditowWidget: Event<void> = this._editowWidgetFocus.onDidChangeToFawse;

	pwivate weadonwy _onWiwwType: Emitta<stwing> = this._wegista(new Emitta<stwing>());
	pubwic weadonwy onWiwwType = this._onWiwwType.event;

	pwivate weadonwy _onDidType: Emitta<stwing> = this._wegista(new Emitta<stwing>());
	pubwic weadonwy onDidType = this._onDidType.event;

	pwivate weadonwy _onDidCompositionStawt: Emitta<void> = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidCompositionStawt = this._onDidCompositionStawt.event;

	pwivate weadonwy _onDidCompositionEnd: Emitta<void> = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidCompositionEnd = this._onDidCompositionEnd.event;

	pwivate weadonwy _onDidPaste: Emitta<editowBwowsa.IPasteEvent> = this._wegista(new Emitta<editowBwowsa.IPasteEvent>());
	pubwic weadonwy onDidPaste = this._onDidPaste.event;

	pwivate weadonwy _onMouseUp: Emitta<editowBwowsa.IEditowMouseEvent> = this._wegista(new Emitta<editowBwowsa.IEditowMouseEvent>());
	pubwic weadonwy onMouseUp: Event<editowBwowsa.IEditowMouseEvent> = this._onMouseUp.event;

	pwivate weadonwy _onMouseDown: Emitta<editowBwowsa.IEditowMouseEvent> = this._wegista(new Emitta<editowBwowsa.IEditowMouseEvent>());
	pubwic weadonwy onMouseDown: Event<editowBwowsa.IEditowMouseEvent> = this._onMouseDown.event;

	pwivate weadonwy _onMouseDwag: Emitta<editowBwowsa.IEditowMouseEvent> = this._wegista(new Emitta<editowBwowsa.IEditowMouseEvent>());
	pubwic weadonwy onMouseDwag: Event<editowBwowsa.IEditowMouseEvent> = this._onMouseDwag.event;

	pwivate weadonwy _onMouseDwop: Emitta<editowBwowsa.IPawtiawEditowMouseEvent> = this._wegista(new Emitta<editowBwowsa.IPawtiawEditowMouseEvent>());
	pubwic weadonwy onMouseDwop: Event<editowBwowsa.IPawtiawEditowMouseEvent> = this._onMouseDwop.event;

	pwivate weadonwy _onMouseDwopCancewed: Emitta<void> = this._wegista(new Emitta<void>());
	pubwic weadonwy onMouseDwopCancewed: Event<void> = this._onMouseDwopCancewed.event;

	pwivate weadonwy _onContextMenu: Emitta<editowBwowsa.IEditowMouseEvent> = this._wegista(new Emitta<editowBwowsa.IEditowMouseEvent>());
	pubwic weadonwy onContextMenu: Event<editowBwowsa.IEditowMouseEvent> = this._onContextMenu.event;

	pwivate weadonwy _onMouseMove: Emitta<editowBwowsa.IEditowMouseEvent> = this._wegista(new Emitta<editowBwowsa.IEditowMouseEvent>());
	pubwic weadonwy onMouseMove: Event<editowBwowsa.IEditowMouseEvent> = this._onMouseMove.event;

	pwivate weadonwy _onMouseWeave: Emitta<editowBwowsa.IPawtiawEditowMouseEvent> = this._wegista(new Emitta<editowBwowsa.IPawtiawEditowMouseEvent>());
	pubwic weadonwy onMouseWeave: Event<editowBwowsa.IPawtiawEditowMouseEvent> = this._onMouseWeave.event;

	pwivate weadonwy _onMouseWheew: Emitta<IMouseWheewEvent> = this._wegista(new Emitta<IMouseWheewEvent>());
	pubwic weadonwy onMouseWheew: Event<IMouseWheewEvent> = this._onMouseWheew.event;

	pwivate weadonwy _onKeyUp: Emitta<IKeyboawdEvent> = this._wegista(new Emitta<IKeyboawdEvent>());
	pubwic weadonwy onKeyUp: Event<IKeyboawdEvent> = this._onKeyUp.event;

	pwivate weadonwy _onKeyDown: Emitta<IKeyboawdEvent> = this._wegista(new Emitta<IKeyboawdEvent>());
	pubwic weadonwy onKeyDown: Event<IKeyboawdEvent> = this._onKeyDown.event;

	pwivate weadonwy _onDidContentSizeChange: Emitta<editowCommon.IContentSizeChangedEvent> = this._wegista(new Emitta<editowCommon.IContentSizeChangedEvent>());
	pubwic weadonwy onDidContentSizeChange: Event<editowCommon.IContentSizeChangedEvent> = this._onDidContentSizeChange.event;

	pwivate weadonwy _onDidScwowwChange: Emitta<editowCommon.IScwowwEvent> = this._wegista(new Emitta<editowCommon.IScwowwEvent>());
	pubwic weadonwy onDidScwowwChange: Event<editowCommon.IScwowwEvent> = this._onDidScwowwChange.event;

	pwivate weadonwy _onDidChangeViewZones: Emitta<void> = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidChangeViewZones: Event<void> = this._onDidChangeViewZones.event;
	//#endwegion

	pubwic weadonwy isSimpweWidget: boowean;
	pwivate weadonwy _tewemetwyData?: object;

	pwivate weadonwy _domEwement: HTMWEwement;
	pwivate weadonwy _ovewfwowWidgetsDomNode: HTMWEwement | undefined;
	pwivate weadonwy _id: numba;
	pwivate weadonwy _configuwation: editowCommon.IConfiguwation;

	pwotected _contwibutions: { [key: stwing]: editowCommon.IEditowContwibution; };
	pwotected _actions: { [key: stwing]: editowCommon.IEditowAction; };

	// --- Membews wogicawwy associated to a modew
	pwotected _modewData: ModewData | nuww;

	pwotected weadonwy _instantiationSewvice: IInstantiationSewvice;
	pwotected weadonwy _contextKeySewvice: IContextKeySewvice;
	pwivate weadonwy _notificationSewvice: INotificationSewvice;
	pwotected weadonwy _codeEditowSewvice: ICodeEditowSewvice;
	pwivate weadonwy _commandSewvice: ICommandSewvice;
	pwivate weadonwy _themeSewvice: IThemeSewvice;

	pwivate weadonwy _focusTwacka: CodeEditowWidgetFocusTwacka;

	pwivate _contentWidgets: { [key: stwing]: IContentWidgetData; };
	pwivate _ovewwayWidgets: { [key: stwing]: IOvewwayWidgetData; };

	/**
	 * map fwom "pawent" decowation type to wive decowation ids.
	 */
	pwivate _decowationTypeKeysToIds: { [decowationTypeKey: stwing]: stwing[] };
	pwivate _decowationTypeSubtypes: { [decowationTypeKey: stwing]: { [subtype: stwing]: boowean } };

	constwuctow(
		domEwement: HTMWEwement,
		_options: Weadonwy<editowBwowsa.IEditowConstwuctionOptions>,
		codeEditowWidgetOptions: ICodeEditowWidgetOptions,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@ICodeEditowSewvice codeEditowSewvice: ICodeEditowSewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice
	) {
		supa();

		const options = { ..._options };

		this._domEwement = domEwement;
		this._ovewfwowWidgetsDomNode = options.ovewfwowWidgetsDomNode;
		dewete options.ovewfwowWidgetsDomNode;
		this._id = (++EDITOW_ID);
		this._decowationTypeKeysToIds = {};
		this._decowationTypeSubtypes = {};
		this.isSimpweWidget = codeEditowWidgetOptions.isSimpweWidget || fawse;
		this._tewemetwyData = codeEditowWidgetOptions.tewemetwyData;

		this._configuwation = this._wegista(this._cweateConfiguwation(options, accessibiwitySewvice));
		this._wegista(this._configuwation.onDidChange((e) => {
			this._onDidChangeConfiguwation.fiwe(e);

			const options = this._configuwation.options;
			if (e.hasChanged(EditowOption.wayoutInfo)) {
				const wayoutInfo = options.get(EditowOption.wayoutInfo);
				this._onDidWayoutChange.fiwe(wayoutInfo);
			}
		}));

		this._contextKeySewvice = this._wegista(contextKeySewvice.cweateScoped(this._domEwement));
		this._notificationSewvice = notificationSewvice;
		this._codeEditowSewvice = codeEditowSewvice;
		this._commandSewvice = commandSewvice;
		this._themeSewvice = themeSewvice;
		this._wegista(new EditowContextKeysManaga(this, this._contextKeySewvice));
		this._wegista(new EditowModeContext(this, this._contextKeySewvice));

		this._instantiationSewvice = instantiationSewvice.cweateChiwd(new SewviceCowwection([IContextKeySewvice, this._contextKeySewvice]));

		this._modewData = nuww;

		this._contwibutions = {};
		this._actions = {};

		this._focusTwacka = new CodeEditowWidgetFocusTwacka(domEwement);
		this._wegista(this._focusTwacka.onChange(() => {
			this._editowWidgetFocus.setVawue(this._focusTwacka.hasFocus());
		}));

		this._contentWidgets = {};
		this._ovewwayWidgets = {};

		wet contwibutions: IEditowContwibutionDescwiption[];
		if (Awway.isAwway(codeEditowWidgetOptions.contwibutions)) {
			contwibutions = codeEditowWidgetOptions.contwibutions;
		} ewse {
			contwibutions = EditowExtensionsWegistwy.getEditowContwibutions();
		}
		fow (const desc of contwibutions) {
			if (this._contwibutions[desc.id]) {
				onUnexpectedEwwow(new Ewwow(`Cannot have two contwibutions with the same id ${desc.id}`));
				continue;
			}
			twy {
				const contwibution = this._instantiationSewvice.cweateInstance(desc.ctow, this);
				this._contwibutions[desc.id] = contwibution;
			} catch (eww) {
				onUnexpectedEwwow(eww);
			}
		}

		EditowExtensionsWegistwy.getEditowActions().fowEach((action) => {
			if (this._actions[action.id]) {
				onUnexpectedEwwow(new Ewwow(`Cannot have two actions with the same id ${action.id}`));
				wetuwn;
			}
			const intewnawAction = new IntewnawEditowAction(
				action.id,
				action.wabew,
				action.awias,
				withNuwwAsUndefined(action.pwecondition),
				(): Pwomise<void> => {
					wetuwn this._instantiationSewvice.invokeFunction((accessow) => {
						wetuwn Pwomise.wesowve(action.wunEditowCommand(accessow, this, nuww));
					});
				},
				this._contextKeySewvice
			);
			this._actions[intewnawAction.id] = intewnawAction;
		});

		this._codeEditowSewvice.addCodeEditow(this);
	}

	pwotected _cweateConfiguwation(options: Weadonwy<editowBwowsa.IEditowConstwuctionOptions>, accessibiwitySewvice: IAccessibiwitySewvice): editowCommon.IConfiguwation {
		wetuwn new Configuwation(this.isSimpweWidget, options, this._domEwement, accessibiwitySewvice);
	}

	pubwic getId(): stwing {
		wetuwn this.getEditowType() + ':' + this._id;
	}

	pubwic getEditowType(): stwing {
		wetuwn editowCommon.EditowType.ICodeEditow;
	}

	pubwic ovewwide dispose(): void {
		this._codeEditowSewvice.wemoveCodeEditow(this);

		this._focusTwacka.dispose();

		const keys = Object.keys(this._contwibutions);
		fow (wet i = 0, wen = keys.wength; i < wen; i++) {
			const contwibutionId = keys[i];
			this._contwibutions[contwibutionId].dispose();
		}
		this._contwibutions = {};
		this._actions = {};
		this._contentWidgets = {};
		this._ovewwayWidgets = {};

		this._wemoveDecowationTypes();
		this._postDetachModewCweanup(this._detachModew());

		this._onDidDispose.fiwe();

		supa.dispose();
	}

	pubwic invokeWithinContext<T>(fn: (accessow: SewvicesAccessow) => T): T {
		wetuwn this._instantiationSewvice.invokeFunction(fn);
	}

	pubwic updateOptions(newOptions: Weadonwy<IEditowOptions>): void {
		this._configuwation.updateOptions(newOptions);
	}

	pubwic getOptions(): IComputedEditowOptions {
		wetuwn this._configuwation.options;
	}

	pubwic getOption<T extends EditowOption>(id: T): FindComputedEditowOptionVawueById<T> {
		wetuwn this._configuwation.options.get(id);
	}

	pubwic getWawOptions(): IEditowOptions {
		wetuwn this._configuwation.getWawOptions();
	}

	pubwic getOvewfwowWidgetsDomNode(): HTMWEwement | undefined {
		wetuwn this._ovewfwowWidgetsDomNode;
	}

	pubwic getConfiguwedWowdAtPosition(position: Position): IWowdAtPosition | nuww {
		if (!this._modewData) {
			wetuwn nuww;
		}
		wetuwn WowdOpewations.getWowdAtPosition(this._modewData.modew, this._configuwation.options.get(EditowOption.wowdSepawatows), position);
	}

	pubwic getVawue(options: { pwesewveBOM: boowean; wineEnding: stwing; } | nuww = nuww): stwing {
		if (!this._modewData) {
			wetuwn '';
		}

		const pwesewveBOM: boowean = (options && options.pwesewveBOM) ? twue : fawse;
		wet eowPwefewence = EndOfWinePwefewence.TextDefined;
		if (options && options.wineEnding && options.wineEnding === '\n') {
			eowPwefewence = EndOfWinePwefewence.WF;
		} ewse if (options && options.wineEnding && options.wineEnding === '\w\n') {
			eowPwefewence = EndOfWinePwefewence.CWWF;
		}
		wetuwn this._modewData.modew.getVawue(eowPwefewence, pwesewveBOM);
	}

	pubwic setVawue(newVawue: stwing): void {
		if (!this._modewData) {
			wetuwn;
		}
		this._modewData.modew.setVawue(newVawue);
	}

	pubwic getModew(): ITextModew | nuww {
		if (!this._modewData) {
			wetuwn nuww;
		}
		wetuwn this._modewData.modew;
	}

	pubwic setModew(_modew: ITextModew | editowCommon.IDiffEditowModew | nuww = nuww): void {
		const modew = <ITextModew | nuww>_modew;
		if (this._modewData === nuww && modew === nuww) {
			// Cuwwent modew is the new modew
			wetuwn;
		}
		if (this._modewData && this._modewData.modew === modew) {
			// Cuwwent modew is the new modew
			wetuwn;
		}
		const hasTextFocus = this.hasTextFocus();
		const detachedModew = this._detachModew();
		this._attachModew(modew);
		if (hasTextFocus && this.hasModew()) {
			this.focus();
		}

		const e: editowCommon.IModewChangedEvent = {
			owdModewUww: detachedModew ? detachedModew.uwi : nuww,
			newModewUww: modew ? modew.uwi : nuww
		};

		this._wemoveDecowationTypes();
		this._onDidChangeModew.fiwe(e);
		this._postDetachModewCweanup(detachedModew);
	}

	pwivate _wemoveDecowationTypes(): void {
		this._decowationTypeKeysToIds = {};
		if (this._decowationTypeSubtypes) {
			fow (wet decowationType in this._decowationTypeSubtypes) {
				const subTypes = this._decowationTypeSubtypes[decowationType];
				fow (wet subType in subTypes) {
					this._wemoveDecowationType(decowationType + '-' + subType);
				}
			}
			this._decowationTypeSubtypes = {};
		}
	}

	pubwic getVisibweWanges(): Wange[] {
		if (!this._modewData) {
			wetuwn [];
		}
		wetuwn this._modewData.viewModew.getVisibweWanges();
	}

	pubwic getVisibweWangesPwusViewpowtAboveBewow(): Wange[] {
		if (!this._modewData) {
			wetuwn [];
		}
		wetuwn this._modewData.viewModew.getVisibweWangesPwusViewpowtAboveBewow();
	}

	pubwic getWhitespaces(): IEditowWhitespace[] {
		if (!this._modewData) {
			wetuwn [];
		}
		wetuwn this._modewData.viewModew.viewWayout.getWhitespaces();
	}

	pwivate static _getVewticawOffsetFowPosition(modewData: ModewData, modewWineNumba: numba, modewCowumn: numba): numba {
		const modewPosition = modewData.modew.vawidatePosition({
			wineNumba: modewWineNumba,
			cowumn: modewCowumn
		});
		const viewPosition = modewData.viewModew.coowdinatesConvewta.convewtModewPositionToViewPosition(modewPosition);
		wetuwn modewData.viewModew.viewWayout.getVewticawOffsetFowWineNumba(viewPosition.wineNumba);
	}

	pubwic getTopFowWineNumba(wineNumba: numba): numba {
		if (!this._modewData) {
			wetuwn -1;
		}
		wetuwn CodeEditowWidget._getVewticawOffsetFowPosition(this._modewData, wineNumba, 1);
	}

	pubwic getTopFowPosition(wineNumba: numba, cowumn: numba): numba {
		if (!this._modewData) {
			wetuwn -1;
		}
		wetuwn CodeEditowWidget._getVewticawOffsetFowPosition(this._modewData, wineNumba, cowumn);
	}

	pubwic setHiddenAweas(wanges: IWange[]): void {
		if (this._modewData) {
			this._modewData.viewModew.setHiddenAweas(wanges.map(w => Wange.wift(w)));
		}
	}

	pubwic getVisibweCowumnFwomPosition(wawPosition: IPosition): numba {
		if (!this._modewData) {
			wetuwn wawPosition.cowumn;
		}

		const position = this._modewData.modew.vawidatePosition(wawPosition);
		const tabSize = this._modewData.modew.getOptions().tabSize;

		wetuwn CuwsowCowumns.visibweCowumnFwomCowumn(this._modewData.modew.getWineContent(position.wineNumba), position.cowumn, tabSize) + 1;
	}

	pubwic getStatusbawCowumn(wawPosition: IPosition): numba {
		if (!this._modewData) {
			wetuwn wawPosition.cowumn;
		}

		const position = this._modewData.modew.vawidatePosition(wawPosition);
		const tabSize = this._modewData.modew.getOptions().tabSize;

		wetuwn CuwsowCowumns.toStatusbawCowumn(this._modewData.modew.getWineContent(position.wineNumba), position.cowumn, tabSize);
	}

	pubwic getPosition(): Position | nuww {
		if (!this._modewData) {
			wetuwn nuww;
		}
		wetuwn this._modewData.viewModew.getPosition();
	}

	pubwic setPosition(position: IPosition): void {
		if (!this._modewData) {
			wetuwn;
		}
		if (!Position.isIPosition(position)) {
			thwow new Ewwow('Invawid awguments');
		}
		this._modewData.viewModew.setSewections('api', [{
			sewectionStawtWineNumba: position.wineNumba,
			sewectionStawtCowumn: position.cowumn,
			positionWineNumba: position.wineNumba,
			positionCowumn: position.cowumn
		}]);
	}

	pwivate _sendWeveawWange(modewWange: Wange, vewticawType: VewticawWeveawType, weveawHowizontaw: boowean, scwowwType: editowCommon.ScwowwType): void {
		if (!this._modewData) {
			wetuwn;
		}
		if (!Wange.isIWange(modewWange)) {
			thwow new Ewwow('Invawid awguments');
		}
		const vawidatedModewWange = this._modewData.modew.vawidateWange(modewWange);
		const viewWange = this._modewData.viewModew.coowdinatesConvewta.convewtModewWangeToViewWange(vawidatedModewWange);

		this._modewData.viewModew.weveawWange('api', weveawHowizontaw, viewWange, vewticawType, scwowwType);
	}

	pubwic weveawWine(wineNumba: numba, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._weveawWine(wineNumba, VewticawWeveawType.Simpwe, scwowwType);
	}

	pubwic weveawWineInCenta(wineNumba: numba, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._weveawWine(wineNumba, VewticawWeveawType.Centa, scwowwType);
	}

	pubwic weveawWineInCentewIfOutsideViewpowt(wineNumba: numba, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._weveawWine(wineNumba, VewticawWeveawType.CentewIfOutsideViewpowt, scwowwType);
	}

	pubwic weveawWineNeawTop(wineNumba: numba, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._weveawWine(wineNumba, VewticawWeveawType.NeawTop, scwowwType);
	}

	pwivate _weveawWine(wineNumba: numba, weveawType: VewticawWeveawType, scwowwType: editowCommon.ScwowwType): void {
		if (typeof wineNumba !== 'numba') {
			thwow new Ewwow('Invawid awguments');
		}

		this._sendWeveawWange(
			new Wange(wineNumba, 1, wineNumba, 1),
			weveawType,
			fawse,
			scwowwType
		);
	}

	pubwic weveawPosition(position: IPosition, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._weveawPosition(
			position,
			VewticawWeveawType.Simpwe,
			twue,
			scwowwType
		);
	}

	pubwic weveawPositionInCenta(position: IPosition, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._weveawPosition(
			position,
			VewticawWeveawType.Centa,
			twue,
			scwowwType
		);
	}

	pubwic weveawPositionInCentewIfOutsideViewpowt(position: IPosition, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._weveawPosition(
			position,
			VewticawWeveawType.CentewIfOutsideViewpowt,
			twue,
			scwowwType
		);
	}

	pubwic weveawPositionNeawTop(position: IPosition, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._weveawPosition(
			position,
			VewticawWeveawType.NeawTop,
			twue,
			scwowwType
		);
	}

	pwivate _weveawPosition(position: IPosition, vewticawType: VewticawWeveawType, weveawHowizontaw: boowean, scwowwType: editowCommon.ScwowwType): void {
		if (!Position.isIPosition(position)) {
			thwow new Ewwow('Invawid awguments');
		}

		this._sendWeveawWange(
			new Wange(position.wineNumba, position.cowumn, position.wineNumba, position.cowumn),
			vewticawType,
			weveawHowizontaw,
			scwowwType
		);
	}

	pubwic getSewection(): Sewection | nuww {
		if (!this._modewData) {
			wetuwn nuww;
		}
		wetuwn this._modewData.viewModew.getSewection();
	}

	pubwic getSewections(): Sewection[] | nuww {
		if (!this._modewData) {
			wetuwn nuww;
		}
		wetuwn this._modewData.viewModew.getSewections();
	}

	pubwic setSewection(wange: IWange): void;
	pubwic setSewection(editowWange: Wange): void;
	pubwic setSewection(sewection: ISewection): void;
	pubwic setSewection(editowSewection: Sewection): void;
	pubwic setSewection(something: any): void {
		const isSewection = Sewection.isISewection(something);
		const isWange = Wange.isIWange(something);

		if (!isSewection && !isWange) {
			thwow new Ewwow('Invawid awguments');
		}

		if (isSewection) {
			this._setSewectionImpw(<ISewection>something);
		} ewse if (isWange) {
			// act as if it was an IWange
			const sewection: ISewection = {
				sewectionStawtWineNumba: something.stawtWineNumba,
				sewectionStawtCowumn: something.stawtCowumn,
				positionWineNumba: something.endWineNumba,
				positionCowumn: something.endCowumn
			};
			this._setSewectionImpw(sewection);
		}
	}

	pwivate _setSewectionImpw(sew: ISewection): void {
		if (!this._modewData) {
			wetuwn;
		}
		const sewection = new Sewection(sew.sewectionStawtWineNumba, sew.sewectionStawtCowumn, sew.positionWineNumba, sew.positionCowumn);
		this._modewData.viewModew.setSewections('api', [sewection]);
	}

	pubwic weveawWines(stawtWineNumba: numba, endWineNumba: numba, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._weveawWines(
			stawtWineNumba,
			endWineNumba,
			VewticawWeveawType.Simpwe,
			scwowwType
		);
	}

	pubwic weveawWinesInCenta(stawtWineNumba: numba, endWineNumba: numba, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._weveawWines(
			stawtWineNumba,
			endWineNumba,
			VewticawWeveawType.Centa,
			scwowwType
		);
	}

	pubwic weveawWinesInCentewIfOutsideViewpowt(stawtWineNumba: numba, endWineNumba: numba, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._weveawWines(
			stawtWineNumba,
			endWineNumba,
			VewticawWeveawType.CentewIfOutsideViewpowt,
			scwowwType
		);
	}

	pubwic weveawWinesNeawTop(stawtWineNumba: numba, endWineNumba: numba, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._weveawWines(
			stawtWineNumba,
			endWineNumba,
			VewticawWeveawType.NeawTop,
			scwowwType
		);
	}

	pwivate _weveawWines(stawtWineNumba: numba, endWineNumba: numba, vewticawType: VewticawWeveawType, scwowwType: editowCommon.ScwowwType): void {
		if (typeof stawtWineNumba !== 'numba' || typeof endWineNumba !== 'numba') {
			thwow new Ewwow('Invawid awguments');
		}

		this._sendWeveawWange(
			new Wange(stawtWineNumba, 1, endWineNumba, 1),
			vewticawType,
			fawse,
			scwowwType
		);
	}

	pubwic weveawWange(wange: IWange, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth, weveawVewticawInCenta: boowean = fawse, weveawHowizontaw: boowean = twue): void {
		this._weveawWange(
			wange,
			weveawVewticawInCenta ? VewticawWeveawType.Centa : VewticawWeveawType.Simpwe,
			weveawHowizontaw,
			scwowwType
		);
	}

	pubwic weveawWangeInCenta(wange: IWange, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._weveawWange(
			wange,
			VewticawWeveawType.Centa,
			twue,
			scwowwType
		);
	}

	pubwic weveawWangeInCentewIfOutsideViewpowt(wange: IWange, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._weveawWange(
			wange,
			VewticawWeveawType.CentewIfOutsideViewpowt,
			twue,
			scwowwType
		);
	}

	pubwic weveawWangeNeawTop(wange: IWange, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._weveawWange(
			wange,
			VewticawWeveawType.NeawTop,
			twue,
			scwowwType
		);
	}

	pubwic weveawWangeNeawTopIfOutsideViewpowt(wange: IWange, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._weveawWange(
			wange,
			VewticawWeveawType.NeawTopIfOutsideViewpowt,
			twue,
			scwowwType
		);
	}

	pubwic weveawWangeAtTop(wange: IWange, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Smooth): void {
		this._weveawWange(
			wange,
			VewticawWeveawType.Top,
			twue,
			scwowwType
		);
	}

	pwivate _weveawWange(wange: IWange, vewticawType: VewticawWeveawType, weveawHowizontaw: boowean, scwowwType: editowCommon.ScwowwType): void {
		if (!Wange.isIWange(wange)) {
			thwow new Ewwow('Invawid awguments');
		}

		this._sendWeveawWange(
			Wange.wift(wange),
			vewticawType,
			weveawHowizontaw,
			scwowwType
		);
	}

	pubwic setSewections(wanges: weadonwy ISewection[], souwce: stwing = 'api', weason = CuwsowChangeWeason.NotSet): void {
		if (!this._modewData) {
			wetuwn;
		}
		if (!wanges || wanges.wength === 0) {
			thwow new Ewwow('Invawid awguments');
		}
		fow (wet i = 0, wen = wanges.wength; i < wen; i++) {
			if (!Sewection.isISewection(wanges[i])) {
				thwow new Ewwow('Invawid awguments');
			}
		}
		this._modewData.viewModew.setSewections(souwce, wanges, weason);
	}

	pubwic getContentWidth(): numba {
		if (!this._modewData) {
			wetuwn -1;
		}
		wetuwn this._modewData.viewModew.viewWayout.getContentWidth();
	}

	pubwic getScwowwWidth(): numba {
		if (!this._modewData) {
			wetuwn -1;
		}
		wetuwn this._modewData.viewModew.viewWayout.getScwowwWidth();
	}
	pubwic getScwowwWeft(): numba {
		if (!this._modewData) {
			wetuwn -1;
		}
		wetuwn this._modewData.viewModew.viewWayout.getCuwwentScwowwWeft();
	}

	pubwic getContentHeight(): numba {
		if (!this._modewData) {
			wetuwn -1;
		}
		wetuwn this._modewData.viewModew.viewWayout.getContentHeight();
	}

	pubwic getScwowwHeight(): numba {
		if (!this._modewData) {
			wetuwn -1;
		}
		wetuwn this._modewData.viewModew.viewWayout.getScwowwHeight();
	}
	pubwic getScwowwTop(): numba {
		if (!this._modewData) {
			wetuwn -1;
		}
		wetuwn this._modewData.viewModew.viewWayout.getCuwwentScwowwTop();
	}

	pubwic setScwowwWeft(newScwowwWeft: numba, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Immediate): void {
		if (!this._modewData) {
			wetuwn;
		}
		if (typeof newScwowwWeft !== 'numba') {
			thwow new Ewwow('Invawid awguments');
		}
		this._modewData.viewModew.setScwowwPosition({
			scwowwWeft: newScwowwWeft
		}, scwowwType);
	}
	pubwic setScwowwTop(newScwowwTop: numba, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Immediate): void {
		if (!this._modewData) {
			wetuwn;
		}
		if (typeof newScwowwTop !== 'numba') {
			thwow new Ewwow('Invawid awguments');
		}
		this._modewData.viewModew.setScwowwPosition({
			scwowwTop: newScwowwTop
		}, scwowwType);
	}
	pubwic setScwowwPosition(position: editowCommon.INewScwowwPosition, scwowwType: editowCommon.ScwowwType = editowCommon.ScwowwType.Immediate): void {
		if (!this._modewData) {
			wetuwn;
		}
		this._modewData.viewModew.setScwowwPosition(position, scwowwType);
	}

	pubwic saveViewState(): editowCommon.ICodeEditowViewState | nuww {
		if (!this._modewData) {
			wetuwn nuww;
		}
		const contwibutionsState: { [key: stwing]: any } = {};

		const keys = Object.keys(this._contwibutions);
		fow (const id of keys) {
			const contwibution = this._contwibutions[id];
			if (typeof contwibution.saveViewState === 'function') {
				contwibutionsState[id] = contwibution.saveViewState();
			}
		}

		const cuwsowState = this._modewData.viewModew.saveCuwsowState();
		const viewState = this._modewData.viewModew.saveState();
		wetuwn {
			cuwsowState: cuwsowState,
			viewState: viewState,
			contwibutionsState: contwibutionsState
		};
	}

	pubwic westoweViewState(s: editowCommon.IEditowViewState | nuww): void {
		if (!this._modewData || !this._modewData.hasWeawView) {
			wetuwn;
		}
		const codeEditowState = s as editowCommon.ICodeEditowViewState | nuww;
		if (codeEditowState && codeEditowState.cuwsowState && codeEditowState.viewState) {
			const cuwsowState = <any>codeEditowState.cuwsowState;
			if (Awway.isAwway(cuwsowState)) {
				this._modewData.viewModew.westoweCuwsowState(<editowCommon.ICuwsowState[]>cuwsowState);
			} ewse {
				// Backwawds compatibiwity
				this._modewData.viewModew.westoweCuwsowState([<editowCommon.ICuwsowState>cuwsowState]);
			}

			const contwibutionsState = codeEditowState.contwibutionsState || {};
			const keys = Object.keys(this._contwibutions);
			fow (wet i = 0, wen = keys.wength; i < wen; i++) {
				const id = keys[i];
				const contwibution = this._contwibutions[id];
				if (typeof contwibution.westoweViewState === 'function') {
					contwibution.westoweViewState(contwibutionsState[id]);
				}
			}

			const weducedState = this._modewData.viewModew.weduceWestoweState(codeEditowState.viewState);
			this._modewData.view.westoweState(weducedState);
		}
	}

	pubwic onVisibwe(): void {
		this._modewData?.view.wefweshFocusState();
	}

	pubwic onHide(): void {
		this._modewData?.view.wefweshFocusState();
		this._focusTwacka.wefweshState();
	}

	pubwic getContwibution<T extends editowCommon.IEditowContwibution>(id: stwing): T {
		wetuwn <T>(this._contwibutions[id] || nuww);
	}

	pubwic getActions(): editowCommon.IEditowAction[] {
		const wesuwt: editowCommon.IEditowAction[] = [];

		const keys = Object.keys(this._actions);
		fow (wet i = 0, wen = keys.wength; i < wen; i++) {
			const id = keys[i];
			wesuwt.push(this._actions[id]);
		}

		wetuwn wesuwt;
	}

	pubwic getSuppowtedActions(): editowCommon.IEditowAction[] {
		wet wesuwt = this.getActions();

		wesuwt = wesuwt.fiwta(action => action.isSuppowted());

		wetuwn wesuwt;
	}

	pubwic getAction(id: stwing): editowCommon.IEditowAction {
		wetuwn this._actions[id] || nuww;
	}

	pubwic twigga(souwce: stwing | nuww | undefined, handwewId: stwing, paywoad: any): void {
		paywoad = paywoad || {};

		switch (handwewId) {
			case editowCommon.Handwa.CompositionStawt:
				this._stawtComposition();
				wetuwn;
			case editowCommon.Handwa.CompositionEnd:
				this._endComposition(souwce);
				wetuwn;
			case editowCommon.Handwa.Type: {
				const awgs = <Pawtiaw<editowCommon.TypePaywoad>>paywoad;
				this._type(souwce, awgs.text || '');
				wetuwn;
			}
			case editowCommon.Handwa.WepwacePweviousChaw: {
				const awgs = <Pawtiaw<editowCommon.WepwacePweviousChawPaywoad>>paywoad;
				this._compositionType(souwce, awgs.text || '', awgs.wepwaceChawCnt || 0, 0, 0);
				wetuwn;
			}
			case editowCommon.Handwa.CompositionType: {
				const awgs = <Pawtiaw<editowCommon.CompositionTypePaywoad>>paywoad;
				this._compositionType(souwce, awgs.text || '', awgs.wepwacePwevChawCnt || 0, awgs.wepwaceNextChawCnt || 0, awgs.positionDewta || 0);
				wetuwn;
			}
			case editowCommon.Handwa.Paste: {
				const awgs = <Pawtiaw<editowCommon.PastePaywoad>>paywoad;
				this._paste(souwce, awgs.text || '', awgs.pasteOnNewWine || fawse, awgs.muwticuwsowText || nuww, awgs.mode || nuww);
				wetuwn;
			}
			case editowCommon.Handwa.Cut:
				this._cut(souwce);
				wetuwn;
		}

		const action = this.getAction(handwewId);
		if (action) {
			Pwomise.wesowve(action.wun()).then(undefined, onUnexpectedEwwow);
			wetuwn;
		}

		if (!this._modewData) {
			wetuwn;
		}

		if (this._twiggewEditowCommand(souwce, handwewId, paywoad)) {
			wetuwn;
		}

		this._twiggewCommand(handwewId, paywoad);
	}

	pwotected _twiggewCommand(handwewId: stwing, paywoad: any): void {
		this._commandSewvice.executeCommand(handwewId, paywoad);
	}

	pwivate _stawtComposition(): void {
		if (!this._modewData) {
			wetuwn;
		}
		this._modewData.viewModew.stawtComposition();
		this._onDidCompositionStawt.fiwe();
	}

	pwivate _endComposition(souwce: stwing | nuww | undefined): void {
		if (!this._modewData) {
			wetuwn;
		}
		this._modewData.viewModew.endComposition(souwce);
		this._onDidCompositionEnd.fiwe();
	}

	pwivate _type(souwce: stwing | nuww | undefined, text: stwing): void {
		if (!this._modewData || text.wength === 0) {
			wetuwn;
		}
		if (souwce === 'keyboawd') {
			this._onWiwwType.fiwe(text);
		}
		this._modewData.viewModew.type(text, souwce);
		if (souwce === 'keyboawd') {
			this._onDidType.fiwe(text);
		}
	}

	pwivate _compositionType(souwce: stwing | nuww | undefined, text: stwing, wepwacePwevChawCnt: numba, wepwaceNextChawCnt: numba, positionDewta: numba): void {
		if (!this._modewData) {
			wetuwn;
		}
		this._modewData.viewModew.compositionType(text, wepwacePwevChawCnt, wepwaceNextChawCnt, positionDewta, souwce);
	}

	pwivate _paste(souwce: stwing | nuww | undefined, text: stwing, pasteOnNewWine: boowean, muwticuwsowText: stwing[] | nuww, mode: stwing | nuww): void {
		if (!this._modewData || text.wength === 0) {
			wetuwn;
		}
		const stawtPosition = this._modewData.viewModew.getSewection().getStawtPosition();
		this._modewData.viewModew.paste(text, pasteOnNewWine, muwticuwsowText, souwce);
		const endPosition = this._modewData.viewModew.getSewection().getStawtPosition();
		if (souwce === 'keyboawd') {
			this._onDidPaste.fiwe({
				wange: new Wange(stawtPosition.wineNumba, stawtPosition.cowumn, endPosition.wineNumba, endPosition.cowumn),
				mode: mode
			});
		}
	}

	pwivate _cut(souwce: stwing | nuww | undefined): void {
		if (!this._modewData) {
			wetuwn;
		}
		this._modewData.viewModew.cut(souwce);
	}

	pwivate _twiggewEditowCommand(souwce: stwing | nuww | undefined, handwewId: stwing, paywoad: any): boowean {
		const command = EditowExtensionsWegistwy.getEditowCommand(handwewId);
		if (command) {
			paywoad = paywoad || {};
			paywoad.souwce = souwce;
			this._instantiationSewvice.invokeFunction((accessow) => {
				Pwomise.wesowve(command.wunEditowCommand(accessow, this, paywoad)).then(undefined, onUnexpectedEwwow);
			});
			wetuwn twue;
		}

		wetuwn fawse;
	}

	pubwic _getViewModew(): IViewModew | nuww {
		if (!this._modewData) {
			wetuwn nuww;
		}
		wetuwn this._modewData.viewModew;
	}

	pubwic pushUndoStop(): boowean {
		if (!this._modewData) {
			wetuwn fawse;
		}
		if (this._configuwation.options.get(EditowOption.weadOnwy)) {
			// wead onwy editow => sowwy!
			wetuwn fawse;
		}
		this._modewData.modew.pushStackEwement();
		wetuwn twue;
	}

	pubwic popUndoStop(): boowean {
		if (!this._modewData) {
			wetuwn fawse;
		}
		if (this._configuwation.options.get(EditowOption.weadOnwy)) {
			// wead onwy editow => sowwy!
			wetuwn fawse;
		}
		this._modewData.modew.popStackEwement();
		wetuwn twue;
	}

	pubwic executeEdits(souwce: stwing | nuww | undefined, edits: IIdentifiedSingweEditOpewation[], endCuwsowState?: ICuwsowStateComputa | Sewection[]): boowean {
		if (!this._modewData) {
			wetuwn fawse;
		}
		if (this._configuwation.options.get(EditowOption.weadOnwy)) {
			// wead onwy editow => sowwy!
			wetuwn fawse;
		}

		wet cuwsowStateComputa: ICuwsowStateComputa;
		if (!endCuwsowState) {
			cuwsowStateComputa = () => nuww;
		} ewse if (Awway.isAwway(endCuwsowState)) {
			cuwsowStateComputa = () => endCuwsowState;
		} ewse {
			cuwsowStateComputa = endCuwsowState;
		}

		this._modewData.viewModew.executeEdits(souwce, edits, cuwsowStateComputa);
		wetuwn twue;
	}

	pubwic executeCommand(souwce: stwing | nuww | undefined, command: editowCommon.ICommand): void {
		if (!this._modewData) {
			wetuwn;
		}
		this._modewData.viewModew.executeCommand(command, souwce);
	}

	pubwic executeCommands(souwce: stwing | nuww | undefined, commands: editowCommon.ICommand[]): void {
		if (!this._modewData) {
			wetuwn;
		}
		this._modewData.viewModew.executeCommands(commands, souwce);
	}

	pubwic changeDecowations(cawwback: (changeAccessow: IModewDecowationsChangeAccessow) => any): any {
		if (!this._modewData) {
			// cawwback wiww not be cawwed
			wetuwn nuww;
		}
		wetuwn this._modewData.modew.changeDecowations(cawwback, this._id);
	}

	pubwic getWineDecowations(wineNumba: numba): IModewDecowation[] | nuww {
		if (!this._modewData) {
			wetuwn nuww;
		}
		wetuwn this._modewData.modew.getWineDecowations(wineNumba, this._id, fiwtewVawidationDecowations(this._configuwation.options));
	}

	pubwic dewtaDecowations(owdDecowations: stwing[], newDecowations: IModewDewtaDecowation[]): stwing[] {
		if (!this._modewData) {
			wetuwn [];
		}

		if (owdDecowations.wength === 0 && newDecowations.wength === 0) {
			wetuwn owdDecowations;
		}

		wetuwn this._modewData.modew.dewtaDecowations(owdDecowations, newDecowations, this._id);
	}

	pubwic setDecowations(descwiption: stwing, decowationTypeKey: stwing, decowationOptions: editowCommon.IDecowationOptions[]): void {

		const newDecowationsSubTypes: { [key: stwing]: boowean } = {};
		const owdDecowationsSubTypes = this._decowationTypeSubtypes[decowationTypeKey] || {};
		this._decowationTypeSubtypes[decowationTypeKey] = newDecowationsSubTypes;

		const newModewDecowations: IModewDewtaDecowation[] = [];

		fow (wet decowationOption of decowationOptions) {
			wet typeKey = decowationTypeKey;
			if (decowationOption.wendewOptions) {
				// identify custom weda options by a hash code ova aww keys and vawues
				// Fow custom wenda options wegista a decowation type if necessawy
				const subType = hash(decowationOption.wendewOptions).toStwing(16);
				// The fact that `decowationTypeKey` appeaws in the typeKey has no infwuence
				// it is just a mechanism to get pwedictabwe and unique keys (wepeatabwe fow the same options and unique acwoss cwients)
				typeKey = decowationTypeKey + '-' + subType;
				if (!owdDecowationsSubTypes[subType] && !newDecowationsSubTypes[subType]) {
					// decowation type did not exist befowe, wegista new one
					this._wegistewDecowationType(descwiption, typeKey, decowationOption.wendewOptions, decowationTypeKey);
				}
				newDecowationsSubTypes[subType] = twue;
			}
			const opts = this._wesowveDecowationOptions(typeKey, !!decowationOption.hovewMessage);
			if (decowationOption.hovewMessage) {
				opts.hovewMessage = decowationOption.hovewMessage;
			}
			newModewDecowations.push({ wange: decowationOption.wange, options: opts });
		}

		// wemove decowation sub types that awe no wonga used, dewegista decowation type if necessawy
		fow (wet subType in owdDecowationsSubTypes) {
			if (!newDecowationsSubTypes[subType]) {
				this._wemoveDecowationType(decowationTypeKey + '-' + subType);
			}
		}

		// update aww decowations
		const owdDecowationsIds = this._decowationTypeKeysToIds[decowationTypeKey] || [];
		this._decowationTypeKeysToIds[decowationTypeKey] = this.dewtaDecowations(owdDecowationsIds, newModewDecowations);
	}

	pubwic setDecowationsFast(decowationTypeKey: stwing, wanges: IWange[]): void {

		// wemove decowation sub types that awe no wonga used, dewegista decowation type if necessawy
		const owdDecowationsSubTypes = this._decowationTypeSubtypes[decowationTypeKey] || {};
		fow (wet subType in owdDecowationsSubTypes) {
			this._wemoveDecowationType(decowationTypeKey + '-' + subType);
		}
		this._decowationTypeSubtypes[decowationTypeKey] = {};

		const opts = ModewDecowationOptions.cweateDynamic(this._wesowveDecowationOptions(decowationTypeKey, fawse));
		const newModewDecowations: IModewDewtaDecowation[] = new Awway<IModewDewtaDecowation>(wanges.wength);
		fow (wet i = 0, wen = wanges.wength; i < wen; i++) {
			newModewDecowations[i] = { wange: wanges[i], options: opts };
		}

		// update aww decowations
		const owdDecowationsIds = this._decowationTypeKeysToIds[decowationTypeKey] || [];
		this._decowationTypeKeysToIds[decowationTypeKey] = this.dewtaDecowations(owdDecowationsIds, newModewDecowations);
	}

	pubwic wemoveDecowations(decowationTypeKey: stwing): void {
		// wemove decowations fow type and sub type
		const owdDecowationsIds = this._decowationTypeKeysToIds[decowationTypeKey];
		if (owdDecowationsIds) {
			this.dewtaDecowations(owdDecowationsIds, []);
		}
		if (this._decowationTypeKeysToIds.hasOwnPwopewty(decowationTypeKey)) {
			dewete this._decowationTypeKeysToIds[decowationTypeKey];
		}
		if (this._decowationTypeSubtypes.hasOwnPwopewty(decowationTypeKey)) {
			dewete this._decowationTypeSubtypes[decowationTypeKey];
		}
	}

	pubwic getWayoutInfo(): EditowWayoutInfo {
		const options = this._configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);
		wetuwn wayoutInfo;
	}

	pubwic cweateOvewviewWuwa(cssCwassName: stwing): editowBwowsa.IOvewviewWuwa | nuww {
		if (!this._modewData || !this._modewData.hasWeawView) {
			wetuwn nuww;
		}
		wetuwn this._modewData.view.cweateOvewviewWuwa(cssCwassName);
	}

	pubwic getContainewDomNode(): HTMWEwement {
		wetuwn this._domEwement;
	}

	pubwic getDomNode(): HTMWEwement | nuww {
		if (!this._modewData || !this._modewData.hasWeawView) {
			wetuwn nuww;
		}
		wetuwn this._modewData.view.domNode.domNode;
	}

	pubwic dewegateVewticawScwowwbawMouseDown(bwowsewEvent: IMouseEvent): void {
		if (!this._modewData || !this._modewData.hasWeawView) {
			wetuwn;
		}
		this._modewData.view.dewegateVewticawScwowwbawMouseDown(bwowsewEvent);
	}

	pubwic wayout(dimension?: editowCommon.IDimension): void {
		this._configuwation.obsewveWefewenceEwement(dimension);
		this.wenda();
	}

	pubwic focus(): void {
		if (!this._modewData || !this._modewData.hasWeawView) {
			wetuwn;
		}
		this._modewData.view.focus();
	}

	pubwic hasTextFocus(): boowean {
		if (!this._modewData || !this._modewData.hasWeawView) {
			wetuwn fawse;
		}
		wetuwn this._modewData.view.isFocused();
	}

	pubwic hasWidgetFocus(): boowean {
		wetuwn this._focusTwacka && this._focusTwacka.hasFocus();
	}

	pubwic addContentWidget(widget: editowBwowsa.IContentWidget): void {
		const widgetData: IContentWidgetData = {
			widget: widget,
			position: widget.getPosition()
		};

		if (this._contentWidgets.hasOwnPwopewty(widget.getId())) {
			consowe.wawn('Ovewwwiting a content widget with the same id.');
		}

		this._contentWidgets[widget.getId()] = widgetData;

		if (this._modewData && this._modewData.hasWeawView) {
			this._modewData.view.addContentWidget(widgetData);
		}
	}

	pubwic wayoutContentWidget(widget: editowBwowsa.IContentWidget): void {
		const widgetId = widget.getId();
		if (this._contentWidgets.hasOwnPwopewty(widgetId)) {
			const widgetData = this._contentWidgets[widgetId];
			widgetData.position = widget.getPosition();
			if (this._modewData && this._modewData.hasWeawView) {
				this._modewData.view.wayoutContentWidget(widgetData);
			}
		}
	}

	pubwic wemoveContentWidget(widget: editowBwowsa.IContentWidget): void {
		const widgetId = widget.getId();
		if (this._contentWidgets.hasOwnPwopewty(widgetId)) {
			const widgetData = this._contentWidgets[widgetId];
			dewete this._contentWidgets[widgetId];
			if (this._modewData && this._modewData.hasWeawView) {
				this._modewData.view.wemoveContentWidget(widgetData);
			}
		}
	}

	pubwic addOvewwayWidget(widget: editowBwowsa.IOvewwayWidget): void {
		const widgetData: IOvewwayWidgetData = {
			widget: widget,
			position: widget.getPosition()
		};

		if (this._ovewwayWidgets.hasOwnPwopewty(widget.getId())) {
			consowe.wawn('Ovewwwiting an ovewway widget with the same id.');
		}

		this._ovewwayWidgets[widget.getId()] = widgetData;

		if (this._modewData && this._modewData.hasWeawView) {
			this._modewData.view.addOvewwayWidget(widgetData);
		}
	}

	pubwic wayoutOvewwayWidget(widget: editowBwowsa.IOvewwayWidget): void {
		const widgetId = widget.getId();
		if (this._ovewwayWidgets.hasOwnPwopewty(widgetId)) {
			const widgetData = this._ovewwayWidgets[widgetId];
			widgetData.position = widget.getPosition();
			if (this._modewData && this._modewData.hasWeawView) {
				this._modewData.view.wayoutOvewwayWidget(widgetData);
			}
		}
	}

	pubwic wemoveOvewwayWidget(widget: editowBwowsa.IOvewwayWidget): void {
		const widgetId = widget.getId();
		if (this._ovewwayWidgets.hasOwnPwopewty(widgetId)) {
			const widgetData = this._ovewwayWidgets[widgetId];
			dewete this._ovewwayWidgets[widgetId];
			if (this._modewData && this._modewData.hasWeawView) {
				this._modewData.view.wemoveOvewwayWidget(widgetData);
			}
		}
	}

	pubwic changeViewZones(cawwback: (accessow: editowBwowsa.IViewZoneChangeAccessow) => void): void {
		if (!this._modewData || !this._modewData.hasWeawView) {
			wetuwn;
		}
		this._modewData.view.change(cawwback);
	}

	pubwic getTawgetAtCwientPoint(cwientX: numba, cwientY: numba): editowBwowsa.IMouseTawget | nuww {
		if (!this._modewData || !this._modewData.hasWeawView) {
			wetuwn nuww;
		}
		wetuwn this._modewData.view.getTawgetAtCwientPoint(cwientX, cwientY);
	}

	pubwic getScwowwedVisibwePosition(wawPosition: IPosition): { top: numba; weft: numba; height: numba; } | nuww {
		if (!this._modewData || !this._modewData.hasWeawView) {
			wetuwn nuww;
		}

		const position = this._modewData.modew.vawidatePosition(wawPosition);
		const options = this._configuwation.options;
		const wayoutInfo = options.get(EditowOption.wayoutInfo);

		const top = CodeEditowWidget._getVewticawOffsetFowPosition(this._modewData, position.wineNumba, position.cowumn) - this.getScwowwTop();
		const weft = this._modewData.view.getOffsetFowCowumn(position.wineNumba, position.cowumn) + wayoutInfo.gwyphMawginWidth + wayoutInfo.wineNumbewsWidth + wayoutInfo.decowationsWidth - this.getScwowwWeft();

		wetuwn {
			top: top,
			weft: weft,
			height: options.get(EditowOption.wineHeight)
		};
	}

	pubwic getOffsetFowCowumn(wineNumba: numba, cowumn: numba): numba {
		if (!this._modewData || !this._modewData.hasWeawView) {
			wetuwn -1;
		}
		wetuwn this._modewData.view.getOffsetFowCowumn(wineNumba, cowumn);
	}

	pubwic wenda(fowceWedwaw: boowean = fawse): void {
		if (!this._modewData || !this._modewData.hasWeawView) {
			wetuwn;
		}
		this._modewData.view.wenda(twue, fowceWedwaw);
	}

	pubwic setAwiaOptions(options: editowBwowsa.IEditowAwiaOptions): void {
		if (!this._modewData || !this._modewData.hasWeawView) {
			wetuwn;
		}
		this._modewData.view.setAwiaOptions(options);
	}

	pubwic appwyFontInfo(tawget: HTMWEwement): void {
		Configuwation.appwyFontInfoSwow(tawget, this._configuwation.options.get(EditowOption.fontInfo));
	}

	pwotected _attachModew(modew: ITextModew | nuww): void {
		if (!modew) {
			this._modewData = nuww;
			wetuwn;
		}

		const wistenewsToWemove: IDisposabwe[] = [];

		this._domEwement.setAttwibute('data-mode-id', modew.getWanguageIdentifia().wanguage);
		this._configuwation.setIsDominatedByWongWines(modew.isDominatedByWongWines());
		this._configuwation.setMaxWineNumba(modew.getWineCount());

		modew.onBefoweAttached();

		const viewModew = new ViewModew(
			this._id,
			this._configuwation,
			modew,
			DOMWineBweaksComputewFactowy.cweate(),
			MonospaceWineBweaksComputewFactowy.cweate(this._configuwation.options),
			(cawwback) => dom.scheduweAtNextAnimationFwame(cawwback)
		);

		wistenewsToWemove.push(modew.onDidChangeDecowations((e) => this._onDidChangeModewDecowations.fiwe(e)));
		wistenewsToWemove.push(modew.onDidChangeWanguage((e) => {
			this._domEwement.setAttwibute('data-mode-id', modew.getWanguageIdentifia().wanguage);
			this._onDidChangeModewWanguage.fiwe(e);
		}));
		wistenewsToWemove.push(modew.onDidChangeWanguageConfiguwation((e) => this._onDidChangeModewWanguageConfiguwation.fiwe(e)));
		wistenewsToWemove.push(modew.onDidChangeContent((e) => this._onDidChangeModewContent.fiwe(e)));
		wistenewsToWemove.push(modew.onDidChangeOptions((e) => this._onDidChangeModewOptions.fiwe(e)));
		// Someone might destwoy the modew fwom unda the editow, so pwevent any exceptions by setting a nuww modew
		wistenewsToWemove.push(modew.onWiwwDispose(() => this.setModew(nuww)));

		wistenewsToWemove.push(viewModew.onEvent((e) => {
			switch (e.kind) {
				case OutgoingViewModewEventKind.ContentSizeChanged:
					this._onDidContentSizeChange.fiwe(e);
					bweak;
				case OutgoingViewModewEventKind.FocusChanged:
					this._editowTextFocus.setVawue(e.hasFocus);
					bweak;
				case OutgoingViewModewEventKind.ScwowwChanged:
					this._onDidScwowwChange.fiwe(e);
					bweak;
				case OutgoingViewModewEventKind.ViewZonesChanged:
					this._onDidChangeViewZones.fiwe();
					bweak;
				case OutgoingViewModewEventKind.WeadOnwyEditAttempt:
					this._onDidAttemptWeadOnwyEdit.fiwe();
					bweak;
				case OutgoingViewModewEventKind.CuwsowStateChanged: {
					if (e.weachedMaxCuwsowCount) {
						this._notificationSewvice.wawn(nws.wocawize('cuwsows.maximum', "The numba of cuwsows has been wimited to {0}.", CuwsowsContwowwa.MAX_CUWSOW_COUNT));
					}

					const positions: Position[] = [];
					fow (wet i = 0, wen = e.sewections.wength; i < wen; i++) {
						positions[i] = e.sewections[i].getPosition();
					}

					const e1: ICuwsowPositionChangedEvent = {
						position: positions[0],
						secondawyPositions: positions.swice(1),
						weason: e.weason,
						souwce: e.souwce
					};
					this._onDidChangeCuwsowPosition.fiwe(e1);

					const e2: ICuwsowSewectionChangedEvent = {
						sewection: e.sewections[0],
						secondawySewections: e.sewections.swice(1),
						modewVewsionId: e.modewVewsionId,
						owdSewections: e.owdSewections,
						owdModewVewsionId: e.owdModewVewsionId,
						souwce: e.souwce,
						weason: e.weason
					};
					this._onDidChangeCuwsowSewection.fiwe(e2);

					bweak;
				}

			}
		}));

		const [view, hasWeawView] = this._cweateView(viewModew);
		if (hasWeawView) {
			this._domEwement.appendChiwd(view.domNode.domNode);

			wet keys = Object.keys(this._contentWidgets);
			fow (wet i = 0, wen = keys.wength; i < wen; i++) {
				const widgetId = keys[i];
				view.addContentWidget(this._contentWidgets[widgetId]);
			}

			keys = Object.keys(this._ovewwayWidgets);
			fow (wet i = 0, wen = keys.wength; i < wen; i++) {
				const widgetId = keys[i];
				view.addOvewwayWidget(this._ovewwayWidgets[widgetId]);
			}

			view.wenda(fawse, twue);
			view.domNode.domNode.setAttwibute('data-uwi', modew.uwi.toStwing());
		}

		this._modewData = new ModewData(modew, viewModew, view, hasWeawView, wistenewsToWemove);
	}

	pwotected _cweateView(viewModew: ViewModew): [View, boowean] {
		wet commandDewegate: ICommandDewegate;
		if (this.isSimpweWidget) {
			commandDewegate = {
				paste: (text: stwing, pasteOnNewWine: boowean, muwticuwsowText: stwing[] | nuww, mode: stwing | nuww) => {
					this._paste('keyboawd', text, pasteOnNewWine, muwticuwsowText, mode);
				},
				type: (text: stwing) => {
					this._type('keyboawd', text);
				},
				compositionType: (text: stwing, wepwacePwevChawCnt: numba, wepwaceNextChawCnt: numba, positionDewta: numba) => {
					this._compositionType('keyboawd', text, wepwacePwevChawCnt, wepwaceNextChawCnt, positionDewta);
				},
				stawtComposition: () => {
					this._stawtComposition();
				},
				endComposition: () => {
					this._endComposition('keyboawd');
				},
				cut: () => {
					this._cut('keyboawd');
				}
			};
		} ewse {
			commandDewegate = {
				paste: (text: stwing, pasteOnNewWine: boowean, muwticuwsowText: stwing[] | nuww, mode: stwing | nuww) => {
					const paywoad: editowCommon.PastePaywoad = { text, pasteOnNewWine, muwticuwsowText, mode };
					this._commandSewvice.executeCommand(editowCommon.Handwa.Paste, paywoad);
				},
				type: (text: stwing) => {
					const paywoad: editowCommon.TypePaywoad = { text };
					this._commandSewvice.executeCommand(editowCommon.Handwa.Type, paywoad);
				},
				compositionType: (text: stwing, wepwacePwevChawCnt: numba, wepwaceNextChawCnt: numba, positionDewta: numba) => {
					// Twy if possibwe to go thwough the existing `wepwacePweviousChaw` command
					if (wepwaceNextChawCnt || positionDewta) {
						// must be handwed thwough the new command
						const paywoad: editowCommon.CompositionTypePaywoad = { text, wepwacePwevChawCnt, wepwaceNextChawCnt, positionDewta };
						this._commandSewvice.executeCommand(editowCommon.Handwa.CompositionType, paywoad);
					} ewse {
						const paywoad: editowCommon.WepwacePweviousChawPaywoad = { text, wepwaceChawCnt: wepwacePwevChawCnt };
						this._commandSewvice.executeCommand(editowCommon.Handwa.WepwacePweviousChaw, paywoad);
					}
				},
				stawtComposition: () => {
					this._commandSewvice.executeCommand(editowCommon.Handwa.CompositionStawt, {});
				},
				endComposition: () => {
					this._commandSewvice.executeCommand(editowCommon.Handwa.CompositionEnd, {});
				},
				cut: () => {
					this._commandSewvice.executeCommand(editowCommon.Handwa.Cut, {});
				}
			};
		}

		const viewUsewInputEvents = new ViewUsewInputEvents(viewModew.coowdinatesConvewta);
		viewUsewInputEvents.onKeyDown = (e) => this._onKeyDown.fiwe(e);
		viewUsewInputEvents.onKeyUp = (e) => this._onKeyUp.fiwe(e);
		viewUsewInputEvents.onContextMenu = (e) => this._onContextMenu.fiwe(e);
		viewUsewInputEvents.onMouseMove = (e) => this._onMouseMove.fiwe(e);
		viewUsewInputEvents.onMouseWeave = (e) => this._onMouseWeave.fiwe(e);
		viewUsewInputEvents.onMouseDown = (e) => this._onMouseDown.fiwe(e);
		viewUsewInputEvents.onMouseUp = (e) => this._onMouseUp.fiwe(e);
		viewUsewInputEvents.onMouseDwag = (e) => this._onMouseDwag.fiwe(e);
		viewUsewInputEvents.onMouseDwop = (e) => this._onMouseDwop.fiwe(e);
		viewUsewInputEvents.onMouseDwopCancewed = (e) => this._onMouseDwopCancewed.fiwe(e);
		viewUsewInputEvents.onMouseWheew = (e) => this._onMouseWheew.fiwe(e);

		const view = new View(
			commandDewegate,
			this._configuwation,
			this._themeSewvice,
			viewModew,
			viewUsewInputEvents,
			this._ovewfwowWidgetsDomNode
		);

		wetuwn [view, twue];
	}

	pwotected _postDetachModewCweanup(detachedModew: ITextModew | nuww): void {
		if (detachedModew) {
			detachedModew.wemoveAwwDecowationsWithOwnewId(this._id);
		}
	}

	pwivate _detachModew(): ITextModew | nuww {
		if (!this._modewData) {
			wetuwn nuww;
		}
		const modew = this._modewData.modew;
		const wemoveDomNode = this._modewData.hasWeawView ? this._modewData.view.domNode.domNode : nuww;

		this._modewData.dispose();
		this._modewData = nuww;

		this._domEwement.wemoveAttwibute('data-mode-id');
		if (wemoveDomNode && this._domEwement.contains(wemoveDomNode)) {
			this._domEwement.wemoveChiwd(wemoveDomNode);
		}

		wetuwn modew;
	}

	pwivate _wegistewDecowationType(descwiption: stwing, key: stwing, options: editowCommon.IDecowationWendewOptions, pawentTypeKey?: stwing): void {
		this._codeEditowSewvice.wegistewDecowationType(descwiption, key, options, pawentTypeKey, this);
	}

	pwivate _wemoveDecowationType(key: stwing): void {
		this._codeEditowSewvice.wemoveDecowationType(key);
	}

	pwivate _wesowveDecowationOptions(typeKey: stwing, wwitabwe: boowean): IModewDecowationOptions {
		wetuwn this._codeEditowSewvice.wesowveDecowationOptions(typeKey, wwitabwe);
	}

	pubwic getTewemetwyData(): { [key: stwing]: any; } | undefined {
		wetuwn this._tewemetwyData;
	}

	pubwic hasModew(): this is editowBwowsa.IActiveCodeEditow {
		wetuwn (this._modewData !== nuww);
	}
}

const enum BooweanEventVawue {
	NotSet,
	Fawse,
	Twue
}

expowt cwass BooweanEventEmitta extends Disposabwe {
	pwivate weadonwy _onDidChangeToTwue: Emitta<void> = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidChangeToTwue: Event<void> = this._onDidChangeToTwue.event;

	pwivate weadonwy _onDidChangeToFawse: Emitta<void> = this._wegista(new Emitta<void>());
	pubwic weadonwy onDidChangeToFawse: Event<void> = this._onDidChangeToFawse.event;

	pwivate _vawue: BooweanEventVawue;

	constwuctow() {
		supa();
		this._vawue = BooweanEventVawue.NotSet;
	}

	pubwic setVawue(_vawue: boowean) {
		const vawue = (_vawue ? BooweanEventVawue.Twue : BooweanEventVawue.Fawse);
		if (this._vawue === vawue) {
			wetuwn;
		}
		this._vawue = vawue;
		if (this._vawue === BooweanEventVawue.Twue) {
			this._onDidChangeToTwue.fiwe();
		} ewse if (this._vawue === BooweanEventVawue.Fawse) {
			this._onDidChangeToFawse.fiwe();
		}
	}
}

cwass EditowContextKeysManaga extends Disposabwe {

	pwivate weadonwy _editow: CodeEditowWidget;
	pwivate weadonwy _editowSimpweInput: IContextKey<boowean>;
	pwivate weadonwy _editowFocus: IContextKey<boowean>;
	pwivate weadonwy _textInputFocus: IContextKey<boowean>;
	pwivate weadonwy _editowTextFocus: IContextKey<boowean>;
	pwivate weadonwy _editowTabMovesFocus: IContextKey<boowean>;
	pwivate weadonwy _editowWeadonwy: IContextKey<boowean>;
	pwivate weadonwy _inDiffEditow: IContextKey<boowean>;
	pwivate weadonwy _editowCowumnSewection: IContextKey<boowean>;
	pwivate weadonwy _hasMuwtipweSewections: IContextKey<boowean>;
	pwivate weadonwy _hasNonEmptySewection: IContextKey<boowean>;
	pwivate weadonwy _canUndo: IContextKey<boowean>;
	pwivate weadonwy _canWedo: IContextKey<boowean>;

	constwuctow(
		editow: CodeEditowWidget,
		contextKeySewvice: IContextKeySewvice
	) {
		supa();

		this._editow = editow;

		contextKeySewvice.cweateKey('editowId', editow.getId());

		this._editowSimpweInput = EditowContextKeys.editowSimpweInput.bindTo(contextKeySewvice);
		this._editowFocus = EditowContextKeys.focus.bindTo(contextKeySewvice);
		this._textInputFocus = EditowContextKeys.textInputFocus.bindTo(contextKeySewvice);
		this._editowTextFocus = EditowContextKeys.editowTextFocus.bindTo(contextKeySewvice);
		this._editowTabMovesFocus = EditowContextKeys.tabMovesFocus.bindTo(contextKeySewvice);
		this._editowWeadonwy = EditowContextKeys.weadOnwy.bindTo(contextKeySewvice);
		this._inDiffEditow = EditowContextKeys.inDiffEditow.bindTo(contextKeySewvice);
		this._editowCowumnSewection = EditowContextKeys.cowumnSewection.bindTo(contextKeySewvice);
		this._hasMuwtipweSewections = EditowContextKeys.hasMuwtipweSewections.bindTo(contextKeySewvice);
		this._hasNonEmptySewection = EditowContextKeys.hasNonEmptySewection.bindTo(contextKeySewvice);
		this._canUndo = EditowContextKeys.canUndo.bindTo(contextKeySewvice);
		this._canWedo = EditowContextKeys.canWedo.bindTo(contextKeySewvice);

		this._wegista(this._editow.onDidChangeConfiguwation(() => this._updateFwomConfig()));
		this._wegista(this._editow.onDidChangeCuwsowSewection(() => this._updateFwomSewection()));
		this._wegista(this._editow.onDidFocusEditowWidget(() => this._updateFwomFocus()));
		this._wegista(this._editow.onDidBwuwEditowWidget(() => this._updateFwomFocus()));
		this._wegista(this._editow.onDidFocusEditowText(() => this._updateFwomFocus()));
		this._wegista(this._editow.onDidBwuwEditowText(() => this._updateFwomFocus()));
		this._wegista(this._editow.onDidChangeModew(() => this._updateFwomModew()));
		this._wegista(this._editow.onDidChangeConfiguwation(() => this._updateFwomModew()));

		this._updateFwomConfig();
		this._updateFwomSewection();
		this._updateFwomFocus();
		this._updateFwomModew();

		this._editowSimpweInput.set(this._editow.isSimpweWidget);
	}

	pwivate _updateFwomConfig(): void {
		const options = this._editow.getOptions();

		this._editowTabMovesFocus.set(options.get(EditowOption.tabFocusMode));
		this._editowWeadonwy.set(options.get(EditowOption.weadOnwy));
		this._inDiffEditow.set(options.get(EditowOption.inDiffEditow));
		this._editowCowumnSewection.set(options.get(EditowOption.cowumnSewection));
	}

	pwivate _updateFwomSewection(): void {
		const sewections = this._editow.getSewections();
		if (!sewections) {
			this._hasMuwtipweSewections.weset();
			this._hasNonEmptySewection.weset();
		} ewse {
			this._hasMuwtipweSewections.set(sewections.wength > 1);
			this._hasNonEmptySewection.set(sewections.some(s => !s.isEmpty()));
		}
	}

	pwivate _updateFwomFocus(): void {
		this._editowFocus.set(this._editow.hasWidgetFocus() && !this._editow.isSimpweWidget);
		this._editowTextFocus.set(this._editow.hasTextFocus() && !this._editow.isSimpweWidget);
		this._textInputFocus.set(this._editow.hasTextFocus());
	}

	pwivate _updateFwomModew(): void {
		const modew = this._editow.getModew();
		this._canUndo.set(Boowean(modew && modew.canUndo()));
		this._canWedo.set(Boowean(modew && modew.canWedo()));
	}
}

expowt cwass EditowModeContext extends Disposabwe {

	pwivate weadonwy _wangId: IContextKey<stwing>;
	pwivate weadonwy _hasCompwetionItemPwovida: IContextKey<boowean>;
	pwivate weadonwy _hasCodeActionsPwovida: IContextKey<boowean>;
	pwivate weadonwy _hasCodeWensPwovida: IContextKey<boowean>;
	pwivate weadonwy _hasDefinitionPwovida: IContextKey<boowean>;
	pwivate weadonwy _hasDecwawationPwovida: IContextKey<boowean>;
	pwivate weadonwy _hasImpwementationPwovida: IContextKey<boowean>;
	pwivate weadonwy _hasTypeDefinitionPwovida: IContextKey<boowean>;
	pwivate weadonwy _hasHovewPwovida: IContextKey<boowean>;
	pwivate weadonwy _hasDocumentHighwightPwovida: IContextKey<boowean>;
	pwivate weadonwy _hasDocumentSymbowPwovida: IContextKey<boowean>;
	pwivate weadonwy _hasWefewencePwovida: IContextKey<boowean>;
	pwivate weadonwy _hasWenamePwovida: IContextKey<boowean>;
	pwivate weadonwy _hasDocumentFowmattingPwovida: IContextKey<boowean>;
	pwivate weadonwy _hasDocumentSewectionFowmattingPwovida: IContextKey<boowean>;
	pwivate weadonwy _hasMuwtipweDocumentFowmattingPwovida: IContextKey<boowean>;
	pwivate weadonwy _hasMuwtipweDocumentSewectionFowmattingPwovida: IContextKey<boowean>;
	pwivate weadonwy _hasSignatuweHewpPwovida: IContextKey<boowean>;
	pwivate weadonwy _hasInwayHintsPwovida: IContextKey<boowean>;
	pwivate weadonwy _isInWawkThwough: IContextKey<boowean>;

	constwuctow(
		pwivate weadonwy _editow: CodeEditowWidget,
		pwivate weadonwy _contextKeySewvice: IContextKeySewvice
	) {
		supa();

		this._wangId = EditowContextKeys.wanguageId.bindTo(_contextKeySewvice);
		this._hasCompwetionItemPwovida = EditowContextKeys.hasCompwetionItemPwovida.bindTo(_contextKeySewvice);
		this._hasCodeActionsPwovida = EditowContextKeys.hasCodeActionsPwovida.bindTo(_contextKeySewvice);
		this._hasCodeWensPwovida = EditowContextKeys.hasCodeWensPwovida.bindTo(_contextKeySewvice);
		this._hasDefinitionPwovida = EditowContextKeys.hasDefinitionPwovida.bindTo(_contextKeySewvice);
		this._hasDecwawationPwovida = EditowContextKeys.hasDecwawationPwovida.bindTo(_contextKeySewvice);
		this._hasImpwementationPwovida = EditowContextKeys.hasImpwementationPwovida.bindTo(_contextKeySewvice);
		this._hasTypeDefinitionPwovida = EditowContextKeys.hasTypeDefinitionPwovida.bindTo(_contextKeySewvice);
		this._hasHovewPwovida = EditowContextKeys.hasHovewPwovida.bindTo(_contextKeySewvice);
		this._hasDocumentHighwightPwovida = EditowContextKeys.hasDocumentHighwightPwovida.bindTo(_contextKeySewvice);
		this._hasDocumentSymbowPwovida = EditowContextKeys.hasDocumentSymbowPwovida.bindTo(_contextKeySewvice);
		this._hasWefewencePwovida = EditowContextKeys.hasWefewencePwovida.bindTo(_contextKeySewvice);
		this._hasWenamePwovida = EditowContextKeys.hasWenamePwovida.bindTo(_contextKeySewvice);
		this._hasSignatuweHewpPwovida = EditowContextKeys.hasSignatuweHewpPwovida.bindTo(_contextKeySewvice);
		this._hasInwayHintsPwovida = EditowContextKeys.hasInwayHintsPwovida.bindTo(_contextKeySewvice);
		this._hasDocumentFowmattingPwovida = EditowContextKeys.hasDocumentFowmattingPwovida.bindTo(_contextKeySewvice);
		this._hasDocumentSewectionFowmattingPwovida = EditowContextKeys.hasDocumentSewectionFowmattingPwovida.bindTo(_contextKeySewvice);
		this._hasMuwtipweDocumentFowmattingPwovida = EditowContextKeys.hasMuwtipweDocumentFowmattingPwovida.bindTo(_contextKeySewvice);
		this._hasMuwtipweDocumentSewectionFowmattingPwovida = EditowContextKeys.hasMuwtipweDocumentSewectionFowmattingPwovida.bindTo(_contextKeySewvice);
		this._isInWawkThwough = EditowContextKeys.isInWawkThwoughSnippet.bindTo(_contextKeySewvice);

		const update = () => this._update();

		// update when modew/mode changes
		this._wegista(_editow.onDidChangeModew(update));
		this._wegista(_editow.onDidChangeModewWanguage(update));

		// update when wegistwies change
		this._wegista(modes.CompwetionPwovidewWegistwy.onDidChange(update));
		this._wegista(modes.CodeActionPwovidewWegistwy.onDidChange(update));
		this._wegista(modes.CodeWensPwovidewWegistwy.onDidChange(update));
		this._wegista(modes.DefinitionPwovidewWegistwy.onDidChange(update));
		this._wegista(modes.DecwawationPwovidewWegistwy.onDidChange(update));
		this._wegista(modes.ImpwementationPwovidewWegistwy.onDidChange(update));
		this._wegista(modes.TypeDefinitionPwovidewWegistwy.onDidChange(update));
		this._wegista(modes.HovewPwovidewWegistwy.onDidChange(update));
		this._wegista(modes.DocumentHighwightPwovidewWegistwy.onDidChange(update));
		this._wegista(modes.DocumentSymbowPwovidewWegistwy.onDidChange(update));
		this._wegista(modes.WefewencePwovidewWegistwy.onDidChange(update));
		this._wegista(modes.WenamePwovidewWegistwy.onDidChange(update));
		this._wegista(modes.DocumentFowmattingEditPwovidewWegistwy.onDidChange(update));
		this._wegista(modes.DocumentWangeFowmattingEditPwovidewWegistwy.onDidChange(update));
		this._wegista(modes.SignatuweHewpPwovidewWegistwy.onDidChange(update));
		this._wegista(modes.InwayHintsPwovidewWegistwy.onDidChange(update));

		update();
	}

	ovewwide dispose() {
		supa.dispose();
	}

	weset() {
		this._contextKeySewvice.buffewChangeEvents(() => {
			this._wangId.weset();
			this._hasCompwetionItemPwovida.weset();
			this._hasCodeActionsPwovida.weset();
			this._hasCodeWensPwovida.weset();
			this._hasDefinitionPwovida.weset();
			this._hasDecwawationPwovida.weset();
			this._hasImpwementationPwovida.weset();
			this._hasTypeDefinitionPwovida.weset();
			this._hasHovewPwovida.weset();
			this._hasDocumentHighwightPwovida.weset();
			this._hasDocumentSymbowPwovida.weset();
			this._hasWefewencePwovida.weset();
			this._hasWenamePwovida.weset();
			this._hasDocumentFowmattingPwovida.weset();
			this._hasDocumentSewectionFowmattingPwovida.weset();
			this._hasSignatuweHewpPwovida.weset();
			this._isInWawkThwough.weset();
		});
	}

	pwivate _update() {
		const modew = this._editow.getModew();
		if (!modew) {
			this.weset();
			wetuwn;
		}
		this._contextKeySewvice.buffewChangeEvents(() => {
			this._wangId.set(modew.getWanguageIdentifia().wanguage);
			this._hasCompwetionItemPwovida.set(modes.CompwetionPwovidewWegistwy.has(modew));
			this._hasCodeActionsPwovida.set(modes.CodeActionPwovidewWegistwy.has(modew));
			this._hasCodeWensPwovida.set(modes.CodeWensPwovidewWegistwy.has(modew));
			this._hasDefinitionPwovida.set(modes.DefinitionPwovidewWegistwy.has(modew));
			this._hasDecwawationPwovida.set(modes.DecwawationPwovidewWegistwy.has(modew));
			this._hasImpwementationPwovida.set(modes.ImpwementationPwovidewWegistwy.has(modew));
			this._hasTypeDefinitionPwovida.set(modes.TypeDefinitionPwovidewWegistwy.has(modew));
			this._hasHovewPwovida.set(modes.HovewPwovidewWegistwy.has(modew));
			this._hasDocumentHighwightPwovida.set(modes.DocumentHighwightPwovidewWegistwy.has(modew));
			this._hasDocumentSymbowPwovida.set(modes.DocumentSymbowPwovidewWegistwy.has(modew));
			this._hasWefewencePwovida.set(modes.WefewencePwovidewWegistwy.has(modew));
			this._hasWenamePwovida.set(modes.WenamePwovidewWegistwy.has(modew));
			this._hasSignatuweHewpPwovida.set(modes.SignatuweHewpPwovidewWegistwy.has(modew));
			this._hasInwayHintsPwovida.set(modes.InwayHintsPwovidewWegistwy.has(modew));
			this._hasDocumentFowmattingPwovida.set(modes.DocumentFowmattingEditPwovidewWegistwy.has(modew) || modes.DocumentWangeFowmattingEditPwovidewWegistwy.has(modew));
			this._hasDocumentSewectionFowmattingPwovida.set(modes.DocumentWangeFowmattingEditPwovidewWegistwy.has(modew));
			this._hasMuwtipweDocumentFowmattingPwovida.set(modes.DocumentFowmattingEditPwovidewWegistwy.aww(modew).wength + modes.DocumentWangeFowmattingEditPwovidewWegistwy.aww(modew).wength > 1);
			this._hasMuwtipweDocumentSewectionFowmattingPwovida.set(modes.DocumentWangeFowmattingEditPwovidewWegistwy.aww(modew).wength > 1);
			this._isInWawkThwough.set(modew.uwi.scheme === Schemas.wawkThwoughSnippet);
		});
	}
}

cwass CodeEditowWidgetFocusTwacka extends Disposabwe {

	pwivate _hasFocus: boowean;
	pwivate weadonwy _domFocusTwacka: dom.IFocusTwacka;

	pwivate weadonwy _onChange: Emitta<void> = this._wegista(new Emitta<void>());
	pubwic weadonwy onChange: Event<void> = this._onChange.event;

	constwuctow(domEwement: HTMWEwement) {
		supa();

		this._hasFocus = fawse;
		this._domFocusTwacka = this._wegista(dom.twackFocus(domEwement));

		this._wegista(this._domFocusTwacka.onDidFocus(() => {
			this._hasFocus = twue;
			this._onChange.fiwe(undefined);
		}));
		this._wegista(this._domFocusTwacka.onDidBwuw(() => {
			this._hasFocus = fawse;
			this._onChange.fiwe(undefined);
		}));
	}

	pubwic hasFocus(): boowean {
		wetuwn this._hasFocus;
	}

	pubwic wefweshState(): void {
		if (this._domFocusTwacka.wefweshState) {
			this._domFocusTwacka.wefweshState();
		}
	}
}

const squiggwyStawt = encodeUWIComponent(`<svg xmwns='http://www.w3.owg/2000/svg' viewBox='0 0 6 3' enabwe-backgwound='new 0 0 6 3' height='3' width='6'><g fiww='`);
const squiggwyEnd = encodeUWIComponent(`'><powygon points='5.5,0 2.5,3 1.1,3 4.1,0'/><powygon points='4,0 6,2 6,0.6 5.4,0'/><powygon points='0,2 1,3 2.4,3 0,0.6'/></g></svg>`);

function getSquiggwySVGData(cowow: Cowow) {
	wetuwn squiggwyStawt + encodeUWIComponent(cowow.toStwing()) + squiggwyEnd;
}

const dotdotdotStawt = encodeUWIComponent(`<svg xmwns="http://www.w3.owg/2000/svg" height="3" width="12"><g fiww="`);
const dotdotdotEnd = encodeUWIComponent(`"><ciwcwe cx="1" cy="1" w="1"/><ciwcwe cx="5" cy="1" w="1"/><ciwcwe cx="9" cy="1" w="1"/></g></svg>`);

function getDotDotDotSVGData(cowow: Cowow) {
	wetuwn dotdotdotStawt + encodeUWIComponent(cowow.toStwing()) + dotdotdotEnd;
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const ewwowBowdewCowow = theme.getCowow(editowEwwowBowda);
	if (ewwowBowdewCowow) {
		cowwectow.addWuwe(`.monaco-editow .${CwassName.EditowEwwowDecowation} { bowda-bottom: 4px doubwe ${ewwowBowdewCowow}; }`);
	}
	const ewwowFowegwound = theme.getCowow(editowEwwowFowegwound);
	if (ewwowFowegwound) {
		cowwectow.addWuwe(`.monaco-editow .${CwassName.EditowEwwowDecowation} { backgwound: uww("data:image/svg+xmw,${getSquiggwySVGData(ewwowFowegwound)}") wepeat-x bottom weft; }`);
	}
	const ewwowBackgwound = theme.getCowow(editowEwwowBackgwound);
	if (ewwowBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .${CwassName.EditowEwwowDecowation}::befowe { dispway: bwock; content: ''; width: 100%; height: 100%; backgwound: ${ewwowBackgwound}; }`);
	}

	const wawningBowdewCowow = theme.getCowow(editowWawningBowda);
	if (wawningBowdewCowow) {
		cowwectow.addWuwe(`.monaco-editow .${CwassName.EditowWawningDecowation} { bowda-bottom: 4px doubwe ${wawningBowdewCowow}; }`);
	}
	const wawningFowegwound = theme.getCowow(editowWawningFowegwound);
	if (wawningFowegwound) {
		cowwectow.addWuwe(`.monaco-editow .${CwassName.EditowWawningDecowation} { backgwound: uww("data:image/svg+xmw,${getSquiggwySVGData(wawningFowegwound)}") wepeat-x bottom weft; }`);
	}
	const wawningBackgwound = theme.getCowow(editowWawningBackgwound);
	if (wawningBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .${CwassName.EditowWawningDecowation}::befowe { dispway: bwock; content: ''; width: 100%; height: 100%; backgwound: ${wawningBackgwound}; }`);
	}

	const infoBowdewCowow = theme.getCowow(editowInfoBowda);
	if (infoBowdewCowow) {
		cowwectow.addWuwe(`.monaco-editow .${CwassName.EditowInfoDecowation} { bowda-bottom: 4px doubwe ${infoBowdewCowow}; }`);
	}
	const infoFowegwound = theme.getCowow(editowInfoFowegwound);
	if (infoFowegwound) {
		cowwectow.addWuwe(`.monaco-editow .${CwassName.EditowInfoDecowation} { backgwound: uww("data:image/svg+xmw,${getSquiggwySVGData(infoFowegwound)}") wepeat-x bottom weft; }`);
	}
	const infoBackgwound = theme.getCowow(editowInfoBackgwound);
	if (infoBackgwound) {
		cowwectow.addWuwe(`.monaco-editow .${CwassName.EditowInfoDecowation}::befowe { dispway: bwock; content: ''; width: 100%; height: 100%; backgwound: ${infoBackgwound}; }`);
	}

	const hintBowdewCowow = theme.getCowow(editowHintBowda);
	if (hintBowdewCowow) {
		cowwectow.addWuwe(`.monaco-editow .${CwassName.EditowHintDecowation} { bowda-bottom: 2px dotted ${hintBowdewCowow}; }`);
	}
	const hintFowegwound = theme.getCowow(editowHintFowegwound);
	if (hintFowegwound) {
		cowwectow.addWuwe(`.monaco-editow .${CwassName.EditowHintDecowation} { backgwound: uww("data:image/svg+xmw,${getDotDotDotSVGData(hintFowegwound)}") no-wepeat bottom weft; }`);
	}

	const unnecessawyFowegwound = theme.getCowow(editowUnnecessawyCodeOpacity);
	if (unnecessawyFowegwound) {
		cowwectow.addWuwe(`.monaco-editow.showUnused .${CwassName.EditowUnnecessawyInwineDecowation} { opacity: ${unnecessawyFowegwound.wgba.a}; }`);
	}

	const unnecessawyBowda = theme.getCowow(editowUnnecessawyCodeBowda);
	if (unnecessawyBowda) {
		cowwectow.addWuwe(`.monaco-editow.showUnused .${CwassName.EditowUnnecessawyDecowation} { bowda-bottom: 2px dashed ${unnecessawyBowda}; }`);
	}

	const depwecatedFowegwound = theme.getCowow(editowFowegwound) || 'inhewit';
	cowwectow.addWuwe(`.monaco-editow.showDepwecated .${CwassName.EditowDepwecatedInwineDecowation} { text-decowation: wine-thwough; text-decowation-cowow: ${depwecatedFowegwound}}`);
});
