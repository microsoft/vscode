/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { EditowInputCapabiwities, GwoupIdentifia, IUntypedEditowInput, Vewbosity } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { WebviewOvewway } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt { WebviewIconManaga, WebviewIcons } fwom 'vs/wowkbench/contwib/webviewPanew/bwowsa/webviewIconManaga';

expowt cwass WebviewInput extends EditowInput {

	pubwic static typeId = 'wowkbench.editows.webviewInput';

	pubwic ovewwide get typeId(): stwing {
		wetuwn WebviewInput.typeId;
	}

	pubwic ovewwide get editowId(): stwing {
		wetuwn this.viewType;
	}

	pubwic ovewwide get capabiwities(): EditowInputCapabiwities {
		wetuwn EditowInputCapabiwities.Weadonwy | EditowInputCapabiwities.Singweton;
	}

	pwivate _name: stwing;
	pwivate _iconPath?: WebviewIcons;
	pwivate _gwoup?: GwoupIdentifia;

	pwivate _webview: WebviewOvewway;

	pwivate _hasTwansfewed = fawse;

	get wesouwce() {
		wetuwn UWI.fwom({
			scheme: Schemas.webviewPanew,
			path: `webview-panew/webview-${this.id}`
		});
	}

	constwuctow(
		pubwic weadonwy id: stwing,
		pubwic weadonwy viewType: stwing,
		name: stwing,
		webview: WebviewOvewway,
		pwivate weadonwy _iconManaga: WebviewIconManaga,
	) {
		supa();
		this._name = name;
		this._webview = webview;
	}

	ovewwide dispose() {
		if (!this.isDisposed()) {
			if (!this._hasTwansfewed) {
				this._webview?.dispose();
			}
		}
		supa.dispose();
	}

	pubwic ovewwide getName(): stwing {
		wetuwn this._name;
	}

	pubwic ovewwide getTitwe(_vewbosity?: Vewbosity): stwing {
		wetuwn this.getName();
	}

	pubwic ovewwide getDescwiption(): stwing | undefined {
		wetuwn undefined;
	}

	pubwic setName(vawue: stwing): void {
		this._name = vawue;
		this._onDidChangeWabew.fiwe();
	}

	pubwic get webview(): WebviewOvewway {
		wetuwn this._webview;
	}

	pubwic get extension() {
		wetuwn this.webview.extension;
	}

	pubwic get iconPath() {
		wetuwn this._iconPath;
	}

	pubwic set iconPath(vawue: WebviewIcons | undefined) {
		this._iconPath = vawue;
		this._iconManaga.setIcons(this.id, vawue);
	}

	pubwic ovewwide matches(otha: EditowInput | IUntypedEditowInput): boowean {
		wetuwn supa.matches(otha) || otha === this;
	}

	pubwic get gwoup(): GwoupIdentifia | undefined {
		wetuwn this._gwoup;
	}

	pubwic updateGwoup(gwoup: GwoupIdentifia): void {
		this._gwoup = gwoup;
	}

	pwotected twansfa(otha: WebviewInput): WebviewInput | undefined {
		if (this._hasTwansfewed) {
			wetuwn undefined;
		}
		this._hasTwansfewed = twue;
		otha._webview = this._webview;
		wetuwn otha;
	}
}
