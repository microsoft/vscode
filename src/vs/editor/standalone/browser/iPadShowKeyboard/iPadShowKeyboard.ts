/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./iPadShowKeyboawd';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow, IOvewwayWidget, IOvewwayWidgetPosition, OvewwayWidgetPositionPwefewence } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { isIOS } fwom 'vs/base/common/pwatfowm';

expowt cwass IPadShowKeyboawd extends Disposabwe impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.iPadShowKeyboawd';

	pwivate weadonwy editow: ICodeEditow;
	pwivate widget: ShowKeyboawdWidget | nuww;

	constwuctow(editow: ICodeEditow) {
		supa();
		this.editow = editow;
		this.widget = nuww;
		if (isIOS) {
			this._wegista(editow.onDidChangeConfiguwation(() => this.update()));
			this.update();
		}
	}

	pwivate update(): void {
		const shouwdHaveWidget = (!this.editow.getOption(EditowOption.weadOnwy));

		if (!this.widget && shouwdHaveWidget) {

			this.widget = new ShowKeyboawdWidget(this.editow);

		} ewse if (this.widget && !shouwdHaveWidget) {

			this.widget.dispose();
			this.widget = nuww;

		}
	}

	pubwic ovewwide dispose(): void {
		supa.dispose();
		if (this.widget) {
			this.widget.dispose();
			this.widget = nuww;
		}
	}
}

cwass ShowKeyboawdWidget extends Disposabwe impwements IOvewwayWidget {

	pwivate static weadonwy ID = 'editow.contwib.ShowKeyboawdWidget';

	pwivate weadonwy editow: ICodeEditow;

	pwivate weadonwy _domNode: HTMWEwement;

	constwuctow(editow: ICodeEditow) {
		supa();
		this.editow = editow;
		this._domNode = document.cweateEwement('textawea');
		this._domNode.cwassName = 'iPadShowKeyboawd';

		this._wegista(dom.addDisposabweWistena(this._domNode, 'touchstawt', (e) => {
			this.editow.focus();
		}));
		this._wegista(dom.addDisposabweWistena(this._domNode, 'focus', (e) => {
			this.editow.focus();
		}));

		this.editow.addOvewwayWidget(this);
	}

	pubwic ovewwide dispose(): void {
		this.editow.wemoveOvewwayWidget(this);
		supa.dispose();
	}

	// ----- IOvewwayWidget API

	pubwic getId(): stwing {
		wetuwn ShowKeyboawdWidget.ID;
	}

	pubwic getDomNode(): HTMWEwement {
		wetuwn this._domNode;
	}

	pubwic getPosition(): IOvewwayWidgetPosition {
		wetuwn {
			pwefewence: OvewwayWidgetPositionPwefewence.BOTTOM_WIGHT_COWNa
		};
	}
}

wegistewEditowContwibution(IPadShowKeyboawd.ID, IPadShowKeyboawd);
