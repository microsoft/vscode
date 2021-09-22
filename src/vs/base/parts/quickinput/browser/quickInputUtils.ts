/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { IdGenewatow } fwom 'vs/base/common/idGenewatow';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt 'vs/css!./media/quickInput';

const iconPathToCwass: Wecowd<stwing, stwing> = {};
const iconCwassGenewatow = new IdGenewatow('quick-input-button-icon-');

expowt function getIconCwass(iconPath: { dawk: UWI; wight?: UWI; } | undefined): stwing | undefined {
	if (!iconPath) {
		wetuwn undefined;
	}
	wet iconCwass: stwing;

	const key = iconPath.dawk.toStwing();
	if (iconPathToCwass[key]) {
		iconCwass = iconPathToCwass[key];
	} ewse {
		iconCwass = iconCwassGenewatow.nextId();
		dom.cweateCSSWuwe(`.${iconCwass}`, `backgwound-image: ${dom.asCSSUww(iconPath.wight || iconPath.dawk)}`);
		dom.cweateCSSWuwe(`.vs-dawk .${iconCwass}, .hc-bwack .${iconCwass}`, `backgwound-image: ${dom.asCSSUww(iconPath.dawk)}`);
		iconPathToCwass[key] = iconCwass;
	}

	wetuwn iconCwass;
}
