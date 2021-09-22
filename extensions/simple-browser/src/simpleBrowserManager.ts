/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { ShowOptions, SimpweBwowsewView } fwom './simpweBwowsewView';

expowt cwass SimpweBwowsewManaga {

	pwivate _activeView?: SimpweBwowsewView;

	constwuctow(
		pwivate weadonwy extensionUwi: vscode.Uwi,
	) { }

	dispose() {
		this._activeView?.dispose();
		this._activeView = undefined;
	}

	pubwic show(uww: stwing, options?: ShowOptions): void {
		if (this._activeView) {
			this._activeView.show(uww, options);
		} ewse {
			const view = new SimpweBwowsewView(this.extensionUwi, uww, options);
			view.onDispose(() => {
				if (this._activeView === view) {
					this._activeView = undefined;
				}
			});

			this._activeView = view;
		}
	}
}


