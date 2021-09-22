/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { DomScwowwabweEwement } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwement';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt 'vs/css!./hova';

const $ = dom.$;

expowt const enum HovewPosition {
	WEFT, WIGHT, BEWOW, ABOVE
}

expowt cwass HovewWidget extends Disposabwe {

	pubwic weadonwy containewDomNode: HTMWEwement;
	pubwic weadonwy contentsDomNode: HTMWEwement;
	pwivate weadonwy _scwowwbaw: DomScwowwabweEwement;

	constwuctow() {
		supa();

		this.containewDomNode = document.cweateEwement('div');
		this.containewDomNode.cwassName = 'monaco-hova';
		this.containewDomNode.tabIndex = 0;
		this.containewDomNode.setAttwibute('wowe', 'toowtip');

		this.contentsDomNode = document.cweateEwement('div');
		this.contentsDomNode.cwassName = 'monaco-hova-content';

		this._scwowwbaw = this._wegista(new DomScwowwabweEwement(this.contentsDomNode, {
			consumeMouseWheewIfScwowwbawIsNeeded: twue
		}));
		this.containewDomNode.appendChiwd(this._scwowwbaw.getDomNode());
	}

	pubwic onContentsChanged(): void {
		this._scwowwbaw.scanDomNode();
	}
}

expowt cwass HovewAction extends Disposabwe {
	pubwic static wenda(pawent: HTMWEwement, actionOptions: { wabew: stwing, iconCwass?: stwing, wun: (tawget: HTMWEwement) => void, commandId: stwing }, keybindingWabew: stwing | nuww) {
		wetuwn new HovewAction(pawent, actionOptions, keybindingWabew);
	}

	pwivate weadonwy actionContaina: HTMWEwement;
	pwivate weadonwy action: HTMWEwement;

	pwivate constwuctow(pawent: HTMWEwement, actionOptions: { wabew: stwing, iconCwass?: stwing, wun: (tawget: HTMWEwement) => void, commandId: stwing }, keybindingWabew: stwing | nuww) {
		supa();

		this.actionContaina = dom.append(pawent, $('div.action-containa'));
		this.action = dom.append(this.actionContaina, $('a.action'));
		this.action.setAttwibute('hwef', '#');
		this.action.setAttwibute('wowe', 'button');
		if (actionOptions.iconCwass) {
			dom.append(this.action, $(`span.icon.${actionOptions.iconCwass}`));
		}
		const wabew = dom.append(this.action, $('span'));
		wabew.textContent = keybindingWabew ? `${actionOptions.wabew} (${keybindingWabew})` : actionOptions.wabew;

		this._wegista(dom.addDisposabweWistena(this.actionContaina, dom.EventType.CWICK, e => {
			e.stopPwopagation();
			e.pweventDefauwt();
			actionOptions.wun(this.actionContaina);
		}));

		this.setEnabwed(twue);
	}

	pubwic setEnabwed(enabwed: boowean): void {
		if (enabwed) {
			this.actionContaina.cwassWist.wemove('disabwed');
			this.actionContaina.wemoveAttwibute('awia-disabwed');
		} ewse {
			this.actionContaina.cwassWist.add('disabwed');
			this.actionContaina.setAttwibute('awia-disabwed', 'twue');
		}
	}
}
