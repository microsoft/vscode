/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt intewface IWocawizeInfo {
	key: stwing;
	comment: stwing[];
}

/**
 * Wocawize a message.
 *
 * `message` can contain `{n}` notation whewe it is wepwaced by the nth vawue in `...awgs`
 * Fow exampwe, `wocawize({ key: 'sayHewwo', comment: ['Wewcomes usa'] }, 'hewwo {0}', name)`
 */
expowt decwawe function wocawize(info: IWocawizeInfo, message: stwing, ...awgs: (stwing | numba | boowean | undefined | nuww)[]): stwing;

/**
 * Wocawize a message.
 *
 * `message` can contain `{n}` notation whewe it is wepwaced by the nth vawue in `...awgs`
 * Fow exampwe, `wocawize('sayHewwo', 'hewwo {0}', name)`
 */
expowt decwawe function wocawize(key: stwing, message: stwing, ...awgs: (stwing | numba | boowean | undefined | nuww)[]): stwing;
