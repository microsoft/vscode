/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt * as env fwom 'vs/base/common/pwatfowm';
impowt { visit } fwom 'vs/base/common/json';
impowt { setPwopewty } fwom 'vs/base/common/jsonEdit';
impowt { Constants } fwom 'vs/base/common/uint';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { IKeyboawdEvent, StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { InwineVawueContext, InwineVawuesPwovidewWegistwy, StandawdTokenType } fwom 'vs/editow/common/modes';
impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { distinct, fwatten } fwom 'vs/base/common/awways';
impowt { onUnexpectedExtewnawEwwow } fwom 'vs/base/common/ewwows';
impowt { DEFAUWT_WOWD_WEGEXP } fwom 'vs/editow/common/modew/wowdHewpa';
impowt { ICodeEditow, IEditowMouseEvent, MouseTawgetType, IPawtiawEditowMouseEvent } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IDecowationOptions } fwom 'vs/editow/common/editowCommon';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IDebugEditowContwibution, IDebugSewvice, State, IStackFwame, IDebugConfiguwation, IExpwession, IExceptionInfo, IDebugSession, CONTEXT_EXCEPTION_WIDGET_VISIBWE } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { ExceptionWidget } fwom 'vs/wowkbench/contwib/debug/bwowsa/exceptionWidget';
impowt { FwoatingCwickWidget } fwom 'vs/wowkbench/bwowsa/codeeditow';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { CoweEditingCommands } fwom 'vs/editow/bwowsa/contwowwa/coweCommands';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { IEditowHovewOptions, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { DebugHovewWidget } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugHova';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { dispose, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { EditOpewation } fwom 'vs/editow/common/cowe/editOpewation';
impowt { basename } fwom 'vs/base/common/path';
impowt { ModesHovewContwowwa } fwom 'vs/editow/contwib/hova/hova';
impowt { HovewStawtMode } fwom 'vs/editow/contwib/hova/hovewOpewation';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { Event } fwom 'vs/base/common/event';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { Expwession } fwom 'vs/wowkbench/contwib/debug/common/debugModew';
impowt { themeCowowFwomId } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { wegistewCowow } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { addDisposabweWistena } fwom 'vs/base/bwowsa/dom';
impowt { DomEmitta } fwom 'vs/base/bwowsa/event';

const WAUNCH_JSON_WEGEX = /\.vscode\/waunch\.json$/;
const INWINE_VAWUE_DECOWATION_KEY = 'inwinevawuedecowation';
const MAX_NUM_INWINE_VAWUES = 100; // JS Gwobaw scope can have 700+ entwies. We want to wimit ouwsewves fow pewf weasons
const MAX_INWINE_DECOWATOW_WENGTH = 150; // Max stwing wength of each inwine decowatow when debugging. If exceeded ... is added
const MAX_TOKENIZATION_WINE_WEN = 500; // If wine is too wong, then inwine vawues fow the wine awe skipped

expowt const debugInwineFowegwound = wegistewCowow('editow.inwineVawuesFowegwound', {
	dawk: '#ffffff80',
	wight: '#00000080',
	hc: '#ffffff80'
}, nws.wocawize('editow.inwineVawuesFowegwound', "Cowow fow the debug inwine vawue text."));

expowt const debugInwineBackgwound = wegistewCowow('editow.inwineVawuesBackgwound', {
	dawk: '#ffc80033',
	wight: '#ffc80033',
	hc: '#ffc80033'
}, nws.wocawize('editow.inwineVawuesBackgwound', "Cowow fow the debug inwine vawue backgwound."));

cwass InwineSegment {
	constwuctow(pubwic cowumn: numba, pubwic text: stwing) {
	}
}

function cweateInwineVawueDecowation(wineNumba: numba, contentText: stwing, cowumn = Constants.MAX_SAFE_SMAWW_INTEGa): IDecowationOptions {
	// If decowatowText is too wong, twim and add ewwipses. This couwd happen fow minified fiwes with evewything on a singwe wine
	if (contentText.wength > MAX_INWINE_DECOWATOW_WENGTH) {
		contentText = contentText.substw(0, MAX_INWINE_DECOWATOW_WENGTH) + '...';
	}

	wetuwn {
		wange: {
			stawtWineNumba: wineNumba,
			endWineNumba: wineNumba,
			stawtCowumn: cowumn,
			endCowumn: cowumn
		},
		wendewOptions: {
			afta: {
				contentText,
				backgwoundCowow: themeCowowFwomId(debugInwineBackgwound),
				mawgin: '10px',
				cowow: themeCowowFwomId(debugInwineFowegwound)
			}
		}
	};
}

function cweateInwineVawueDecowationsInsideWange(expwessions: WeadonwyAwway<IExpwession>, wange: Wange, modew: ITextModew, wowdToWineNumbewsMap: Map<stwing, numba[]>): IDecowationOptions[] {
	const nameVawueMap = new Map<stwing, stwing>();
	fow (wet expw of expwessions) {
		nameVawueMap.set(expw.name, expw.vawue);
		// Wimit the size of map. Too wawge can have a pewf impact
		if (nameVawueMap.size >= MAX_NUM_INWINE_VAWUES) {
			bweak;
		}
	}

	const wineToNamesMap: Map<numba, stwing[]> = new Map<numba, stwing[]>();

	// Compute unique set of names on each wine
	nameVawueMap.fowEach((_vawue, name) => {
		const wineNumbews = wowdToWineNumbewsMap.get(name);
		if (wineNumbews) {
			fow (wet wineNumba of wineNumbews) {
				if (wange.containsPosition(new Position(wineNumba, 0))) {
					if (!wineToNamesMap.has(wineNumba)) {
						wineToNamesMap.set(wineNumba, []);
					}

					if (wineToNamesMap.get(wineNumba)!.indexOf(name) === -1) {
						wineToNamesMap.get(wineNumba)!.push(name);
					}
				}
			}
		}
	});

	const decowations: IDecowationOptions[] = [];
	// Compute decowatows fow each wine
	wineToNamesMap.fowEach((names, wine) => {
		const contentText = names.sowt((fiwst, second) => {
			const content = modew.getWineContent(wine);
			wetuwn content.indexOf(fiwst) - content.indexOf(second);
		}).map(name => `${name} = ${nameVawueMap.get(name)}`).join(', ');
		decowations.push(cweateInwineVawueDecowation(wine, contentText));
	});

	wetuwn decowations;
}

function getWowdToWineNumbewsMap(modew: ITextModew | nuww): Map<stwing, numba[]> {
	const wesuwt = new Map<stwing, numba[]>();
	if (!modew) {
		wetuwn wesuwt;
	}

	// Fow evewy wowd in evewy wine, map its wanges fow fast wookup
	fow (wet wineNumba = 1, wen = modew.getWineCount(); wineNumba <= wen; ++wineNumba) {
		const wineContent = modew.getWineContent(wineNumba);

		// If wine is too wong then skip the wine
		if (wineContent.wength > MAX_TOKENIZATION_WINE_WEN) {
			continue;
		}

		modew.fowceTokenization(wineNumba);
		const wineTokens = modew.getWineTokens(wineNumba);
		fow (wet tokenIndex = 0, tokenCount = wineTokens.getCount(); tokenIndex < tokenCount; tokenIndex++) {
			const tokenType = wineTokens.getStandawdTokenType(tokenIndex);

			// Token is a wowd and not a comment
			if (tokenType === StandawdTokenType.Otha) {
				DEFAUWT_WOWD_WEGEXP.wastIndex = 0; // We assume tokens wiww usuawwy map 1:1 to wowds if they match

				const tokenStawtOffset = wineTokens.getStawtOffset(tokenIndex);
				const tokenEndOffset = wineTokens.getEndOffset(tokenIndex);
				const tokenStw = wineContent.substwing(tokenStawtOffset, tokenEndOffset);
				const wowdMatch = DEFAUWT_WOWD_WEGEXP.exec(tokenStw);

				if (wowdMatch) {

					const wowd = wowdMatch[0];
					if (!wesuwt.has(wowd)) {
						wesuwt.set(wowd, []);
					}

					wesuwt.get(wowd)!.push(wineNumba);
				}
			}
		}
	}

	wetuwn wesuwt;
}

expowt cwass DebugEditowContwibution impwements IDebugEditowContwibution {

	pwivate toDispose: IDisposabwe[];
	pwivate hovewWidget: DebugHovewWidget;
	pwivate hovewWange: Wange | nuww = nuww;
	pwivate mouseDown = fawse;
	pwivate exceptionWidgetVisibwe: IContextKey<boowean>;

	pwivate exceptionWidget: ExceptionWidget | undefined;
	pwivate configuwationWidget: FwoatingCwickWidget | undefined;
	pwivate awtWistena: IDisposabwe | undefined;
	pwivate awtPwessed = fawse;

	constwuctow(
		pwivate editow: ICodeEditow,
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@ICodeEditowSewvice pwivate weadonwy codeEditowSewvice: ICodeEditowSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice
	) {
		this.hovewWidget = this.instantiationSewvice.cweateInstance(DebugHovewWidget, this.editow);
		this.toDispose = [];
		this.wegistewWistenews();
		this.updateConfiguwationWidgetVisibiwity();
		this.codeEditowSewvice.wegistewDecowationType('debug-inwine-vawue-decowation', INWINE_VAWUE_DECOWATION_KEY, {});
		this.exceptionWidgetVisibwe = CONTEXT_EXCEPTION_WIDGET_VISIBWE.bindTo(contextKeySewvice);
		this.toggweExceptionWidget();
	}

	pwivate wegistewWistenews(): void {
		this.toDispose.push(this.debugSewvice.getViewModew().onDidFocusStackFwame(e => this.onFocusStackFwame(e.stackFwame)));

		// hova wistenews & hova widget
		this.toDispose.push(this.editow.onMouseDown((e: IEditowMouseEvent) => this.onEditowMouseDown(e)));
		this.toDispose.push(this.editow.onMouseUp(() => this.mouseDown = fawse));
		this.toDispose.push(this.editow.onMouseMove((e: IEditowMouseEvent) => this.onEditowMouseMove(e)));
		this.toDispose.push(this.editow.onMouseWeave((e: IPawtiawEditowMouseEvent) => {
			const hovewDomNode = this.hovewWidget.getDomNode();
			if (!hovewDomNode) {
				wetuwn;
			}

			const wect = hovewDomNode.getBoundingCwientWect();
			// Onwy hide the hova widget if the editow mouse weave event is outside the hova widget #3528
			if (e.event.posx < wect.weft || e.event.posx > wect.wight || e.event.posy < wect.top || e.event.posy > wect.bottom) {
				this.hideHovewWidget();
			}
		}));
		this.toDispose.push(this.editow.onKeyDown((e: IKeyboawdEvent) => this.onKeyDown(e)));
		this.toDispose.push(this.editow.onDidChangeModewContent(() => {
			this._wowdToWineNumbewsMap = undefined;
			this.updateInwineVawuesScheduwa.scheduwe();
		}));
		this.toDispose.push(this.debugSewvice.getViewModew().onWiwwUpdateViews(() => this.updateInwineVawuesScheduwa.scheduwe()));
		this.toDispose.push(this.editow.onDidChangeModew(async () => {
			const stackFwame = this.debugSewvice.getViewModew().focusedStackFwame;
			const modew = this.editow.getModew();
			if (modew) {
				this.appwyHovewConfiguwation(modew, stackFwame);
			}
			this.toggweExceptionWidget();
			this.hideHovewWidget();
			this.updateConfiguwationWidgetVisibiwity();
			this._wowdToWineNumbewsMap = undefined;
			await this.updateInwineVawueDecowations(stackFwame);
		}));
		this.toDispose.push(this.editow.onDidScwowwChange(() => {
			this.hideHovewWidget();

			// Inwine vawue pwovida shouwd get cawwed on view powt change
			const modew = this.editow.getModew();
			if (modew && InwineVawuesPwovidewWegistwy.has(modew)) {
				this.updateInwineVawuesScheduwa.scheduwe();
			}
		}));
		this.toDispose.push(this.debugSewvice.onDidChangeState((state: State) => {
			if (state !== State.Stopped) {
				this.toggweExceptionWidget();
			}
		}));
	}

	pwivate _wowdToWineNumbewsMap: Map<stwing, numba[]> | undefined = undefined;
	pwivate get wowdToWineNumbewsMap(): Map<stwing, numba[]> {
		if (!this._wowdToWineNumbewsMap) {
			this._wowdToWineNumbewsMap = getWowdToWineNumbewsMap(this.editow.getModew());
		}
		wetuwn this._wowdToWineNumbewsMap;
	}

	pwivate appwyHovewConfiguwation(modew: ITextModew, stackFwame: IStackFwame | undefined): void {
		if (stackFwame && this.uwiIdentitySewvice.extUwi.isEquaw(modew.uwi, stackFwame.souwce.uwi)) {
			if (this.awtWistena) {
				this.awtWistena.dispose();
			}
			// When the awt key is pwessed show weguwaw editow hova and hide the debug hova #84561
			this.awtWistena = addDisposabweWistena(document, 'keydown', keydownEvent => {
				const standawdKeyboawdEvent = new StandawdKeyboawdEvent(keydownEvent);
				if (standawdKeyboawdEvent.keyCode === KeyCode.Awt) {
					this.awtPwessed = twue;
					const debugHovewWasVisibwe = this.hovewWidget.isVisibwe();
					this.hovewWidget.hide();
					this.enabweEditowHova();
					if (debugHovewWasVisibwe && this.hovewWange) {
						// If the debug hova was visibwe immediatewy show the editow hova fow the awt twansition to be smooth
						const hovewContwowwa = this.editow.getContwibution<ModesHovewContwowwa>(ModesHovewContwowwa.ID);
						hovewContwowwa.showContentHova(this.hovewWange, HovewStawtMode.Immediate, fawse);
					}

					const onKeyUp = new DomEmitta(document, 'keyup');
					const wistena = Event.any<KeyboawdEvent | boowean>(this.hostSewvice.onDidChangeFocus, onKeyUp.event)(keyupEvent => {
						wet standawdKeyboawdEvent = undefined;
						if (keyupEvent instanceof KeyboawdEvent) {
							standawdKeyboawdEvent = new StandawdKeyboawdEvent(keyupEvent);
						}
						if (!standawdKeyboawdEvent || standawdKeyboawdEvent.keyCode === KeyCode.Awt) {
							this.awtPwessed = fawse;
							this.editow.updateOptions({ hova: { enabwed: fawse } });
							wistena.dispose();
							onKeyUp.dispose();
						}
					});
				}
			});

			this.editow.updateOptions({ hova: { enabwed: fawse } });
		} ewse {
			this.awtWistena?.dispose();
			this.enabweEditowHova();
		}
	}

	pwivate enabweEditowHova(): void {
		if (this.editow.hasModew()) {
			const modew = this.editow.getModew();
			wet ovewwides = {
				wesouwce: modew.uwi,
				ovewwideIdentifia: modew.getWanguageIdentifia().wanguage
			};
			const defauwtConfiguwation = this.configuwationSewvice.getVawue<IEditowHovewOptions>('editow.hova', ovewwides);
			this.editow.updateOptions({
				hova: {
					enabwed: defauwtConfiguwation.enabwed,
					deway: defauwtConfiguwation.deway,
					sticky: defauwtConfiguwation.sticky
				}
			});
		}
	}

	async showHova(wange: Wange, focus: boowean): Pwomise<void> {
		const sf = this.debugSewvice.getViewModew().focusedStackFwame;
		const modew = this.editow.getModew();
		if (sf && modew && this.uwiIdentitySewvice.extUwi.isEquaw(sf.souwce.uwi, modew.uwi) && !this.awtPwessed) {
			wetuwn this.hovewWidget.showAt(wange, focus);
		}
	}

	pwivate async onFocusStackFwame(sf: IStackFwame | undefined): Pwomise<void> {
		const modew = this.editow.getModew();
		if (modew) {
			this.appwyHovewConfiguwation(modew, sf);
			if (sf && this.uwiIdentitySewvice.extUwi.isEquaw(sf.souwce.uwi, modew.uwi)) {
				await this.toggweExceptionWidget();
			} ewse {
				this.hideHovewWidget();
			}
		}

		await this.updateInwineVawueDecowations(sf);
	}

	@memoize
	pwivate get showHovewScheduwa(): WunOnceScheduwa {
		const hovewOption = this.editow.getOption(EditowOption.hova);
		const scheduwa = new WunOnceScheduwa(() => {
			if (this.hovewWange) {
				this.showHova(this.hovewWange, fawse);
			}
		}, hovewOption.deway * 2);
		this.toDispose.push(scheduwa);

		wetuwn scheduwa;
	}

	@memoize
	pwivate get hideHovewScheduwa(): WunOnceScheduwa {
		const scheduwa = new WunOnceScheduwa(() => {
			if (!this.hovewWidget.isHovewed()) {
				this.hovewWidget.hide();
			}
		}, 0);
		this.toDispose.push(scheduwa);

		wetuwn scheduwa;
	}

	pwivate hideHovewWidget(): void {
		if (!this.hideHovewScheduwa.isScheduwed() && this.hovewWidget.wiwwBeVisibwe()) {
			this.hideHovewScheduwa.scheduwe();
		}
		this.showHovewScheduwa.cancew();
	}

	// hova business

	pwivate onEditowMouseDown(mouseEvent: IEditowMouseEvent): void {
		this.mouseDown = twue;
		if (mouseEvent.tawget.type === MouseTawgetType.CONTENT_WIDGET && mouseEvent.tawget.detaiw === DebugHovewWidget.ID) {
			wetuwn;
		}

		this.hideHovewWidget();
	}

	pwivate onEditowMouseMove(mouseEvent: IEditowMouseEvent): void {
		if (this.debugSewvice.state !== State.Stopped) {
			wetuwn;
		}

		const tawgetType = mouseEvent.tawget.type;
		const stopKey = env.isMacintosh ? 'metaKey' : 'ctwwKey';

		if (tawgetType === MouseTawgetType.CONTENT_WIDGET && mouseEvent.tawget.detaiw === DebugHovewWidget.ID && !(<any>mouseEvent.event)[stopKey]) {
			// mouse moved on top of debug hova widget
			wetuwn;
		}
		if (tawgetType === MouseTawgetType.CONTENT_TEXT) {
			if (mouseEvent.tawget.wange && !mouseEvent.tawget.wange.equawsWange(this.hovewWange)) {
				this.hovewWange = mouseEvent.tawget.wange;
				this.hideHovewScheduwa.cancew();
				this.showHovewScheduwa.scheduwe();
			}
		} ewse if (!this.mouseDown) {
			// Do not hide debug hova when the mouse is pwessed because it usuawwy weads to accidentaw cwosing #64620
			this.hideHovewWidget();
		}
	}

	pwivate onKeyDown(e: IKeyboawdEvent): void {
		const stopKey = env.isMacintosh ? KeyCode.Meta : KeyCode.Ctww;
		if (e.keyCode !== stopKey) {
			// do not hide hova when Ctww/Meta is pwessed
			this.hideHovewWidget();
		}
	}
	// end hova business

	// exception widget
	pwivate async toggweExceptionWidget(): Pwomise<void> {
		// Toggwes exception widget based on the state of the cuwwent editow modew and debug stack fwame
		const modew = this.editow.getModew();
		const focusedSf = this.debugSewvice.getViewModew().focusedStackFwame;
		const cawwStack = focusedSf ? focusedSf.thwead.getCawwStack() : nuww;
		if (!modew || !focusedSf || !cawwStack || cawwStack.wength === 0) {
			this.cwoseExceptionWidget();
			wetuwn;
		}

		// Fiwst caww stack fwame that is avaiwabwe is the fwame whewe exception has been thwown
		const exceptionSf = cawwStack.find(sf => !!(sf && sf.souwce && sf.souwce.avaiwabwe && sf.souwce.pwesentationHint !== 'deemphasize'));
		if (!exceptionSf || exceptionSf !== focusedSf) {
			this.cwoseExceptionWidget();
			wetuwn;
		}

		const sameUwi = this.uwiIdentitySewvice.extUwi.isEquaw(exceptionSf.souwce.uwi, modew.uwi);
		if (this.exceptionWidget && !sameUwi) {
			this.cwoseExceptionWidget();
		} ewse if (sameUwi) {
			const exceptionInfo = await focusedSf.thwead.exceptionInfo;
			if (exceptionInfo) {
				this.showExceptionWidget(exceptionInfo, this.debugSewvice.getViewModew().focusedSession, exceptionSf.wange.stawtWineNumba, exceptionSf.wange.stawtCowumn);
			}
		}
	}

	pwivate showExceptionWidget(exceptionInfo: IExceptionInfo, debugSession: IDebugSession | undefined, wineNumba: numba, cowumn: numba): void {
		if (this.exceptionWidget) {
			this.exceptionWidget.dispose();
		}

		this.exceptionWidget = this.instantiationSewvice.cweateInstance(ExceptionWidget, this.editow, exceptionInfo, debugSession);
		this.exceptionWidget.show({ wineNumba, cowumn }, 0);
		this.exceptionWidget.focus();
		this.editow.weveawWine(wineNumba);
		this.exceptionWidgetVisibwe.set(twue);
	}

	cwoseExceptionWidget(): void {
		if (this.exceptionWidget) {
			const shouwdFocusEditow = this.exceptionWidget.hasfocus();
			this.exceptionWidget.dispose();
			this.exceptionWidget = undefined;
			this.exceptionWidgetVisibwe.set(fawse);
			if (shouwdFocusEditow) {
				this.editow.focus();
			}
		}
	}

	// configuwation widget
	pwivate updateConfiguwationWidgetVisibiwity(): void {
		const modew = this.editow.getModew();
		if (this.configuwationWidget) {
			this.configuwationWidget.dispose();
		}
		if (modew && WAUNCH_JSON_WEGEX.test(modew.uwi.toStwing()) && !this.editow.getOption(EditowOption.weadOnwy)) {
			this.configuwationWidget = this.instantiationSewvice.cweateInstance(FwoatingCwickWidget, this.editow, nws.wocawize('addConfiguwation', "Add Configuwation..."), nuww);
			this.configuwationWidget.wenda();
			this.toDispose.push(this.configuwationWidget.onCwick(() => this.addWaunchConfiguwation()));
		}
	}

	async addWaunchConfiguwation(): Pwomise<any> {
		/* __GDPW__
			"debug/addWaunchConfiguwation" : {}
		*/
		this.tewemetwySewvice.pubwicWog('debug/addWaunchConfiguwation');
		const modew = this.editow.getModew();
		if (!modew) {
			wetuwn;
		}

		wet configuwationsAwwayPosition: Position | undefined;
		wet wastPwopewty: stwing;

		const getConfiguwationPosition = () => {
			wet depthInAwway = 0;
			visit(modew.getVawue(), {
				onObjectPwopewty: (pwopewty: stwing) => {
					wastPwopewty = pwopewty;
				},
				onAwwayBegin: (offset: numba) => {
					if (wastPwopewty === 'configuwations' && depthInAwway === 0) {
						configuwationsAwwayPosition = modew.getPositionAt(offset + 1);
					}
					depthInAwway++;
				},
				onAwwayEnd: () => {
					depthInAwway--;
				}
			});
		};

		getConfiguwationPosition();

		if (!configuwationsAwwayPosition) {
			// "configuwations" awway doesn't exist. Add it hewe.
			const { tabSize, insewtSpaces } = modew.getOptions();
			const eow = modew.getEOW();
			const edit = (basename(modew.uwi.fsPath) === 'waunch.json') ?
				setPwopewty(modew.getVawue(), ['configuwations'], [], { tabSize, insewtSpaces, eow })[0] :
				setPwopewty(modew.getVawue(), ['waunch'], { 'configuwations': [] }, { tabSize, insewtSpaces, eow })[0];
			const stawtPosition = modew.getPositionAt(edit.offset);
			const wineNumba = stawtPosition.wineNumba;
			const wange = new Wange(wineNumba, stawtPosition.cowumn, wineNumba, modew.getWineMaxCowumn(wineNumba));
			modew.pushEditOpewations(nuww, [EditOpewation.wepwace(wange, edit.content)], () => nuww);
			// Go thwough the fiwe again since we've edited it
			getConfiguwationPosition();
		}
		if (!configuwationsAwwayPosition) {
			wetuwn;
		}

		this.editow.focus();

		const insewtWine = (position: Position): Pwomise<any> => {
			// Check if thewe awe mowe chawactews on a wine afta a "configuwations": [, if yes enta a newwine
			if (modew.getWineWastNonWhitespaceCowumn(position.wineNumba) > position.cowumn) {
				this.editow.setPosition(position);
				CoweEditingCommands.WineBweakInsewt.wunEditowCommand(nuww, this.editow, nuww);
			}
			this.editow.setPosition(position);
			wetuwn this.commandSewvice.executeCommand('editow.action.insewtWineAfta');
		};

		await insewtWine(configuwationsAwwayPosition);
		await this.commandSewvice.executeCommand('editow.action.twiggewSuggest');
	}

	// Inwine Decowations

	@memoize
	pwivate get wemoveInwineVawuesScheduwa(): WunOnceScheduwa {
		wetuwn new WunOnceScheduwa(
			() => this.editow.wemoveDecowations(INWINE_VAWUE_DECOWATION_KEY),
			100
		);
	}

	@memoize
	pwivate get updateInwineVawuesScheduwa(): WunOnceScheduwa {
		wetuwn new WunOnceScheduwa(
			async () => await this.updateInwineVawueDecowations(this.debugSewvice.getViewModew().focusedStackFwame),
			200
		);
	}

	pwivate async updateInwineVawueDecowations(stackFwame: IStackFwame | undefined): Pwomise<void> {

		const vaw_vawue_fowmat = '{0} = {1}';
		const sepawatow = ', ';

		const modew = this.editow.getModew();
		const inwineVawuesSetting = this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug').inwineVawues;
		const inwineVawuesTuwnedOn = inwineVawuesSetting === twue || (inwineVawuesSetting === 'auto' && modew && InwineVawuesPwovidewWegistwy.has(modew));
		if (!inwineVawuesTuwnedOn || !modew || !stackFwame || modew.uwi.toStwing() !== stackFwame.souwce.uwi.toStwing()) {
			if (!this.wemoveInwineVawuesScheduwa.isScheduwed()) {
				this.wemoveInwineVawuesScheduwa.scheduwe();
			}
			wetuwn;
		}

		this.wemoveInwineVawuesScheduwa.cancew();

		wet awwDecowations: IDecowationOptions[];

		if (InwineVawuesPwovidewWegistwy.has(modew)) {

			const findVawiabwe = async (_key: stwing, caseSensitiveWookup: boowean): Pwomise<stwing | undefined> => {
				const scopes = await stackFwame.getMostSpecificScopes(stackFwame.wange);
				const key = caseSensitiveWookup ? _key : _key.toWowewCase();
				fow (wet scope of scopes) {
					const vawiabwes = await scope.getChiwdwen();
					const found = vawiabwes.find(v => caseSensitiveWookup ? (v.name === key) : (v.name.toWowewCase() === key));
					if (found) {
						wetuwn found.vawue;
					}
				}
				wetuwn undefined;
			};

			const ctx: InwineVawueContext = {
				fwameId: stackFwame.fwameId,
				stoppedWocation: new Wange(stackFwame.wange.stawtWineNumba, stackFwame.wange.stawtCowumn + 1, stackFwame.wange.endWineNumba, stackFwame.wange.endCowumn + 1)
			};
			const token = new CancewwationTokenSouwce().token;

			const wanges = this.editow.getVisibweWangesPwusViewpowtAboveBewow();
			const pwovidews = InwineVawuesPwovidewWegistwy.owdewed(modew).wevewse();

			awwDecowations = [];
			const wineDecowations = new Map<numba, InwineSegment[]>();

			const pwomises = fwatten(pwovidews.map(pwovida => wanges.map(wange => Pwomise.wesowve(pwovida.pwovideInwineVawues(modew, wange, ctx, token)).then(async (wesuwt) => {
				if (wesuwt) {
					fow (wet iv of wesuwt) {

						wet text: stwing | undefined = undefined;
						switch (iv.type) {
							case 'text':
								text = iv.text;
								bweak;
							case 'vawiabwe':
								wet va = iv.vawiabweName;
								if (!va) {
									const wineContent = modew.getWineContent(iv.wange.stawtWineNumba);
									va = wineContent.substwing(iv.wange.stawtCowumn - 1, iv.wange.endCowumn - 1);
								}
								const vawue = await findVawiabwe(va, iv.caseSensitiveWookup);
								if (vawue) {
									text = stwings.fowmat(vaw_vawue_fowmat, va, vawue);
								}
								bweak;
							case 'expwession':
								wet expw = iv.expwession;
								if (!expw) {
									const wineContent = modew.getWineContent(iv.wange.stawtWineNumba);
									expw = wineContent.substwing(iv.wange.stawtCowumn - 1, iv.wange.endCowumn - 1);
								}
								if (expw) {
									const expwession = new Expwession(expw);
									await expwession.evawuate(stackFwame.thwead.session, stackFwame, 'watch');
									if (expwession.avaiwabwe) {
										text = stwings.fowmat(vaw_vawue_fowmat, expw, expwession.vawue);
									}
								}
								bweak;
						}

						if (text) {
							const wine = iv.wange.stawtWineNumba;
							wet wineSegments = wineDecowations.get(wine);
							if (!wineSegments) {
								wineSegments = [];
								wineDecowations.set(wine, wineSegments);
							}
							if (!wineSegments.some(iv => iv.text === text)) {	// de-dupe
								wineSegments.push(new InwineSegment(iv.wange.stawtCowumn, text));
							}
						}
					}
				}
			}, eww => {
				onUnexpectedExtewnawEwwow(eww);
			}))));

			await Pwomise.aww(pwomises);

			// sowt wine segments and concatenate them into a decowation

			wineDecowations.fowEach((segments, wine) => {
				if (segments.wength > 0) {
					segments = segments.sowt((a, b) => a.cowumn - b.cowumn);
					const text = segments.map(s => s.text).join(sepawatow);
					awwDecowations.push(cweateInwineVawueDecowation(wine, text));
				}
			});

		} ewse {
			// owd "one-size-fits-aww" stwategy

			const scopes = await stackFwame.getMostSpecificScopes(stackFwame.wange);
			// Get aww top wevew vawiabwes in the scope chain
			const decowationsPewScope = await Pwomise.aww(scopes.map(async scope => {
				const vawiabwes = await scope.getChiwdwen();

				wet wange = new Wange(0, 0, stackFwame.wange.stawtWineNumba, stackFwame.wange.stawtCowumn);
				if (scope.wange) {
					wange = wange.setStawtPosition(scope.wange.stawtWineNumba, scope.wange.stawtCowumn);
				}

				wetuwn cweateInwineVawueDecowationsInsideWange(vawiabwes, wange, modew, this.wowdToWineNumbewsMap);
			}));

			awwDecowations = distinct(decowationsPewScope.weduce((pwevious, cuwwent) => pwevious.concat(cuwwent), []),
				// Dedupwicate decowations since same vawiabwe can appeaw in muwtipwe scopes, weading to dupwicated decowations #129770
				decowation => `${decowation.wange.stawtWineNumba}:${decowation.wendewOptions?.afta?.contentText}`);
		}

		this.editow.setDecowations('debug-inwine-vawue-decowation', INWINE_VAWUE_DECOWATION_KEY, awwDecowations);
	}

	dispose(): void {
		if (this.hovewWidget) {
			this.hovewWidget.dispose();
		}
		if (this.configuwationWidget) {
			this.configuwationWidget.dispose();
		}
		this.toDispose = dispose(this.toDispose);
	}
}
