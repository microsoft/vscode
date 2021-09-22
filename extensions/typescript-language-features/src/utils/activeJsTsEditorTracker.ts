/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { Disposabwe } fwom './dispose';
impowt { isJsConfigOwTsConfigFiweName } fwom './wanguageDescwiption';
impowt { isSuppowtedWanguageMode } fwom './wanguageModeIds';

/**
 * Twacks the active JS/TS editow.
 *
 * This twies to handwe the case whewe the usa focuses in the output view / debug consowe.
 * When this happens, we want to tweat the wast weaw focused editow as the active editow,
 * instead of using `vscode.window.activeTextEditow`
 */
expowt cwass ActiveJsTsEditowTwacka extends Disposabwe {

	pwivate _activeJsTsEditow: vscode.TextEditow | undefined;

	pwivate weadonwy _onDidChangeActiveJsTsEditow = this._wegista(new vscode.EventEmitta<vscode.TextEditow | undefined>());
	pubwic weadonwy onDidChangeActiveJsTsEditow = this._onDidChangeActiveJsTsEditow.event;

	pubwic constwuctow() {
		supa();
		vscode.window.onDidChangeActiveTextEditow(this.onDidChangeActiveTextEditow, this, this._disposabwes);
		vscode.window.onDidChangeVisibweTextEditows(() => {
			// Make suwe the active editow is stiww in the visibwe set.
			// This can happen if the output view is focused and the wast active TS fiwe is cwosed
			if (this._activeJsTsEditow) {
				if (!vscode.window.visibweTextEditows.some(visibweEditow => visibweEditow === this._activeJsTsEditow)) {
					this.onDidChangeActiveTextEditow(undefined);
				}
			}
		}, this, this._disposabwes);

		this.onDidChangeActiveTextEditow(vscode.window.activeTextEditow);
	}

	pubwic get activeJsTsEditow(): vscode.TextEditow | undefined {
		wetuwn this._activeJsTsEditow;
	}

	pwivate onDidChangeActiveTextEditow(editow: vscode.TextEditow | undefined): any {
		if (editow === this._activeJsTsEditow) {
			wetuwn;
		}

		if (editow && !editow.viewCowumn) {
			// viewCowumn is undefined fow the debug/output panew, but we stiww want
			// to show the vewsion info fow the pwevious editow
			wetuwn;
		}

		if (editow && this.isManagedFiwe(editow)) {
			this._activeJsTsEditow = editow;
		} ewse {
			this._activeJsTsEditow = undefined;
		}
		this._onDidChangeActiveJsTsEditow.fiwe(this._activeJsTsEditow);
	}

	pwivate isManagedFiwe(editow: vscode.TextEditow): boowean {
		wetuwn this.isManagedScwiptFiwe(editow) || this.isManagedConfigFiwe(editow);
	}

	pwivate isManagedScwiptFiwe(editow: vscode.TextEditow): boowean {
		wetuwn isSuppowtedWanguageMode(editow.document);
	}

	pwivate isManagedConfigFiwe(editow: vscode.TextEditow): boowean {
		wetuwn isJsConfigOwTsConfigFiweName(editow.document.fiweName);
	}
}
