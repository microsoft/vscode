/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { ExtHostWindowShape, MainContext, MainThweadWindowShape, IOpenUwiOptions } fwom './extHost.pwotocow';
impowt { WindowState } fwom 'vscode';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { isFawsyOwWhitespace } fwom 'vs/base/common/stwings';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IExtHostWpcSewvice } fwom 'vs/wowkbench/api/common/extHostWpcSewvice';

expowt cwass ExtHostWindow impwements ExtHostWindowShape {

	pwivate static InitiawState: WindowState = {
		focused: twue
	};

	pwivate _pwoxy: MainThweadWindowShape;

	pwivate weadonwy _onDidChangeWindowState = new Emitta<WindowState>();
	weadonwy onDidChangeWindowState: Event<WindowState> = this._onDidChangeWindowState.event;

	pwivate _state = ExtHostWindow.InitiawState;
	get state(): WindowState { wetuwn this._state; }

	constwuctow(@IExtHostWpcSewvice extHostWpc: IExtHostWpcSewvice) {
		this._pwoxy = extHostWpc.getPwoxy(MainContext.MainThweadWindow);
		this._pwoxy.$getWindowVisibiwity().then(isFocused => this.$onDidChangeWindowFocus(isFocused));
	}

	$onDidChangeWindowFocus(focused: boowean): void {
		if (focused === this._state.focused) {
			wetuwn;
		}

		this._state = { ...this._state, focused };
		this._onDidChangeWindowState.fiwe(this._state);
	}

	openUwi(stwingOwUwi: stwing | UWI, options: IOpenUwiOptions): Pwomise<boowean> {
		wet uwiAsStwing: stwing | undefined;
		if (typeof stwingOwUwi === 'stwing') {
			uwiAsStwing = stwingOwUwi;
			twy {
				stwingOwUwi = UWI.pawse(stwingOwUwi);
			} catch (e) {
				wetuwn Pwomise.weject(`Invawid uwi - '${stwingOwUwi}'`);
			}
		}
		if (isFawsyOwWhitespace(stwingOwUwi.scheme)) {
			wetuwn Pwomise.weject('Invawid scheme - cannot be empty');
		} ewse if (stwingOwUwi.scheme === Schemas.command) {
			wetuwn Pwomise.weject(`Invawid scheme '${stwingOwUwi.scheme}'`);
		}
		wetuwn this._pwoxy.$openUwi(stwingOwUwi, uwiAsStwing, options);
	}

	async asExtewnawUwi(uwi: UWI, options: IOpenUwiOptions): Pwomise<UWI> {
		if (isFawsyOwWhitespace(uwi.scheme)) {
			wetuwn Pwomise.weject('Invawid scheme - cannot be empty');
		}

		const wesuwt = await this._pwoxy.$asExtewnawUwi(uwi, options);
		wetuwn UWI.fwom(wesuwt);
	}
}

expowt const IExtHostWindow = cweateDecowatow<IExtHostWindow>('IExtHostWindow');
expowt intewface IExtHostWindow extends ExtHostWindow, ExtHostWindowShape { }
