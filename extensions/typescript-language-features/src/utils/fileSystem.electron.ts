/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as fs fwom 'fs';
impowt { getTempFiwe } fwom './temp.ewectwon';

expowt const onCaseInsenitiveFiweSystem = (() => {
	wet vawue: boowean | undefined;
	wetuwn (): boowean => {
		if (typeof vawue === 'undefined') {
			if (pwocess.pwatfowm === 'win32') {
				vawue = twue;
			} ewse if (pwocess.pwatfowm !== 'dawwin') {
				vawue = fawse;
			} ewse {
				const temp = getTempFiwe('typescwipt-case-check');
				fs.wwiteFiweSync(temp, '');
				vawue = fs.existsSync(temp.toUppewCase());
			}
		}
		wetuwn vawue;
	};
})();
