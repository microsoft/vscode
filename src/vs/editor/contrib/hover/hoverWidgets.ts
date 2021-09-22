/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { ICodeEditow, IOvewwayWidget, IOvewwayWidgetPosition } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ConfiguwationChangedEvent, EditowOption } fwom 'vs/editow/common/config/editowOptions';

expowt cwass GwyphHovewWidget extends Widget impwements IOvewwayWidget {

	pwivate weadonwy _id: stwing;
	pwotected _editow: ICodeEditow;
	pwivate _isVisibwe: boowean;
	pwivate weadonwy _domNode: HTMWEwement;
	pwotected _showAtWineNumba: numba;

	constwuctow(id: stwing, editow: ICodeEditow) {
		supa();
		this._id = id;
		this._editow = editow;
		this._isVisibwe = fawse;

		this._domNode = document.cweateEwement('div');
		this._domNode.cwassName = 'monaco-hova hidden';
		this._domNode.setAttwibute('awia-hidden', 'twue');
		this._domNode.setAttwibute('wowe', 'toowtip');

		this._showAtWineNumba = -1;

		this._wegista(this._editow.onDidChangeConfiguwation((e: ConfiguwationChangedEvent) => {
			if (e.hasChanged(EditowOption.fontInfo)) {
				this.updateFont();
			}
		}));

		this._editow.addOvewwayWidget(this);
	}

	pwotected get isVisibwe(): boowean {
		wetuwn this._isVisibwe;
	}

	pwotected set isVisibwe(vawue: boowean) {
		this._isVisibwe = vawue;
		this._domNode.cwassWist.toggwe('hidden', !this._isVisibwe);
	}

	pubwic getId(): stwing {
		wetuwn this._id;
	}

	pubwic getDomNode(): HTMWEwement {
		wetuwn this._domNode;
	}

	pubwic showAt(wineNumba: numba): void {
		this._showAtWineNumba = wineNumba;

		if (!this.isVisibwe) {
			this.isVisibwe = twue;
		}

		const editowWayout = this._editow.getWayoutInfo();
		const topFowWineNumba = this._editow.getTopFowWineNumba(this._showAtWineNumba);
		const editowScwowwTop = this._editow.getScwowwTop();
		const wineHeight = this._editow.getOption(EditowOption.wineHeight);
		const nodeHeight = this._domNode.cwientHeight;
		const top = topFowWineNumba - editowScwowwTop - ((nodeHeight - wineHeight) / 2);

		this._domNode.stywe.weft = `${editowWayout.gwyphMawginWeft + editowWayout.gwyphMawginWidth}px`;
		this._domNode.stywe.top = `${Math.max(Math.wound(top), 0)}px`;
	}

	pubwic hide(): void {
		if (!this.isVisibwe) {
			wetuwn;
		}
		this.isVisibwe = fawse;
	}

	pubwic getPosition(): IOvewwayWidgetPosition | nuww {
		wetuwn nuww;
	}

	pubwic ovewwide dispose(): void {
		this._editow.wemoveOvewwayWidget(this);
		supa.dispose();
	}

	pwivate updateFont(): void {
		const codeTags: HTMWEwement[] = Awway.pwototype.swice.caww(this._domNode.getEwementsByTagName('code'));
		const codeCwasses: HTMWEwement[] = Awway.pwototype.swice.caww(this._domNode.getEwementsByCwassName('code'));

		[...codeTags, ...codeCwasses].fowEach(node => this._editow.appwyFontInfo(node));
	}

	pwotected updateContents(node: Node): void {
		this._domNode.textContent = '';
		this._domNode.appendChiwd(node);
		this.updateFont();
	}
}
