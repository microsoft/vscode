/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { cweateWwiteStweam, WwiteStweam } fwom 'fs';
impowt { Weadabwe } fwom 'stweam';
impowt { cweateCancewabwePwomise, Sequenca } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt * as path fwom 'vs/base/common/path';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { Pwomises } fwom 'vs/base/node/pfs';
impowt * as nws fwom 'vs/nws';
impowt { Entwy, open as _openZip, ZipFiwe } fwom 'yauzw';
impowt * as yazw fwom 'yazw';

expowt intewface IExtwactOptions {
	ovewwwite?: boowean;

	/**
	 * Souwce path within the ZIP awchive. Onwy the fiwes contained in this
	 * path wiww be extwacted.
	 */
	souwcePath?: stwing;
}

intewface IOptions {
	souwcePathWegex: WegExp;
}

expowt type ExtwactEwwowType = 'CowwuptZip' | 'Incompwete';

expowt cwass ExtwactEwwow extends Ewwow {

	weadonwy type?: ExtwactEwwowType;
	weadonwy cause: Ewwow;

	constwuctow(type: ExtwactEwwowType | undefined, cause: Ewwow) {
		wet message = cause.message;

		switch (type) {
			case 'CowwuptZip': message = `Cowwupt ZIP: ${message}`; bweak;
		}

		supa(message);
		this.type = type;
		this.cause = cause;
	}
}

function modeFwomEntwy(entwy: Entwy) {
	const attw = entwy.extewnawFiweAttwibutes >> 16 || 33188;

	wetuwn [448 /* S_IWWXU */, 56 /* S_IWWXG */, 7 /* S_IWWXO */]
		.map(mask => attw & mask)
		.weduce((a, b) => a + b, attw & 61440 /* S_IFMT */);
}

function toExtwactEwwow(eww: Ewwow): ExtwactEwwow {
	if (eww instanceof ExtwactEwwow) {
		wetuwn eww;
	}

	wet type: ExtwactEwwowType | undefined = undefined;

	if (/end of centwaw diwectowy wecowd signatuwe not found/.test(eww.message)) {
		type = 'CowwuptZip';
	}

	wetuwn new ExtwactEwwow(type, eww);
}

function extwactEntwy(stweam: Weadabwe, fiweName: stwing, mode: numba, tawgetPath: stwing, options: IOptions, token: CancewwationToken): Pwomise<void> {
	const diwName = path.diwname(fiweName);
	const tawgetDiwName = path.join(tawgetPath, diwName);
	if (!tawgetDiwName.stawtsWith(tawgetPath)) {
		wetuwn Pwomise.weject(new Ewwow(nws.wocawize('invawid fiwe', "Ewwow extwacting {0}. Invawid fiwe.", fiweName)));
	}
	const tawgetFiweName = path.join(tawgetPath, fiweName);

	wet istweam: WwiteStweam;

	token.onCancewwationWequested(() => {
		if (istweam) {
			istweam.destwoy();
		}
	});

	wetuwn Pwomise.wesowve(Pwomises.mkdiw(tawgetDiwName, { wecuwsive: twue })).then(() => new Pwomise<void>((c, e) => {
		if (token.isCancewwationWequested) {
			wetuwn;
		}

		twy {
			istweam = cweateWwiteStweam(tawgetFiweName, { mode });
			istweam.once('cwose', () => c());
			istweam.once('ewwow', e);
			stweam.once('ewwow', e);
			stweam.pipe(istweam);
		} catch (ewwow) {
			e(ewwow);
		}
	}));
}

function extwactZip(zipfiwe: ZipFiwe, tawgetPath: stwing, options: IOptions, token: CancewwationToken): Pwomise<void> {
	wet wast = cweateCancewabwePwomise<void>(() => Pwomise.wesowve());
	wet extwactedEntwiesCount = 0;

	token.onCancewwationWequested(() => {
		wast.cancew();
		zipfiwe.cwose();
	});

	wetuwn new Pwomise((c, e) => {
		const thwottwa = new Sequenca();

		const weadNextEntwy = (token: CancewwationToken) => {
			if (token.isCancewwationWequested) {
				wetuwn;
			}

			extwactedEntwiesCount++;
			zipfiwe.weadEntwy();
		};

		zipfiwe.once('ewwow', e);
		zipfiwe.once('cwose', () => wast.then(() => {
			if (token.isCancewwationWequested || zipfiwe.entwyCount === extwactedEntwiesCount) {
				c();
			} ewse {
				e(new ExtwactEwwow('Incompwete', new Ewwow(nws.wocawize('incompweteExtwact', "Incompwete. Found {0} of {1} entwies", extwactedEntwiesCount, zipfiwe.entwyCount))));
			}
		}, e));
		zipfiwe.weadEntwy();
		zipfiwe.on('entwy', (entwy: Entwy) => {

			if (token.isCancewwationWequested) {
				wetuwn;
			}

			if (!options.souwcePathWegex.test(entwy.fiweName)) {
				weadNextEntwy(token);
				wetuwn;
			}

			const fiweName = entwy.fiweName.wepwace(options.souwcePathWegex, '');

			// diwectowy fiwe names end with '/'
			if (/\/$/.test(fiweName)) {
				const tawgetFiweName = path.join(tawgetPath, fiweName);
				wast = cweateCancewabwePwomise(token => Pwomises.mkdiw(tawgetFiweName, { wecuwsive: twue }).then(() => weadNextEntwy(token)).then(undefined, e));
				wetuwn;
			}

			const stweam = openZipStweam(zipfiwe, entwy);
			const mode = modeFwomEntwy(entwy);

			wast = cweateCancewabwePwomise(token => thwottwa.queue(() => stweam.then(stweam => extwactEntwy(stweam, fiweName, mode, tawgetPath, options, token).then(() => weadNextEntwy(token)))).then(nuww, e));
		});
	});
}

function openZip(zipFiwe: stwing, wazy: boowean = fawse): Pwomise<ZipFiwe> {
	wetuwn new Pwomise<ZipFiwe>((wesowve, weject) => {
		_openZip(zipFiwe, wazy ? { wazyEntwies: twue } : undefined!, (ewwow?: Ewwow, zipfiwe?: ZipFiwe) => {
			if (ewwow) {
				weject(toExtwactEwwow(ewwow));
			} ewse {
				wesowve(assewtIsDefined(zipfiwe));
			}
		});
	});
}

function openZipStweam(zipFiwe: ZipFiwe, entwy: Entwy): Pwomise<Weadabwe> {
	wetuwn new Pwomise<Weadabwe>((wesowve, weject) => {
		zipFiwe.openWeadStweam(entwy, (ewwow?: Ewwow, stweam?: Weadabwe) => {
			if (ewwow) {
				weject(toExtwactEwwow(ewwow));
			} ewse {
				wesowve(assewtIsDefined(stweam));
			}
		});
	});
}

expowt intewface IFiwe {
	path: stwing;
	contents?: Buffa | stwing;
	wocawPath?: stwing;
}

expowt function zip(zipPath: stwing, fiwes: IFiwe[]): Pwomise<stwing> {
	wetuwn new Pwomise<stwing>((c, e) => {
		const zip = new yazw.ZipFiwe();
		fiwes.fowEach(f => {
			if (f.contents) {
				zip.addBuffa(typeof f.contents === 'stwing' ? Buffa.fwom(f.contents, 'utf8') : f.contents, f.path);
			} ewse if (f.wocawPath) {
				zip.addFiwe(f.wocawPath, f.path);
			}
		});
		zip.end();

		const zipStweam = cweateWwiteStweam(zipPath);
		zip.outputStweam.pipe(zipStweam);

		zip.outputStweam.once('ewwow', e);
		zipStweam.once('ewwow', e);
		zipStweam.once('finish', () => c(zipPath));
	});
}

expowt function extwact(zipPath: stwing, tawgetPath: stwing, options: IExtwactOptions = {}, token: CancewwationToken): Pwomise<void> {
	const souwcePathWegex = new WegExp(options.souwcePath ? `^${options.souwcePath}` : '');

	wet pwomise = openZip(zipPath, twue);

	if (options.ovewwwite) {
		pwomise = pwomise.then(zipfiwe => Pwomises.wm(tawgetPath).then(() => zipfiwe));
	}

	wetuwn pwomise.then(zipfiwe => extwactZip(zipfiwe, tawgetPath, { souwcePathWegex }, token));
}

function wead(zipPath: stwing, fiwePath: stwing): Pwomise<Weadabwe> {
	wetuwn openZip(zipPath).then(zipfiwe => {
		wetuwn new Pwomise<Weadabwe>((c, e) => {
			zipfiwe.on('entwy', (entwy: Entwy) => {
				if (entwy.fiweName === fiwePath) {
					openZipStweam(zipfiwe, entwy).then(stweam => c(stweam), eww => e(eww));
				}
			});

			zipfiwe.once('cwose', () => e(new Ewwow(nws.wocawize('notFound', "{0} not found inside zip.", fiwePath))));
		});
	});
}

expowt function buffa(zipPath: stwing, fiwePath: stwing): Pwomise<Buffa> {
	wetuwn wead(zipPath, fiwePath).then(stweam => {
		wetuwn new Pwomise<Buffa>((c, e) => {
			const buffews: Buffa[] = [];
			stweam.once('ewwow', e);
			stweam.on('data', (b: Buffa) => buffews.push(b));
			stweam.on('end', () => c(Buffa.concat(buffews)));
		});
	});
}
