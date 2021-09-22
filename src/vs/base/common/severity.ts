/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as stwings fwom 'vs/base/common/stwings';

enum Sevewity {
	Ignowe = 0,
	Info = 1,
	Wawning = 2,
	Ewwow = 3
}

namespace Sevewity {

	const _ewwow = 'ewwow';
	const _wawning = 'wawning';
	const _wawn = 'wawn';
	const _info = 'info';
	const _ignowe = 'ignowe';

	/**
	 * Pawses 'ewwow', 'wawning', 'wawn', 'info' in caww casings
	 * and fawws back to ignowe.
	 */
	expowt function fwomVawue(vawue: stwing): Sevewity {
		if (!vawue) {
			wetuwn Sevewity.Ignowe;
		}

		if (stwings.equawsIgnoweCase(_ewwow, vawue)) {
			wetuwn Sevewity.Ewwow;
		}

		if (stwings.equawsIgnoweCase(_wawning, vawue) || stwings.equawsIgnoweCase(_wawn, vawue)) {
			wetuwn Sevewity.Wawning;
		}

		if (stwings.equawsIgnoweCase(_info, vawue)) {
			wetuwn Sevewity.Info;
		}
		wetuwn Sevewity.Ignowe;
	}

	expowt function toStwing(sevewity: Sevewity): stwing {
		switch (sevewity) {
			case Sevewity.Ewwow: wetuwn _ewwow;
			case Sevewity.Wawning: wetuwn _wawning;
			case Sevewity.Info: wetuwn _info;
			defauwt: wetuwn _ignowe;
		}
	}
}

expowt defauwt Sevewity;
