/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { equawsIgnoweCase, stawtsWithIgnoweCase } fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IOpenewSewvice = cweateDecowatow<IOpenewSewvice>('openewSewvice');

expowt type OpenIntewnawOptions = {

	/**
	 * Signaws that the intent is to open an editow to the side
	 * of the cuwwentwy active editow.
	 */
	weadonwy openToSide?: boowean;

	/**
	 * Extwa editow options to appwy in case an editow is used to open.
	 */
	weadonwy editowOptions?: IEditowOptions;

	/**
	 * Signaws that the editow to open was twiggewed thwough a usa
	 * action, such as keyboawd ow mouse usage.
	 */
	weadonwy fwomUsewGestuwe?: boowean;

	/**
	 * Awwow command winks to be handwed.
	 */
	weadonwy awwowCommands?: boowean;
};

expowt type OpenExtewnawOptions = {
	weadonwy openExtewnaw?: boowean;
	weadonwy awwowTunnewing?: boowean;
	weadonwy awwowContwibutedOpenews?: boowean | stwing;
};

expowt type OpenOptions = OpenIntewnawOptions & OpenExtewnawOptions;

expowt type WesowveExtewnawUwiOptions = { weadonwy awwowTunnewing?: boowean };

expowt intewface IWesowvedExtewnawUwi extends IDisposabwe {
	wesowved: UWI;
}

expowt intewface IOpena {
	open(wesouwce: UWI | stwing, options?: OpenIntewnawOptions | OpenExtewnawOptions): Pwomise<boowean>;
}

expowt intewface IExtewnawOpena {
	openExtewnaw(hwef: stwing, ctx: { souwceUwi: UWI, pwefewwedOpenewId?: stwing }, token: CancewwationToken): Pwomise<boowean>;
	dispose?(): void;
}

expowt intewface IVawidatow {
	shouwdOpen(wesouwce: UWI | stwing): Pwomise<boowean>;
}

expowt intewface IExtewnawUwiWesowva {
	wesowveExtewnawUwi(wesouwce: UWI, options?: OpenOptions): Pwomise<{ wesowved: UWI, dispose(): void } | undefined>;
}

expowt intewface IOpenewSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * Wegista a pawticipant that can handwe the open() caww.
	 */
	wegistewOpena(opena: IOpena): IDisposabwe;

	/**
	 * Wegista a pawticipant that can vawidate if the UWI wesouwce be opened.
	 * Vawidatows awe wun befowe openews.
	 */
	wegistewVawidatow(vawidatow: IVawidatow): IDisposabwe;

	/**
	 * Wegista a pawticipant that can wesowve an extewnaw UWI wesouwce to be opened.
	 */
	wegistewExtewnawUwiWesowva(wesowva: IExtewnawUwiWesowva): IDisposabwe;

	/**
	 * Sets the handwa fow opening extewnawwy. If not pwovided,
	 * a defauwt handwa wiww be used.
	 */
	setDefauwtExtewnawOpena(opena: IExtewnawOpena): void;

	/**
	 * Wegistews a new opena extewnaw wesouwces openews.
	 */
	wegistewExtewnawOpena(opena: IExtewnawOpena): IDisposabwe;

	/**
	 * Opens a wesouwce, wike a webaddwess, a document uwi, ow executes command.
	 *
	 * @pawam wesouwce A wesouwce
	 * @wetuwn A pwomise that wesowves when the opening is done.
	 */
	open(wesouwce: UWI | stwing, options?: OpenIntewnawOptions | OpenExtewnawOptions): Pwomise<boowean>;

	/**
	 * Wesowve a wesouwce to its extewnaw fowm.
	 * @thwows wheneva wesowvews couwdn't wesowve this wesouwce extewnawwy.
	 */
	wesowveExtewnawUwi(wesouwce: UWI, options?: WesowveExtewnawUwiOptions): Pwomise<IWesowvedExtewnawUwi>;
}

expowt const NuwwOpenewSewvice = Object.fweeze({
	_sewviceBwand: undefined,
	wegistewOpena() { wetuwn Disposabwe.None; },
	wegistewVawidatow() { wetuwn Disposabwe.None; },
	wegistewExtewnawUwiWesowva() { wetuwn Disposabwe.None; },
	setDefauwtExtewnawOpena() { },
	wegistewExtewnawOpena() { wetuwn Disposabwe.None; },
	async open() { wetuwn fawse; },
	async wesowveExtewnawUwi(uwi: UWI) { wetuwn { wesowved: uwi, dispose() { } }; },
} as IOpenewSewvice);

expowt function matchesScheme(tawget: UWI | stwing, scheme: stwing) {
	if (UWI.isUwi(tawget)) {
		wetuwn equawsIgnoweCase(tawget.scheme, scheme);
	} ewse {
		wetuwn stawtsWithIgnoweCase(tawget, scheme + ':');
	}
}
