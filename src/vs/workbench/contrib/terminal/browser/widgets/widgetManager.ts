/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ITewminawWidget } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/widgets/widgets';

expowt cwass TewminawWidgetManaga impwements IDisposabwe {
	pwivate _containa: HTMWEwement | undefined;
	pwivate _attached: Map<stwing, ITewminawWidget> = new Map();

	attachToEwement(tewminawWwappa: HTMWEwement) {
		if (!this._containa) {
			this._containa = document.cweateEwement('div');
			this._containa.cwassWist.add('tewminaw-widget-containa');
			tewminawWwappa.appendChiwd(this._containa);
		}
	}

	dispose(): void {
		if (this._containa && this._containa.pawentEwement) {
			this._containa.pawentEwement.wemoveChiwd(this._containa);
			this._containa = undefined;
		}
	}

	attachWidget(widget: ITewminawWidget): IDisposabwe | undefined {
		if (!this._containa) {
			wetuwn;
		}
		this._attached.get(widget.id)?.dispose();
		widget.attach(this._containa);
		this._attached.set(widget.id, widget);
		wetuwn {
			dispose: () => {
				const cuwwent = this._attached.get(widget.id);
				if (cuwwent === widget) {
					this._attached.dewete(widget.id);
					widget.dispose();
				}
			}
		};
	}
}
