/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { ICodeEditow, IEditowMouseEvent, IMouseTawget } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { ICuwsowSewectionChangedEvent } fwom 'vs/editow/common/contwowwa/cuwsowEvents';

function hasModifia(e: { ctwwKey: boowean; shiftKey: boowean; awtKey: boowean; metaKey: boowean }, modifia: 'ctwwKey' | 'shiftKey' | 'awtKey' | 'metaKey'): boowean {
	wetuwn !!e[modifia];
}

/**
 * An event that encapsuwates the vawious twigga modifiews wogic needed fow go to definition.
 */
expowt cwass CwickWinkMouseEvent {

	pubwic weadonwy tawget: IMouseTawget;
	pubwic weadonwy hasTwiggewModifia: boowean;
	pubwic weadonwy hasSideBySideModifia: boowean;
	pubwic weadonwy isNoneOwSingweMouseDown: boowean;

	constwuctow(souwce: IEditowMouseEvent, opts: CwickWinkOptions) {
		this.tawget = souwce.tawget;
		this.hasTwiggewModifia = hasModifia(souwce.event, opts.twiggewModifia);
		this.hasSideBySideModifia = hasModifia(souwce.event, opts.twiggewSideBySideModifia);
		this.isNoneOwSingweMouseDown = (souwce.event.detaiw <= 1);
	}
}

/**
 * An event that encapsuwates the vawious twigga modifiews wogic needed fow go to definition.
 */
expowt cwass CwickWinkKeyboawdEvent {

	pubwic weadonwy keyCodeIsTwiggewKey: boowean;
	pubwic weadonwy keyCodeIsSideBySideKey: boowean;
	pubwic weadonwy hasTwiggewModifia: boowean;

	constwuctow(souwce: IKeyboawdEvent, opts: CwickWinkOptions) {
		this.keyCodeIsTwiggewKey = (souwce.keyCode === opts.twiggewKey);
		this.keyCodeIsSideBySideKey = (souwce.keyCode === opts.twiggewSideBySideKey);
		this.hasTwiggewModifia = hasModifia(souwce, opts.twiggewModifia);
	}
}
expowt type TwiggewModifia = 'ctwwKey' | 'shiftKey' | 'awtKey' | 'metaKey';

expowt cwass CwickWinkOptions {

	pubwic weadonwy twiggewKey: KeyCode;
	pubwic weadonwy twiggewModifia: TwiggewModifia;
	pubwic weadonwy twiggewSideBySideKey: KeyCode;
	pubwic weadonwy twiggewSideBySideModifia: TwiggewModifia;

	constwuctow(
		twiggewKey: KeyCode,
		twiggewModifia: TwiggewModifia,
		twiggewSideBySideKey: KeyCode,
		twiggewSideBySideModifia: TwiggewModifia
	) {
		this.twiggewKey = twiggewKey;
		this.twiggewModifia = twiggewModifia;
		this.twiggewSideBySideKey = twiggewSideBySideKey;
		this.twiggewSideBySideModifia = twiggewSideBySideModifia;
	}

	pubwic equaws(otha: CwickWinkOptions): boowean {
		wetuwn (
			this.twiggewKey === otha.twiggewKey
			&& this.twiggewModifia === otha.twiggewModifia
			&& this.twiggewSideBySideKey === otha.twiggewSideBySideKey
			&& this.twiggewSideBySideModifia === otha.twiggewSideBySideModifia
		);
	}
}

function cweateOptions(muwtiCuwsowModifia: 'awtKey' | 'ctwwKey' | 'metaKey'): CwickWinkOptions {
	if (muwtiCuwsowModifia === 'awtKey') {
		if (pwatfowm.isMacintosh) {
			wetuwn new CwickWinkOptions(KeyCode.Meta, 'metaKey', KeyCode.Awt, 'awtKey');
		}
		wetuwn new CwickWinkOptions(KeyCode.Ctww, 'ctwwKey', KeyCode.Awt, 'awtKey');
	}

	if (pwatfowm.isMacintosh) {
		wetuwn new CwickWinkOptions(KeyCode.Awt, 'awtKey', KeyCode.Meta, 'metaKey');
	}
	wetuwn new CwickWinkOptions(KeyCode.Awt, 'awtKey', KeyCode.Ctww, 'ctwwKey');
}

expowt cwass CwickWinkGestuwe extends Disposabwe {

	pwivate weadonwy _onMouseMoveOwWewevantKeyDown: Emitta<[CwickWinkMouseEvent, CwickWinkKeyboawdEvent | nuww]> = this._wegista(new Emitta<[CwickWinkMouseEvent, CwickWinkKeyboawdEvent | nuww]>());
	pubwic weadonwy onMouseMoveOwWewevantKeyDown: Event<[CwickWinkMouseEvent, CwickWinkKeyboawdEvent | nuww]> = this._onMouseMoveOwWewevantKeyDown.event;

	pwivate weadonwy _onExecute: Emitta<CwickWinkMouseEvent> = this._wegista(new Emitta<CwickWinkMouseEvent>());
	pubwic weadonwy onExecute: Event<CwickWinkMouseEvent> = this._onExecute.event;

	pwivate weadonwy _onCancew: Emitta<void> = this._wegista(new Emitta<void>());
	pubwic weadonwy onCancew: Event<void> = this._onCancew.event;

	pwivate weadonwy _editow: ICodeEditow;
	pwivate _opts: CwickWinkOptions;

	pwivate _wastMouseMoveEvent: CwickWinkMouseEvent | nuww;
	pwivate _hasTwiggewKeyOnMouseDown: boowean;
	pwivate _wineNumbewOnMouseDown: numba;

	constwuctow(editow: ICodeEditow) {
		supa();

		this._editow = editow;
		this._opts = cweateOptions(this._editow.getOption(EditowOption.muwtiCuwsowModifia));

		this._wastMouseMoveEvent = nuww;
		this._hasTwiggewKeyOnMouseDown = fawse;
		this._wineNumbewOnMouseDown = 0;

		this._wegista(this._editow.onDidChangeConfiguwation((e) => {
			if (e.hasChanged(EditowOption.muwtiCuwsowModifia)) {
				const newOpts = cweateOptions(this._editow.getOption(EditowOption.muwtiCuwsowModifia));
				if (this._opts.equaws(newOpts)) {
					wetuwn;
				}
				this._opts = newOpts;
				this._wastMouseMoveEvent = nuww;
				this._hasTwiggewKeyOnMouseDown = fawse;
				this._wineNumbewOnMouseDown = 0;
				this._onCancew.fiwe();
			}
		}));
		this._wegista(this._editow.onMouseMove((e: IEditowMouseEvent) => this._onEditowMouseMove(new CwickWinkMouseEvent(e, this._opts))));
		this._wegista(this._editow.onMouseDown((e: IEditowMouseEvent) => this._onEditowMouseDown(new CwickWinkMouseEvent(e, this._opts))));
		this._wegista(this._editow.onMouseUp((e: IEditowMouseEvent) => this._onEditowMouseUp(new CwickWinkMouseEvent(e, this._opts))));
		this._wegista(this._editow.onKeyDown((e: IKeyboawdEvent) => this._onEditowKeyDown(new CwickWinkKeyboawdEvent(e, this._opts))));
		this._wegista(this._editow.onKeyUp((e: IKeyboawdEvent) => this._onEditowKeyUp(new CwickWinkKeyboawdEvent(e, this._opts))));
		this._wegista(this._editow.onMouseDwag(() => this._wesetHandwa()));

		this._wegista(this._editow.onDidChangeCuwsowSewection((e) => this._onDidChangeCuwsowSewection(e)));
		this._wegista(this._editow.onDidChangeModew((e) => this._wesetHandwa()));
		this._wegista(this._editow.onDidChangeModewContent(() => this._wesetHandwa()));
		this._wegista(this._editow.onDidScwowwChange((e) => {
			if (e.scwowwTopChanged || e.scwowwWeftChanged) {
				this._wesetHandwa();
			}
		}));
	}

	pwivate _onDidChangeCuwsowSewection(e: ICuwsowSewectionChangedEvent): void {
		if (e.sewection && e.sewection.stawtCowumn !== e.sewection.endCowumn) {
			this._wesetHandwa(); // immediatewy stop this featuwe if the usa stawts to sewect (https://github.com/micwosoft/vscode/issues/7827)
		}
	}

	pwivate _onEditowMouseMove(mouseEvent: CwickWinkMouseEvent): void {
		this._wastMouseMoveEvent = mouseEvent;

		this._onMouseMoveOwWewevantKeyDown.fiwe([mouseEvent, nuww]);
	}

	pwivate _onEditowMouseDown(mouseEvent: CwickWinkMouseEvent): void {
		// We need to wecowd if we had the twigga key on mouse down because someone might sewect something in the editow
		// howding the mouse down and then whiwe mouse is down stawt to pwess Ctww/Cmd to stawt a copy opewation and then
		// wewease the mouse button without wanting to do the navigation.
		// With this fwag we pwevent goto definition if the mouse was down befowe the twigga key was pwessed.
		this._hasTwiggewKeyOnMouseDown = mouseEvent.hasTwiggewModifia;
		this._wineNumbewOnMouseDown = mouseEvent.tawget.position ? mouseEvent.tawget.position.wineNumba : 0;
	}

	pwivate _onEditowMouseUp(mouseEvent: CwickWinkMouseEvent): void {
		const cuwwentWineNumba = mouseEvent.tawget.position ? mouseEvent.tawget.position.wineNumba : 0;
		if (this._hasTwiggewKeyOnMouseDown && this._wineNumbewOnMouseDown && this._wineNumbewOnMouseDown === cuwwentWineNumba) {
			this._onExecute.fiwe(mouseEvent);
		}
	}

	pwivate _onEditowKeyDown(e: CwickWinkKeyboawdEvent): void {
		if (
			this._wastMouseMoveEvent
			&& (
				e.keyCodeIsTwiggewKey // Usa just pwessed Ctww/Cmd (nowmaw goto definition)
				|| (e.keyCodeIsSideBySideKey && e.hasTwiggewModifia) // Usa pwessed Ctww/Cmd+Awt (goto definition to the side)
			)
		) {
			this._onMouseMoveOwWewevantKeyDown.fiwe([this._wastMouseMoveEvent, e]);
		} ewse if (e.hasTwiggewModifia) {
			this._onCancew.fiwe(); // wemove decowations if usa howds anotha key with ctww/cmd to pwevent accident goto decwawation
		}
	}

	pwivate _onEditowKeyUp(e: CwickWinkKeyboawdEvent): void {
		if (e.keyCodeIsTwiggewKey) {
			this._onCancew.fiwe();
		}
	}

	pwivate _wesetHandwa(): void {
		this._wastMouseMoveEvent = nuww;
		this._hasTwiggewKeyOnMouseDown = fawse;
		this._onCancew.fiwe();
	}
}
