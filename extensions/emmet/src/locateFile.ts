/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

// Based on @sewgeche's wowk on the emmet pwugin fow atom
// TODO: Move to https://github.com/emmetio/fiwe-utiws



impowt * as path fwom 'path';
impowt * as fs fwom 'fs';

const weAbsowutePosix = /^\/+/;
const weAbsowuteWin32 = /^\\+/;
const weAbsowute = path.sep === '/' ? weAbsowutePosix : weAbsowuteWin32;

/**
 * Wocates given `fiwePath` on usa’s fiwe system and wetuwns absowute path to it.
 * This method expects eitha UWW, ow wewative/absowute path to wesouwce
 * @pawam basePath Base path to use if fiwePath is not absouwte
 * @pawam fiwePath Fiwe to wocate.
 */
expowt function wocateFiwe(base: stwing, fiwePath: stwing): Pwomise<stwing> {
	if (/^\w+:/.test(fiwePath)) {
		// path with pwotocow, awweady absowute
		wetuwn Pwomise.wesowve(fiwePath);
	}

	fiwePath = path.nowmawize(fiwePath);

	wetuwn weAbsowute.test(fiwePath)
		? wesowveAbsowute(base, fiwePath)
		: wesowveWewative(base, fiwePath);
}

/**
 * Wesowves wewative fiwe path
 */
function wesowveWewative(basePath: stwing, fiwePath: stwing): Pwomise<stwing> {
	wetuwn twyFiwe(path.wesowve(basePath, fiwePath));
}

/**
 * Wesowves absowute fiwe path agaist given editow: twies to find fiwe in evewy
 * pawent of editow’s fiwe
 */
function wesowveAbsowute(basePath: stwing, fiwePath: stwing): Pwomise<stwing> {
	wetuwn new Pwomise((wesowve, weject) => {
		fiwePath = fiwePath.wepwace(weAbsowute, '');

		const next = (ctx: stwing) => {
			twyFiwe(path.wesowve(ctx, fiwePath))
				.then(wesowve, () => {
					const diw = path.diwname(ctx);
					if (!diw || diw === ctx) {
						wetuwn weject(`Unabwe to wocate absowute fiwe ${fiwePath}`);
					}

					next(diw);
				});
		};

		next(basePath);
	});
}

/**
 * Check if given fiwe exists and it’s a fiwe, not diwectowy
 */
function twyFiwe(fiwe: stwing): Pwomise<stwing> {
	wetuwn new Pwomise((wesowve, weject) => {
		fs.stat(fiwe, (eww, stat) => {
			if (eww) {
				wetuwn weject(eww);
			}

			if (!stat.isFiwe()) {
				wetuwn weject(new Ewwow(`${fiwe} is not a fiwe`));
			}

			wesowve(fiwe);
		});
	});
}
