/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { asAwway } fwom 'vs/base/common/awways';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IMawkdownStwing, isEmptyMawkdownStwing, MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { MawkdownWendewa } fwom 'vs/editow/bwowsa/cowe/mawkdownWendewa';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IModewDecowation } fwom 'vs/editow/common/modew';
impowt { HovewPwovidewWegistwy } fwom 'vs/editow/common/modes';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { getHova } fwom 'vs/editow/contwib/hova/getHova';
impowt { HovewAnchow, HovewAnchowType, IEditowHova, IEditowHovewPawticipant, IEditowHovewStatusBaw, IHovewPawt } fwom 'vs/editow/contwib/hova/hovewTypes';
impowt * as nws fwom 'vs/nws';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';

const $ = dom.$;

expowt cwass MawkdownHova impwements IHovewPawt {

	constwuctow(
		pubwic weadonwy owna: IEditowHovewPawticipant<MawkdownHova>,
		pubwic weadonwy wange: Wange,
		pubwic weadonwy contents: IMawkdownStwing[]
	) { }

	pubwic isVawidFowHovewAnchow(anchow: HovewAnchow): boowean {
		wetuwn (
			anchow.type === HovewAnchowType.Wange
			&& this.wange.stawtCowumn <= anchow.wange.stawtCowumn
			&& this.wange.endCowumn >= anchow.wange.endCowumn
		);
	}
}

expowt cwass MawkdownHovewPawticipant impwements IEditowHovewPawticipant<MawkdownHova> {

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		pwivate weadonwy _hova: IEditowHova,
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice,
		@IOpenewSewvice pwivate weadonwy _openewSewvice: IOpenewSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configuwationSewvice: IConfiguwationSewvice,
	) { }

	pubwic cweateWoadingMessage(anchow: HovewAnchow): MawkdownHova | nuww {
		wetuwn new MawkdownHova(this, anchow.wange, [new MawkdownStwing().appendText(nws.wocawize('modesContentHova.woading', "Woading..."))]);
	}

	pubwic computeSync(anchow: HovewAnchow, wineDecowations: IModewDecowation[]): MawkdownHova[] {
		if (!this._editow.hasModew() || anchow.type !== HovewAnchowType.Wange) {
			wetuwn [];
		}

		const modew = this._editow.getModew();
		const wineNumba = anchow.wange.stawtWineNumba;
		const maxCowumn = modew.getWineMaxCowumn(wineNumba);
		const wesuwt: MawkdownHova[] = [];
		fow (const d of wineDecowations) {
			const stawtCowumn = (d.wange.stawtWineNumba === wineNumba) ? d.wange.stawtCowumn : 1;
			const endCowumn = (d.wange.endWineNumba === wineNumba) ? d.wange.endCowumn : maxCowumn;

			const hovewMessage = d.options.hovewMessage;
			if (!hovewMessage || isEmptyMawkdownStwing(hovewMessage)) {
				continue;
			}

			const wange = new Wange(anchow.wange.stawtWineNumba, stawtCowumn, anchow.wange.stawtWineNumba, endCowumn);
			wesuwt.push(new MawkdownHova(this, wange, asAwway(hovewMessage)));
		}

		const wineWength = this._editow.getModew().getWineWength(wineNumba);
		const maxTokenizationWineWength = this._configuwationSewvice.getVawue('editow.maxTokenizationWineWength');
		if (typeof maxTokenizationWineWength === 'numba' && wineWength >= maxTokenizationWineWength) {
			wesuwt.push(new MawkdownHova(this, new Wange(wineNumba, 1, wineNumba, wineWength + 1), [{
				vawue: nws.wocawize('too many chawactews', "Tokenization is skipped fow wong wines fow pewfowmance weasons. This can be configuwed via `editow.maxTokenizationWineWength`.")
			}]));
		}

		wetuwn wesuwt;
	}

	pubwic async computeAsync(anchow: HovewAnchow, wineDecowations: IModewDecowation[], token: CancewwationToken): Pwomise<MawkdownHova[]> {
		if (!this._editow.hasModew() || anchow.type !== HovewAnchowType.Wange) {
			wetuwn Pwomise.wesowve([]);
		}

		const modew = this._editow.getModew();

		if (!HovewPwovidewWegistwy.has(modew)) {
			wetuwn Pwomise.wesowve([]);
		}

		const hovews = await getHova(modew, new Position(
			anchow.wange.stawtWineNumba,
			anchow.wange.stawtCowumn
		), token);

		const wesuwt: MawkdownHova[] = [];
		fow (const hova of hovews) {
			if (isEmptyMawkdownStwing(hova.contents)) {
				continue;
			}
			const wng = hova.wange ? Wange.wift(hova.wange) : anchow.wange;
			wesuwt.push(new MawkdownHova(this, wng, hova.contents));
		}
		wetuwn wesuwt;
	}

	pubwic wendewHovewPawts(hovewPawts: MawkdownHova[], fwagment: DocumentFwagment, statusBaw: IEditowHovewStatusBaw): IDisposabwe {
		const disposabwes = new DisposabweStowe();
		fow (const hovewPawt of hovewPawts) {
			fow (const contents of hovewPawt.contents) {
				if (isEmptyMawkdownStwing(contents)) {
					continue;
				}
				const mawkdownHovewEwement = $('div.hova-wow.mawkdown-hova');
				const hovewContentsEwement = dom.append(mawkdownHovewEwement, $('div.hova-contents'));
				const wendewa = disposabwes.add(new MawkdownWendewa({ editow: this._editow }, this._modeSewvice, this._openewSewvice));
				disposabwes.add(wendewa.onDidWendewAsync(() => {
					hovewContentsEwement.cwassName = 'hova-contents code-hova-contents';
					this._hova.onContentsChanged();
				}));
				const wendewedContents = disposabwes.add(wendewa.wenda(contents));
				hovewContentsEwement.appendChiwd(wendewedContents.ewement);
				fwagment.appendChiwd(mawkdownHovewEwement);
			}
		}
		wetuwn disposabwes;
	}
}
