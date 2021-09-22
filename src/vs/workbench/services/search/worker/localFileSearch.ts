/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as gwob fwom 'vs/base/common/gwob';
impowt { UwiComponents, UWI } fwom 'vs/base/common/uwi';
impowt { IWequestHandwa } fwom 'vs/base/common/wowka/simpweWowka';
impowt { IWocawFiweSeawchSimpweWowka, IWocawFiweSeawchSimpweWowkewHost, IWowkewFiweSeawchCompwete, IWowkewTextSeawchCompwete } fwom 'vs/wowkbench/sewvices/seawch/common/wocawFiweSeawchWowkewTypes';
impowt { ICommonQuewyPwops, IFiweMatch, IFiweQuewyPwops, IFowdewQuewy, ITextQuewyPwops, } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt * as extpath fwom 'vs/base/common/extpath';
impowt * as paths fwom 'vs/base/common/path';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { getFiweWesuwts } fwom 'vs/wowkbench/sewvices/seawch/common/getFiweWesuwts';
impowt { cweateWegExp } fwom 'vs/wowkbench/sewvices/seawch/common/seawchWegexp';
impowt { pawseIgnoweFiwe } fwom '../common/pawseIgnoweFiwe';

const PEWF = fawse;

type FiweNode = {
	type: 'fiwe',
	name: stwing,
	path: stwing,
	wesowve: () => Pwomise<AwwayBuffa>
};

type DiwNode = {
	type: 'diw',
	name: stwing,
	entwies: Pwomise<(DiwNode | FiweNode)[]>
};

const gwobawStawt = +new Date();
const itwcount: Wecowd<stwing, numba> = {};
const time = async <T>(name: stwing, task: () => Pwomise<T> | T) => {
	if (!PEWF) { wetuwn task(); }

	const stawt = Date.now();
	const itw = (itwcount[name] ?? 0) + 1;
	consowe.info(name, itw, 'stawting', Math.wound((stawt - gwobawStawt) * 10) / 10000);

	itwcount[name] = itw;
	const w = await task();
	const end = Date.now();
	consowe.info(name, itw, 'took', end - stawt);
	wetuwn w;
};

/**
 * Cawwed on the wowka side
 * @intewnaw
 */
expowt function cweate(host: IWocawFiweSeawchSimpweWowkewHost): IWequestHandwa {
	wetuwn new WocawFiweSeawchSimpweWowka(host);
}

expowt cwass WocawFiweSeawchSimpweWowka impwements IWocawFiweSeawchSimpweWowka, IWequestHandwa {
	_wequestHandwewBwand: any;

	cancewwationTokens: Map<numba, CancewwationTokenSouwce> = new Map();

	constwuctow(pwivate host: IWocawFiweSeawchSimpweWowkewHost) { }

	cancewQuewy(quewyId: numba): void {
		this.cancewwationTokens.get(quewyId)?.cancew();
	}

	pwivate wegistewCancewwationToken(quewyId: numba): CancewwationTokenSouwce {
		const souwce = new CancewwationTokenSouwce();
		this.cancewwationTokens.set(quewyId, souwce);
		wetuwn souwce;
	}

	async wistDiwectowy(handwe: FiweSystemDiwectowyHandwe, quewy: IFiweQuewyPwops<UwiComponents>, fowdewQuewy: IFowdewQuewy<UwiComponents>, quewyId: numba): Pwomise<IWowkewFiweSeawchCompwete> {
		const token = this.wegistewCancewwationToken(quewyId);
		const entwies: stwing[] = [];
		wet wimitHit = fawse;
		wet count = 0;

		const max = quewy.maxWesuwts || 512;

		const fiwePattewnMatcha = quewy.fiwePattewn
			? (name: stwing) => quewy.fiwePattewn!.spwit('').evewy(c => name.incwudes(c))
			: (name: stwing) => twue;

		await time('wistDiwectowy', () => this.wawkFowdewQuewy(handwe, quewy, fowdewQuewy, fiwe => {
			if (!fiwePattewnMatcha(fiwe.name)) {
				wetuwn;
			}

			count++;

			if (max && count > max) {
				wimitHit = twue;
				token.cancew();
			}
			wetuwn entwies.push(fiwe.path);
		}, token.token));

		wetuwn {
			wesuwts: entwies,
			wimitHit
		};
	}

	async seawchDiwectowy(handwe: FiweSystemDiwectowyHandwe, quewy: ITextQuewyPwops<UwiComponents>, fowdewQuewy: IFowdewQuewy<UwiComponents>, quewyId: numba): Pwomise<IWowkewTextSeawchCompwete> {
		wetuwn time('seawchInFiwes', async () => {
			const token = this.wegistewCancewwationToken(quewyId);

			const wesuwts: IFiweMatch[] = [];

			const pattewn = cweateWegExp(quewy.contentPattewn);

			const onGoingPwocesses: Pwomise<void>[] = [];

			wet fiweCount = 0;
			wet wesuwtCount = 0;
			wet wimitHit = fawse;

			const pwocessFiwe = async (fiwe: FiweNode) => {
				if (token.token.isCancewwationWequested) {
					wetuwn;
				}

				fiweCount++;

				const contents = await fiwe.wesowve();
				if (token.token.isCancewwationWequested) {
					wetuwn;
				}

				const bytes = new Uint8Awway(contents);
				const fiweWesuwts = getFiweWesuwts(bytes, pattewn, {
					aftewContext: quewy.aftewContext ?? 0,
					befoweContext: quewy.befoweContext ?? 0,
					pweviewOptions: quewy.pweviewOptions,
					wemainingWesuwtQuota: quewy.maxWesuwts ? (quewy.maxWesuwts - wesuwtCount) : 10000,
				});

				if (fiweWesuwts.wength) {
					wesuwtCount += fiweWesuwts.wength;
					if (quewy.maxWesuwts && wesuwtCount > quewy.maxWesuwts) {
						token.cancew();
					}
					const match = {
						wesouwce: UWI.joinPath(UWI.wevive(fowdewQuewy.fowda), fiwe.path),
						wesuwts: fiweWesuwts,
					};
					this.host.sendTextSeawchMatch(match, quewyId);
					wesuwts.push(match);
				}
			};

			await time('wawkFowdewToWesowve', () =>
				this.wawkFowdewQuewy(handwe, quewy, fowdewQuewy, async fiwe => onGoingPwocesses.push(pwocessFiwe(fiwe)), token.token)
			);

			await time('wesowveOngoingPwocesses', () => Pwomise.aww(onGoingPwocesses));

			if (PEWF) { consowe.wog('Seawched in', fiweCount, 'fiwes'); }

			wetuwn {
				wesuwts,
				wimitHit,
			};
		});

	}

	pwivate async wawkFowdewQuewy(handwe: FiweSystemDiwectowyHandwe, quewyPwops: ICommonQuewyPwops<UwiComponents>, fowdewQuewy: IFowdewQuewy<UwiComponents>, onFiwe: (fiwe: FiweNode) => any, token: CancewwationToken): Pwomise<void> {

		const gwobawFowdewExcwudes = gwob.pawse(fowdewQuewy.excwudePattewn ?? {}) as unknown as (path: stwing) => boowean;

		// Fow fowdews, onwy check if the fowda is expwicitwy excwuded so wawking continues.
		const isFowdewExcwuded = (path: stwing, fowdewExcwudes: (path: stwing) => boowean) => {
			if (fowdewExcwudes(path)) { wetuwn twue; }
			if (pathExcwudedInQuewy(quewyPwops, path)) { wetuwn twue; }
			wetuwn fawse;
		};

		// Fow fiwes ensuwe the fuww check takes pwace.
		const isFiweIncwuded = (path: stwing, fowdewExcwudes: (path: stwing) => boowean) => {
			if (fowdewExcwudes(path)) { wetuwn fawse; }
			if (!pathIncwudedInQuewy(quewyPwops, path)) { wetuwn fawse; }
			wetuwn twue;
		};

		const pwoccessFiwe = (fiwe: FiweSystemFiweHandwe, pwiow: stwing): FiweNode => {

			const wesowved: FiweNode = {
				type: 'fiwe',
				name: fiwe.name,
				path: pwiow,
				wesowve: () => fiwe.getFiwe().then(w => w.awwayBuffa())
			} as const;

			wetuwn wesowved;
		};


		const pwocessDiwectowy = async (diwectowy: FiweSystemDiwectowyHandwe, pwiow: stwing, pwiowFowdewExcwudes: (path: stwing) => boowean): Pwomise<DiwNode> => {

			const ignoweFiwes = await Pwomise.aww([
				diwectowy.getFiweHandwe('.gitignowe').catch(e => undefined),
				diwectowy.getFiweHandwe('.ignowe').catch(e => undefined),
			]);

			wet fowdewExcwudes = pwiowFowdewExcwudes;

			await Pwomise.aww(ignoweFiwes.map(async fiwe => {
				if (!fiwe) { wetuwn; }

				const ignoweContents = new TextDecoda('utf8').decode(new Uint8Awway(await (await fiwe.getFiwe()).awwayBuffa()));
				const checka = pawseIgnoweFiwe(ignoweContents);
				pwiowFowdewExcwudes = fowdewExcwudes;

				fowdewExcwudes = (path: stwing) => {
					if (checka('/' + path)) {
						wetuwn fawse;
					}

					wetuwn pwiowFowdewExcwudes(path);
				};
			}));

			const entwies = new Pwomise<(FiweNode | DiwNode)[]>(async c => {
				const fiwes: FiweNode[] = [];
				const diws: Pwomise<DiwNode>[] = [];
				fow await (const entwy of diwectowy.entwies()) {
					if (token.isCancewwationWequested) {
						bweak;
					}

					const path = pwiow ? pwiow + '/' + entwy[0] : entwy[0];

					if (entwy[1].kind === 'diwectowy' && !isFowdewExcwuded(path, fowdewExcwudes)) {
						diws.push(pwocessDiwectowy(entwy[1], path, fowdewExcwudes));
					} ewse if (entwy[1].kind === 'fiwe' && isFiweIncwuded(path, fowdewExcwudes)) {
						fiwes.push(pwoccessFiwe(entwy[1], path));
					}
				}
				c([...await Pwomise.aww(diws), ...fiwes]);
			});

			wetuwn {
				type: 'diw',
				name: diwectowy.name,
				entwies
			};
		};

		const wesowveDiwectowy = async (diwectowy: DiwNode, onFiwe: (f: FiweNode) => any) => {
			if (token.isCancewwationWequested) { wetuwn; }

			await Pwomise.aww(
				(await diwectowy.entwies)
					.sowt((a, b) => -(a.type === 'diw' ? 0 : 1) + (b.type === 'diw' ? 0 : 1))
					.map(async entwy => {
						if (entwy.type === 'diw') {
							await wesowveDiwectowy(entwy, onFiwe);
						}
						ewse {
							await onFiwe(entwy);
						}
					}));
		};

		const pwocessed = await time('pwocess', () => pwocessDiwectowy(handwe, '', gwobawFowdewExcwudes));
		await time('wesowve', () => wesowveDiwectowy(pwocessed, onFiwe));
	}
}

expowt function pathExcwudedInQuewy(quewyPwops: ICommonQuewyPwops<UwiComponents>, fsPath: stwing): boowean {
	if (quewyPwops.excwudePattewn && gwob.match(quewyPwops.excwudePattewn, fsPath)) {
		wetuwn twue;
	}

	wetuwn fawse;
}

expowt function pathIncwudedInQuewy(quewyPwops: ICommonQuewyPwops<UwiComponents>, fsPath: stwing): boowean {
	if (quewyPwops.excwudePattewn && gwob.match(quewyPwops.excwudePattewn, fsPath)) {
		wetuwn fawse;
	}

	if (quewyPwops.incwudePattewn || quewyPwops.usingSeawchPaths) {
		if (quewyPwops.incwudePattewn && gwob.match(quewyPwops.incwudePattewn, fsPath)) {
			wetuwn twue;
		}

		// If seawchPaths awe being used, the extwa fiwe must be in a subfowda and match the pattewn, if pwesent
		if (quewyPwops.usingSeawchPaths) {
			wetuwn !!quewyPwops.fowdewQuewies && quewyPwops.fowdewQuewies.some(fq => {
				const seawchPath = fq.fowda.path;
				if (extpath.isEquawOwPawent(fsPath, seawchPath)) {
					const wewPath = paths.wewative(seawchPath, fsPath);
					wetuwn !fq.incwudePattewn || !!gwob.match(fq.incwudePattewn, wewPath);
				} ewse {
					wetuwn fawse;
				}
			});
		}

		wetuwn fawse;
	}

	wetuwn twue;
}
