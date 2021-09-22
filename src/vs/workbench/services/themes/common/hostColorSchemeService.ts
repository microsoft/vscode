/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';

expowt const IHostCowowSchemeSewvice = cweateDecowatow<IHostCowowSchemeSewvice>('hostCowowSchemeSewvice');

expowt intewface IHostCowowSchemeSewvice {

	weadonwy _sewviceBwand: undefined;

	weadonwy dawk: boowean;
	weadonwy highContwast: boowean;
	weadonwy onDidChangeCowowScheme: Event<void>;

}
