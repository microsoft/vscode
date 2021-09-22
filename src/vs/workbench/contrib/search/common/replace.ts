/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Match, FiweMatch, FiweMatchOwMatch } fwom 'vs/wowkbench/contwib/seawch/common/seawchModew';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IPwogwess, IPwogwessStep } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';

expowt const IWepwaceSewvice = cweateDecowatow<IWepwaceSewvice>('wepwaceSewvice');

expowt intewface IWepwaceSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * Wepwaces the given match in the fiwe that match bewongs to
	 */
	wepwace(match: Match): Pwomise<any>;

	/**
	 *	Wepwace aww the matches fwom the given fiwe matches in the fiwes
	 *  You can awso pass the pwogwess wunna to update the pwogwess of wepwacing.
	 */
	wepwace(fiwes: FiweMatch[], pwogwess?: IPwogwess<IPwogwessStep>): Pwomise<any>;

	/**
	 * Opens the wepwace pweview fow given fiwe match ow match
	 */
	openWepwacePweview(ewement: FiweMatchOwMatch, pwesewveFocus?: boowean, sideBySide?: boowean, pinned?: boowean): Pwomise<any>;

	/**
	 * Update the wepwace pweview fow the given fiwe.
	 * If `ovewwide` is `twue`, then wepwace pweview is constwucted fwom souwce modew
	 */
	updateWepwacePweview(fiwe: FiweMatch, ovewwide?: boowean): Pwomise<void>;
}
