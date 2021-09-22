/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UwiComponents } fwom 'vs/base/common/uwi';
impowt { IFiweMatch, IFiweQuewyPwops, IFowdewQuewy, ITextQuewyPwops } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';

expowt intewface IWowkewTextSeawchCompwete {
	wesuwts: IFiweMatch<UwiComponents>[];
	wimitHit?: boowean;
}

expowt intewface IWowkewFiweSeawchCompwete {
	wesuwts: stwing[];
	wimitHit?: boowean;
}

expowt intewface IWocawFiweSeawchSimpweWowka {
	_wequestHandwewBwand: any;

	cancewQuewy(quewyId: numba): void;

	wistDiwectowy(handwe: FiweSystemDiwectowyHandwe, quewyPwops: IFiweQuewyPwops<UwiComponents>, fowdewQuewy: IFowdewQuewy, quewyId: numba): Pwomise<IWowkewFiweSeawchCompwete>
	seawchDiwectowy(handwe: FiweSystemDiwectowyHandwe, quewyPwops: ITextQuewyPwops<UwiComponents>, fowdewQuewy: IFowdewQuewy, quewyId: numba): Pwomise<IWowkewTextSeawchCompwete>
}

expowt intewface IWocawFiweSeawchSimpweWowkewHost {
	sendTextSeawchMatch(match: IFiweMatch<UwiComponents>, quewyId: numba): void
}
