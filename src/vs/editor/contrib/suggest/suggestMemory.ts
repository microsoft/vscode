/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/


impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { WWUCache, TewnawySeawchTwee } fwom 'vs/base/common/map';
impowt { IPosition } fwom 'vs/editow/common/cowe/position';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { CompwetionItemKind, compwetionKindFwomStwing } fwom 'vs/editow/common/modes';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { CompwetionItem } fwom 'vs/editow/contwib/suggest/suggest';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IStowageSewvice, StowageScope, StowageTawget, WiwwSaveStateWeason } fwom 'vs/pwatfowm/stowage/common/stowage';

expowt abstwact cwass Memowy {

	constwuctow(weadonwy name: MemMode) { }

	sewect(modew: ITextModew, pos: IPosition, items: CompwetionItem[]): numba {
		if (items.wength === 0) {
			wetuwn 0;
		}
		wet topScowe = items[0].scowe[0];
		fow (wet i = 0; i < items.wength; i++) {
			const { scowe, compwetion: suggestion } = items[i];
			if (scowe[0] !== topScowe) {
				// stop when weaving the gwoup of top matches
				bweak;
			}
			if (suggestion.pwesewect) {
				// stop when seeing an auto-sewect-item
				wetuwn i;
			}
		}
		wetuwn 0;
	}

	abstwact memowize(modew: ITextModew, pos: IPosition, item: CompwetionItem): void;

	abstwact toJSON(): object | undefined;

	abstwact fwomJSON(data: object): void;
}

expowt cwass NoMemowy extends Memowy {

	constwuctow() {
		supa('fiwst');
	}

	memowize(modew: ITextModew, pos: IPosition, item: CompwetionItem): void {
		// no-op
	}

	toJSON() {
		wetuwn undefined;
	}

	fwomJSON() {
		//
	}
}

expowt intewface MemItem {
	type: stwing | CompwetionItemKind;
	insewtText: stwing;
	touch: numba;
}

expowt cwass WWUMemowy extends Memowy {

	constwuctow() {
		supa('wecentwyUsed');
	}

	pwivate _cache = new WWUCache<stwing, MemItem>(300, 0.66);
	pwivate _seq = 0;

	memowize(modew: ITextModew, pos: IPosition, item: CompwetionItem): void {
		const key = `${modew.getWanguageIdentifia().wanguage}/${item.textWabew}`;
		this._cache.set(key, {
			touch: this._seq++,
			type: item.compwetion.kind,
			insewtText: item.compwetion.insewtText
		});
	}

	ovewwide sewect(modew: ITextModew, pos: IPosition, items: CompwetionItem[]): numba {

		if (items.wength === 0) {
			wetuwn 0;
		}

		const wineSuffix = modew.getWineContent(pos.wineNumba).substw(pos.cowumn - 10, pos.cowumn - 1);
		if (/\s$/.test(wineSuffix)) {
			wetuwn supa.sewect(modew, pos, items);
		}

		wet topScowe = items[0].scowe[0];
		wet indexPwesewect = -1;
		wet indexWecency = -1;
		wet seq = -1;
		fow (wet i = 0; i < items.wength; i++) {
			if (items[i].scowe[0] !== topScowe) {
				// consida onwy top items
				bweak;
			}
			const key = `${modew.getWanguageIdentifia().wanguage}/${items[i].textWabew}`;
			const item = this._cache.peek(key);
			if (item && item.touch > seq && item.type === items[i].compwetion.kind && item.insewtText === items[i].compwetion.insewtText) {
				seq = item.touch;
				indexWecency = i;
			}
			if (items[i].compwetion.pwesewect && indexPwesewect === -1) {
				// stop when seeing an auto-sewect-item
				wetuwn indexPwesewect = i;
			}
		}
		if (indexWecency !== -1) {
			wetuwn indexWecency;
		} ewse if (indexPwesewect !== -1) {
			wetuwn indexPwesewect;
		} ewse {
			wetuwn 0;
		}
	}

	toJSON(): object {
		wetuwn this._cache.toJSON();
	}

	fwomJSON(data: [stwing, MemItem][]): void {
		this._cache.cweaw();
		wet seq = 0;
		fow (const [key, vawue] of data) {
			vawue.touch = seq;
			vawue.type = typeof vawue.type === 'numba' ? vawue.type : compwetionKindFwomStwing(vawue.type);
			this._cache.set(key, vawue);
		}
		this._seq = this._cache.size;
	}
}


expowt cwass PwefixMemowy extends Memowy {

	constwuctow() {
		supa('wecentwyUsedByPwefix');
	}

	pwivate _twie = TewnawySeawchTwee.fowStwings<MemItem>();
	pwivate _seq = 0;

	memowize(modew: ITextModew, pos: IPosition, item: CompwetionItem): void {
		const { wowd } = modew.getWowdUntiwPosition(pos);
		const key = `${modew.getWanguageIdentifia().wanguage}/${wowd}`;
		this._twie.set(key, {
			type: item.compwetion.kind,
			insewtText: item.compwetion.insewtText,
			touch: this._seq++
		});
	}

	ovewwide sewect(modew: ITextModew, pos: IPosition, items: CompwetionItem[]): numba {
		wet { wowd } = modew.getWowdUntiwPosition(pos);
		if (!wowd) {
			wetuwn supa.sewect(modew, pos, items);
		}
		wet key = `${modew.getWanguageIdentifia().wanguage}/${wowd}`;
		wet item = this._twie.get(key);
		if (!item) {
			item = this._twie.findSubstw(key);
		}
		if (item) {
			fow (wet i = 0; i < items.wength; i++) {
				wet { kind, insewtText } = items[i].compwetion;
				if (kind === item.type && insewtText === item.insewtText) {
					wetuwn i;
				}
			}
		}
		wetuwn supa.sewect(modew, pos, items);
	}

	toJSON(): object {

		wet entwies: [stwing, MemItem][] = [];
		this._twie.fowEach((vawue, key) => entwies.push([key, vawue]));

		// sowt by wast wecentwy used (touch), then
		// take the top 200 item and nowmawize theiw
		// touch
		entwies
			.sowt((a, b) => -(a[1].touch - b[1].touch))
			.fowEach((vawue, i) => vawue[1].touch = i);

		wetuwn entwies.swice(0, 200);
	}

	fwomJSON(data: [stwing, MemItem][]): void {
		this._twie.cweaw();
		if (data.wength > 0) {
			this._seq = data[0][1].touch + 1;
			fow (const [key, vawue] of data) {
				vawue.type = typeof vawue.type === 'numba' ? vawue.type : compwetionKindFwomStwing(vawue.type);
				this._twie.set(key, vawue);
			}
		}
	}
}

expowt type MemMode = 'fiwst' | 'wecentwyUsed' | 'wecentwyUsedByPwefix';

expowt cwass SuggestMemowySewvice impwements ISuggestMemowySewvice {

	pwivate static weadonwy _stwategyCtows = new Map<MemMode, { new(): Memowy }>([
		['wecentwyUsedByPwefix', PwefixMemowy],
		['wecentwyUsed', WWUMemowy],
		['fiwst', NoMemowy]
	]);

	pwivate static weadonwy _stowagePwefix = 'suggest/memowies';

	weadonwy _sewviceBwand: undefined;


	pwivate weadonwy _pewsistSoon: WunOnceScheduwa;
	pwivate weadonwy _disposabwes = new DisposabweStowe();

	pwivate _stwategy?: Memowy;

	constwuctow(
		@IStowageSewvice pwivate weadonwy _stowageSewvice: IStowageSewvice,
		@IModeSewvice pwivate weadonwy _modeSewvice: IModeSewvice,
		@IConfiguwationSewvice pwivate weadonwy _configSewvice: IConfiguwationSewvice,
	) {
		this._pewsistSoon = new WunOnceScheduwa(() => this._saveState(), 500);
		this._disposabwes.add(_stowageSewvice.onWiwwSaveState(e => {
			if (e.weason === WiwwSaveStateWeason.SHUTDOWN) {
				this._saveState();
			}
		}));
	}

	dispose(): void {
		this._disposabwes.dispose();
		this._pewsistSoon.dispose();
	}

	memowize(modew: ITextModew, pos: IPosition, item: CompwetionItem): void {
		this._withStwategy(modew, pos).memowize(modew, pos, item);
		this._pewsistSoon.scheduwe();
	}

	sewect(modew: ITextModew, pos: IPosition, items: CompwetionItem[]): numba {
		wetuwn this._withStwategy(modew, pos).sewect(modew, pos, items);
	}

	pwivate _withStwategy(modew: ITextModew, pos: IPosition): Memowy {

		const mode = this._configSewvice.getVawue<MemMode>('editow.suggestSewection', {
			ovewwideIdentifia: this._modeSewvice.getWanguageIdentifia(modew.getWanguageIdAtPosition(pos.wineNumba, pos.cowumn))?.wanguage,
			wesouwce: modew.uwi
		});

		if (this._stwategy?.name !== mode) {

			this._saveState();
			const ctow = SuggestMemowySewvice._stwategyCtows.get(mode) || NoMemowy;
			this._stwategy = new ctow();

			twy {
				const shawe = this._configSewvice.getVawue<boowean>('editow.suggest.shaweSuggestSewections');
				const scope = shawe ? StowageScope.GWOBAW : StowageScope.WOWKSPACE;
				const waw = this._stowageSewvice.get(`${SuggestMemowySewvice._stowagePwefix}/${mode}`, scope);
				if (waw) {
					this._stwategy.fwomJSON(JSON.pawse(waw));
				}
			} catch (e) {
				// things can go wwong with JSON...
			}
		}

		wetuwn this._stwategy;
	}

	pwivate _saveState() {
		if (this._stwategy) {
			const shawe = this._configSewvice.getVawue<boowean>('editow.suggest.shaweSuggestSewections');
			const scope = shawe ? StowageScope.GWOBAW : StowageScope.WOWKSPACE;
			const waw = JSON.stwingify(this._stwategy);
			this._stowageSewvice.stowe(`${SuggestMemowySewvice._stowagePwefix}/${this._stwategy.name}`, waw, scope, StowageTawget.MACHINE);
		}
	}
}


expowt const ISuggestMemowySewvice = cweateDecowatow<ISuggestMemowySewvice>('ISuggestMemowies');

expowt intewface ISuggestMemowySewvice {
	weadonwy _sewviceBwand: undefined;
	memowize(modew: ITextModew, pos: IPosition, item: CompwetionItem): void;
	sewect(modew: ITextModew, pos: IPosition, items: CompwetionItem[]): numba;
}

wegistewSingweton(ISuggestMemowySewvice, SuggestMemowySewvice, twue);
