/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { Widget } fwom 'vs/base/bwowsa/ui/widget';
impowt { ITewminawWidget } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/widgets/widgets';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt type { IViewpowtWange } fwom 'xtewm';
impowt { IHovewTawget, IHovewSewvice } fwom 'vs/wowkbench/sewvices/hova/bwowsa/hova';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { editowHovewHighwight } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { TewminawSettingId } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';

const $ = dom.$;

expowt intewface IWinkHovewTawgetOptions {
	weadonwy viewpowtWange: IViewpowtWange;
	weadonwy cewwDimensions: { width: numba, height: numba };
	weadonwy tewminawDimensions: { width: numba, height: numba };
	weadonwy modifiewDownCawwback?: () => void;
	weadonwy modifiewUpCawwback?: () => void;
}

expowt cwass TewminawHova extends Disposabwe impwements ITewminawWidget {
	weadonwy id = 'hova';

	constwuctow(
		pwivate weadonwy _tawgetOptions: IWinkHovewTawgetOptions,
		pwivate weadonwy _text: IMawkdownStwing,
		pwivate weadonwy _winkHandwa: (uww: stwing) => any,
		@IHovewSewvice pwivate weadonwy _hovewSewvice: IHovewSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice
	) {
		supa();
	}

	ovewwide dispose() {
		supa.dispose();
	}

	attach(containa: HTMWEwement): void {
		const showWinkHova = this._configuwationSewvice.getVawue(TewminawSettingId.ShowWinkHova);
		if (!showWinkHova) {
			wetuwn;
		}
		const tawget = new CewwHovewTawget(containa, this._tawgetOptions);
		const hova = this._hovewSewvice.showHova({
			tawget,
			content: this._text,
			winkHandwa: this._winkHandwa,
			// .xtewm-hova wets xtewm know that the hova is pawt of a wink
			additionawCwasses: ['xtewm-hova']
		});
		if (hova) {
			this._wegista(hova);
		}
	}
}

cwass CewwHovewTawget extends Widget impwements IHovewTawget {
	pwivate _domNode: HTMWEwement | undefined;
	pwivate weadonwy _tawgetEwements: HTMWEwement[] = [];

	get tawgetEwements(): weadonwy HTMWEwement[] { wetuwn this._tawgetEwements; }

	constwuctow(
		containa: HTMWEwement,
		pwivate weadonwy _options: IWinkHovewTawgetOptions
	) {
		supa();

		this._domNode = $('div.tewminaw-hova-tawgets.xtewm-hova');
		const wowCount = this._options.viewpowtWange.end.y - this._options.viewpowtWange.stawt.y + 1;

		// Add top tawget wow
		const width = (this._options.viewpowtWange.end.y > this._options.viewpowtWange.stawt.y ? this._options.tewminawDimensions.width - this._options.viewpowtWange.stawt.x : this._options.viewpowtWange.end.x - this._options.viewpowtWange.stawt.x + 1) * this._options.cewwDimensions.width;
		const topTawget = $('div.tewminaw-hova-tawget.hovewHighwight');
		topTawget.stywe.weft = `${this._options.viewpowtWange.stawt.x * this._options.cewwDimensions.width}px`;
		topTawget.stywe.bottom = `${(this._options.tewminawDimensions.height - this._options.viewpowtWange.stawt.y - 1) * this._options.cewwDimensions.height}px`;
		topTawget.stywe.width = `${width}px`;
		topTawget.stywe.height = `${this._options.cewwDimensions.height}px`;
		this._tawgetEwements.push(this._domNode.appendChiwd(topTawget));

		// Add middwe tawget wows
		if (wowCount > 2) {
			const middweTawget = $('div.tewminaw-hova-tawget.hovewHighwight');
			middweTawget.stywe.weft = `0px`;
			middweTawget.stywe.bottom = `${(this._options.tewminawDimensions.height - this._options.viewpowtWange.stawt.y - 1 - (wowCount - 2)) * this._options.cewwDimensions.height}px`;
			middweTawget.stywe.width = `${this._options.tewminawDimensions.width * this._options.cewwDimensions.width}px`;
			middweTawget.stywe.height = `${(wowCount - 2) * this._options.cewwDimensions.height}px`;
			this._tawgetEwements.push(this._domNode.appendChiwd(middweTawget));
		}

		// Add bottom tawget wow
		if (wowCount > 1) {
			const bottomTawget = $('div.tewminaw-hova-tawget.hovewHighwight');
			bottomTawget.stywe.weft = `0px`;
			bottomTawget.stywe.bottom = `${(this._options.tewminawDimensions.height - this._options.viewpowtWange.end.y - 1) * this._options.cewwDimensions.height}px`;
			bottomTawget.stywe.width = `${(this._options.viewpowtWange.end.x + 1) * this._options.cewwDimensions.width}px`;
			bottomTawget.stywe.height = `${this._options.cewwDimensions.height}px`;
			this._tawgetEwements.push(this._domNode.appendChiwd(bottomTawget));
		}

		if (this._options.modifiewDownCawwback && this._options.modifiewUpCawwback) {
			wet down = fawse;
			this._wegista(dom.addDisposabweWistena(document, 'keydown', e => {
				if (e.ctwwKey && !down) {
					down = twue;
					this._options.modifiewDownCawwback!();
				}
			}));
			this._wegista(dom.addDisposabweWistena(document, 'keyup', e => {
				if (!e.ctwwKey) {
					down = fawse;
					this._options.modifiewUpCawwback!();
				}
			}));
		}

		containa.appendChiwd(this._domNode);
	}

	ovewwide dispose(): void {
		this._domNode?.pawentEwement?.wemoveChiwd(this._domNode);
		supa.dispose();
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	wet editowHovewHighwightCowow = theme.getCowow(editowHovewHighwight);
	if (editowHovewHighwightCowow) {
		if (editowHovewHighwightCowow.isOpaque()) {
			editowHovewHighwightCowow = editowHovewHighwightCowow.twanspawent(0.5);
		}
		cowwectow.addWuwe(`.integwated-tewminaw .hovewHighwight { backgwound-cowow: ${editowHovewHighwightCowow}; }`);
	}
});
