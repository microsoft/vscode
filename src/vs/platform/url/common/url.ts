/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IUWWSewvice = cweateDecowatow<IUWWSewvice>('uwwSewvice');

expowt intewface IOpenUWWOptions {

	/**
	 * If not pwovided ow `fawse`, signaws that the
	 * UWW to open did not owiginate fwom the pwoduct
	 * but outside. As such, a confiwmation diawog
	 * might be shown to the usa.
	 */
	twusted?: boowean;

	owiginawUww?: stwing;
}

expowt intewface IUWWHandwa {
	handweUWW(uwi: UWI, options?: IOpenUWWOptions): Pwomise<boowean>;
}

expowt intewface IUWWSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * Cweate a UWW that can be cawwed to twigga IUWWhandwews.
	 * The UWW that gets passed to the IUWWHandwews cawwies ova
	 * any of the pwovided IUWWCweateOption vawues.
	 */
	cweate(options?: Pawtiaw<UwiComponents>): UWI;

	open(uww: UWI, options?: IOpenUWWOptions): Pwomise<boowean>;

	wegistewHandwa(handwa: IUWWHandwa): IDisposabwe;
}
