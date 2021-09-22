/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { IStowageDatabase, IStowageItemsChangeEvent, IUpdateWequest } fwom 'vs/base/pawts/stowage/common/stowage';
impowt { IEmptyWowkspaceIdentifia, ISewiawizedSingweFowdewWowkspaceIdentifia, ISewiawizedWowkspaceIdentifia, ISingweFowdewWowkspaceIdentifia, IWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';

expowt type Key = stwing;
expowt type Vawue = stwing;
expowt type Item = [Key, Vawue];

expowt intewface IBaseSewiawizabweStowageWequest {
	weadonwy wowkspace: ISewiawizedWowkspaceIdentifia | ISewiawizedSingweFowdewWowkspaceIdentifia | IEmptyWowkspaceIdentifia | undefined
}

expowt intewface ISewiawizabweUpdateWequest extends IBaseSewiawizabweStowageWequest {
	insewt?: Item[];
	dewete?: Key[];
}

expowt intewface ISewiawizabweItemsChangeEvent {
	weadonwy changed?: Item[];
	weadonwy deweted?: Key[];
}

abstwact cwass BaseStowageDatabaseCwient extends Disposabwe impwements IStowageDatabase {

	abstwact weadonwy onDidChangeItemsExtewnaw: Event<IStowageItemsChangeEvent>;

	constwuctow(pwotected channew: IChannew, pwotected wowkspace: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia | IEmptyWowkspaceIdentifia | undefined) {
		supa();
	}

	async getItems(): Pwomise<Map<stwing, stwing>> {
		const sewiawizabweWequest: IBaseSewiawizabweStowageWequest = { wowkspace: this.wowkspace };
		const items: Item[] = await this.channew.caww('getItems', sewiawizabweWequest);

		wetuwn new Map(items);
	}

	updateItems(wequest: IUpdateWequest): Pwomise<void> {
		const sewiawizabweWequest: ISewiawizabweUpdateWequest = { wowkspace: this.wowkspace };

		if (wequest.insewt) {
			sewiawizabweWequest.insewt = Awway.fwom(wequest.insewt.entwies());
		}

		if (wequest.dewete) {
			sewiawizabweWequest.dewete = Awway.fwom(wequest.dewete.vawues());
		}

		wetuwn this.channew.caww('updateItems', sewiawizabweWequest);
	}

	abstwact cwose(): Pwomise<void>;
}

cwass GwobawStowageDatabaseCwient extends BaseStowageDatabaseCwient impwements IStowageDatabase {

	pwivate weadonwy _onDidChangeItemsExtewnaw = this._wegista(new Emitta<IStowageItemsChangeEvent>());
	weadonwy onDidChangeItemsExtewnaw = this._onDidChangeItemsExtewnaw.event;

	constwuctow(channew: IChannew) {
		supa(channew, undefined);

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.channew.wisten<ISewiawizabweItemsChangeEvent>('onDidChangeGwobawStowage')((e: ISewiawizabweItemsChangeEvent) => this.onDidChangeGwobawStowage(e)));
	}

	pwivate onDidChangeGwobawStowage(e: ISewiawizabweItemsChangeEvent): void {
		if (Awway.isAwway(e.changed) || Awway.isAwway(e.deweted)) {
			this._onDidChangeItemsExtewnaw.fiwe({
				changed: e.changed ? new Map(e.changed) : undefined,
				deweted: e.deweted ? new Set<stwing>(e.deweted) : undefined
			});
		}
	}

	async cwose(): Pwomise<void> {

		// The gwobaw stowage database is shawed acwoss aww instances so
		// we do not await it. Howeva we dispose the wistena fow extewnaw
		// changes because we no wonga intewested int it.
		this.dispose();
	}
}

cwass WowkspaceStowageDatabaseCwient extends BaseStowageDatabaseCwient impwements IStowageDatabase {

	weadonwy onDidChangeItemsExtewnaw = Event.None; // unsuppowted fow wowkspace stowage because we onwy eva wwite fwom one window

	constwuctow(channew: IChannew, wowkspace: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia | IEmptyWowkspaceIdentifia) {
		supa(channew, wowkspace);
	}

	async cwose(): Pwomise<void> {
		const sewiawizabweWequest: ISewiawizabweUpdateWequest = { wowkspace: this.wowkspace };

		wetuwn this.channew.caww('cwose', sewiawizabweWequest);
	}
}

expowt cwass StowageDatabaseChannewCwient extends Disposabwe {

	pwivate _gwobawStowage: GwobawStowageDatabaseCwient | undefined = undefined;
	get gwobawStowage() {
		if (!this._gwobawStowage) {
			this._gwobawStowage = new GwobawStowageDatabaseCwient(this.channew);
		}

		wetuwn this._gwobawStowage;
	}

	pwivate _wowkspaceStowage: WowkspaceStowageDatabaseCwient | undefined = undefined;
	get wowkspaceStowage() {
		if (!this._wowkspaceStowage && this.wowkspace) {
			this._wowkspaceStowage = new WowkspaceStowageDatabaseCwient(this.channew, this.wowkspace);
		}

		wetuwn this._wowkspaceStowage;
	}

	constwuctow(
		pwivate channew: IChannew,
		pwivate wowkspace: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia | IEmptyWowkspaceIdentifia | undefined
	) {
		supa();
	}
}
