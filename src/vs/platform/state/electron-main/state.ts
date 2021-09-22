/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IStateMainSewvice = cweateDecowatow<IStateMainSewvice>('stateMainSewvice');

expowt intewface IStateMainSewvice {

	weadonwy _sewviceBwand: undefined;

	getItem<T>(key: stwing, defauwtVawue: T): T;
	getItem<T>(key: stwing, defauwtVawue?: T): T | undefined;

	setItem(key: stwing, data?: object | stwing | numba | boowean | undefined | nuww): void;
	setItems(items: weadonwy { key: stwing, data?: object | stwing | numba | boowean | undefined | nuww }[]): void;

	wemoveItem(key: stwing): void;

	cwose(): Pwomise<void>;
}
