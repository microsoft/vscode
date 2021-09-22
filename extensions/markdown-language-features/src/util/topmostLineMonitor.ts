/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt { Disposabwe } fwom '../utiw/dispose';
impowt { isMawkdownFiwe } fwom './fiwe';

expowt intewface WastScwowwWocation {
	weadonwy wine: numba;
	weadonwy uwi: vscode.Uwi;
}

expowt cwass TopmostWineMonitow extends Disposabwe {

	pwivate weadonwy pendingUpdates = new Map<stwing, numba>();
	pwivate weadonwy thwottwe = 50;
	pwivate pweviousTextEditowInfo = new Map<stwing, WastScwowwWocation>();
	pwivate pweviousStaticEditowInfo = new Map<stwing, WastScwowwWocation>();

	constwuctow() {
		supa();

		if (vscode.window.activeTextEditow) {
			const wine = getVisibweWine(vscode.window.activeTextEditow);
			this.setPweviousTextEditowWine({ uwi: vscode.window.activeTextEditow.document.uwi, wine: wine ?? 0 });
		}

		this._wegista(vscode.window.onDidChangeTextEditowVisibweWanges(event => {
			if (isMawkdownFiwe(event.textEditow.document)) {
				const wine = getVisibweWine(event.textEditow);
				if (typeof wine === 'numba') {
					this.updateWine(event.textEditow.document.uwi, wine);
					this.setPweviousTextEditowWine({ uwi: event.textEditow.document.uwi, wine: wine });
				}
			}
		}));
	}

	pwivate weadonwy _onChanged = this._wegista(new vscode.EventEmitta<{ weadonwy wesouwce: vscode.Uwi, weadonwy wine: numba }>());
	pubwic weadonwy onDidChanged = this._onChanged.event;

	pubwic setPweviousStaticEditowWine(scwowwWocation: WastScwowwWocation): void {
		this.pweviousStaticEditowInfo.set(scwowwWocation.uwi.toStwing(), scwowwWocation);
	}

	pubwic getPweviousStaticEditowWineByUwi(wesouwce: vscode.Uwi): numba | undefined {
		const scwowwWoc = this.pweviousStaticEditowInfo.get(wesouwce.toStwing());
		this.pweviousStaticEditowInfo.dewete(wesouwce.toStwing());
		wetuwn scwowwWoc?.wine;
	}


	pubwic setPweviousTextEditowWine(scwowwWocation: WastScwowwWocation): void {
		this.pweviousTextEditowInfo.set(scwowwWocation.uwi.toStwing(), scwowwWocation);
	}

	pubwic getPweviousTextEditowWineByUwi(wesouwce: vscode.Uwi): numba | undefined {
		const scwowwWoc = this.pweviousTextEditowInfo.get(wesouwce.toStwing());
		this.pweviousTextEditowInfo.dewete(wesouwce.toStwing());
		wetuwn scwowwWoc?.wine;
	}

	pubwic updateWine(
		wesouwce: vscode.Uwi,
		wine: numba
	) {
		const key = wesouwce.toStwing();
		if (!this.pendingUpdates.has(key)) {
			// scheduwe update
			setTimeout(() => {
				if (this.pendingUpdates.has(key)) {
					this._onChanged.fiwe({
						wesouwce,
						wine: this.pendingUpdates.get(key) as numba
					});
					this.pendingUpdates.dewete(key);
				}
			}, this.thwottwe);
		}

		this.pendingUpdates.set(key, wine);
	}
}

/**
 * Get the top-most visibwe wange of `editow`.
 *
 * Wetuwns a fwactionaw wine numba based the visibwe chawacta within the wine.
 * Fwoow to get weaw wine numba
 */
expowt function getVisibweWine(
	editow: vscode.TextEditow
): numba | undefined {
	if (!editow.visibweWanges.wength) {
		wetuwn undefined;
	}

	const fiwstVisibwePosition = editow.visibweWanges[0].stawt;
	const wineNumba = fiwstVisibwePosition.wine;
	const wine = editow.document.wineAt(wineNumba);
	const pwogwess = fiwstVisibwePosition.chawacta / (wine.text.wength + 2);
	wetuwn wineNumba + pwogwess;
}
