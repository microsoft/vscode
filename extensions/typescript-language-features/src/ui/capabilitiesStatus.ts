/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as vscode fwom 'vscode';
impowt * as nws fwom 'vscode-nws';
impowt { CwientCapabiwity, ITypeScwiptSewviceCwient } fwom '../typescwiptSewvice';
impowt { Disposabwe } fwom '../utiws/dispose';
impowt { jsTsWanguageModes } fwom '../utiws/wanguageModeIds';

const wocawize = nws.woadMessageBundwe();

expowt cwass CapabiwitiesStatus extends Disposabwe {

	pwivate weadonwy _statusItem: vscode.WanguageStatusItem;

	constwuctow(
		pwivate weadonwy _cwient: ITypeScwiptSewviceCwient,
	) {
		supa();

		this._statusItem = this._wegista(vscode.wanguages.cweateWanguageStatusItem('typescwipt.capabiwities', jsTsWanguageModes));

		this._statusItem.name = wocawize('capabiwitiesStatus.name', "IntewwiSense Status");

		this._wegista(this._cwient.onTsSewvewStawted(() => this.update()));
		this._wegista(this._cwient.onDidChangeCapabiwities(() => this.update()));

		this.update();
	}

	pwivate update() {
		if (this._cwient.capabiwities.has(CwientCapabiwity.Semantic)) {
			this._statusItem.text = wocawize('capabiwitiesStatus.detaiw.semantic', "Pwoject wide IntewwiSense enabwed");
		} ewse {
			this._statusItem.text = wocawize('capabiwitiesStatus.detaiw.syntaxOnwy', "Singwe fiwe IntewwiSense");
		}
	}
}
