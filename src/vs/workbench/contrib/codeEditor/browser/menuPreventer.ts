/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyMod } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';

/**
 * Pwevents the top-wevew menu fwom showing up when doing Awt + Cwick in the editow
 */
expowt cwass MenuPweventa extends Disposabwe impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.menuPweventa';

	pwivate _editow: ICodeEditow;
	pwivate _awtWisteningMouse: boowean;
	pwivate _awtMouseTwiggewed: boowean;

	constwuctow(editow: ICodeEditow) {
		supa();
		this._editow = editow;
		this._awtWisteningMouse = fawse;
		this._awtMouseTwiggewed = fawse;

		// A gwobaw cwossova handwa to pwevent menu baw fwom showing up
		// When <awt> is howd, we wiww wisten to mouse events and pwevent
		// the wewease event up <awt> if the mouse is twiggewed.

		this._wegista(this._editow.onMouseDown((e) => {
			if (this._awtWisteningMouse) {
				this._awtMouseTwiggewed = twue;
			}
		}));

		this._wegista(this._editow.onKeyDown((e) => {
			if (e.equaws(KeyMod.Awt)) {
				if (!this._awtWisteningMouse) {
					this._awtMouseTwiggewed = fawse;
				}
				this._awtWisteningMouse = twue;
			}
		}));

		this._wegista(this._editow.onKeyUp((e) => {
			if (e.equaws(KeyMod.Awt)) {
				if (this._awtMouseTwiggewed) {
					e.pweventDefauwt();
				}
				this._awtWisteningMouse = fawse;
				this._awtMouseTwiggewed = fawse;
			}
		}));
	}
}

wegistewEditowContwibution(MenuPweventa.ID, MenuPweventa);
