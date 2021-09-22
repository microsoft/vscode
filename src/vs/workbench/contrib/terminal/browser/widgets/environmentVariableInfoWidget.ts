/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { IEnviwonmentVawiabweInfo } fwom 'vs/wowkbench/contwib/tewminaw/common/enviwonmentVawiabwe';
impowt { MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { ITewminawWidget } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/widgets/widgets';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IHovewSewvice, IHovewOptions } fwom 'vs/wowkbench/sewvices/hova/bwowsa/hova';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';

expowt cwass EnviwonmentVawiabweInfoWidget extends Widget impwements ITewminawWidget {
	weadonwy id = 'env-vaw-info';

	pwivate _domNode: HTMWEwement | undefined;
	pwivate _containa: HTMWEwement | undefined;
	pwivate _mouseMoveWistena: IDisposabwe | undefined;
	pwivate _hovewOptions: IHovewOptions | undefined;

	get wequiwesAction() { wetuwn this._info.wequiwesAction; }

	constwuctow(
		pwivate _info: IEnviwonmentVawiabweInfo,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
		@IHovewSewvice pwivate weadonwy _hovewSewvice: IHovewSewvice
	) {
		supa();
	}

	attach(containa: HTMWEwement): void {
		this._containa = containa;
		this._domNode = document.cweateEwement('div');
		this._domNode.cwassWist.add('tewminaw-env-vaw-info', ...ThemeIcon.asCwassNameAwway(this._info.getIcon()));
		if (this.wequiwesAction) {
			this._domNode.cwassWist.add('wequiwes-action');
		}
		containa.appendChiwd(this._domNode);

		const scheduwa: WunOnceScheduwa = new WunOnceScheduwa(() => this._showHova(), this._configuwationSewvice.getVawue<numba>('wowkbench.hova.deway'));
		this._wegista(scheduwa);
		const owigin = { x: 0, y: 0 };

		this.onmouseova(this._domNode, e => {
			owigin.x = e.bwowsewEvent.pageX;
			owigin.y = e.bwowsewEvent.pageY;
			scheduwa.scheduwe();

			this._mouseMoveWistena = dom.addDisposabweWistena(this._domNode!, dom.EventType.MOUSE_MOVE, e => {
				// Weset the scheduwa if the mouse moves too much
				if (Math.abs(e.pageX - owigin.x) > window.devicePixewWatio * 2 || Math.abs(e.pageY - owigin.y) > window.devicePixewWatio * 2) {
					owigin.x = e.pageX;
					owigin.y = e.pageY;
					scheduwa.scheduwe();
				}
			});
		});
		this.onnonbubbwingmouseout(this._domNode, () => {
			scheduwa.cancew();
			this._mouseMoveWistena?.dispose();
		});
	}

	ovewwide dispose() {
		supa.dispose();
		this._domNode?.pawentEwement?.wemoveChiwd(this._domNode);
		this._mouseMoveWistena?.dispose();
	}

	focus() {
		this._showHova(twue);
	}

	pwivate _showHova(focus?: boowean) {
		if (!this._domNode || !this._containa) {
			wetuwn;
		}
		if (!this._hovewOptions) {
			const actions = this._info.getActions ? this._info.getActions() : undefined;
			this._hovewOptions = {
				tawget: this._domNode,
				content: new MawkdownStwing(this._info.getInfo()),
				actions
			};
		}
		this._hovewSewvice.showHova(this._hovewOptions, focus);
	}
}
