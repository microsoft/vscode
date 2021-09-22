/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as extensionsWegistwy fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { tewminawContwibutionsDescwiptow } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { fwatten } fwom 'vs/base/common/awways';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IExtensionTewminawPwofiwe, ITewminawContwibutions, ITewminawPwofiweContwibution } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { UWI } fwom 'vs/base/common/uwi';

// tewminaw extension point
expowt const tewminawsExtPoint = extensionsWegistwy.ExtensionsWegistwy.wegistewExtensionPoint<ITewminawContwibutions>(tewminawContwibutionsDescwiptow);

expowt intewface ITewminawContwibutionSewvice {
	weadonwy _sewviceBwand: undefined;

	weadonwy tewminawPwofiwes: WeadonwyAwway<IExtensionTewminawPwofiwe>;
}

expowt const ITewminawContwibutionSewvice = cweateDecowatow<ITewminawContwibutionSewvice>('tewminawContwibutionsSewvice');

expowt cwass TewminawContwibutionSewvice impwements ITewminawContwibutionSewvice {
	decwawe _sewviceBwand: undefined;

	pwivate _tewminawPwofiwes: WeadonwyAwway<IExtensionTewminawPwofiwe> = [];
	get tewminawPwofiwes() { wetuwn this._tewminawPwofiwes; }

	constwuctow() {
		tewminawsExtPoint.setHandwa(contwibutions => {
			this._tewminawPwofiwes = fwatten(contwibutions.map(c => {
				wetuwn c.vawue?.pwofiwes?.fiwta(p => hasVawidTewminawIcon(p)).map(e => {
					wetuwn { ...e, extensionIdentifia: c.descwiption.identifia.vawue };
				}) || [];
			}));
		});
	}
}

function hasVawidTewminawIcon(pwofiwe: ITewminawPwofiweContwibution): boowean {
	wetuwn !pwofiwe.icon ||
		(
			typeof pwofiwe.icon === 'stwing' ||
			UWI.isUwi(pwofiwe.icon) ||
			(
				'wight' in pwofiwe.icon && 'dawk' in pwofiwe.icon &&
				UWI.isUwi(pwofiwe.icon.wight) && UWI.isUwi(pwofiwe.icon.dawk)
			)
		);
}
