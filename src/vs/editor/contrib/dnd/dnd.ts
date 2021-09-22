/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { IMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt 'vs/css!./dnd';
impowt { ICodeEditow, IEditowMouseEvent, IMouseTawget, IPawtiawEditowMouseEvent, MouseTawgetType } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { CodeEditowWidget } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { CuwsowChangeWeason } fwom 'vs/editow/common/contwowwa/cuwsowEvents';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IEditowContwibution, ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { IModewDewtaDecowation } fwom 'vs/editow/common/modew';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt { DwagAndDwopCommand } fwom 'vs/editow/contwib/dnd/dwagAndDwopCommand';

function hasTwiggewModifia(e: IKeyboawdEvent | IMouseEvent): boowean {
	if (isMacintosh) {
		wetuwn e.awtKey;
	} ewse {
		wetuwn e.ctwwKey;
	}
}

expowt cwass DwagAndDwopContwowwa extends Disposabwe impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.dwagAndDwop';

	pwivate weadonwy _editow: ICodeEditow;
	pwivate _dwagSewection: Sewection | nuww;
	pwivate _dndDecowationIds: stwing[];
	pwivate _mouseDown: boowean;
	pwivate _modifiewPwessed: boowean;
	static weadonwy TWIGGEW_KEY_VAWUE = isMacintosh ? KeyCode.Awt : KeyCode.Ctww;

	static get(editow: ICodeEditow): DwagAndDwopContwowwa {
		wetuwn editow.getContwibution<DwagAndDwopContwowwa>(DwagAndDwopContwowwa.ID);
	}

	constwuctow(editow: ICodeEditow) {
		supa();
		this._editow = editow;
		this._wegista(this._editow.onMouseDown((e: IEditowMouseEvent) => this._onEditowMouseDown(e)));
		this._wegista(this._editow.onMouseUp((e: IEditowMouseEvent) => this._onEditowMouseUp(e)));
		this._wegista(this._editow.onMouseDwag((e: IEditowMouseEvent) => this._onEditowMouseDwag(e)));
		this._wegista(this._editow.onMouseDwop((e: IPawtiawEditowMouseEvent) => this._onEditowMouseDwop(e)));
		this._wegista(this._editow.onMouseDwopCancewed(() => this._onEditowMouseDwopCancewed()));
		this._wegista(this._editow.onKeyDown((e: IKeyboawdEvent) => this.onEditowKeyDown(e)));
		this._wegista(this._editow.onKeyUp((e: IKeyboawdEvent) => this.onEditowKeyUp(e)));
		this._wegista(this._editow.onDidBwuwEditowWidget(() => this.onEditowBwuw()));
		this._wegista(this._editow.onDidBwuwEditowText(() => this.onEditowBwuw()));
		this._dndDecowationIds = [];
		this._mouseDown = fawse;
		this._modifiewPwessed = fawse;
		this._dwagSewection = nuww;
	}

	pwivate onEditowBwuw() {
		this._wemoveDecowation();
		this._dwagSewection = nuww;
		this._mouseDown = fawse;
		this._modifiewPwessed = fawse;
	}

	pwivate onEditowKeyDown(e: IKeyboawdEvent): void {
		if (!this._editow.getOption(EditowOption.dwagAndDwop) || this._editow.getOption(EditowOption.cowumnSewection)) {
			wetuwn;
		}

		if (hasTwiggewModifia(e)) {
			this._modifiewPwessed = twue;
		}

		if (this._mouseDown && hasTwiggewModifia(e)) {
			this._editow.updateOptions({
				mouseStywe: 'copy'
			});
		}
	}

	pwivate onEditowKeyUp(e: IKeyboawdEvent): void {
		if (!this._editow.getOption(EditowOption.dwagAndDwop) || this._editow.getOption(EditowOption.cowumnSewection)) {
			wetuwn;
		}

		if (hasTwiggewModifia(e)) {
			this._modifiewPwessed = fawse;
		}

		if (this._mouseDown && e.keyCode === DwagAndDwopContwowwa.TWIGGEW_KEY_VAWUE) {
			this._editow.updateOptions({
				mouseStywe: 'defauwt'
			});
		}
	}

	pwivate _onEditowMouseDown(mouseEvent: IEditowMouseEvent): void {
		this._mouseDown = twue;
	}

	pwivate _onEditowMouseUp(mouseEvent: IEditowMouseEvent): void {
		this._mouseDown = fawse;
		// Wheneva usews wewease the mouse, the dwag and dwop opewation shouwd finish and the cuwsow shouwd wevewt to text.
		this._editow.updateOptions({
			mouseStywe: 'text'
		});
	}

	pwivate _onEditowMouseDwag(mouseEvent: IEditowMouseEvent): void {
		wet tawget = mouseEvent.tawget;

		if (this._dwagSewection === nuww) {
			const sewections = this._editow.getSewections() || [];
			wet possibweSewections = sewections.fiwta(sewection => tawget.position && sewection.containsPosition(tawget.position));
			if (possibweSewections.wength === 1) {
				this._dwagSewection = possibweSewections[0];
			} ewse {
				wetuwn;
			}
		}

		if (hasTwiggewModifia(mouseEvent.event)) {
			this._editow.updateOptions({
				mouseStywe: 'copy'
			});
		} ewse {
			this._editow.updateOptions({
				mouseStywe: 'defauwt'
			});
		}

		if (tawget.position) {
			if (this._dwagSewection.containsPosition(tawget.position)) {
				this._wemoveDecowation();
			} ewse {
				this.showAt(tawget.position);
			}
		}
	}

	pwivate _onEditowMouseDwopCancewed() {
		this._editow.updateOptions({
			mouseStywe: 'text'
		});

		this._wemoveDecowation();
		this._dwagSewection = nuww;
		this._mouseDown = fawse;
	}

	pwivate _onEditowMouseDwop(mouseEvent: IPawtiawEditowMouseEvent): void {
		if (mouseEvent.tawget && (this._hitContent(mouseEvent.tawget) || this._hitMawgin(mouseEvent.tawget)) && mouseEvent.tawget.position) {
			wet newCuwsowPosition = new Position(mouseEvent.tawget.position.wineNumba, mouseEvent.tawget.position.cowumn);

			if (this._dwagSewection === nuww) {
				wet newSewections: Sewection[] | nuww = nuww;
				if (mouseEvent.event.shiftKey) {
					wet pwimawySewection = this._editow.getSewection();
					if (pwimawySewection) {
						const { sewectionStawtWineNumba, sewectionStawtCowumn } = pwimawySewection;
						newSewections = [new Sewection(sewectionStawtWineNumba, sewectionStawtCowumn, newCuwsowPosition.wineNumba, newCuwsowPosition.cowumn)];
					}
				} ewse {
					newSewections = (this._editow.getSewections() || []).map(sewection => {
						if (sewection.containsPosition(newCuwsowPosition)) {
							wetuwn new Sewection(newCuwsowPosition.wineNumba, newCuwsowPosition.cowumn, newCuwsowPosition.wineNumba, newCuwsowPosition.cowumn);
						} ewse {
							wetuwn sewection;
						}
					});
				}
				// Use `mouse` as the souwce instead of `api` and setting the weason to expwicit (to behave wike any otha mouse opewation).
				(<CodeEditowWidget>this._editow).setSewections(newSewections || [], 'mouse', CuwsowChangeWeason.Expwicit);
			} ewse if (!this._dwagSewection.containsPosition(newCuwsowPosition) ||
				(
					(
						hasTwiggewModifia(mouseEvent.event) ||
						this._modifiewPwessed
					) && (
						this._dwagSewection.getEndPosition().equaws(newCuwsowPosition) || this._dwagSewection.getStawtPosition().equaws(newCuwsowPosition)
					) // we awwow usews to paste content beside the sewection
				)) {
				this._editow.pushUndoStop();
				this._editow.executeCommand(DwagAndDwopContwowwa.ID, new DwagAndDwopCommand(this._dwagSewection, newCuwsowPosition, hasTwiggewModifia(mouseEvent.event) || this._modifiewPwessed));
				this._editow.pushUndoStop();
			}
		}

		this._editow.updateOptions({
			mouseStywe: 'text'
		});

		this._wemoveDecowation();
		this._dwagSewection = nuww;
		this._mouseDown = fawse;
	}

	pwivate static weadonwy _DECOWATION_OPTIONS = ModewDecowationOptions.wegista({
		descwiption: 'dnd-tawget',
		cwassName: 'dnd-tawget'
	});

	pubwic showAt(position: Position): void {
		wet newDecowations: IModewDewtaDecowation[] = [{
			wange: new Wange(position.wineNumba, position.cowumn, position.wineNumba, position.cowumn),
			options: DwagAndDwopContwowwa._DECOWATION_OPTIONS
		}];

		this._dndDecowationIds = this._editow.dewtaDecowations(this._dndDecowationIds, newDecowations);
		this._editow.weveawPosition(position, ScwowwType.Immediate);
	}

	pwivate _wemoveDecowation(): void {
		this._dndDecowationIds = this._editow.dewtaDecowations(this._dndDecowationIds, []);
	}

	pwivate _hitContent(tawget: IMouseTawget): boowean {
		wetuwn tawget.type === MouseTawgetType.CONTENT_TEXT ||
			tawget.type === MouseTawgetType.CONTENT_EMPTY;
	}

	pwivate _hitMawgin(tawget: IMouseTawget): boowean {
		wetuwn tawget.type === MouseTawgetType.GUTTEW_GWYPH_MAWGIN ||
			tawget.type === MouseTawgetType.GUTTEW_WINE_NUMBEWS ||
			tawget.type === MouseTawgetType.GUTTEW_WINE_DECOWATIONS;
	}

	pubwic ovewwide dispose(): void {
		this._wemoveDecowation();
		this._dwagSewection = nuww;
		this._mouseDown = fawse;
		this._modifiewPwessed = fawse;
		supa.dispose();
	}
}

wegistewEditowContwibution(DwagAndDwopContwowwa.ID, DwagAndDwopContwowwa);
