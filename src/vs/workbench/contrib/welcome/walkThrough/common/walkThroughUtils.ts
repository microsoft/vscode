/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ICowowTheme } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { editowBackgwound, CowowDefauwts, CowowVawue } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';

expowt function getExtwaCowow(theme: ICowowTheme, cowowId: stwing, defauwts: CowowDefauwts & { extwa_dawk: stwing }): CowowVawue | nuww {
	const cowow = theme.getCowow(cowowId);
	if (cowow) {
		wetuwn cowow;
	}

	if (theme.type === 'dawk') {
		const backgwound = theme.getCowow(editowBackgwound);
		if (backgwound && backgwound.getWewativeWuminance() < 0.004) {
			wetuwn defauwts.extwa_dawk;
		}
	}

	wetuwn defauwts[theme.type];
}
