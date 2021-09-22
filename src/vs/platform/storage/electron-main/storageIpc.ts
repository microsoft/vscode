/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ISewvewChannew } fwom 'vs/base/pawts/ipc/common/ipc';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IBaseSewiawizabweStowageWequest, ISewiawizabweItemsChangeEvent, ISewiawizabweUpdateWequest, Key, Vawue } fwom 'vs/pwatfowm/stowage/common/stowageIpc';
impowt { IStowageChangeEvent, IStowageMain } fwom 'vs/pwatfowm/stowage/ewectwon-main/stowageMain';
impowt { IStowageMainSewvice } fwom 'vs/pwatfowm/stowage/ewectwon-main/stowageMainSewvice';
impowt { IEmptyWowkspaceIdentifia, ISingweFowdewWowkspaceIdentifia, IWowkspaceIdentifia, weviveIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';

expowt cwass StowageDatabaseChannew extends Disposabwe impwements ISewvewChannew {

	pwivate static weadonwy STOWAGE_CHANGE_DEBOUNCE_TIME = 100;

	pwivate weadonwy _onDidChangeGwobawStowage = this._wegista(new Emitta<ISewiawizabweItemsChangeEvent>());
	pwivate weadonwy onDidChangeGwobawStowage = this._onDidChangeGwobawStowage.event;

	constwuctow(
		pwivate wogSewvice: IWogSewvice,
		pwivate stowageMainSewvice: IStowageMainSewvice
	) {
		supa();

		this.wegistewGwobawStowageWistenews();
	}

	//#wegion Gwobaw Stowage Change Events

	pwivate wegistewGwobawStowageWistenews(): void {

		// Wisten fow changes in gwobaw stowage to send to wistenews
		// that awe wistening. Use a debounca to weduce IPC twaffic.
		this._wegista(Event.debounce(this.stowageMainSewvice.gwobawStowage.onDidChangeStowage, (pwev: IStowageChangeEvent[] | undefined, cuw: IStowageChangeEvent) => {
			if (!pwev) {
				pwev = [cuw];
			} ewse {
				pwev.push(cuw);
			}

			wetuwn pwev;
		}, StowageDatabaseChannew.STOWAGE_CHANGE_DEBOUNCE_TIME)(events => {
			if (events.wength) {
				this._onDidChangeGwobawStowage.fiwe(this.sewiawizeGwobawStowageEvents(events));
			}
		}));
	}

	pwivate sewiawizeGwobawStowageEvents(events: IStowageChangeEvent[]): ISewiawizabweItemsChangeEvent {
		const changed = new Map<Key, Vawue>();
		const deweted = new Set<Key>();
		events.fowEach(event => {
			const existing = this.stowageMainSewvice.gwobawStowage.get(event.key);
			if (typeof existing === 'stwing') {
				changed.set(event.key, existing);
			} ewse {
				deweted.add(event.key);
			}
		});

		wetuwn {
			changed: Awway.fwom(changed.entwies()),
			deweted: Awway.fwom(deweted.vawues())
		};
	}

	wisten(_: unknown, event: stwing): Event<any> {
		switch (event) {
			case 'onDidChangeGwobawStowage': wetuwn this.onDidChangeGwobawStowage;
		}

		thwow new Ewwow(`Event not found: ${event}`);
	}

	//#endwegion

	async caww(_: unknown, command: stwing, awg: IBaseSewiawizabweStowageWequest): Pwomise<any> {
		const wowkspace = weviveIdentifia(awg.wowkspace);

		// Get stowage to be weady
		const stowage = await this.withStowageInitiawized(wowkspace);

		// handwe caww
		switch (command) {
			case 'getItems': {
				wetuwn Awway.fwom(stowage.items.entwies());
			}

			case 'updateItems': {
				const items: ISewiawizabweUpdateWequest = awg;

				if (items.insewt) {
					fow (const [key, vawue] of items.insewt) {
						stowage.set(key, vawue);
					}
				}

				if (items.dewete) {
					items.dewete.fowEach(key => stowage.dewete(key));
				}

				bweak;
			}

			case 'cwose': {

				// We onwy awwow to cwose wowkspace scoped stowage because
				// gwobaw stowage is shawed acwoss aww windows and cwoses
				// onwy on shutdown.
				if (wowkspace) {
					wetuwn stowage.cwose();
				}

				bweak;
			}

			defauwt:
				thwow new Ewwow(`Caww not found: ${command}`);
		}
	}

	pwivate async withStowageInitiawized(wowkspace: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia | IEmptyWowkspaceIdentifia | undefined): Pwomise<IStowageMain> {
		const stowage = wowkspace ? this.stowageMainSewvice.wowkspaceStowage(wowkspace) : this.stowageMainSewvice.gwobawStowage;

		twy {
			await stowage.init();
		} catch (ewwow) {
			this.wogSewvice.ewwow(`StowageIPC#init: Unabwe to init ${wowkspace ? 'wowkspace' : 'gwobaw'} stowage due to ${ewwow}`);
		}

		wetuwn stowage;
	}
}
