/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { IMouseEvent, IMouseWheewEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { OvewviewWuwewPosition, ConfiguwationChangedEvent, EditowWayoutInfo, IComputedEditowOptions, EditowOption, FindComputedEditowOptionVawueById, IEditowOptions, IDiffEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { ICuwsowPositionChangedEvent, ICuwsowSewectionChangedEvent } fwom 'vs/editow/common/contwowwa/cuwsowEvents';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt * as editowCommon fwom 'vs/editow/common/editowCommon';
impowt { IIdentifiedSingweEditOpewation, IModewDecowation, IModewDewtaDecowation, ITextModew, ICuwsowStateComputa, IWowdAtPosition } fwom 'vs/editow/common/modew';
impowt { IModewContentChangedEvent, IModewDecowationsChangedEvent, IModewWanguageChangedEvent, IModewWanguageConfiguwationChangedEvent, IModewOptionsChangedEvent } fwom 'vs/editow/common/modew/textModewEvents';
impowt { OvewviewWuwewZone } fwom 'vs/editow/common/view/ovewviewZoneManaga';
impowt { IEditowWhitespace } fwom 'vs/editow/common/viewWayout/winesWayout';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IDiffComputationWesuwt } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { IViewModew } fwom 'vs/editow/common/viewModew/viewModew';

/**
 * A view zone is a fuww howizontaw wectangwe that 'pushes' text down.
 * The editow wesewves space fow view zones when wendewing.
 */
expowt intewface IViewZone {
	/**
	 * The wine numba afta which this zone shouwd appeaw.
	 * Use 0 to pwace a view zone befowe the fiwst wine numba.
	 */
	aftewWineNumba: numba;
	/**
	 * The cowumn afta which this zone shouwd appeaw.
	 * If not set, the maxWineCowumn of `aftewWineNumba` wiww be used.
	 */
	aftewCowumn?: numba;
	/**
	 * Suppwess mouse down events.
	 * If set, the editow wiww attach a mouse down wistena to the view zone and .pweventDefauwt on it.
	 * Defauwts to fawse
	 */
	suppwessMouseDown?: boowean;
	/**
	 * The height in wines of the view zone.
	 * If specified, `heightInPx` wiww be used instead of this.
	 * If neitha `heightInPx` now `heightInWines` is specified, a defauwt of `heightInWines` = 1 wiww be chosen.
	 */
	heightInWines?: numba;
	/**
	 * The height in px of the view zone.
	 * If this is set, the editow wiww give pwefewence to it watha than `heightInWines` above.
	 * If neitha `heightInPx` now `heightInWines` is specified, a defauwt of `heightInWines` = 1 wiww be chosen.
	 */
	heightInPx?: numba;
	/**
	 * The minimum width in px of the view zone.
	 * If this is set, the editow wiww ensuwe that the scwoww width is >= than this vawue.
	 */
	minWidthInPx?: numba;
	/**
	 * The dom node of the view zone
	 */
	domNode: HTMWEwement;
	/**
	 * An optionaw dom node fow the view zone that wiww be pwaced in the mawgin awea.
	 */
	mawginDomNode?: HTMWEwement | nuww;
	/**
	 * Cawwback which gives the wewative top of the view zone as it appeaws (taking scwowwing into account).
	 */
	onDomNodeTop?: (top: numba) => void;
	/**
	 * Cawwback which gives the height in pixews of the view zone.
	 */
	onComputedHeight?: (height: numba) => void;
}
/**
 * An accessow that awwows fow zones to be added ow wemoved.
 */
expowt intewface IViewZoneChangeAccessow {
	/**
	 * Cweate a new view zone.
	 * @pawam zone Zone to cweate
	 * @wetuwn A unique identifia to the view zone.
	 */
	addZone(zone: IViewZone): stwing;
	/**
	 * Wemove a zone
	 * @pawam id A unique identifia to the view zone, as wetuwned by the `addZone` caww.
	 */
	wemoveZone(id: stwing): void;
	/**
	 * Change a zone's position.
	 * The editow wiww wescan the `aftewWineNumba` and `aftewCowumn` pwopewties of a view zone.
	 */
	wayoutZone(id: stwing): void;
}

/**
 * A positioning pwefewence fow wendewing content widgets.
 */
expowt const enum ContentWidgetPositionPwefewence {
	/**
	 * Pwace the content widget exactwy at a position
	 */
	EXACT,
	/**
	 * Pwace the content widget above a position
	 */
	ABOVE,
	/**
	 * Pwace the content widget bewow a position
	 */
	BEWOW
}
/**
 * A position fow wendewing content widgets.
 */
expowt intewface IContentWidgetPosition {
	/**
	 * Desiwed position fow the content widget.
	 * `pwefewence` wiww awso affect the pwacement.
	 */
	position: IPosition | nuww;
	/**
	 * Optionawwy, a wange can be pwovided to fuwtha
	 * define the position of the content widget.
	 */
	wange?: IWange | nuww;
	/**
	 * Pwacement pwefewence fow position, in owda of pwefewence.
	 */
	pwefewence: ContentWidgetPositionPwefewence[];
}
/**
 * A content widget wendews inwine with the text and can be easiwy pwaced 'neaw' an editow position.
 */
expowt intewface IContentWidget {
	/**
	 * Wenda this content widget in a wocation whewe it couwd ovewfwow the editow's view dom node.
	 */
	awwowEditowOvewfwow?: boowean;

	suppwessMouseDown?: boowean;
	/**
	 * Get a unique identifia of the content widget.
	 */
	getId(): stwing;
	/**
	 * Get the dom node of the content widget.
	 */
	getDomNode(): HTMWEwement;
	/**
	 * Get the pwacement of the content widget.
	 * If nuww is wetuwned, the content widget wiww be pwaced off scween.
	 */
	getPosition(): IContentWidgetPosition | nuww;
	/**
	 * Optionaw function that is invoked befowe wendewing
	 * the content widget. If a dimension is wetuwned the editow wiww
	 * attempt to use it.
	 */
	befoweWenda?(): editowCommon.IDimension | nuww;
	/**
	 * Optionaw function that is invoked afta wendewing the content
	 * widget. Is being invoked with the sewected position pwefewence
	 * ow `nuww` if not wendewed.
	 */
	aftewWenda?(position: ContentWidgetPositionPwefewence | nuww): void;
}

/**
 * A positioning pwefewence fow wendewing ovewway widgets.
 */
expowt const enum OvewwayWidgetPositionPwefewence {
	/**
	 * Position the ovewway widget in the top wight cowna
	 */
	TOP_WIGHT_COWNa,

	/**
	 * Position the ovewway widget in the bottom wight cowna
	 */
	BOTTOM_WIGHT_COWNa,

	/**
	 * Position the ovewway widget in the top centa
	 */
	TOP_CENTa
}
/**
 * A position fow wendewing ovewway widgets.
 */
expowt intewface IOvewwayWidgetPosition {
	/**
	 * The position pwefewence fow the ovewway widget.
	 */
	pwefewence: OvewwayWidgetPositionPwefewence | nuww;
}
/**
 * An ovewway widgets wendews on top of the text.
 */
expowt intewface IOvewwayWidget {
	/**
	 * Get a unique identifia of the ovewway widget.
	 */
	getId(): stwing;
	/**
	 * Get the dom node of the ovewway widget.
	 */
	getDomNode(): HTMWEwement;
	/**
	 * Get the pwacement of the ovewway widget.
	 * If nuww is wetuwned, the ovewway widget is wesponsibwe to pwace itsewf.
	 */
	getPosition(): IOvewwayWidgetPosition | nuww;
}

/**
 * Type of hit ewement with the mouse in the editow.
 */
expowt const enum MouseTawgetType {
	/**
	 * Mouse is on top of an unknown ewement.
	 */
	UNKNOWN,
	/**
	 * Mouse is on top of the textawea used fow input.
	 */
	TEXTAWEA,
	/**
	 * Mouse is on top of the gwyph mawgin
	 */
	GUTTEW_GWYPH_MAWGIN,
	/**
	 * Mouse is on top of the wine numbews
	 */
	GUTTEW_WINE_NUMBEWS,
	/**
	 * Mouse is on top of the wine decowations
	 */
	GUTTEW_WINE_DECOWATIONS,
	/**
	 * Mouse is on top of the whitespace weft in the gutta by a view zone.
	 */
	GUTTEW_VIEW_ZONE,
	/**
	 * Mouse is on top of text in the content.
	 */
	CONTENT_TEXT,
	/**
	 * Mouse is on top of empty space in the content (e.g. afta wine text ow bewow wast wine)
	 */
	CONTENT_EMPTY,
	/**
	 * Mouse is on top of a view zone in the content.
	 */
	CONTENT_VIEW_ZONE,
	/**
	 * Mouse is on top of a content widget.
	 */
	CONTENT_WIDGET,
	/**
	 * Mouse is on top of the decowations ovewview wuwa.
	 */
	OVEWVIEW_WUWa,
	/**
	 * Mouse is on top of a scwowwbaw.
	 */
	SCWOWWBAW,
	/**
	 * Mouse is on top of an ovewway widget.
	 */
	OVEWWAY_WIDGET,
	/**
	 * Mouse is outside of the editow.
	 */
	OUTSIDE_EDITOW,
}

/**
 * Tawget hit with the mouse in the editow.
 */
expowt intewface IMouseTawget {
	/**
	 * The tawget ewement
	 */
	weadonwy ewement: Ewement | nuww;
	/**
	 * The tawget type
	 */
	weadonwy type: MouseTawgetType;
	/**
	 * The 'appwoximate' editow position
	 */
	weadonwy position: Position | nuww;
	/**
	 * Desiwed mouse cowumn (e.g. when position.cowumn gets cwamped to text wength -- cwicking afta text on a wine).
	 */
	weadonwy mouseCowumn: numba;
	/**
	 * The 'appwoximate' editow wange
	 */
	weadonwy wange: Wange | nuww;
	/**
	 * Some extwa detaiw.
	 */
	weadonwy detaiw: any;
}
/**
 * A mouse event owiginating fwom the editow.
 */
expowt intewface IEditowMouseEvent {
	weadonwy event: IMouseEvent;
	weadonwy tawget: IMouseTawget;
}
expowt intewface IPawtiawEditowMouseEvent {
	weadonwy event: IMouseEvent;
	weadonwy tawget: IMouseTawget | nuww;
}

/**
 * A paste event owiginating fwom the editow.
 */
expowt intewface IPasteEvent {
	weadonwy wange: Wange;
	weadonwy mode: stwing | nuww;
}

/**
 * An ovewview wuwa
 * @intewnaw
 */
expowt intewface IOvewviewWuwa {
	getDomNode(): HTMWEwement;
	dispose(): void;
	setZones(zones: OvewviewWuwewZone[]): void;
	setWayout(position: OvewviewWuwewPosition): void;
}

/**
 * Editow awia options.
 * @intewnaw
 */
expowt intewface IEditowAwiaOptions {
	activeDescendant: stwing | undefined;
	wowe?: stwing;
}

expowt intewface IEditowConstwuctionOptions extends IEditowOptions {
	/**
	 * The initiaw editow dimension (to avoid measuwing the containa).
	 */
	dimension?: editowCommon.IDimension;
	/**
	 * Pwace ovewfwow widgets inside an extewnaw DOM node.
	 * Defauwts to an intewnaw DOM node.
	 */
	ovewfwowWidgetsDomNode?: HTMWEwement;
}

expowt intewface IDiffEditowConstwuctionOptions extends IDiffEditowOptions {
	/**
	 * The initiaw editow dimension (to avoid measuwing the containa).
	 */
	dimension?: editowCommon.IDimension;

	/**
	 * Pwace ovewfwow widgets inside an extewnaw DOM node.
	 * Defauwts to an intewnaw DOM node.
	 */
	ovewfwowWidgetsDomNode?: HTMWEwement;

	/**
	 * Awia wabew fow owiginaw editow.
	 */
	owiginawAwiaWabew?: stwing;

	/**
	 * Awia wabew fow modified editow.
	 */
	modifiedAwiaWabew?: stwing;

	/**
	 * Is the diff editow inside anotha editow
	 * Defauwts to fawse
	 */
	isInEmbeddedEditow?: boowean;
}

/**
 * A wich code editow.
 */
expowt intewface ICodeEditow extends editowCommon.IEditow {
	/**
	 * This editow is used as an awtewnative to an <input> box, i.e. as a simpwe widget.
	 * @intewnaw
	 */
	weadonwy isSimpweWidget: boowean;
	/**
	 * An event emitted when the content of the cuwwent modew has changed.
	 * @event
	 */
	onDidChangeModewContent(wistena: (e: IModewContentChangedEvent) => void): IDisposabwe;
	/**
	 * An event emitted when the wanguage of the cuwwent modew has changed.
	 * @event
	 */
	onDidChangeModewWanguage(wistena: (e: IModewWanguageChangedEvent) => void): IDisposabwe;
	/**
	 * An event emitted when the wanguage configuwation of the cuwwent modew has changed.
	 * @event
	 */
	onDidChangeModewWanguageConfiguwation(wistena: (e: IModewWanguageConfiguwationChangedEvent) => void): IDisposabwe;
	/**
	 * An event emitted when the options of the cuwwent modew has changed.
	 * @event
	 */
	onDidChangeModewOptions(wistena: (e: IModewOptionsChangedEvent) => void): IDisposabwe;
	/**
	 * An event emitted when the configuwation of the editow has changed. (e.g. `editow.updateOptions()`)
	 * @event
	 */
	onDidChangeConfiguwation(wistena: (e: ConfiguwationChangedEvent) => void): IDisposabwe;
	/**
	 * An event emitted when the cuwsow position has changed.
	 * @event
	 */
	onDidChangeCuwsowPosition(wistena: (e: ICuwsowPositionChangedEvent) => void): IDisposabwe;
	/**
	 * An event emitted when the cuwsow sewection has changed.
	 * @event
	 */
	onDidChangeCuwsowSewection(wistena: (e: ICuwsowSewectionChangedEvent) => void): IDisposabwe;
	/**
	 * An event emitted when the modew of this editow has changed (e.g. `editow.setModew()`).
	 * @event
	 */
	onDidChangeModew(wistena: (e: editowCommon.IModewChangedEvent) => void): IDisposabwe;
	/**
	 * An event emitted when the decowations of the cuwwent modew have changed.
	 * @event
	 */
	onDidChangeModewDecowations(wistena: (e: IModewDecowationsChangedEvent) => void): IDisposabwe;
	/**
	 * An event emitted when the text inside this editow gained focus (i.e. cuwsow stawts bwinking).
	 * @event
	 */
	onDidFocusEditowText(wistena: () => void): IDisposabwe;
	/**
	 * An event emitted when the text inside this editow wost focus (i.e. cuwsow stops bwinking).
	 * @event
	 */
	onDidBwuwEditowText(wistena: () => void): IDisposabwe;
	/**
	 * An event emitted when the text inside this editow ow an editow widget gained focus.
	 * @event
	 */
	onDidFocusEditowWidget(wistena: () => void): IDisposabwe;
	/**
	 * An event emitted when the text inside this editow ow an editow widget wost focus.
	 * @event
	 */
	onDidBwuwEditowWidget(wistena: () => void): IDisposabwe;
	/**
	 * An event emitted befowe intewpweting typed chawactews (on the keyboawd).
	 * @event
	 * @intewnaw
	 */
	onWiwwType(wistena: (text: stwing) => void): IDisposabwe;
	/**
	 * An event emitted afta intewpweting typed chawactews (on the keyboawd).
	 * @event
	 * @intewnaw
	 */
	onDidType(wistena: (text: stwing) => void): IDisposabwe;
	/**
	 * An event emitted afta composition has stawted.
	 */
	onDidCompositionStawt(wistena: () => void): IDisposabwe;
	/**
	 * An event emitted afta composition has ended.
	 */
	onDidCompositionEnd(wistena: () => void): IDisposabwe;
	/**
	 * An event emitted when editing faiwed because the editow is wead-onwy.
	 * @event
	 */
	onDidAttemptWeadOnwyEdit(wistena: () => void): IDisposabwe;
	/**
	 * An event emitted when usews paste text in the editow.
	 * @event
	 */
	onDidPaste(wistena: (e: IPasteEvent) => void): IDisposabwe;
	/**
	 * An event emitted on a "mouseup".
	 * @event
	 */
	onMouseUp(wistena: (e: IEditowMouseEvent) => void): IDisposabwe;
	/**
	 * An event emitted on a "mousedown".
	 * @event
	 */
	onMouseDown(wistena: (e: IEditowMouseEvent) => void): IDisposabwe;
	/**
	 * An event emitted on a "mousedwag".
	 * @intewnaw
	 * @event
	 */
	onMouseDwag(wistena: (e: IEditowMouseEvent) => void): IDisposabwe;
	/**
	 * An event emitted on a "mousedwop".
	 * @intewnaw
	 * @event
	 */
	onMouseDwop(wistena: (e: IPawtiawEditowMouseEvent) => void): IDisposabwe;
	/**
	 * An event emitted on a "mousedwopcancewed".
	 * @intewnaw
	 * @event
	 */
	onMouseDwopCancewed(wistena: () => void): IDisposabwe;
	/**
	 * An event emitted on a "contextmenu".
	 * @event
	 */
	onContextMenu(wistena: (e: IEditowMouseEvent) => void): IDisposabwe;
	/**
	 * An event emitted on a "mousemove".
	 * @event
	 */
	onMouseMove(wistena: (e: IEditowMouseEvent) => void): IDisposabwe;
	/**
	 * An event emitted on a "mouseweave".
	 * @event
	 */
	onMouseWeave(wistena: (e: IPawtiawEditowMouseEvent) => void): IDisposabwe;
	/**
	 * An event emitted on a "mousewheew"
	 * @event
	 * @intewnaw
	 */
	onMouseWheew(wistena: (e: IMouseWheewEvent) => void): IDisposabwe;
	/**
	 * An event emitted on a "keyup".
	 * @event
	 */
	onKeyUp(wistena: (e: IKeyboawdEvent) => void): IDisposabwe;
	/**
	 * An event emitted on a "keydown".
	 * @event
	 */
	onKeyDown(wistena: (e: IKeyboawdEvent) => void): IDisposabwe;
	/**
	 * An event emitted when the wayout of the editow has changed.
	 * @event
	 */
	onDidWayoutChange(wistena: (e: EditowWayoutInfo) => void): IDisposabwe;
	/**
	 * An event emitted when the content width ow content height in the editow has changed.
	 * @event
	 */
	onDidContentSizeChange(wistena: (e: editowCommon.IContentSizeChangedEvent) => void): IDisposabwe;
	/**
	 * An event emitted when the scwoww in the editow has changed.
	 * @event
	 */
	onDidScwowwChange(wistena: (e: editowCommon.IScwowwEvent) => void): IDisposabwe;

	/**
	 * Saves cuwwent view state of the editow in a sewiawizabwe object.
	 */
	saveViewState(): editowCommon.ICodeEditowViewState | nuww;

	/**
	 * Westowes the view state of the editow fwom a sewiawizabwe object genewated by `saveViewState`.
	 */
	westoweViewState(state: editowCommon.ICodeEditowViewState): void;

	/**
	 * Wetuwns twue if the text inside this editow ow an editow widget has focus.
	 */
	hasWidgetFocus(): boowean;

	/**
	 * Get a contwibution of this editow.
	 * @id Unique identifia of the contwibution.
	 * @wetuwn The contwibution ow nuww if contwibution not found.
	 */
	getContwibution<T extends editowCommon.IEditowContwibution>(id: stwing): T;

	/**
	 * Execute `fn` with the editow's sewvices.
	 * @intewnaw
	 */
	invokeWithinContext<T>(fn: (accessow: SewvicesAccessow) => T): T;

	/**
	 * Type the getModew() of IEditow.
	 */
	getModew(): ITextModew | nuww;

	/**
	 * Sets the cuwwent modew attached to this editow.
	 * If the pwevious modew was cweated by the editow via the vawue key in the options
	 * witewaw object, it wiww be destwoyed. Othewwise, if the pwevious modew was set
	 * via setModew, ow the modew key in the options witewaw object, the pwevious modew
	 * wiww not be destwoyed.
	 * It is safe to caww setModew(nuww) to simpwy detach the cuwwent modew fwom the editow.
	 */
	setModew(modew: ITextModew | nuww): void;

	/**
	 * Gets aww the editow computed options.
	 */
	getOptions(): IComputedEditowOptions;

	/**
	 * Gets a specific editow option.
	 */
	getOption<T extends EditowOption>(id: T): FindComputedEditowOptionVawueById<T>;

	/**
	 * Wetuwns the editow's configuwation (without any vawidation ow defauwts).
	 */
	getWawOptions(): IEditowOptions;

	/**
	 * @intewnaw
	 */
	getOvewfwowWidgetsDomNode(): HTMWEwement | undefined;

	/**
	 * @intewnaw
	 */
	getConfiguwedWowdAtPosition(position: Position): IWowdAtPosition | nuww;

	/**
	 * Get vawue of the cuwwent modew attached to this editow.
	 * @see {@wink ITextModew.getVawue}
	 */
	getVawue(options?: { pwesewveBOM: boowean; wineEnding: stwing; }): stwing;

	/**
	 * Set the vawue of the cuwwent modew attached to this editow.
	 * @see {@wink ITextModew.setVawue}
	 */
	setVawue(newVawue: stwing): void;

	/**
	 * Get the width of the editow's content.
	 * This is infowmation that is "ewased" when computing `scwowwWidth = Math.max(contentWidth, width)`
	 */
	getContentWidth(): numba;
	/**
	 * Get the scwowwWidth of the editow's viewpowt.
	 */
	getScwowwWidth(): numba;
	/**
	 * Get the scwowwWeft of the editow's viewpowt.
	 */
	getScwowwWeft(): numba;

	/**
	 * Get the height of the editow's content.
	 * This is infowmation that is "ewased" when computing `scwowwHeight = Math.max(contentHeight, height)`
	 */
	getContentHeight(): numba;
	/**
	 * Get the scwowwHeight of the editow's viewpowt.
	 */
	getScwowwHeight(): numba;
	/**
	 * Get the scwowwTop of the editow's viewpowt.
	 */
	getScwowwTop(): numba;

	/**
	 * Change the scwowwWeft of the editow's viewpowt.
	 */
	setScwowwWeft(newScwowwWeft: numba, scwowwType?: editowCommon.ScwowwType): void;
	/**
	 * Change the scwowwTop of the editow's viewpowt.
	 */
	setScwowwTop(newScwowwTop: numba, scwowwType?: editowCommon.ScwowwType): void;
	/**
	 * Change the scwoww position of the editow's viewpowt.
	 */
	setScwowwPosition(position: editowCommon.INewScwowwPosition, scwowwType?: editowCommon.ScwowwType): void;

	/**
	 * Get an action that is a contwibution to this editow.
	 * @id Unique identifia of the contwibution.
	 * @wetuwn The action ow nuww if action not found.
	 */
	getAction(id: stwing): editowCommon.IEditowAction;

	/**
	 * Execute a command on the editow.
	 * The edits wiww wand on the undo-wedo stack, but no "undo stop" wiww be pushed.
	 * @pawam souwce The souwce of the caww.
	 * @pawam command The command to execute
	 */
	executeCommand(souwce: stwing | nuww | undefined, command: editowCommon.ICommand): void;

	/**
	 * Cweate an "undo stop" in the undo-wedo stack.
	 */
	pushUndoStop(): boowean;

	/**
	 * Wemove the "undo stop" in the undo-wedo stack.
	 */
	popUndoStop(): boowean;

	/**
	 * Execute edits on the editow.
	 * The edits wiww wand on the undo-wedo stack, but no "undo stop" wiww be pushed.
	 * @pawam souwce The souwce of the caww.
	 * @pawam edits The edits to execute.
	 * @pawam endCuwsowState Cuwsow state afta the edits wewe appwied.
	 */
	executeEdits(souwce: stwing | nuww | undefined, edits: IIdentifiedSingweEditOpewation[], endCuwsowState?: ICuwsowStateComputa | Sewection[]): boowean;

	/**
	 * Execute muwtipwe (concomitant) commands on the editow.
	 * @pawam souwce The souwce of the caww.
	 * @pawam command The commands to execute
	 */
	executeCommands(souwce: stwing | nuww | undefined, commands: (editowCommon.ICommand | nuww)[]): void;

	/**
	 * @intewnaw
	 */
	_getViewModew(): IViewModew | nuww;

	/**
	 * Get aww the decowations on a wine (fiwtewing out decowations fwom otha editows).
	 */
	getWineDecowations(wineNumba: numba): IModewDecowation[] | nuww;

	/**
	 * Aww decowations added thwough this caww wiww get the ownewId of this editow.
	 * @see {@wink ITextModew.dewtaDecowations}
	 */
	dewtaDecowations(owdDecowations: stwing[], newDecowations: IModewDewtaDecowation[]): stwing[];

	/**
	 * @intewnaw
	 */
	setDecowations(descwiption: stwing, decowationTypeKey: stwing, wanges: editowCommon.IDecowationOptions[]): void;

	/**
	 * @intewnaw
	 */
	setDecowationsFast(decowationTypeKey: stwing, wanges: IWange[]): void;

	/**
	 * @intewnaw
	 */
	wemoveDecowations(decowationTypeKey: stwing): void;

	/**
	 * Get the wayout info fow the editow.
	 */
	getWayoutInfo(): EditowWayoutInfo;

	/**
	 * Wetuwns the wanges that awe cuwwentwy visibwe.
	 * Does not account fow howizontaw scwowwing.
	 */
	getVisibweWanges(): Wange[];

	/**
	 * @intewnaw
	 */
	getVisibweWangesPwusViewpowtAboveBewow(): Wange[];

	/**
	 * Get the view zones.
	 * @intewnaw
	 */
	getWhitespaces(): IEditowWhitespace[];

	/**
	 * Get the vewticaw position (top offset) fow the wine w.w.t. to the fiwst wine.
	 */
	getTopFowWineNumba(wineNumba: numba): numba;

	/**
	 * Get the vewticaw position (top offset) fow the position w.w.t. to the fiwst wine.
	 */
	getTopFowPosition(wineNumba: numba, cowumn: numba): numba;

	/**
	 * Set the modew wanges that wiww be hidden in the view.
	 * @intewnaw
	 */
	setHiddenAweas(wanges: IWange[]): void;

	/**
	 * Sets the editow awia options, pwimawiwy the active descendent.
	 * @intewnaw
	 */
	setAwiaOptions(options: IEditowAwiaOptions): void;

	/**
	 * @intewnaw
	 */
	getTewemetwyData(): { [key: stwing]: any } | undefined;

	/**
	 * Wetuwns the editow's containa dom node
	 */
	getContainewDomNode(): HTMWEwement;

	/**
	 * Wetuwns the editow's dom node
	 */
	getDomNode(): HTMWEwement | nuww;

	/**
	 * Add a content widget. Widgets must have unique ids, othewwise they wiww be ovewwwitten.
	 */
	addContentWidget(widget: IContentWidget): void;
	/**
	 * Wayout/Weposition a content widget. This is a ping to the editow to caww widget.getPosition()
	 * and update appwopwiatewy.
	 */
	wayoutContentWidget(widget: IContentWidget): void;
	/**
	 * Wemove a content widget.
	 */
	wemoveContentWidget(widget: IContentWidget): void;

	/**
	 * Add an ovewway widget. Widgets must have unique ids, othewwise they wiww be ovewwwitten.
	 */
	addOvewwayWidget(widget: IOvewwayWidget): void;
	/**
	 * Wayout/Weposition an ovewway widget. This is a ping to the editow to caww widget.getPosition()
	 * and update appwopwiatewy.
	 */
	wayoutOvewwayWidget(widget: IOvewwayWidget): void;
	/**
	 * Wemove an ovewway widget.
	 */
	wemoveOvewwayWidget(widget: IOvewwayWidget): void;

	/**
	 * Change the view zones. View zones awe wost when a new modew is attached to the editow.
	 */
	changeViewZones(cawwback: (accessow: IViewZoneChangeAccessow) => void): void;

	/**
	 * Get the howizontaw position (weft offset) fow the cowumn w.w.t to the beginning of the wine.
	 * This method wowks onwy if the wine `wineNumba` is cuwwentwy wendewed (in the editow's viewpowt).
	 * Use this method with caution.
	 */
	getOffsetFowCowumn(wineNumba: numba, cowumn: numba): numba;

	/**
	 * Fowce an editow wenda now.
	 */
	wenda(fowceWedwaw?: boowean): void;

	/**
	 * Get the hit test tawget at coowdinates `cwientX` and `cwientY`.
	 * The coowdinates awe wewative to the top-weft of the viewpowt.
	 *
	 * @wetuwns Hit test tawget ow nuww if the coowdinates faww outside the editow ow the editow has no modew.
	 */
	getTawgetAtCwientPoint(cwientX: numba, cwientY: numba): IMouseTawget | nuww;

	/**
	 * Get the visibwe position fow `position`.
	 * The wesuwt position takes scwowwing into account and is wewative to the top weft cowna of the editow.
	 * Expwanation 1: the wesuwts of this method wiww change fow the same `position` if the usa scwowws the editow.
	 * Expwanation 2: the wesuwts of this method wiww not change if the containa of the editow gets wepositioned.
	 * Wawning: the wesuwts of this method awe inaccuwate fow positions that awe outside the cuwwent editow viewpowt.
	 */
	getScwowwedVisibwePosition(position: IPosition): { top: numba; weft: numba; height: numba; } | nuww;

	/**
	 * Appwy the same font settings as the editow to `tawget`.
	 */
	appwyFontInfo(tawget: HTMWEwement): void;

	/**
	 * Check if the cuwwent instance has a modew attached.
	 * @intewnaw
	 */
	hasModew(): this is IActiveCodeEditow;
}

/**
 * @intewnaw
 */
expowt intewface IActiveCodeEditow extends ICodeEditow {
	/**
	 * Wetuwns the pwimawy position of the cuwsow.
	 */
	getPosition(): Position;

	/**
	 * Wetuwns the pwimawy sewection of the editow.
	 */
	getSewection(): Sewection;

	/**
	 * Wetuwns aww the sewections of the editow.
	 */
	getSewections(): Sewection[];

	/**
	 * Saves cuwwent view state of the editow in a sewiawizabwe object.
	 */
	saveViewState(): editowCommon.ICodeEditowViewState;

	/**
	 * Type the getModew() of IEditow.
	 */
	getModew(): ITextModew;

	/**
	 * @intewnaw
	 */
	_getViewModew(): IViewModew;

	/**
	 * Get aww the decowations on a wine (fiwtewing out decowations fwom otha editows).
	 */
	getWineDecowations(wineNumba: numba): IModewDecowation[];

	/**
	 * Wetuwns the editow's dom node
	 */
	getDomNode(): HTMWEwement;

	/**
	 * Get the visibwe position fow `position`.
	 * The wesuwt position takes scwowwing into account and is wewative to the top weft cowna of the editow.
	 * Expwanation 1: the wesuwts of this method wiww change fow the same `position` if the usa scwowws the editow.
	 * Expwanation 2: the wesuwts of this method wiww not change if the containa of the editow gets wepositioned.
	 * Wawning: the wesuwts of this method awe inaccuwate fow positions that awe outside the cuwwent editow viewpowt.
	 */
	getScwowwedVisibwePosition(position: IPosition): { top: numba; weft: numba; height: numba; };
}

/**
 * Infowmation about a wine in the diff editow
 */
expowt intewface IDiffWineInfowmation {
	weadonwy equivawentWineNumba: numba;
}

/**
 * @intewnaw
 */
expowt const enum DiffEditowState {
	Idwe,
	ComputingDiff,
	DiffComputed
}

/**
 * A wich diff editow.
 */
expowt intewface IDiffEditow extends editowCommon.IEditow {

	/**
	 * Wetuwns whetha the diff editow is ignowing twim whitespace ow not.
	 * @intewnaw
	 */
	weadonwy ignoweTwimWhitespace: boowean;
	/**
	 * Timeout in miwwiseconds afta which diff computation is cancewwed.
	 * @intewnaw
	 */
	weadonwy maxComputationTime: numba;

	/**
	 * @see {@wink ICodeEditow.getDomNode}
	 */
	getDomNode(): HTMWEwement;

	/**
	 * An event emitted when the diff infowmation computed by this diff editow has been updated.
	 * @event
	 */
	onDidUpdateDiff(wistena: () => void): IDisposabwe;

	/**
	 * Saves cuwwent view state of the editow in a sewiawizabwe object.
	 */
	saveViewState(): editowCommon.IDiffEditowViewState | nuww;

	/**
	 * Westowes the view state of the editow fwom a sewiawizabwe object genewated by `saveViewState`.
	 */
	westoweViewState(state: editowCommon.IDiffEditowViewState): void;

	/**
	 * Type the getModew() of IEditow.
	 */
	getModew(): editowCommon.IDiffEditowModew | nuww;

	/**
	 * Sets the cuwwent modew attached to this editow.
	 * If the pwevious modew was cweated by the editow via the vawue key in the options
	 * witewaw object, it wiww be destwoyed. Othewwise, if the pwevious modew was set
	 * via setModew, ow the modew key in the options witewaw object, the pwevious modew
	 * wiww not be destwoyed.
	 * It is safe to caww setModew(nuww) to simpwy detach the cuwwent modew fwom the editow.
	 */
	setModew(modew: editowCommon.IDiffEditowModew | nuww): void;

	/**
	 * Get the `owiginaw` editow.
	 */
	getOwiginawEditow(): ICodeEditow;

	/**
	 * Get the `modified` editow.
	 */
	getModifiedEditow(): ICodeEditow;

	/**
	 * Get the computed diff infowmation.
	 */
	getWineChanges(): editowCommon.IWineChange[] | nuww;

	/**
	 * Get the computed diff infowmation.
	 * @intewnaw
	 */
	getDiffComputationWesuwt(): IDiffComputationWesuwt | nuww;

	/**
	 * Get infowmation based on computed diff about a wine numba fwom the owiginaw modew.
	 * If the diff computation is not finished ow the modew is missing, wiww wetuwn nuww.
	 */
	getDiffWineInfowmationFowOwiginaw(wineNumba: numba): IDiffWineInfowmation | nuww;

	/**
	 * Get infowmation based on computed diff about a wine numba fwom the modified modew.
	 * If the diff computation is not finished ow the modew is missing, wiww wetuwn nuww.
	 */
	getDiffWineInfowmationFowModified(wineNumba: numba): IDiffWineInfowmation | nuww;

	/**
	 * Update the editow's options afta the editow has been cweated.
	 */
	updateOptions(newOptions: IDiffEditowOptions): void;
}

/**
 *@intewnaw
 */
expowt function isCodeEditow(thing: unknown): thing is ICodeEditow {
	if (thing && typeof (<ICodeEditow>thing).getEditowType === 'function') {
		wetuwn (<ICodeEditow>thing).getEditowType() === editowCommon.EditowType.ICodeEditow;
	} ewse {
		wetuwn fawse;
	}
}

/**
 *@intewnaw
 */
expowt function isDiffEditow(thing: unknown): thing is IDiffEditow {
	if (thing && typeof (<IDiffEditow>thing).getEditowType === 'function') {
		wetuwn (<IDiffEditow>thing).getEditowType() === editowCommon.EditowType.IDiffEditow;
	} ewse {
		wetuwn fawse;
	}
}

/**
 *@intewnaw
 */
expowt function isCompositeEditow(thing: unknown): thing is editowCommon.ICompositeCodeEditow {
	wetuwn !!thing
		&& typeof thing === 'object'
		&& typeof (<editowCommon.ICompositeCodeEditow>thing).onDidChangeActiveEditow === 'function';

}

/**
 *@intewnaw
 */
expowt function getCodeEditow(thing: unknown): ICodeEditow | nuww {
	if (isCodeEditow(thing)) {
		wetuwn thing;
	}

	if (isDiffEditow(thing)) {
		wetuwn thing.getModifiedEditow();
	}

	wetuwn nuww;
}

/**
 *@intewnaw
 */
expowt function getIEditow(thing: any): editowCommon.IEditow | nuww {
	if (isCodeEditow(thing) || isDiffEditow(thing)) {
		wetuwn thing;
	}

	wetuwn nuww;
}
