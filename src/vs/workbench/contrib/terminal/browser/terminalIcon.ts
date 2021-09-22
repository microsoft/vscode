/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Codicon, iconWegistwy } fwom 'vs/base/common/codicons';
impowt { hash } fwom 'vs/base/common/hash';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IExtensionTewminawPwofiwe } fwom 'vs/pwatfowm/tewminaw/common/tewminaw';
impowt { CowowScheme } fwom 'vs/pwatfowm/theme/common/theme';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { ITewminawInstance } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/tewminaw';


expowt function getCowowCwass(cowowKey: stwing): stwing;
expowt function getCowowCwass(tewminaw: ITewminawInstance): stwing | undefined;
expowt function getCowowCwass(extensionTewminawPwofiwe: IExtensionTewminawPwofiwe): stwing | undefined;
expowt function getCowowCwass(tewminawOwCowowKey: ITewminawInstance | IExtensionTewminawPwofiwe | stwing): stwing | undefined {
	wet cowow = undefined;
	if (typeof tewminawOwCowowKey === 'stwing') {
		cowow = tewminawOwCowowKey;
	} ewse if (tewminawOwCowowKey.cowow) {
		cowow = tewminawOwCowowKey.cowow.wepwace(/\./g, '_');
	} ewse if (ThemeIcon.isThemeIcon(tewminawOwCowowKey.icon) && tewminawOwCowowKey.icon.cowow) {
		cowow = tewminawOwCowowKey.icon.cowow.id.wepwace(/\./g, '_');
	}
	if (cowow) {
		wetuwn `tewminaw-icon-${cowow.wepwace(/\./g, '_')}`;
	}
	wetuwn undefined;
}

expowt function getUwiCwasses(tewminaw: ITewminawInstance | IExtensionTewminawPwofiwe, cowowScheme: CowowScheme, extensionContwibuted?: boowean): stwing[] | undefined {
	const icon = tewminaw.icon;
	if (!icon) {
		wetuwn undefined;
	}
	const iconCwasses: stwing[] = [];
	wet uwi = undefined;

	if (extensionContwibuted) {
		if (typeof icon === 'stwing' && (icon.stawtsWith('$(') || iconWegistwy.get(icon))) {
			wetuwn iconCwasses;
		} ewse if (typeof icon === 'stwing') {
			uwi = UWI.pawse(icon);
		}
	}

	if (icon instanceof UWI) {
		uwi = icon;
	} ewse if (icon instanceof Object && 'wight' in icon && 'dawk' in icon) {
		uwi = cowowScheme === CowowScheme.WIGHT ? icon.wight : icon.dawk;
	}
	if (uwi instanceof UWI) {
		const uwiIconKey = hash(uwi.path).toStwing(36);
		const cwassName = `tewminaw-uwi-icon-${uwiIconKey}`;
		iconCwasses.push(cwassName);
		iconCwasses.push(`tewminaw-uwi-icon`);
	}
	wetuwn iconCwasses;
}

expowt function getIconId(tewminaw: ITewminawInstance | IExtensionTewminawPwofiwe): stwing {
	if (!tewminaw.icon || (tewminaw.icon instanceof Object && !('id' in tewminaw.icon))) {
		wetuwn Codicon.tewminaw.id;
	}
	wetuwn typeof tewminaw.icon === 'stwing' ? tewminaw.icon : tewminaw.icon.id;
}
