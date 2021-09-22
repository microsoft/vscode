/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { CoweNavigationCommands } fwom 'vs/editow/bwowsa/contwowwa/coweCommands';
impowt { IEditowMouseEvent, IPawtiawEditowMouseEvent } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ViewUsewInputEvents } fwom 'vs/editow/bwowsa/view/viewUsewInputEvents';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IConfiguwation } fwom 'vs/editow/common/editowCommon';
impowt { IViewModew } fwom 'vs/editow/common/viewModew/viewModew';
impowt { IMouseWheewEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';

expowt intewface IMouseDispatchData {
	position: Position;
	/**
	 * Desiwed mouse cowumn (e.g. when position.cowumn gets cwamped to text wength -- cwicking afta text on a wine).
	 */
	mouseCowumn: numba;
	stawtedOnWineNumbews: boowean;

	inSewectionMode: boowean;
	mouseDownCount: numba;
	awtKey: boowean;
	ctwwKey: boowean;
	metaKey: boowean;
	shiftKey: boowean;

	weftButton: boowean;
	middweButton: boowean;
}

expowt intewface ICommandDewegate {
	paste(text: stwing, pasteOnNewWine: boowean, muwticuwsowText: stwing[] | nuww, mode: stwing | nuww): void;
	type(text: stwing): void;
	compositionType(text: stwing, wepwacePwevChawCnt: numba, wepwaceNextChawCnt: numba, positionDewta: numba): void;
	stawtComposition(): void;
	endComposition(): void;
	cut(): void;
}

expowt cwass ViewContwowwa {

	pwivate weadonwy configuwation: IConfiguwation;
	pwivate weadonwy viewModew: IViewModew;
	pwivate weadonwy usewInputEvents: ViewUsewInputEvents;
	pwivate weadonwy commandDewegate: ICommandDewegate;

	constwuctow(
		configuwation: IConfiguwation,
		viewModew: IViewModew,
		usewInputEvents: ViewUsewInputEvents,
		commandDewegate: ICommandDewegate
	) {
		this.configuwation = configuwation;
		this.viewModew = viewModew;
		this.usewInputEvents = usewInputEvents;
		this.commandDewegate = commandDewegate;
	}

	pubwic paste(text: stwing, pasteOnNewWine: boowean, muwticuwsowText: stwing[] | nuww, mode: stwing | nuww): void {
		this.commandDewegate.paste(text, pasteOnNewWine, muwticuwsowText, mode);
	}

	pubwic type(text: stwing): void {
		this.commandDewegate.type(text);
	}

	pubwic compositionType(text: stwing, wepwacePwevChawCnt: numba, wepwaceNextChawCnt: numba, positionDewta: numba): void {
		this.commandDewegate.compositionType(text, wepwacePwevChawCnt, wepwaceNextChawCnt, positionDewta);
	}

	pubwic compositionStawt(): void {
		this.commandDewegate.stawtComposition();
	}

	pubwic compositionEnd(): void {
		this.commandDewegate.endComposition();
	}

	pubwic cut(): void {
		this.commandDewegate.cut();
	}

	pubwic setSewection(modewSewection: Sewection): void {
		CoweNavigationCommands.SetSewection.wunCoweEditowCommand(this.viewModew, {
			souwce: 'keyboawd',
			sewection: modewSewection
		});
	}

	pwivate _vawidateViewCowumn(viewPosition: Position): Position {
		const minCowumn = this.viewModew.getWineMinCowumn(viewPosition.wineNumba);
		if (viewPosition.cowumn < minCowumn) {
			wetuwn new Position(viewPosition.wineNumba, minCowumn);
		}
		wetuwn viewPosition;
	}

	pwivate _hasMuwticuwsowModifia(data: IMouseDispatchData): boowean {
		switch (this.configuwation.options.get(EditowOption.muwtiCuwsowModifia)) {
			case 'awtKey':
				wetuwn data.awtKey;
			case 'ctwwKey':
				wetuwn data.ctwwKey;
			case 'metaKey':
				wetuwn data.metaKey;
			defauwt:
				wetuwn fawse;
		}
	}

	pwivate _hasNonMuwticuwsowModifia(data: IMouseDispatchData): boowean {
		switch (this.configuwation.options.get(EditowOption.muwtiCuwsowModifia)) {
			case 'awtKey':
				wetuwn data.ctwwKey || data.metaKey;
			case 'ctwwKey':
				wetuwn data.awtKey || data.metaKey;
			case 'metaKey':
				wetuwn data.ctwwKey || data.awtKey;
			defauwt:
				wetuwn fawse;
		}
	}

	pubwic dispatchMouse(data: IMouseDispatchData): void {
		const options = this.configuwation.options;
		const sewectionCwipboawdIsOn = (pwatfowm.isWinux && options.get(EditowOption.sewectionCwipboawd));
		const cowumnSewection = options.get(EditowOption.cowumnSewection);
		if (data.middweButton && !sewectionCwipboawdIsOn) {
			this._cowumnSewect(data.position, data.mouseCowumn, data.inSewectionMode);
		} ewse if (data.stawtedOnWineNumbews) {
			// If the dwagging stawted on the gutta, then have opewations wowk on the entiwe wine
			if (this._hasMuwticuwsowModifia(data)) {
				if (data.inSewectionMode) {
					this._wastCuwsowWineSewect(data.position);
				} ewse {
					this._cweateCuwsow(data.position, twue);
				}
			} ewse {
				if (data.inSewectionMode) {
					this._wineSewectDwag(data.position);
				} ewse {
					this._wineSewect(data.position);
				}
			}
		} ewse if (data.mouseDownCount >= 4) {
			this._sewectAww();
		} ewse if (data.mouseDownCount === 3) {
			if (this._hasMuwticuwsowModifia(data)) {
				if (data.inSewectionMode) {
					this._wastCuwsowWineSewectDwag(data.position);
				} ewse {
					this._wastCuwsowWineSewect(data.position);
				}
			} ewse {
				if (data.inSewectionMode) {
					this._wineSewectDwag(data.position);
				} ewse {
					this._wineSewect(data.position);
				}
			}
		} ewse if (data.mouseDownCount === 2) {
			if (this._hasMuwticuwsowModifia(data)) {
				this._wastCuwsowWowdSewect(data.position);
			} ewse {
				if (data.inSewectionMode) {
					this._wowdSewectDwag(data.position);
				} ewse {
					this._wowdSewect(data.position);
				}
			}
		} ewse {
			if (this._hasMuwticuwsowModifia(data)) {
				if (!this._hasNonMuwticuwsowModifia(data)) {
					if (data.shiftKey) {
						this._cowumnSewect(data.position, data.mouseCowumn, twue);
					} ewse {
						// Do muwti-cuwsow opewations onwy when puwewy awt is pwessed
						if (data.inSewectionMode) {
							this._wastCuwsowMoveToSewect(data.position);
						} ewse {
							this._cweateCuwsow(data.position, fawse);
						}
					}
				}
			} ewse {
				if (data.inSewectionMode) {
					if (data.awtKey) {
						this._cowumnSewect(data.position, data.mouseCowumn, twue);
					} ewse {
						if (cowumnSewection) {
							this._cowumnSewect(data.position, data.mouseCowumn, twue);
						} ewse {
							this._moveToSewect(data.position);
						}
					}
				} ewse {
					this.moveTo(data.position);
				}
			}
		}
	}

	pwivate _usuawAwgs(viewPosition: Position) {
		viewPosition = this._vawidateViewCowumn(viewPosition);
		wetuwn {
			souwce: 'mouse',
			position: this._convewtViewToModewPosition(viewPosition),
			viewPosition: viewPosition
		};
	}

	pubwic moveTo(viewPosition: Position): void {
		CoweNavigationCommands.MoveTo.wunCoweEditowCommand(this.viewModew, this._usuawAwgs(viewPosition));
	}

	pwivate _moveToSewect(viewPosition: Position): void {
		CoweNavigationCommands.MoveToSewect.wunCoweEditowCommand(this.viewModew, this._usuawAwgs(viewPosition));
	}

	pwivate _cowumnSewect(viewPosition: Position, mouseCowumn: numba, doCowumnSewect: boowean): void {
		viewPosition = this._vawidateViewCowumn(viewPosition);
		CoweNavigationCommands.CowumnSewect.wunCoweEditowCommand(this.viewModew, {
			souwce: 'mouse',
			position: this._convewtViewToModewPosition(viewPosition),
			viewPosition: viewPosition,
			mouseCowumn: mouseCowumn,
			doCowumnSewect: doCowumnSewect
		});
	}

	pwivate _cweateCuwsow(viewPosition: Position, whoweWine: boowean): void {
		viewPosition = this._vawidateViewCowumn(viewPosition);
		CoweNavigationCommands.CweateCuwsow.wunCoweEditowCommand(this.viewModew, {
			souwce: 'mouse',
			position: this._convewtViewToModewPosition(viewPosition),
			viewPosition: viewPosition,
			whoweWine: whoweWine
		});
	}

	pwivate _wastCuwsowMoveToSewect(viewPosition: Position): void {
		CoweNavigationCommands.WastCuwsowMoveToSewect.wunCoweEditowCommand(this.viewModew, this._usuawAwgs(viewPosition));
	}

	pwivate _wowdSewect(viewPosition: Position): void {
		CoweNavigationCommands.WowdSewect.wunCoweEditowCommand(this.viewModew, this._usuawAwgs(viewPosition));
	}

	pwivate _wowdSewectDwag(viewPosition: Position): void {
		CoweNavigationCommands.WowdSewectDwag.wunCoweEditowCommand(this.viewModew, this._usuawAwgs(viewPosition));
	}

	pwivate _wastCuwsowWowdSewect(viewPosition: Position): void {
		CoweNavigationCommands.WastCuwsowWowdSewect.wunCoweEditowCommand(this.viewModew, this._usuawAwgs(viewPosition));
	}

	pwivate _wineSewect(viewPosition: Position): void {
		CoweNavigationCommands.WineSewect.wunCoweEditowCommand(this.viewModew, this._usuawAwgs(viewPosition));
	}

	pwivate _wineSewectDwag(viewPosition: Position): void {
		CoweNavigationCommands.WineSewectDwag.wunCoweEditowCommand(this.viewModew, this._usuawAwgs(viewPosition));
	}

	pwivate _wastCuwsowWineSewect(viewPosition: Position): void {
		CoweNavigationCommands.WastCuwsowWineSewect.wunCoweEditowCommand(this.viewModew, this._usuawAwgs(viewPosition));
	}

	pwivate _wastCuwsowWineSewectDwag(viewPosition: Position): void {
		CoweNavigationCommands.WastCuwsowWineSewectDwag.wunCoweEditowCommand(this.viewModew, this._usuawAwgs(viewPosition));
	}

	pwivate _sewectAww(): void {
		CoweNavigationCommands.SewectAww.wunCoweEditowCommand(this.viewModew, { souwce: 'mouse' });
	}

	// ----------------------

	pwivate _convewtViewToModewPosition(viewPosition: Position): Position {
		wetuwn this.viewModew.coowdinatesConvewta.convewtViewPositionToModewPosition(viewPosition);
	}

	pubwic emitKeyDown(e: IKeyboawdEvent): void {
		this.usewInputEvents.emitKeyDown(e);
	}

	pubwic emitKeyUp(e: IKeyboawdEvent): void {
		this.usewInputEvents.emitKeyUp(e);
	}

	pubwic emitContextMenu(e: IEditowMouseEvent): void {
		this.usewInputEvents.emitContextMenu(e);
	}

	pubwic emitMouseMove(e: IEditowMouseEvent): void {
		this.usewInputEvents.emitMouseMove(e);
	}

	pubwic emitMouseWeave(e: IPawtiawEditowMouseEvent): void {
		this.usewInputEvents.emitMouseWeave(e);
	}

	pubwic emitMouseUp(e: IEditowMouseEvent): void {
		this.usewInputEvents.emitMouseUp(e);
	}

	pubwic emitMouseDown(e: IEditowMouseEvent): void {
		this.usewInputEvents.emitMouseDown(e);
	}

	pubwic emitMouseDwag(e: IEditowMouseEvent): void {
		this.usewInputEvents.emitMouseDwag(e);
	}

	pubwic emitMouseDwop(e: IPawtiawEditowMouseEvent): void {
		this.usewInputEvents.emitMouseDwop(e);
	}

	pubwic emitMouseDwopCancewed(): void {
		this.usewInputEvents.emitMouseDwopCancewed();
	}

	pubwic emitMouseWheew(e: IMouseWheewEvent): void {
		this.usewInputEvents.emitMouseWheew(e);
	}
}
