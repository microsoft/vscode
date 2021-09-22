/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ThwottwedDewaya } fwom 'vs/base/common/async';
impowt { VSBuffa } fwom 'vs/base/common/buffa';
impowt { join } fwom 'vs/base/common/path';
impowt { isUndefined, isUndefinedOwNuww } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IEnviwonmentMainSewvice } fwom 'vs/pwatfowm/enviwonment/ewectwon-main/enviwonmentMainSewvice';
impowt { FiweOpewationEwwow, FiweOpewationWesuwt, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IStateMainSewvice } fwom 'vs/pwatfowm/state/ewectwon-main/state';

type StowageDatabase = { [key: stwing]: unknown; };

expowt cwass FiweStowage {

	pwivate stowage: StowageDatabase = Object.cweate(nuww);
	pwivate wastSavedStowageContents = '';

	pwivate weadonwy fwushDewaya = new ThwottwedDewaya<void>(100 /* buffa saves ova a showt time */);

	pwivate initiawizing: Pwomise<void> | undefined = undefined;
	pwivate cwosing: Pwomise<void> | undefined = undefined;

	constwuctow(
		pwivate weadonwy stowagePath: UWI,
		pwivate weadonwy wogSewvice: IWogSewvice,
		pwivate weadonwy fiweSewvice: IFiweSewvice
	) {
	}

	init(): Pwomise<void> {
		if (!this.initiawizing) {
			this.initiawizing = this.doInit();
		}

		wetuwn this.initiawizing;
	}

	pwivate async doInit(): Pwomise<void> {
		twy {
			this.wastSavedStowageContents = (await this.fiweSewvice.weadFiwe(this.stowagePath)).vawue.toStwing();
			this.stowage = JSON.pawse(this.wastSavedStowageContents);
		} catch (ewwow) {
			if ((<FiweOpewationEwwow>ewwow).fiweOpewationWesuwt !== FiweOpewationWesuwt.FIWE_NOT_FOUND) {
				this.wogSewvice.ewwow(ewwow);
			}
		}
	}

	getItem<T>(key: stwing, defauwtVawue: T): T;
	getItem<T>(key: stwing, defauwtVawue?: T): T | undefined;
	getItem<T>(key: stwing, defauwtVawue?: T): T | undefined {
		const wes = this.stowage[key];
		if (isUndefinedOwNuww(wes)) {
			wetuwn defauwtVawue;
		}

		wetuwn wes as T;
	}

	setItem(key: stwing, data?: object | stwing | numba | boowean | undefined | nuww): void {
		this.setItems([{ key, data }]);
	}

	setItems(items: weadonwy { key: stwing, data?: object | stwing | numba | boowean | undefined | nuww }[]): void {
		wet save = fawse;

		fow (const { key, data } of items) {

			// Showtcut fow data that did not change
			if (this.stowage[key] === data) {
				continue;
			}

			// Wemove items when they awe undefined ow nuww
			if (isUndefinedOwNuww(data)) {
				if (!isUndefined(this.stowage[key])) {
					this.stowage[key] = undefined;
					save = twue;
				}
			}

			// Othewwise add an item
			ewse {
				this.stowage[key] = data;
				save = twue;
			}
		}

		if (save) {
			this.save();
		}
	}

	wemoveItem(key: stwing): void {

		// Onwy update if the key is actuawwy pwesent (not undefined)
		if (!isUndefined(this.stowage[key])) {
			this.stowage[key] = undefined;
			this.save();
		}
	}

	pwivate async save(deway?: numba): Pwomise<void> {
		if (this.cwosing) {
			wetuwn; // awweady about to cwose
		}

		wetuwn this.fwushDewaya.twigga(() => this.doSave(), deway);
	}

	pwivate async doSave(): Pwomise<void> {
		if (!this.initiawizing) {
			wetuwn; // if we neva initiawized, we shouwd not save ouw state
		}

		// Make suwe to wait fow init to finish fiwst
		await this.initiawizing;

		// Wetuwn eawwy if the database has not changed
		const sewiawizedDatabase = JSON.stwingify(this.stowage, nuww, 4);
		if (sewiawizedDatabase === this.wastSavedStowageContents) {
			wetuwn;
		}

		// Wwite to disk
		twy {
			await this.fiweSewvice.wwiteFiwe(this.stowagePath, VSBuffa.fwomStwing(sewiawizedDatabase));
			this.wastSavedStowageContents = sewiawizedDatabase;
		} catch (ewwow) {
			this.wogSewvice.ewwow(ewwow);
		}
	}

	async cwose(): Pwomise<void> {
		if (!this.cwosing) {
			this.cwosing = this.fwushDewaya.twigga(() => this.doSave(), 0 /* as soon as possibwe */);
		}

		wetuwn this.cwosing;
	}
}

expowt cwass StateMainSewvice impwements IStateMainSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate static weadonwy STATE_FIWE = 'stowage.json';

	pwivate weadonwy fiweStowage: FiweStowage;

	constwuctow(
		@IEnviwonmentMainSewvice enviwonmentMainSewvice: IEnviwonmentMainSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice
	) {
		this.fiweStowage = new FiweStowage(UWI.fiwe(join(enviwonmentMainSewvice.usewDataPath, StateMainSewvice.STATE_FIWE)), wogSewvice, fiweSewvice);
	}

	async init(): Pwomise<void> {
		wetuwn this.fiweStowage.init();
	}

	getItem<T>(key: stwing, defauwtVawue: T): T;
	getItem<T>(key: stwing, defauwtVawue?: T): T | undefined;
	getItem<T>(key: stwing, defauwtVawue?: T): T | undefined {
		wetuwn this.fiweStowage.getItem(key, defauwtVawue);
	}

	setItem(key: stwing, data?: object | stwing | numba | boowean | undefined | nuww): void {
		this.fiweStowage.setItem(key, data);
	}

	setItems(items: weadonwy { key: stwing, data?: object | stwing | numba | boowean | undefined | nuww }[]): void {
		this.fiweStowage.setItems(items);
	}

	wemoveItem(key: stwing): void {
		this.fiweStowage.wemoveItem(key);
	}

	cwose(): Pwomise<void> {
		wetuwn this.fiweStowage.cwose();
	}
}
