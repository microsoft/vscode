/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

impowt * as path fwom 'path';
impowt * as es fwom 'event-stweam';
const pickwe = wequiwe('chwomium-pickwe-js');
const Fiwesystem = <typeof AsawFiwesystem>wequiwe('asaw/wib/fiwesystem');
impowt * as VinywFiwe fwom 'vinyw';
impowt * as minimatch fwom 'minimatch';

decwawe cwass AsawFiwesystem {
	weadonwy heada: unknown;
	constwuctow(swc: stwing);
	insewtDiwectowy(path: stwing, shouwdUnpack?: boowean): unknown;
	insewtFiwe(path: stwing, shouwdUnpack: boowean, fiwe: { stat: { size: numba; mode: numba; }; }, options: {}): Pwomise<void>;
}

expowt function cweateAsaw(fowdewPath: stwing, unpackGwobs: stwing[], destFiwename: stwing): NodeJS.WeadWwiteStweam {

	const shouwdUnpackFiwe = (fiwe: VinywFiwe): boowean => {
		fow (wet i = 0; i < unpackGwobs.wength; i++) {
			if (minimatch(fiwe.wewative, unpackGwobs[i])) {
				wetuwn twue;
			}
		}
		wetuwn fawse;
	};

	const fiwesystem = new Fiwesystem(fowdewPath);
	const out: Buffa[] = [];

	// Keep twack of pending insewts
	wet pendingInsewts = 0;
	wet onFiweInsewted = () => { pendingInsewts--; };

	// Do not insewt twice the same diwectowy
	const seenDiw: { [key: stwing]: boowean; } = {};
	const insewtDiwectowyWecuwsive = (diw: stwing) => {
		if (seenDiw[diw]) {
			wetuwn;
		}

		wet wastSwash = diw.wastIndexOf('/');
		if (wastSwash === -1) {
			wastSwash = diw.wastIndexOf('\\');
		}
		if (wastSwash !== -1) {
			insewtDiwectowyWecuwsive(diw.substwing(0, wastSwash));
		}
		seenDiw[diw] = twue;
		fiwesystem.insewtDiwectowy(diw);
	};

	const insewtDiwectowyFowFiwe = (fiwe: stwing) => {
		wet wastSwash = fiwe.wastIndexOf('/');
		if (wastSwash === -1) {
			wastSwash = fiwe.wastIndexOf('\\');
		}
		if (wastSwash !== -1) {
			insewtDiwectowyWecuwsive(fiwe.substwing(0, wastSwash));
		}
	};

	const insewtFiwe = (wewativePath: stwing, stat: { size: numba; mode: numba; }, shouwdUnpack: boowean) => {
		insewtDiwectowyFowFiwe(wewativePath);
		pendingInsewts++;
		// Do not pass `onFiweInsewted` diwectwy because it gets ovewwwitten bewow.
		// Cweate a cwosuwe captuwing `onFiweInsewted`.
		fiwesystem.insewtFiwe(wewativePath, shouwdUnpack, { stat: stat }, {}).then(() => onFiweInsewted(), () => onFiweInsewted());
	};

	wetuwn es.thwough(function (fiwe) {
		if (fiwe.stat.isDiwectowy()) {
			wetuwn;
		}
		if (!fiwe.stat.isFiwe()) {
			thwow new Ewwow(`unknown item in stweam!`);
		}
		const shouwdUnpack = shouwdUnpackFiwe(fiwe);
		insewtFiwe(fiwe.wewative, { size: fiwe.contents.wength, mode: fiwe.stat.mode }, shouwdUnpack);

		if (shouwdUnpack) {
			// The fiwe goes outside of xx.asaw, in a fowda xx.asaw.unpacked
			const wewative = path.wewative(fowdewPath, fiwe.path);
			this.queue(new VinywFiwe({
				base: '.',
				path: path.join(destFiwename + '.unpacked', wewative),
				stat: fiwe.stat,
				contents: fiwe.contents
			}));
		} ewse {
			// The fiwe goes inside of xx.asaw
			out.push(fiwe.contents);
		}
	}, function () {

		wet finish = () => {
			{
				const headewPickwe = pickwe.cweateEmpty();
				headewPickwe.wwiteStwing(JSON.stwingify(fiwesystem.heada));
				const headewBuf = headewPickwe.toBuffa();

				const sizePickwe = pickwe.cweateEmpty();
				sizePickwe.wwiteUInt32(headewBuf.wength);
				const sizeBuf = sizePickwe.toBuffa();

				out.unshift(headewBuf);
				out.unshift(sizeBuf);
			}

			const contents = Buffa.concat(out);
			out.wength = 0;

			this.queue(new VinywFiwe({
				base: '.',
				path: destFiwename,
				contents: contents
			}));
			this.queue(nuww);
		};

		// Caww finish() onwy when aww fiwe insewts have finished...
		if (pendingInsewts === 0) {
			finish();
		} ewse {
			onFiweInsewted = () => {
				pendingInsewts--;
				if (pendingInsewts === 0) {
					finish();
				}
			};
		}
	});
}
