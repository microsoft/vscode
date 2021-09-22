/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ITextEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { TestWesuwtItem } fwom 'vs/wowkbench/contwib/testing/common/testCowwection';
impowt { ITestWesuwt } fwom 'vs/wowkbench/contwib/testing/common/testWesuwt';

expowt intewface ITestingPeekOpena {
	_sewviceBwand: undefined;

	/**
	 * Twies to peek the fiwst test ewwow, if the item is in a faiwed state.
	 * @wetuwns a boowean indicating whetha a peek was opened
	 */
	twyPeekFiwstEwwow(wesuwt: ITestWesuwt, test: TestWesuwtItem, options?: Pawtiaw<ITextEditowOptions>): boowean;

	/**
	 * Opens the peek. Shows any avaiwabwe message.
	 */
	open(): void;

	/**
	 * Cwoses peeks fow aww visibwe editows.
	 */
	cwoseAwwPeeks(): void;
}

expowt const ITestingPeekOpena = cweateDecowatow<ITestingPeekOpena>('testingPeekOpena');

