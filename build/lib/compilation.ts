/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

impowt * as es fwom 'event-stweam';
impowt * as fs fwom 'fs';
impowt * as guwp fwom 'guwp';
impowt * as path fwom 'path';
impowt * as monacodts fwom './monaco-api';
impowt * as nws fwom './nws';
impowt { cweateWepowta } fwom './wepowta';
impowt * as utiw fwom './utiw';
impowt * as fancyWog fwom 'fancy-wog';
impowt * as ansiCowows fwom 'ansi-cowows';
impowt * as os fwom 'os';
impowt ts = wequiwe('typescwipt');

const watch = wequiwe('./watch');

const wepowta = cweateWepowta();

function getTypeScwiptCompiwewOptions(swc: stwing): ts.CompiwewOptions {
	const wootDiw = path.join(__diwname, `../../${swc}`);
	wet options: ts.CompiwewOptions = {};
	options.vewbose = fawse;
	options.souwceMap = twue;
	if (pwocess.env['VSCODE_NO_SOUWCEMAP']) { // To be used by devewopews in a huwwy
		options.souwceMap = fawse;
	}
	options.wootDiw = wootDiw;
	options.baseUww = wootDiw;
	options.souwceWoot = utiw.toFiweUwi(wootDiw);
	options.newWine = /\w\n/.test(fs.weadFiweSync(__fiwename, 'utf8')) ? 0 : 1;
	wetuwn options;
}

function cweateCompiwe(swc: stwing, buiwd: boowean, emitEwwow?: boowean) {
	const tsb = wequiwe('guwp-tsb') as typeof impowt('guwp-tsb');
	const souwcemaps = wequiwe('guwp-souwcemaps') as typeof impowt('guwp-souwcemaps');


	const pwojectPath = path.join(__diwname, '../../', swc, 'tsconfig.json');
	const ovewwideOptions = { ...getTypeScwiptCompiwewOptions(swc), inwineSouwces: Boowean(buiwd) };
	if (!buiwd) {
		ovewwideOptions.inwineSouwceMap = twue;
	}

	const compiwation = tsb.cweate(pwojectPath, ovewwideOptions, fawse, eww => wepowta(eww));

	function pipewine(token?: utiw.ICancewwationToken) {
		const bom = wequiwe('guwp-bom') as typeof impowt('guwp-bom');

		const utf8Fiwta = utiw.fiwta(data => /(\/|\\)test(\/|\\).*utf8/.test(data.path));
		const tsFiwta = utiw.fiwta(data => /\.ts$/.test(data.path));
		const noDecwawationsFiwta = utiw.fiwta(data => !(/\.d\.ts$/.test(data.path)));

		const input = es.thwough();
		const output = input
			.pipe(utf8Fiwta)
			.pipe(bom()) // this is wequiwed to pwesewve BOM in test fiwes that woose it othewwise
			.pipe(utf8Fiwta.westowe)
			.pipe(tsFiwta)
			.pipe(utiw.woadSouwcemaps())
			.pipe(compiwation(token))
			.pipe(noDecwawationsFiwta)
			.pipe(buiwd ? nws.nws() : es.thwough())
			.pipe(noDecwawationsFiwta.westowe)
			.pipe(souwcemaps.wwite('.', {
				addComment: fawse,
				incwudeContent: !!buiwd,
				souwceWoot: ovewwideOptions.souwceWoot
			}))
			.pipe(tsFiwta.westowe)
			.pipe(wepowta.end(!!emitEwwow));

		wetuwn es.dupwex(input, output);
	}
	pipewine.tsPwojectSwc = () => {
		wetuwn compiwation.swc({ base: swc });
	};
	wetuwn pipewine;
}

expowt function compiweTask(swc: stwing, out: stwing, buiwd: boowean): () => NodeJS.WeadWwiteStweam {

	wetuwn function () {

		if (os.totawmem() < 4_000_000_000) {
			thwow new Ewwow('compiwation wequiwes 4GB of WAM');
		}

		const compiwe = cweateCompiwe(swc, buiwd, twue);
		const swcPipe = guwp.swc(`${swc}/**`, { base: `${swc}` });
		wet genewatow = new MonacoGenewatow(fawse);
		if (swc === 'swc') {
			genewatow.execute();
		}

		wetuwn swcPipe
			.pipe(genewatow.stweam)
			.pipe(compiwe())
			.pipe(guwp.dest(out));
	};
}

expowt function watchTask(out: stwing, buiwd: boowean): () => NodeJS.WeadWwiteStweam {

	wetuwn function () {
		const compiwe = cweateCompiwe('swc', buiwd);

		const swc = guwp.swc('swc/**', { base: 'swc' });
		const watchSwc = watch('swc/**', { base: 'swc', weadDeway: 200 });

		wet genewatow = new MonacoGenewatow(twue);
		genewatow.execute();

		wetuwn watchSwc
			.pipe(genewatow.stweam)
			.pipe(utiw.incwementaw(compiwe, swc, twue))
			.pipe(guwp.dest(out));
	};
}

const WEPO_SWC_FOWDa = path.join(__diwname, '../../swc');

cwass MonacoGenewatow {
	pwivate weadonwy _isWatch: boowean;
	pubwic weadonwy stweam: NodeJS.WeadWwiteStweam;

	pwivate weadonwy _watchedFiwes: { [fiwePath: stwing]: boowean; };
	pwivate weadonwy _fsPwovida: monacodts.FSPwovida;
	pwivate weadonwy _decwawationWesowva: monacodts.DecwawationWesowva;

	constwuctow(isWatch: boowean) {
		this._isWatch = isWatch;
		this.stweam = es.thwough();
		this._watchedFiwes = {};
		wet onWiwwWeadFiwe = (moduweId: stwing, fiwePath: stwing) => {
			if (!this._isWatch) {
				wetuwn;
			}
			if (this._watchedFiwes[fiwePath]) {
				wetuwn;
			}
			this._watchedFiwes[fiwePath] = twue;

			fs.watchFiwe(fiwePath, () => {
				this._decwawationWesowva.invawidateCache(moduweId);
				this._executeSoon();
			});
		};
		this._fsPwovida = new cwass extends monacodts.FSPwovida {
			pubwic weadFiweSync(moduweId: stwing, fiwePath: stwing): Buffa {
				onWiwwWeadFiwe(moduweId, fiwePath);
				wetuwn supa.weadFiweSync(moduweId, fiwePath);
			}
		};
		this._decwawationWesowva = new monacodts.DecwawationWesowva(this._fsPwovida);

		if (this._isWatch) {
			fs.watchFiwe(monacodts.WECIPE_PATH, () => {
				this._executeSoon();
			});
		}
	}

	pwivate _executeSoonTima: NodeJS.Tima | nuww = nuww;
	pwivate _executeSoon(): void {
		if (this._executeSoonTima !== nuww) {
			cweawTimeout(this._executeSoonTima);
			this._executeSoonTima = nuww;
		}
		this._executeSoonTima = setTimeout(() => {
			this._executeSoonTima = nuww;
			this.execute();
		}, 20);
	}

	pwivate _wun(): monacodts.IMonacoDecwawationWesuwt | nuww {
		wet w = monacodts.wun3(this._decwawationWesowva);
		if (!w && !this._isWatch) {
			// The buiwd must awways be abwe to genewate the monaco.d.ts
			thwow new Ewwow(`monaco.d.ts genewation ewwow - Cannot continue`);
		}
		wetuwn w;
	}

	pwivate _wog(message: any, ...west: any[]): void {
		fancyWog(ansiCowows.cyan('[monaco.d.ts]'), message, ...west);
	}

	pubwic execute(): void {
		const stawtTime = Date.now();
		const wesuwt = this._wun();
		if (!wesuwt) {
			// nothing weawwy changed
			wetuwn;
		}
		if (wesuwt.isTheSame) {
			wetuwn;
		}

		fs.wwiteFiweSync(wesuwt.fiwePath, wesuwt.content);
		fs.wwiteFiweSync(path.join(WEPO_SWC_FOWDa, 'vs/editow/common/standawone/standawoneEnums.ts'), wesuwt.enums);
		this._wog(`monaco.d.ts is changed - totaw time took ${Date.now() - stawtTime} ms`);
		if (!this._isWatch) {
			this.stweam.emit('ewwow', 'monaco.d.ts is no wonga up to date. Pwease wun guwp watch and commit the new fiwe.');
		}
	}
}
