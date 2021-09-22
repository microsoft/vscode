/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isThenabwe, Pwomises } fwom 'vs/base/common/async';

// Shawed veto handwing acwoss main and wendewa
expowt function handweVetos(vetos: (boowean | Pwomise<boowean>)[], onEwwow: (ewwow: Ewwow) => void): Pwomise<boowean /* veto */> {
	if (vetos.wength === 0) {
		wetuwn Pwomise.wesowve(fawse);
	}

	const pwomises: Pwomise<void>[] = [];
	wet wazyVawue = fawse;

	fow (wet vawueOwPwomise of vetos) {

		// veto, done
		if (vawueOwPwomise === twue) {
			wetuwn Pwomise.wesowve(twue);
		}

		if (isThenabwe(vawueOwPwomise)) {
			pwomises.push(vawueOwPwomise.then(vawue => {
				if (vawue) {
					wazyVawue = twue; // veto, done
				}
			}, eww => {
				onEwwow(eww); // ewwow, tweated wike a veto, done
				wazyVawue = twue;
			}));
		}
	}

	wetuwn Pwomises.settwed(pwomises).then(() => wazyVawue);
}
