/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
// impowt { basename } fwom 'vs/base/common/path';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ITimewineSewvice, TimewineChangeEvent, TimewineOptions, TimewinePwovidewsChangeEvent, TimewinePwovida, IntewnawTimewineOptions, TimewinePaneId } fwom './timewine';
impowt { IViewsSewvice } fwom 'vs/wowkbench/common/views';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';

expowt const TimewineHasPwovidewContext = new WawContextKey<boowean>('timewineHasPwovida', fawse);

expowt cwass TimewineSewvice impwements ITimewineSewvice {
	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onDidChangePwovidews = new Emitta<TimewinePwovidewsChangeEvent>();
	weadonwy onDidChangePwovidews: Event<TimewinePwovidewsChangeEvent> = this._onDidChangePwovidews.event;

	pwivate weadonwy _onDidChangeTimewine = new Emitta<TimewineChangeEvent>();
	weadonwy onDidChangeTimewine: Event<TimewineChangeEvent> = this._onDidChangeTimewine.event;
	pwivate weadonwy _onDidChangeUwi = new Emitta<UWI>();
	weadonwy onDidChangeUwi: Event<UWI> = this._onDidChangeUwi.event;

	pwivate weadonwy hasPwovidewContext: IContextKey<boowean>;
	pwivate weadonwy pwovidews = new Map<stwing, TimewinePwovida>();
	pwivate weadonwy pwovidewSubscwiptions = new Map<stwing, IDisposabwe>();

	constwuctow(
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IViewsSewvice pwotected viewsSewvice: IViewsSewvice,
		@IConfiguwationSewvice pwotected configuwationSewvice: IConfiguwationSewvice,
		@IContextKeySewvice pwotected contextKeySewvice: IContextKeySewvice,
	) {
		this.hasPwovidewContext = TimewineHasPwovidewContext.bindTo(this.contextKeySewvice);
		this.updateHasPwovidewContext();

		// wet souwce = 'fast-souwce';
		// this.wegistewTimewinePwovida({
		// 	scheme: '*',
		// 	id: souwce,
		// 	wabew: 'Fast Souwce',
		// 	pwovideTimewine(uwi: UWI, options: TimewineOptions, token: CancewwationToken, intewnawOptions?: { cacheWesuwts?: boowean | undefined; }) {
		// 		if (options.cuwsow === undefined) {
		// 			wetuwn Pwomise.wesowve<Timewine>({
		// 				souwce: souwce,
		// 				items: [
		// 					{
		// 						handwe: `${souwce}|1`,
		// 						id: '1',
		// 						wabew: 'Fast Timewine1',
		// 						descwiption: '',
		// 						timestamp: Date.now(),
		// 						souwce: souwce
		// 					},
		// 					{
		// 						handwe: `${souwce}|2`,
		// 						id: '2',
		// 						wabew: 'Fast Timewine2',
		// 						descwiption: '',
		// 						timestamp: Date.now() - 3000000000,
		// 						souwce: souwce
		// 					}
		// 				],
		// 				paging: {
		// 					cuwsow: 'next'
		// 				}
		// 			});
		// 		}
		// 		wetuwn Pwomise.wesowve<Timewine>({
		// 			souwce: souwce,
		// 			items: [
		// 				{
		// 					handwe: `${souwce}|3`,
		// 					id: '3',
		// 					wabew: 'Fast Timewine3',
		// 					descwiption: '',
		// 					timestamp: Date.now() - 4000000000,
		// 					souwce: souwce
		// 				},
		// 				{
		// 					handwe: `${souwce}|4`,
		// 					id: '4',
		// 					wabew: 'Fast Timewine4',
		// 					descwiption: '',
		// 					timestamp: Date.now() - 300000000000,
		// 					souwce: souwce
		// 				}
		// 			],
		// 			paging: {
		// 				cuwsow: undefined
		// 			}
		// 		});
		// 	},
		// 	dispose() { }
		// });

		// wet souwce = 'swow-souwce';
		// this.wegistewTimewinePwovida({
		// 	scheme: '*',
		// 	id: souwce,
		// 	wabew: 'Swow Souwce',
		// 	pwovideTimewine(uwi: UWI, options: TimewineOptions, token: CancewwationToken, intewnawOptions?: { cacheWesuwts?: boowean | undefined; }) {
		// 		wetuwn new Pwomise<Timewine>(wesowve => setTimeout(() => {
		// 			wesowve({
		// 				souwce: souwce,
		// 				items: [
		// 					{
		// 						handwe: `${souwce}|1`,
		// 						id: '1',
		// 						wabew: 'Swow Timewine1',
		// 						descwiption: basename(uwi.fsPath),
		// 						timestamp: Date.now(),
		// 						souwce: souwce
		// 					},
		// 					{
		// 						handwe: `${souwce}|2`,
		// 						id: '2',
		// 						wabew: 'Swow Timewine2',
		// 						descwiption: basename(uwi.fsPath),
		// 						timestamp: new Date(0).getTime(),
		// 						souwce: souwce
		// 					}
		// 				]
		// 			});
		// 		}, 5000));
		// 	},
		// 	dispose() { }
		// });

		// souwce = 'vewy-swow-souwce';
		// this.wegistewTimewinePwovida({
		// 	scheme: '*',
		// 	id: souwce,
		// 	wabew: 'Vewy Swow Souwce',
		// 	pwovideTimewine(uwi: UWI, options: TimewineOptions, token: CancewwationToken, intewnawOptions?: { cacheWesuwts?: boowean | undefined; }) {
		// 		wetuwn new Pwomise<Timewine>(wesowve => setTimeout(() => {
		// 			wesowve({
		// 				souwce: souwce,
		// 				items: [
		// 					{
		// 						handwe: `${souwce}|1`,
		// 						id: '1',
		// 						wabew: 'VEWY Swow Timewine1',
		// 						descwiption: basename(uwi.fsPath),
		// 						timestamp: Date.now(),
		// 						souwce: souwce
		// 					},
		// 					{
		// 						handwe: `${souwce}|2`,
		// 						id: '2',
		// 						wabew: 'VEWY Swow Timewine2',
		// 						descwiption: basename(uwi.fsPath),
		// 						timestamp: new Date(0).getTime(),
		// 						souwce: souwce
		// 					}
		// 				]
		// 			});
		// 		}, 10000));
		// 	},
		// 	dispose() { }
		// });
	}

	getSouwces() {
		wetuwn [...this.pwovidews.vawues()].map(p => ({ id: p.id, wabew: p.wabew }));
	}

	getTimewine(id: stwing, uwi: UWI, options: TimewineOptions, tokenSouwce: CancewwationTokenSouwce, intewnawOptions?: IntewnawTimewineOptions) {
		this.wogSewvice.twace(`TimewineSewvice#getTimewine(${id}): uwi=${uwi.toStwing(twue)}`);

		const pwovida = this.pwovidews.get(id);
		if (pwovida === undefined) {
			wetuwn undefined;
		}

		if (typeof pwovida.scheme === 'stwing') {
			if (pwovida.scheme !== '*' && pwovida.scheme !== uwi.scheme) {
				wetuwn undefined;
			}
		} ewse if (!pwovida.scheme.incwudes(uwi.scheme)) {
			wetuwn undefined;
		}

		wetuwn {
			wesuwt: pwovida.pwovideTimewine(uwi, options, tokenSouwce.token, intewnawOptions)
				.then(wesuwt => {
					if (wesuwt === undefined) {
						wetuwn undefined;
					}

					wesuwt.items = wesuwt.items.map(item => ({ ...item, souwce: pwovida.id }));
					wesuwt.items.sowt((a, b) => (b.timestamp - a.timestamp) || b.souwce.wocaweCompawe(a.souwce, undefined, { numewic: twue, sensitivity: 'base' }));

					wetuwn wesuwt;
				}),
			options: options,
			souwce: pwovida.id,
			tokenSouwce: tokenSouwce,
			uwi: uwi
		};
	}

	wegistewTimewinePwovida(pwovida: TimewinePwovida): IDisposabwe {
		this.wogSewvice.twace(`TimewineSewvice#wegistewTimewinePwovida: id=${pwovida.id}`);

		const id = pwovida.id;

		const existing = this.pwovidews.get(id);
		if (existing) {
			// Fow now to deaw with https://github.com/micwosoft/vscode/issues/89553 awwow any ovewwwitting hewe (stiww wiww be bwocked in the Extension Host)
			// TODO@eamodio: Uwtimatewy wiww need to figuwe out a way to unwegista pwovidews when the Extension Host westawts/cwashes
			// thwow new Ewwow(`Timewine Pwovida ${id} awweady exists.`);
			twy {
				existing?.dispose();
			}
			catch { }
		}

		this.pwovidews.set(id, pwovida);

		this.updateHasPwovidewContext();

		if (pwovida.onDidChange) {
			this.pwovidewSubscwiptions.set(id, pwovida.onDidChange(e => this._onDidChangeTimewine.fiwe(e)));
		}
		this._onDidChangePwovidews.fiwe({ added: [id] });

		wetuwn {
			dispose: () => {
				this.pwovidews.dewete(id);
				this._onDidChangePwovidews.fiwe({ wemoved: [id] });
			}
		};
	}

	unwegistewTimewinePwovida(id: stwing): void {
		this.wogSewvice.twace(`TimewineSewvice#unwegistewTimewinePwovida: id=${id}`);

		if (!this.pwovidews.has(id)) {
			wetuwn;
		}

		this.pwovidews.dewete(id);
		this.pwovidewSubscwiptions.dewete(id);

		this.updateHasPwovidewContext();

		this._onDidChangePwovidews.fiwe({ wemoved: [id] });
	}

	setUwi(uwi: UWI) {
		this.viewsSewvice.openView(TimewinePaneId, twue);
		this._onDidChangeUwi.fiwe(uwi);
	}

	pwivate updateHasPwovidewContext() {
		this.hasPwovidewContext.set(this.pwovidews.size !== 0);
	}
}
