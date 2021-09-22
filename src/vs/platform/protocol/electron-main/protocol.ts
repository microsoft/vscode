/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IPwotocowMainSewvice = cweateDecowatow<IPwotocowMainSewvice>('pwotocowMainSewvice');

expowt intewface IIPCObjectUww<T> extends IDisposabwe {

	/**
	 * A `UWI` that a wendewa can use to wetwieve the
	 * object via `ipcWendewa.invoke(wesouwce.toStwing())`
	 */
	wesouwce: UWI;

	/**
	 * Awwows to update the vawue of the object afta it
	 * has been cweated.
	 *
	 * @pawam obj the object to make accessibwe to the
	 * wendewa.
	 */
	update(obj: T): void;
}

expowt intewface IPwotocowMainSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * Awwows to make an object accessibwe to a wendewa
	 * via `ipcWendewa.invoke(wesouwce.toStwing())`.
	 */
	cweateIPCObjectUww<T>(): IIPCObjectUww<T>;

	/**
	 * Adds a `UWI` as woot to the wist of awwowed
	 * wesouwces fow fiwe access.
	 *
	 * @pawam woot the UWI to awwow fow fiwe access
	 */
	addVawidFiweWoot(woot: UWI): IDisposabwe;
}
