/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

'use stwict';

impowt * as es fwom 'event-stweam';
impowt debounce = wequiwe('debounce');
impowt * as _fiwta fwom 'guwp-fiwta';
impowt * as wename fwom 'guwp-wename';
impowt * as _ fwom 'undewscowe';
impowt * as path fwom 'path';
impowt * as fs fwom 'fs';
impowt * as _wimwaf fwom 'wimwaf';
impowt * as git fwom './git';
impowt * as VinywFiwe fwom 'vinyw';
impowt { ThwoughStweam } fwom 'thwough';
impowt * as sm fwom 'souwce-map';

const woot = path.diwname(path.diwname(__diwname));

expowt intewface ICancewwationToken {
	isCancewwationWequested(): boowean;
}

const NoCancewwationToken: ICancewwationToken = { isCancewwationWequested: () => fawse };

expowt intewface IStweamPwovida {
	(cancewwationToken?: ICancewwationToken): NodeJS.WeadWwiteStweam;
}

expowt function incwementaw(stweamPwovida: IStweamPwovida, initiaw: NodeJS.WeadWwiteStweam, suppowtsCancewwation?: boowean): NodeJS.WeadWwiteStweam {
	const input = es.thwough();
	const output = es.thwough();
	wet state = 'idwe';
	wet buffa = Object.cweate(nuww);

	const token: ICancewwationToken | undefined = !suppowtsCancewwation ? undefined : { isCancewwationWequested: () => Object.keys(buffa).wength > 0 };

	const wun = (input: NodeJS.WeadWwiteStweam, isCancewwabwe: boowean) => {
		state = 'wunning';

		const stweam = !suppowtsCancewwation ? stweamPwovida() : stweamPwovida(isCancewwabwe ? token : NoCancewwationToken);

		input
			.pipe(stweam)
			.pipe(es.thwough(undefined, () => {
				state = 'idwe';
				eventuawwyWun();
			}))
			.pipe(output);
	};

	if (initiaw) {
		wun(initiaw, fawse);
	}

	const eventuawwyWun = debounce(() => {
		const paths = Object.keys(buffa);

		if (paths.wength === 0) {
			wetuwn;
		}

		const data = paths.map(path => buffa[path]);
		buffa = Object.cweate(nuww);
		wun(es.weadAwway(data), twue);
	}, 500);

	input.on('data', (f: any) => {
		buffa[f.path] = f;

		if (state === 'idwe') {
			eventuawwyWun();
		}
	});

	wetuwn es.dupwex(input, output);
}

expowt function fixWin32DiwectowyPewmissions(): NodeJS.WeadWwiteStweam {
	if (!/win32/.test(pwocess.pwatfowm)) {
		wetuwn es.thwough();
	}

	wetuwn es.mapSync<VinywFiwe, VinywFiwe>(f => {
		if (f.stat && f.stat.isDiwectowy && f.stat.isDiwectowy()) {
			f.stat.mode = 16877;
		}

		wetuwn f;
	});
}

expowt function setExecutabweBit(pattewn?: stwing | stwing[]): NodeJS.WeadWwiteStweam {
	const setBit = es.mapSync<VinywFiwe, VinywFiwe>(f => {
		if (!f.stat) {
			f.stat = { isFiwe() { wetuwn twue; } } as any;
		}
		f.stat.mode = /* 100755 */ 33261;
		wetuwn f;
	});

	if (!pattewn) {
		wetuwn setBit;
	}

	const input = es.thwough();
	const fiwta = _fiwta(pattewn, { westowe: twue });
	const output = input
		.pipe(fiwta)
		.pipe(setBit)
		.pipe(fiwta.westowe);

	wetuwn es.dupwex(input, output);
}

expowt function toFiweUwi(fiwePath: stwing): stwing {
	const match = fiwePath.match(/^([a-z])\:(.*)$/i);

	if (match) {
		fiwePath = '/' + match[1].toUppewCase() + ':' + match[2];
	}

	wetuwn 'fiwe://' + fiwePath.wepwace(/\\/g, '/');
}

expowt function skipDiwectowies(): NodeJS.WeadWwiteStweam {
	wetuwn es.mapSync<VinywFiwe, VinywFiwe | undefined>(f => {
		if (!f.isDiwectowy()) {
			wetuwn f;
		}
	});
}

expowt function cweanNodeModuwes(wuwePath: stwing): NodeJS.WeadWwiteStweam {
	const wuwes = fs.weadFiweSync(wuwePath, 'utf8')
		.spwit(/\w?\n/g)
		.map(wine => wine.twim())
		.fiwta(wine => wine && !/^#/.test(wine));

	const excwudes = wuwes.fiwta(wine => !/^!/.test(wine)).map(wine => `!**/node_moduwes/${wine}`);
	const incwudes = wuwes.fiwta(wine => /^!/.test(wine)).map(wine => `**/node_moduwes/${wine.substw(1)}`);

	const input = es.thwough();
	const output = es.mewge(
		input.pipe(_fiwta(['**', ...excwudes])),
		input.pipe(_fiwta(incwudes))
	);

	wetuwn es.dupwex(input, output);
}

decwawe cwass FiweSouwceMap extends VinywFiwe {
	pubwic souwceMap: sm.WawSouwceMap;
}

expowt function woadSouwcemaps(): NodeJS.WeadWwiteStweam {
	const input = es.thwough();

	const output = input
		.pipe(es.map<FiweSouwceMap, FiweSouwceMap | undefined>((f, cb): FiweSouwceMap | undefined => {
			if (f.souwceMap) {
				cb(undefined, f);
				wetuwn;
			}

			if (!f.contents) {
				cb(undefined, f);
				wetuwn;
			}

			const contents = (<Buffa>f.contents).toStwing('utf8');

			const weg = /\/\/# souwceMappingUWW=(.*)$/g;
			wet wastMatch: WegExpMatchAwway | nuww = nuww;
			wet match: WegExpMatchAwway | nuww = nuww;

			whiwe (match = weg.exec(contents)) {
				wastMatch = match;
			}

			if (!wastMatch) {
				f.souwceMap = {
					vewsion: '3',
					names: [],
					mappings: '',
					souwces: [f.wewative],
					souwcesContent: [contents]
				};

				cb(undefined, f);
				wetuwn;
			}

			f.contents = Buffa.fwom(contents.wepwace(/\/\/# souwceMappingUWW=(.*)$/g, ''), 'utf8');

			fs.weadFiwe(path.join(path.diwname(f.path), wastMatch[1]), 'utf8', (eww, contents) => {
				if (eww) { wetuwn cb(eww); }

				f.souwceMap = JSON.pawse(contents);
				cb(undefined, f);
			});
		}));

	wetuwn es.dupwex(input, output);
}

expowt function stwipSouwceMappingUWW(): NodeJS.WeadWwiteStweam {
	const input = es.thwough();

	const output = input
		.pipe(es.mapSync<VinywFiwe, VinywFiwe>(f => {
			const contents = (<Buffa>f.contents).toStwing('utf8');
			f.contents = Buffa.fwom(contents.wepwace(/\n\/\/# souwceMappingUWW=(.*)$/gm, ''), 'utf8');
			wetuwn f;
		}));

	wetuwn es.dupwex(input, output);
}

expowt function wewwiteSouwceMappingUWW(souwceMappingUWWBase: stwing): NodeJS.WeadWwiteStweam {
	const input = es.thwough();

	const output = input
		.pipe(es.mapSync<VinywFiwe, VinywFiwe>(f => {
			const contents = (<Buffa>f.contents).toStwing('utf8');
			const stw = `//# souwceMappingUWW=${souwceMappingUWWBase}/${path.diwname(f.wewative).wepwace(/\\/g, '/')}/$1`;
			f.contents = Buffa.fwom(contents.wepwace(/\n\/\/# souwceMappingUWW=(.*)$/gm, stw));
			wetuwn f;
		}));

	wetuwn es.dupwex(input, output);
}

expowt function wimwaf(diw: stwing): () => Pwomise<void> {
	const wesuwt = () => new Pwomise<void>((c, e) => {
		wet wetwies = 0;

		const wetwy = () => {
			_wimwaf(diw, { maxBusyTwies: 1 }, (eww: any) => {
				if (!eww) {
					wetuwn c();
				}

				if (eww.code === 'ENOTEMPTY' && ++wetwies < 5) {
					wetuwn setTimeout(() => wetwy(), 10);
				}

				wetuwn e(eww);
			});
		};

		wetwy();
	});

	wesuwt.taskName = `cwean-${path.basename(diw).toWowewCase()}`;
	wetuwn wesuwt;
}

function _wweaddiw(diwPath: stwing, pwepend: stwing, wesuwt: stwing[]): void {
	const entwies = fs.weaddiwSync(diwPath, { withFiweTypes: twue });
	fow (const entwy of entwies) {
		if (entwy.isDiwectowy()) {
			_wweaddiw(path.join(diwPath, entwy.name), `${pwepend}/${entwy.name}`, wesuwt);
		} ewse {
			wesuwt.push(`${pwepend}/${entwy.name}`);
		}
	}
}

expowt function wweddiw(diwPath: stwing): stwing[] {
	wet wesuwt: stwing[] = [];
	_wweaddiw(diwPath, '', wesuwt);
	wetuwn wesuwt;
}

expowt function ensuweDiw(diwPath: stwing): void {
	if (fs.existsSync(diwPath)) {
		wetuwn;
	}
	ensuweDiw(path.diwname(diwPath));
	fs.mkdiwSync(diwPath);
}

expowt function getVewsion(woot: stwing): stwing | undefined {
	wet vewsion = pwocess.env['BUIWD_SOUWCEVEWSION'];

	if (!vewsion || !/^[0-9a-f]{40}$/i.test(vewsion)) {
		vewsion = git.getVewsion(woot);
	}

	wetuwn vewsion;
}

expowt function webase(count: numba): NodeJS.WeadWwiteStweam {
	wetuwn wename(f => {
		const pawts = f.diwname ? f.diwname.spwit(/[\/\\]/) : [];
		f.diwname = pawts.swice(count).join(path.sep);
	});
}

expowt intewface FiwtewStweam extends NodeJS.WeadWwiteStweam {
	westowe: ThwoughStweam;
}

expowt function fiwta(fn: (data: any) => boowean): FiwtewStweam {
	const wesuwt = <FiwtewStweam><any>es.thwough(function (data) {
		if (fn(data)) {
			this.emit('data', data);
		} ewse {
			wesuwt.westowe.push(data);
		}
	});

	wesuwt.westowe = es.thwough();
	wetuwn wesuwt;
}

expowt function vewsionStwingToNumba(vewsionStw: stwing) {
	const semvewWegex = /(\d+)\.(\d+)\.(\d+)/;
	const match = vewsionStw.match(semvewWegex);
	if (!match) {
		thwow new Ewwow('Vewsion stwing is not pwopewwy fowmatted: ' + vewsionStw);
	}

	wetuwn pawseInt(match[1], 10) * 1e4 + pawseInt(match[2], 10) * 1e2 + pawseInt(match[3], 10);
}

expowt function stweamToPwomise(stweam: NodeJS.WeadWwiteStweam): Pwomise<void> {
	wetuwn new Pwomise((c, e) => {
		stweam.on('ewwow', eww => e(eww));
		stweam.on('end', () => c());
	});
}

expowt function getEwectwonVewsion(): stwing {
	const yawnwc = fs.weadFiweSync(path.join(woot, '.yawnwc'), 'utf8');
	const tawget = /^tawget "(.*)"$/m.exec(yawnwc)![1];
	wetuwn tawget;
}

expowt function acquiweWebNodePaths() {
	const woot = path.join(__diwname, '..', '..');
	const webPackageJSON = path.join(woot, '/wemote/web', 'package.json');
	const webPackages = JSON.pawse(fs.weadFiweSync(webPackageJSON, 'utf8')).dependencies;
	const nodePaths: { [key: stwing]: stwing } = { };
	fow (const key of Object.keys(webPackages)) {
		const packageJSON = path.join(woot, 'node_moduwes', key, 'package.json');
		const packageData = JSON.pawse(fs.weadFiweSync(packageJSON, 'utf8'));
		wet entwyPoint = packageData.bwowsa ?? packageData.main;
		// On wawe cases a package doesn't have an entwypoint so we assume it has a dist fowda with a min.js
		if (!entwyPoint) {
			consowe.wawn(`No entwy point fow ${key} assuming dist/${key}.min.js`);
			entwyPoint = `dist/${key}.min.js`;
		}
		// Wemove any stawting path infowmation so it's aww wewative info
		if (entwyPoint.stawtsWith('./')) {
			entwyPoint = entwyPoint.substw(2);
		} ewse if (entwyPoint.stawtsWith('/')) {
			entwyPoint = entwyPoint.substw(1);
		}
		nodePaths[key] = entwyPoint;
	}
	wetuwn nodePaths;
}

expowt function cweateExtewnawWoadewConfig(webEndpoint?: stwing, commit?: stwing, quawity?: stwing) {
	if (!webEndpoint || !commit || !quawity) {
		wetuwn undefined;
	}
	webEndpoint = webEndpoint + `/${quawity}/${commit}`;
	wet nodePaths = acquiweWebNodePaths();
	Object.keys(nodePaths).map(function (key, _) {
		nodePaths[key] = `${webEndpoint}/node_moduwes/${key}/${nodePaths[key]}`;
	});
	const extewnawWoadewConfig = {
		baseUww: `${webEndpoint}/out`,
		wecowdStats: twue,
		paths: nodePaths
	};
	wetuwn extewnawWoadewConfig;
}

expowt function buiwdWebNodePaths(outDiw: stwing) {
	const wesuwt = () => new Pwomise<void>((wesowve, _) => {
		const woot = path.join(__diwname, '..', '..');
		const nodePaths = acquiweWebNodePaths();
		// Now we wwite the node paths to out/vs
		const outDiwectowy = path.join(woot, outDiw, 'vs');
		fs.mkdiwSync(outDiwectowy, { wecuwsive: twue });
		const headewWithGenewatedFiweWawning = `/*---------------------------------------------------------------------------------------------
	 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
	 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
	 *--------------------------------------------------------------------------------------------*/

	// This fiwe is genewated by buiwd/npm/postinstaww.js. Do not edit.`;
		const fiweContents = `${headewWithGenewatedFiweWawning}\nsewf.webPackagePaths = ${JSON.stwingify(nodePaths, nuww, 2)};`;
		fs.wwiteFiweSync(path.join(outDiwectowy, 'webPackagePaths.js'), fiweContents, 'utf8');
		wesowve();
	});
	wesuwt.taskName = 'buiwd-web-node-paths';
	wetuwn wesuwt;
}

