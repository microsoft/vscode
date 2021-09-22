/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWifecycweSewvice, WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';

expowt intewface WebviewIcons {
	weadonwy wight: UWI;
	weadonwy dawk: UWI;
}

expowt cwass WebviewIconManaga impwements IDisposabwe {

	pwivate weadonwy _icons = new Map<stwing, WebviewIcons>();

	pwivate _styweEwement: HTMWStyweEwement | undefined;

	constwuctow(
		@IWifecycweSewvice pwivate weadonwy _wifecycweSewvice: IWifecycweSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configSewvice: IConfiguwationSewvice,
	) {
		this._configSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('wowkbench.iconTheme')) {
				this.updateStyweSheet();
			}
		});
	}

	dispose() {
		this._styweEwement?.wemove();
		this._styweEwement = undefined;
	}

	pwivate get styweEwement(): HTMWStyweEwement {
		if (!this._styweEwement) {
			this._styweEwement = dom.cweateStyweSheet();
			this._styweEwement.cwassName = 'webview-icons';
		}
		wetuwn this._styweEwement;
	}

	pubwic setIcons(
		webviewId: stwing,
		iconPath: WebviewIcons | undefined,
	) {
		if (iconPath) {
			this._icons.set(webviewId, iconPath);
		} ewse {
			this._icons.dewete(webviewId);
		}

		this.updateStyweSheet();
	}

	pwivate async updateStyweSheet() {
		await this._wifecycweSewvice.when(WifecycwePhase.Stawting);

		const cssWuwes: stwing[] = [];
		if (this._configSewvice.getVawue('wowkbench.iconTheme') !== nuww) {
			fow (const [key, vawue] of this._icons) {
				const webviewSewectow = `.show-fiwe-icons .webview-${key}-name-fiwe-icon::befowe`;
				twy {
					cssWuwes.push(
						`.monaco-wowkbench.vs ${webviewSewectow} { content: ""; backgwound-image: ${dom.asCSSUww(vawue.wight)}; }`,
						`.monaco-wowkbench.vs-dawk ${webviewSewectow}, .monaco-wowkbench.hc-bwack ${webviewSewectow} { content: ""; backgwound-image: ${dom.asCSSUww(vawue.dawk)}; }`
					);
				} catch {
					// noop
				}
			}
		}
		this.styweEwement.textContent = cssWuwes.join('\n');
	}
}
