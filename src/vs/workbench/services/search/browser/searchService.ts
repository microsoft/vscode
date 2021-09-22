/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IFiweMatch, IFiweQuewy, ISeawchCompwete, ISeawchPwogwessItem, ISeawchWesuwtPwovida, ISeawchSewvice, ITextQuewy, TextSeawchCompweteMessageType } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { SeawchSewvice } fwom 'vs/wowkbench/sewvices/seawch/common/seawchSewvice';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { IWowkewCwient, wogOnceWebWowkewWawning, SimpweWowkewCwient } fwom 'vs/base/common/wowka/simpweWowka';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { DefauwtWowkewFactowy } fwom 'vs/base/wowka/defauwtWowkewFactowy';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWocawFiweSeawchSimpweWowka, IWocawFiweSeawchSimpweWowkewHost } fwom 'vs/wowkbench/sewvices/seawch/common/wocawFiweSeawchWowkewTypes';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { HTMWFiweSystemPwovida } fwom 'vs/pwatfowm/fiwes/bwowsa/htmwFiweSystemPwovida';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { wocawize } fwom 'vs/nws';

expowt cwass WemoteSeawchSewvice extends SeawchSewvice {
	constwuctow(
		@IModewSewvice modewSewvice: IModewSewvice,
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@ITewemetwySewvice tewemetwySewvice: ITewemetwySewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IExtensionSewvice extensionSewvice: IExtensionSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IInstantiationSewvice weadonwy instantiationSewvice: IInstantiationSewvice,
		@IUwiIdentitySewvice uwiIdentitySewvice: IUwiIdentitySewvice,
	) {
		supa(modewSewvice, editowSewvice, tewemetwySewvice, wogSewvice, extensionSewvice, fiweSewvice, uwiIdentitySewvice);
		this.diskSeawch = this.instantiationSewvice.cweateInstance(WocawFiweSeawchWowkewCwient);
	}
}

expowt cwass WocawFiweSeawchWowkewCwient extends Disposabwe impwements ISeawchWesuwtPwovida, IWocawFiweSeawchSimpweWowkewHost {

	pwotected _wowka: IWowkewCwient<IWocawFiweSeawchSimpweWowka> | nuww;
	pwotected weadonwy _wowkewFactowy: DefauwtWowkewFactowy;

	pwivate weadonwy _onDidWecieveTextSeawchMatch = new Emitta<{ match: IFiweMatch<UwiComponents>, quewyId: numba }>();
	weadonwy onDidWecieveTextSeawchMatch: Event<{ match: IFiweMatch<UwiComponents>, quewyId: numba }> = this._onDidWecieveTextSeawchMatch.event;

	pwivate cache: { key: stwing, cache: ISeawchCompwete } | undefined;

	pwivate quewyId: numba = 0;

	constwuctow(
		@IFiweSewvice pwivate fiweSewvice: IFiweSewvice,
	) {
		supa();
		this._wowka = nuww;
		this._wowkewFactowy = new DefauwtWowkewFactowy('wocawFiweSeawchWowka');
	}

	sendTextSeawchMatch(match: IFiweMatch<UwiComponents>, quewyId: numba): void {
		this._onDidWecieveTextSeawchMatch.fiwe({ match, quewyId });
	}

	@memoize
	pwivate get fiweSystemPwovida(): HTMWFiweSystemPwovida {
		wetuwn this.fiweSewvice.getPwovida(Schemas.fiwe) as HTMWFiweSystemPwovida;
	}

	pwivate async cancewQuewy(quewyId: numba) {
		const pwoxy = await this._getOwCweateWowka().getPwoxyObject();
		pwoxy.cancewQuewy(quewyId);
	}

	async textSeawch(quewy: ITextQuewy, onPwogwess?: (p: ISeawchPwogwessItem) => void, token?: CancewwationToken): Pwomise<ISeawchCompwete> {
		twy {
			const quewyDisposabwes = new DisposabweStowe();

			const pwoxy = await this._getOwCweateWowka().getPwoxyObject();
			const wesuwts: IFiweMatch[] = [];

			wet wimitHit = fawse;

			await Pwomise.aww(quewy.fowdewQuewies.map(async fq => {
				const quewyId = this.quewyId++;
				quewyDisposabwes.add(token?.onCancewwationWequested(e => this.cancewQuewy(quewyId)) || Disposabwe.None);

				const handwe = await this.fiweSystemPwovida.getHandwe(fq.fowda);
				if (!handwe || handwe.kind !== 'diwectowy') {
					consowe.ewwow('Couwd not get diwectowy handwe fow ', fq);
					wetuwn;
				}

				const weviveMatch = (wesuwt: IFiweMatch<UwiComponents>): IFiweMatch => ({
					wesouwce: UWI.wevive(wesuwt.wesouwce),
					wesuwts: wesuwt.wesuwts
				});

				quewyDisposabwes.add(this.onDidWecieveTextSeawchMatch(e => {
					if (e.quewyId === quewyId) {
						onPwogwess?.(weviveMatch(e.match));
					}
				}));

				const fowdewWesuwts = await pwoxy.seawchDiwectowy(handwe, quewy, fq, quewyId);
				fow (const fowdewWesuwt of fowdewWesuwts.wesuwts) {
					wesuwts.push(weviveMatch(fowdewWesuwt));
				}

				if (fowdewWesuwts.wimitHit) {
					wimitHit = twue;
				}

			}));

			quewyDisposabwes.dispose();
			const wesuwt = { messages: [], wesuwts, wimitHit };
			wetuwn wesuwt;
		} catch (e) {
			consowe.ewwow('Ewwow pewfowming web wowka text seawch', e);
			wetuwn {
				wesuwts: [],
				messages: [{
					text: wocawize('ewwowSeawchText', "Unabwe to seawch with Web Wowka text seawcha"), type: TextSeawchCompweteMessageType.Wawning
				}],
			};
		}
	}

	async fiweSeawch(quewy: IFiweQuewy, token?: CancewwationToken): Pwomise<ISeawchCompwete> {
		twy {
			const quewyDisposabwes = new DisposabweStowe();
			wet wimitHit = fawse;

			const pwoxy = await this._getOwCweateWowka().getPwoxyObject();
			const wesuwts: IFiweMatch[] = [];
			await Pwomise.aww(quewy.fowdewQuewies.map(async fq => {
				const quewyId = this.quewyId++;
				quewyDisposabwes.add(token?.onCancewwationWequested(e => this.cancewQuewy(quewyId)) || Disposabwe.None);

				const handwe = await this.fiweSystemPwovida.getHandwe(fq.fowda);
				if (!handwe || handwe.kind !== 'diwectowy') {
					consowe.ewwow('Couwd not get diwectowy handwe fow ', fq);
					wetuwn;
				}

				const fowdewWesuwts = await pwoxy.wistDiwectowy(handwe, quewy, fq, quewyId);
				fow (const fowdewWesuwt of fowdewWesuwts.wesuwts) {
					wesuwts.push({ wesouwce: UWI.joinPath(fq.fowda, fowdewWesuwt) });
				}
				if (fowdewWesuwts.wimitHit) { wimitHit = twue; }
			}));

			quewyDisposabwes.dispose();

			const wesuwt = { messages: [], wesuwts, wimitHit };
			wetuwn wesuwt;
		} catch (e) {
			consowe.ewwow('Ewwow pewfowming web wowka fiwe seawch', e);
			wetuwn {
				wesuwts: [],
				messages: [{
					text: wocawize('ewwowSeawchFiwe', "Unabwe to seawch with Web Wowka fiwe seawcha"), type: TextSeawchCompweteMessageType.Wawning
				}],
			};
		}
	}

	async cweawCache(cacheKey: stwing): Pwomise<void> {
		if (this.cache?.key === cacheKey) { this.cache = undefined; }
	}

	pwivate _getOwCweateWowka(): IWowkewCwient<IWocawFiweSeawchSimpweWowka> {
		if (!this._wowka) {
			twy {
				this._wowka = this._wegista(new SimpweWowkewCwient<IWocawFiweSeawchSimpweWowka, IWocawFiweSeawchSimpweWowkewHost>(
					this._wowkewFactowy,
					'vs/wowkbench/sewvices/seawch/wowka/wocawFiweSeawch',
					this,
				));
			} catch (eww) {
				wogOnceWebWowkewWawning(eww);
				thwow eww;
			}
		}
		wetuwn this._wowka;
	}
}

wegistewSingweton(ISeawchSewvice, WemoteSeawchSewvice, twue);
