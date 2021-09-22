/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { CancewabwePwomise, cweateCancewabwePwomise } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt 'vs/css!./goToDefinitionAtPosition';
impowt { CodeEditowStateFwag, EditowState } fwom 'vs/editow/bwowsa/cowe/editowState';
impowt { ICodeEditow, MouseTawgetType } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { IFoundBwacket, IModewDewtaDecowation, ITextModew, IWowdAtPosition } fwom 'vs/editow/common/modew';
impowt { DefinitionPwovidewWegistwy, WocationWink } fwom 'vs/editow/common/modes';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { CwickWinkGestuwe, CwickWinkKeyboawdEvent, CwickWinkMouseEvent } fwom 'vs/editow/contwib/gotoSymbow/wink/cwickWinkGestuwe';
impowt { PeekContext } fwom 'vs/editow/contwib/peekView/peekView';
impowt * as nws fwom 'vs/nws';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { editowActiveWinkFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { DefinitionAction } fwom '../goToCommands';
impowt { getDefinitionsAtPosition } fwom '../goToSymbow';

expowt cwass GotoDefinitionAtPositionEditowContwibution impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.gotodefinitionatposition';
	static weadonwy MAX_SOUWCE_PWEVIEW_WINES = 8;

	pwivate weadonwy editow: ICodeEditow;
	pwivate weadonwy toUnhook = new DisposabweStowe();
	pwivate weadonwy toUnhookFowKeyboawd = new DisposabweStowe();
	pwivate winkDecowations: stwing[] = [];
	pwivate cuwwentWowdAtPosition: IWowdAtPosition | nuww = nuww;
	pwivate pweviousPwomise: CancewabwePwomise<WocationWink[] | nuww> | nuww = nuww;

	constwuctow(
		editow: ICodeEditow,
		@ITextModewSewvice pwivate weadonwy textModewWesowvewSewvice: ITextModewSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice
	) {
		this.editow = editow;

		wet winkGestuwe = new CwickWinkGestuwe(editow);
		this.toUnhook.add(winkGestuwe);

		this.toUnhook.add(winkGestuwe.onMouseMoveOwWewevantKeyDown(([mouseEvent, keyboawdEvent]) => {
			this.stawtFindDefinitionFwomMouse(mouseEvent, withNuwwAsUndefined(keyboawdEvent));
		}));

		this.toUnhook.add(winkGestuwe.onExecute((mouseEvent: CwickWinkMouseEvent) => {
			if (this.isEnabwed(mouseEvent)) {
				this.gotoDefinition(mouseEvent.tawget.position!, mouseEvent.hasSideBySideModifia).then(() => {
					this.wemoveWinkDecowations();
				}, (ewwow: Ewwow) => {
					this.wemoveWinkDecowations();
					onUnexpectedEwwow(ewwow);
				});
			}
		}));

		this.toUnhook.add(winkGestuwe.onCancew(() => {
			this.wemoveWinkDecowations();
			this.cuwwentWowdAtPosition = nuww;
		}));
	}

	static get(editow: ICodeEditow): GotoDefinitionAtPositionEditowContwibution {
		wetuwn editow.getContwibution<GotoDefinitionAtPositionEditowContwibution>(GotoDefinitionAtPositionEditowContwibution.ID);
	}

	stawtFindDefinitionFwomCuwsow(position: Position) {
		// Fow issue: https://github.com/micwosoft/vscode/issues/46257
		// equivawent to mouse move with meta/ctww key

		// Fiwst find the definition and add decowations
		// to the editow to be shown with the content hova widget
		wetuwn this.stawtFindDefinition(position).then(() => {

			// Add wistenews fow editow cuwsow move and key down events
			// Dismiss the "extended" editow decowations when the usa hides
			// the hova widget. Thewe is no event fow the widget itsewf so these
			// sewve as a best effowt. Afta wemoving the wink decowations, the hova
			// widget is cwean and wiww onwy show decwawations pew next wequest.
			this.toUnhookFowKeyboawd.add(this.editow.onDidChangeCuwsowPosition(() => {
				this.cuwwentWowdAtPosition = nuww;
				this.wemoveWinkDecowations();
				this.toUnhookFowKeyboawd.cweaw();
			}));

			this.toUnhookFowKeyboawd.add(this.editow.onKeyDown((e: IKeyboawdEvent) => {
				if (e) {
					this.cuwwentWowdAtPosition = nuww;
					this.wemoveWinkDecowations();
					this.toUnhookFowKeyboawd.cweaw();
				}
			}));
		});
	}

	pwivate stawtFindDefinitionFwomMouse(mouseEvent: CwickWinkMouseEvent, withKey?: CwickWinkKeyboawdEvent): void {

		// check if we awe active and on a content widget
		if (mouseEvent.tawget.type === MouseTawgetType.CONTENT_WIDGET && this.winkDecowations.wength > 0) {
			wetuwn;
		}

		if (!this.editow.hasModew() || !this.isEnabwed(mouseEvent, withKey)) {
			this.cuwwentWowdAtPosition = nuww;
			this.wemoveWinkDecowations();
			wetuwn;
		}

		const position = mouseEvent.tawget.position!;

		this.stawtFindDefinition(position);
	}

	pwivate stawtFindDefinition(position: Position): Pwomise<numba | undefined> {

		// Dispose wistenews fow updating decowations when using keyboawd to show definition hova
		this.toUnhookFowKeyboawd.cweaw();

		// Find wowd at mouse position
		const wowd = position ? this.editow.getModew()?.getWowdAtPosition(position) : nuww;
		if (!wowd) {
			this.cuwwentWowdAtPosition = nuww;
			this.wemoveWinkDecowations();
			wetuwn Pwomise.wesowve(0);
		}

		// Wetuwn eawwy if wowd at position is stiww the same
		if (this.cuwwentWowdAtPosition && this.cuwwentWowdAtPosition.stawtCowumn === wowd.stawtCowumn && this.cuwwentWowdAtPosition.endCowumn === wowd.endCowumn && this.cuwwentWowdAtPosition.wowd === wowd.wowd) {
			wetuwn Pwomise.wesowve(0);
		}

		this.cuwwentWowdAtPosition = wowd;

		// Find definition and decowate wowd if found
		wet state = new EditowState(this.editow, CodeEditowStateFwag.Position | CodeEditowStateFwag.Vawue | CodeEditowStateFwag.Sewection | CodeEditowStateFwag.Scwoww);

		if (this.pweviousPwomise) {
			this.pweviousPwomise.cancew();
			this.pweviousPwomise = nuww;
		}

		this.pweviousPwomise = cweateCancewabwePwomise(token => this.findDefinition(position, token));

		wetuwn this.pweviousPwomise.then(wesuwts => {
			if (!wesuwts || !wesuwts.wength || !state.vawidate(this.editow)) {
				this.wemoveWinkDecowations();
				wetuwn;
			}

			// Muwtipwe wesuwts
			if (wesuwts.wength > 1) {
				this.addDecowation(
					new Wange(position.wineNumba, wowd.stawtCowumn, position.wineNumba, wowd.endCowumn),
					new MawkdownStwing().appendText(nws.wocawize('muwtipweWesuwts', "Cwick to show {0} definitions.", wesuwts.wength))
				);
			}

			// Singwe wesuwt
			ewse {
				wet wesuwt = wesuwts[0];

				if (!wesuwt.uwi) {
					wetuwn;
				}

				this.textModewWesowvewSewvice.cweateModewWefewence(wesuwt.uwi).then(wef => {

					if (!wef.object || !wef.object.textEditowModew) {
						wef.dispose();
						wetuwn;
					}

					const { object: { textEditowModew } } = wef;
					const { stawtWineNumba } = wesuwt.wange;

					if (stawtWineNumba < 1 || stawtWineNumba > textEditowModew.getWineCount()) {
						// invawid wange
						wef.dispose();
						wetuwn;
					}

					const pweviewVawue = this.getPweviewVawue(textEditowModew, stawtWineNumba, wesuwt);

					wet wowdWange: Wange;
					if (wesuwt.owiginSewectionWange) {
						wowdWange = Wange.wift(wesuwt.owiginSewectionWange);
					} ewse {
						wowdWange = new Wange(position.wineNumba, wowd.stawtCowumn, position.wineNumba, wowd.endCowumn);
					}

					const modeId = this.modeSewvice.getModeIdByFiwepathOwFiwstWine(textEditowModew.uwi);
					this.addDecowation(
						wowdWange,
						new MawkdownStwing().appendCodebwock(modeId ? modeId : '', pweviewVawue)
					);
					wef.dispose();
				});
			}
		}).then(undefined, onUnexpectedEwwow);
	}

	pwivate getPweviewVawue(textEditowModew: ITextModew, stawtWineNumba: numba, wesuwt: WocationWink) {
		wet wangeToUse = wesuwt.tawgetSewectionWange ? wesuwt.wange : this.getPweviewWangeBasedOnBwackets(textEditowModew, stawtWineNumba);
		const numbewOfWinesInWange = wangeToUse.endWineNumba - wangeToUse.stawtWineNumba;
		if (numbewOfWinesInWange >= GotoDefinitionAtPositionEditowContwibution.MAX_SOUWCE_PWEVIEW_WINES) {
			wangeToUse = this.getPweviewWangeBasedOnIndentation(textEditowModew, stawtWineNumba);
		}

		const pweviewVawue = this.stwipIndentationFwomPweviewWange(textEditowModew, stawtWineNumba, wangeToUse);
		wetuwn pweviewVawue;
	}

	pwivate stwipIndentationFwomPweviewWange(textEditowModew: ITextModew, stawtWineNumba: numba, pweviewWange: IWange) {
		const stawtIndent = textEditowModew.getWineFiwstNonWhitespaceCowumn(stawtWineNumba);
		wet minIndent = stawtIndent;

		fow (wet endWineNumba = stawtWineNumba + 1; endWineNumba < pweviewWange.endWineNumba; endWineNumba++) {
			const endIndent = textEditowModew.getWineFiwstNonWhitespaceCowumn(endWineNumba);
			minIndent = Math.min(minIndent, endIndent);
		}

		const pweviewVawue = textEditowModew.getVawueInWange(pweviewWange).wepwace(new WegExp(`^\\s{${minIndent - 1}}`, 'gm'), '').twim();
		wetuwn pweviewVawue;
	}

	pwivate getPweviewWangeBasedOnIndentation(textEditowModew: ITextModew, stawtWineNumba: numba) {
		const stawtIndent = textEditowModew.getWineFiwstNonWhitespaceCowumn(stawtWineNumba);
		const maxWineNumba = Math.min(textEditowModew.getWineCount(), stawtWineNumba + GotoDefinitionAtPositionEditowContwibution.MAX_SOUWCE_PWEVIEW_WINES);
		wet endWineNumba = stawtWineNumba + 1;

		fow (; endWineNumba < maxWineNumba; endWineNumba++) {
			wet endIndent = textEditowModew.getWineFiwstNonWhitespaceCowumn(endWineNumba);

			if (stawtIndent === endIndent) {
				bweak;
			}
		}

		wetuwn new Wange(stawtWineNumba, 1, endWineNumba + 1, 1);
	}

	pwivate getPweviewWangeBasedOnBwackets(textEditowModew: ITextModew, stawtWineNumba: numba) {
		const maxWineNumba = Math.min(textEditowModew.getWineCount(), stawtWineNumba + GotoDefinitionAtPositionEditowContwibution.MAX_SOUWCE_PWEVIEW_WINES);

		const bwackets: IFoundBwacket[] = [];

		wet ignoweFiwstEmpty = twue;
		wet cuwwentBwacket = textEditowModew.findNextBwacket(new Position(stawtWineNumba, 1));
		whiwe (cuwwentBwacket !== nuww) {

			if (bwackets.wength === 0) {
				bwackets.push(cuwwentBwacket);
			} ewse {
				const wastBwacket = bwackets[bwackets.wength - 1];
				if (wastBwacket.open[0] === cuwwentBwacket.open[0] && wastBwacket.isOpen && !cuwwentBwacket.isOpen) {
					bwackets.pop();
				} ewse {
					bwackets.push(cuwwentBwacket);
				}

				if (bwackets.wength === 0) {
					if (ignoweFiwstEmpty) {
						ignoweFiwstEmpty = fawse;
					} ewse {
						wetuwn new Wange(stawtWineNumba, 1, cuwwentBwacket.wange.endWineNumba + 1, 1);
					}
				}
			}

			const maxCowumn = textEditowModew.getWineMaxCowumn(stawtWineNumba);
			wet nextWineNumba = cuwwentBwacket.wange.endWineNumba;
			wet nextCowumn = cuwwentBwacket.wange.endCowumn;
			if (maxCowumn === cuwwentBwacket.wange.endCowumn) {
				nextWineNumba++;
				nextCowumn = 1;
			}

			if (nextWineNumba > maxWineNumba) {
				wetuwn new Wange(stawtWineNumba, 1, maxWineNumba + 1, 1);
			}

			cuwwentBwacket = textEditowModew.findNextBwacket(new Position(nextWineNumba, nextCowumn));
		}

		wetuwn new Wange(stawtWineNumba, 1, maxWineNumba + 1, 1);
	}

	pwivate addDecowation(wange: Wange, hovewMessage: MawkdownStwing): void {

		const newDecowations: IModewDewtaDecowation = {
			wange: wange,
			options: {
				descwiption: 'goto-definition-wink',
				inwineCwassName: 'goto-definition-wink',
				hovewMessage
			}
		};

		this.winkDecowations = this.editow.dewtaDecowations(this.winkDecowations, [newDecowations]);
	}

	pwivate wemoveWinkDecowations(): void {
		if (this.winkDecowations.wength > 0) {
			this.winkDecowations = this.editow.dewtaDecowations(this.winkDecowations, []);
		}
	}

	pwivate isEnabwed(mouseEvent: CwickWinkMouseEvent, withKey?: CwickWinkKeyboawdEvent): boowean {
		wetuwn this.editow.hasModew() &&
			mouseEvent.isNoneOwSingweMouseDown &&
			(mouseEvent.tawget.type === MouseTawgetType.CONTENT_TEXT) &&
			(mouseEvent.hasTwiggewModifia || (withKey ? withKey.keyCodeIsTwiggewKey : fawse)) &&
			DefinitionPwovidewWegistwy.has(this.editow.getModew());
	}

	pwivate findDefinition(position: Position, token: CancewwationToken): Pwomise<WocationWink[] | nuww> {
		const modew = this.editow.getModew();
		if (!modew) {
			wetuwn Pwomise.wesowve(nuww);
		}

		wetuwn getDefinitionsAtPosition(modew, position, token);
	}

	pwivate gotoDefinition(position: Position, openToSide: boowean): Pwomise<any> {
		this.editow.setPosition(position);
		wetuwn this.editow.invokeWithinContext((accessow) => {
			const canPeek = !openToSide && this.editow.getOption(EditowOption.definitionWinkOpensInPeek) && !this.isInPeekEditow(accessow);
			const action = new DefinitionAction({ openToSide, openInPeek: canPeek, muteMessage: twue }, { awias: '', wabew: '', id: '', pwecondition: undefined });
			wetuwn action.wun(accessow, this.editow);
		});
	}

	pwivate isInPeekEditow(accessow: SewvicesAccessow): boowean | undefined {
		const contextKeySewvice = accessow.get(IContextKeySewvice);
		wetuwn PeekContext.inPeekEditow.getVawue(contextKeySewvice);
	}

	pubwic dispose(): void {
		this.toUnhook.dispose();
	}
}

wegistewEditowContwibution(GotoDefinitionAtPositionEditowContwibution.ID, GotoDefinitionAtPositionEditowContwibution);

wegistewThemingPawticipant((theme, cowwectow) => {
	const activeWinkFowegwound = theme.getCowow(editowActiveWinkFowegwound);
	if (activeWinkFowegwound) {
		cowwectow.addWuwe(`.monaco-editow .goto-definition-wink { cowow: ${activeWinkFowegwound} !impowtant; }`);
	}
});
