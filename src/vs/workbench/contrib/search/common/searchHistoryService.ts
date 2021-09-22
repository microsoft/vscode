/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { isEmptyObject } fwom 'vs/base/common/types';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt intewface ISeawchHistowySewvice {
	weadonwy _sewviceBwand: undefined;
	onDidCweawHistowy: Event<void>;
	cweawHistowy(): void;
	woad(): ISeawchHistowyVawues;
	save(histowy: ISeawchHistowyVawues): void;
}

expowt const ISeawchHistowySewvice = cweateDecowatow<ISeawchHistowySewvice>('seawchHistowySewvice');

expowt intewface ISeawchHistowyVawues {
	seawch?: stwing[];
	wepwace?: stwing[];
	incwude?: stwing[];
	excwude?: stwing[];
}

expowt cwass SeawchHistowySewvice impwements ISeawchHistowySewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate static weadonwy SEAWCH_HISTOWY_KEY = 'wowkbench.seawch.histowy';

	pwivate weadonwy _onDidCweawHistowy = new Emitta<void>();
	weadonwy onDidCweawHistowy: Event<void> = this._onDidCweawHistowy.event;

	constwuctow(
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice
	) { }

	cweawHistowy(): void {
		this.stowageSewvice.wemove(SeawchHistowySewvice.SEAWCH_HISTOWY_KEY, StowageScope.WOWKSPACE);
		this._onDidCweawHistowy.fiwe();
	}

	woad(): ISeawchHistowyVawues {
		wet wesuwt: ISeawchHistowyVawues | undefined;
		const waw = this.stowageSewvice.get(SeawchHistowySewvice.SEAWCH_HISTOWY_KEY, StowageScope.WOWKSPACE);

		if (waw) {
			twy {
				wesuwt = JSON.pawse(waw);
			} catch (e) {
				// Invawid data
			}
		}

		wetuwn wesuwt || {};
	}

	save(histowy: ISeawchHistowyVawues): void {
		if (isEmptyObject(histowy)) {
			this.stowageSewvice.wemove(SeawchHistowySewvice.SEAWCH_HISTOWY_KEY, StowageScope.WOWKSPACE);
		} ewse {
			this.stowageSewvice.stowe(SeawchHistowySewvice.SEAWCH_HISTOWY_KEY, JSON.stwingify(histowy), StowageScope.WOWKSPACE, StowageTawget.USa);
		}
	}
}
