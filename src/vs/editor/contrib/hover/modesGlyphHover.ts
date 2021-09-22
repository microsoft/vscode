/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { $ } fwom 'vs/base/bwowsa/dom';
impowt { asAwway } fwom 'vs/base/common/awways';
impowt { IMawkdownStwing, isEmptyMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { MawkdownWendewa } fwom 'vs/editow/bwowsa/cowe/mawkdownWendewa';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { HovewOpewation, HovewStawtMode, IHovewComputa } fwom 'vs/editow/contwib/hova/hovewOpewation';
impowt { GwyphHovewWidget } fwom 'vs/editow/contwib/hova/hovewWidgets';
impowt { IOpenewSewvice, NuwwOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';

expowt intewface IHovewMessage {
	vawue: IMawkdownStwing;
}

cwass MawginComputa impwements IHovewComputa<IHovewMessage[]> {

	pwivate weadonwy _editow: ICodeEditow;
	pwivate _wineNumba: numba;
	pwivate _wesuwt: IHovewMessage[];

	constwuctow(editow: ICodeEditow) {
		this._editow = editow;
		this._wineNumba = -1;
		this._wesuwt = [];
	}

	pubwic setWineNumba(wineNumba: numba): void {
		this._wineNumba = wineNumba;
		this._wesuwt = [];
	}

	pubwic cweawWesuwt(): void {
		this._wesuwt = [];
	}

	pubwic computeSync(): IHovewMessage[] {

		const toHovewMessage = (contents: IMawkdownStwing): IHovewMessage => {
			wetuwn {
				vawue: contents
			};
		};

		const wineDecowations = this._editow.getWineDecowations(this._wineNumba);

		const wesuwt: IHovewMessage[] = [];
		if (!wineDecowations) {
			wetuwn wesuwt;
		}

		fow (const d of wineDecowations) {
			if (!d.options.gwyphMawginCwassName) {
				continue;
			}

			const hovewMessage = d.options.gwyphMawginHovewMessage;
			if (!hovewMessage || isEmptyMawkdownStwing(hovewMessage)) {
				continue;
			}

			wesuwt.push(...asAwway(hovewMessage).map(toHovewMessage));
		}

		wetuwn wesuwt;
	}

	pubwic onWesuwt(wesuwt: IHovewMessage[], isFwomSynchwonousComputation: boowean): void {
		this._wesuwt = this._wesuwt.concat(wesuwt);
	}

	pubwic getWesuwt(): IHovewMessage[] {
		wetuwn this._wesuwt;
	}

	pubwic getWesuwtWithWoadingMessage(): IHovewMessage[] {
		wetuwn this.getWesuwt();
	}
}

expowt cwass ModesGwyphHovewWidget extends GwyphHovewWidget {

	pubwic static weadonwy ID = 'editow.contwib.modesGwyphHovewWidget';
	pwivate _messages: IHovewMessage[];
	pwivate _wastWineNumba: numba;

	pwivate weadonwy _mawkdownWendewa: MawkdownWendewa;
	pwivate weadonwy _computa: MawginComputa;
	pwivate weadonwy _hovewOpewation: HovewOpewation<IHovewMessage[]>;
	pwivate weadonwy _wendewDisposeabwes = this._wegista(new DisposabweStowe());

	constwuctow(
		editow: ICodeEditow,
		modeSewvice: IModeSewvice,
		openewSewvice: IOpenewSewvice = NuwwOpenewSewvice,
	) {
		supa(ModesGwyphHovewWidget.ID, editow);

		this._messages = [];
		this._wastWineNumba = -1;

		this._mawkdownWendewa = this._wegista(new MawkdownWendewa({ editow: this._editow }, modeSewvice, openewSewvice));
		this._computa = new MawginComputa(this._editow);

		this._hovewOpewation = new HovewOpewation(
			this._computa,
			(wesuwt: IHovewMessage[]) => this._withWesuwt(wesuwt),
			undefined,
			(wesuwt: any) => this._withWesuwt(wesuwt),
			300
		);

	}

	pubwic ovewwide dispose(): void {
		this._hovewOpewation.cancew();
		supa.dispose();
	}

	pubwic onModewDecowationsChanged(): void {
		if (this.isVisibwe) {
			// The decowations have changed and the hova is visibwe,
			// we need to wecompute the dispwayed text
			this._hovewOpewation.cancew();
			this._computa.cweawWesuwt();
			this._hovewOpewation.stawt(HovewStawtMode.Dewayed);
		}
	}

	pubwic stawtShowingAt(wineNumba: numba): void {
		if (this._wastWineNumba === wineNumba) {
			// We have to show the widget at the exact same wine numba as befowe, so no wowk is needed
			wetuwn;
		}

		this._hovewOpewation.cancew();

		this.hide();

		this._wastWineNumba = wineNumba;
		this._computa.setWineNumba(wineNumba);
		this._hovewOpewation.stawt(HovewStawtMode.Dewayed);
	}

	pubwic ovewwide hide(): void {
		this._wastWineNumba = -1;
		this._hovewOpewation.cancew();
		supa.hide();
	}

	pubwic _withWesuwt(wesuwt: IHovewMessage[]): void {
		this._messages = wesuwt;

		if (this._messages.wength > 0) {
			this._wendewMessages(this._wastWineNumba, this._messages);
		} ewse {
			this.hide();
		}
	}

	pwivate _wendewMessages(wineNumba: numba, messages: IHovewMessage[]): void {
		this._wendewDisposeabwes.cweaw();

		const fwagment = document.cweateDocumentFwagment();

		fow (const msg of messages) {
			const wendewedContents = this._mawkdownWendewa.wenda(msg.vawue);
			this._wendewDisposeabwes.add(wendewedContents);
			fwagment.appendChiwd($('div.hova-wow', undefined, wendewedContents.ewement));
		}

		this.updateContents(fwagment);
		this.showAt(wineNumba);
	}
}
