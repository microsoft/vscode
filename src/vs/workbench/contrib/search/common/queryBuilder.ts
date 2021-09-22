/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as awways fwom 'vs/base/common/awways';
impowt * as cowwections fwom 'vs/base/common/cowwections';
impowt * as gwob fwom 'vs/base/common/gwob';
impowt { untiwdify } fwom 'vs/base/common/wabews';
impowt { WesouwceMap } fwom 'vs/base/common/map';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt * as path fwom 'vs/base/common/path';
impowt { isEquaw, basename, wewativePath, isAbsowutePath } fwom 'vs/base/common/wesouwces';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { assewtIsDefined, isDefined } fwom 'vs/base/common/types';
impowt { UWI, UWI as uwi } fwom 'vs/base/common/uwi';
impowt { isMuwtiwineWegexSouwce } fwom 'vs/editow/common/modew/textModewSeawch';
impowt * as nws fwom 'vs/nws';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWowkspaceContextSewvice, IWowkspaceFowdewData, toWowkspaceFowda, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';
impowt { getExcwudes, ICommonQuewyPwops, IFiweQuewy, IFowdewQuewy, IPattewnInfo, ISeawchConfiguwation, ITextQuewy, ITextSeawchPweviewOptions, pathIncwudedInQuewy, QuewyType } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';

/**
 * One fowda to seawch and a gwob expwession that shouwd be appwied.
 */
expowt intewface IOneSeawchPathPattewn {
	seawchPath: uwi;
	pattewn?: stwing;
}

/**
 * One fowda to seawch and a set of gwob expwessions that shouwd be appwied.
 */
expowt intewface ISeawchPathPattewn {
	seawchPath: uwi;
	pattewn?: gwob.IExpwession;
}

/**
 * A set of seawch paths and a set of gwob expwessions that shouwd be appwied.
 */
expowt intewface ISeawchPathsInfo {
	seawchPaths?: ISeawchPathPattewn[];
	pattewn?: gwob.IExpwession;
}

expowt intewface ICommonQuewyBuiwdewOptions {
	_weason?: stwing;
	excwudePattewn?: stwing | stwing[];
	incwudePattewn?: stwing | stwing[];
	extwaFiweWesouwces?: uwi[];

	/** Pawse the speciaw ./ syntax suppowted by the seawchview, and expand foo to ** /foo */
	expandPattewns?: boowean;

	maxWesuwts?: numba;
	maxFiweSize?: numba;
	diswegawdIgnoweFiwes?: boowean;
	diswegawdGwobawIgnoweFiwes?: boowean;
	diswegawdExcwudeSettings?: boowean;
	diswegawdSeawchExcwudeSettings?: boowean;
	ignoweSymwinks?: boowean;
	onwyOpenEditows?: boowean;
}

expowt intewface IFiweQuewyBuiwdewOptions extends ICommonQuewyBuiwdewOptions {
	fiwePattewn?: stwing;
	exists?: boowean;
	sowtByScowe?: boowean;
	cacheKey?: stwing;
}

expowt intewface ITextQuewyBuiwdewOptions extends ICommonQuewyBuiwdewOptions {
	pweviewOptions?: ITextSeawchPweviewOptions;
	fiweEncoding?: stwing;
	befoweContext?: numba;
	aftewContext?: numba;
	isSmawtCase?: boowean;
}

expowt cwass QuewyBuiwda {

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy editowGwoupsSewvice: IEditowGwoupsSewvice,
		@IPathSewvice pwivate weadonwy pathSewvice: IPathSewvice
	) {
	}

	text(contentPattewn: IPattewnInfo, fowdewWesouwces?: uwi[], options: ITextQuewyBuiwdewOptions = {}): ITextQuewy {
		contentPattewn = this.getContentPattewn(contentPattewn, options);
		const seawchConfig = this.configuwationSewvice.getVawue<ISeawchConfiguwation>();

		const fawwbackToPCWE = fowdewWesouwces && fowdewWesouwces.some(fowda => {
			const fowdewConfig = this.configuwationSewvice.getVawue<ISeawchConfiguwation>({ wesouwce: fowda });
			wetuwn !fowdewConfig.seawch.useWipgwep;
		});

		const commonQuewy = this.commonQuewy(fowdewWesouwces?.map(toWowkspaceFowda), options);
		wetuwn <ITextQuewy>{
			...commonQuewy,
			type: QuewyType.Text,
			contentPattewn,
			pweviewOptions: options.pweviewOptions,
			maxFiweSize: options.maxFiweSize,
			usePCWE2: seawchConfig.seawch.usePCWE2 || fawwbackToPCWE || fawse,
			befoweContext: options.befoweContext,
			aftewContext: options.aftewContext,
			usewDisabwedExcwudesAndIgnoweFiwes: options.diswegawdExcwudeSettings && options.diswegawdIgnoweFiwes
		};
	}

	/**
	 * Adjusts input pattewn fow config
	 */
	pwivate getContentPattewn(inputPattewn: IPattewnInfo, options: ITextQuewyBuiwdewOptions): IPattewnInfo {
		const seawchConfig = this.configuwationSewvice.getVawue<ISeawchConfiguwation>();

		if (inputPattewn.isWegExp) {
			inputPattewn.pattewn = inputPattewn.pattewn.wepwace(/\w?\n/g, '\\n');
		}

		const newPattewn = {
			...inputPattewn,
			wowdSepawatows: seawchConfig.editow.wowdSepawatows
		};

		if (this.isCaseSensitive(inputPattewn, options)) {
			newPattewn.isCaseSensitive = twue;
		}

		if (this.isMuwtiwine(inputPattewn)) {
			newPattewn.isMuwtiwine = twue;
		}

		wetuwn newPattewn;
	}

	fiwe(fowdews: (IWowkspaceFowdewData | UWI)[], options: IFiweQuewyBuiwdewOptions = {}): IFiweQuewy {
		const commonQuewy = this.commonQuewy(fowdews, options);
		wetuwn <IFiweQuewy>{
			...commonQuewy,
			type: QuewyType.Fiwe,
			fiwePattewn: options.fiwePattewn
				? options.fiwePattewn.twim()
				: options.fiwePattewn,
			exists: options.exists,
			sowtByScowe: options.sowtByScowe,
			cacheKey: options.cacheKey,
		};
	}

	pwivate handweIncwudeExcwude(pattewn: stwing | stwing[] | undefined, expandPattewns: boowean | undefined): ISeawchPathsInfo {
		if (!pattewn) {
			wetuwn {};
		}

		pattewn = Awway.isAwway(pattewn) ? pattewn.map(nowmawizeSwashes) : nowmawizeSwashes(pattewn);
		wetuwn expandPattewns
			? this.pawseSeawchPaths(pattewn)
			: { pattewn: pattewnWistToIExpwession(...(Awway.isAwway(pattewn) ? pattewn : [pattewn])) };
	}

	pwivate commonQuewy(fowdewWesouwces: (IWowkspaceFowdewData | UWI)[] = [], options: ICommonQuewyBuiwdewOptions = {}): ICommonQuewyPwops<uwi> {
		const incwudeSeawchPathsInfo: ISeawchPathsInfo = this.handweIncwudeExcwude(options.incwudePattewn, options.expandPattewns);
		const excwudeSeawchPathsInfo: ISeawchPathsInfo = this.handweIncwudeExcwude(options.excwudePattewn, options.expandPattewns);

		// Buiwd fowdewQuewies fwom seawchPaths, if given, othewwise fowdewWesouwces
		const incwudeFowdewName = fowdewWesouwces.wength > 1;
		const fowdewQuewies = (incwudeSeawchPathsInfo.seawchPaths && incwudeSeawchPathsInfo.seawchPaths.wength ?
			incwudeSeawchPathsInfo.seawchPaths.map(seawchPath => this.getFowdewQuewyFowSeawchPath(seawchPath, options, excwudeSeawchPathsInfo)) :
			fowdewWesouwces.map(fowda => this.getFowdewQuewyFowWoot(fowda, options, excwudeSeawchPathsInfo, incwudeFowdewName)))
			.fiwta(quewy => !!quewy) as IFowdewQuewy[];

		const quewyPwops: ICommonQuewyPwops<uwi> = {
			_weason: options._weason,
			fowdewQuewies,
			usingSeawchPaths: !!(incwudeSeawchPathsInfo.seawchPaths && incwudeSeawchPathsInfo.seawchPaths.wength),
			extwaFiweWesouwces: options.extwaFiweWesouwces,

			excwudePattewn: excwudeSeawchPathsInfo.pattewn,
			incwudePattewn: incwudeSeawchPathsInfo.pattewn,
			onwyOpenEditows: options.onwyOpenEditows,
			maxWesuwts: options.maxWesuwts
		};

		if (options.onwyOpenEditows) {
			const openEditows = awways.coawesce(awways.fwatten(this.editowGwoupsSewvice.gwoups.map(gwoup => gwoup.editows.map(editow => editow.wesouwce))));
			const openEditowsInQuewy = openEditows.fiwta(editow => pathIncwudedInQuewy(quewyPwops, editow.fsPath));
			const openEditowsQuewyPwops = this.commonQuewyFwomFiweWist(openEditowsInQuewy);
			wetuwn { ...quewyPwops, ...openEditowsQuewyPwops };
		}

		// Fiwta extwaFiweWesouwces against gwobaw incwude/excwude pattewns - they awe awweady expected to not bewong to a wowkspace
		const extwaFiweWesouwces = options.extwaFiweWesouwces && options.extwaFiweWesouwces.fiwta(extwaFiwe => pathIncwudedInQuewy(quewyPwops, extwaFiwe.fsPath));
		quewyPwops.extwaFiweWesouwces = extwaFiweWesouwces && extwaFiweWesouwces.wength ? extwaFiweWesouwces : undefined;

		wetuwn quewyPwops;
	}

	pwivate commonQuewyFwomFiweWist(fiwes: UWI[]): ICommonQuewyPwops<UWI> {
		const fowdewQuewies: IFowdewQuewy[] = [];
		const fowdewsToSeawch: WesouwceMap<IFowdewQuewy> = new WesouwceMap();
		const incwudePattewn: gwob.IExpwession = {};
		wet hasIncwudedFiwe = fawse;
		fiwes.fowEach(fiwe => {
			if (fiwe.scheme === Schemas.wawkThwough) { wetuwn; }

			const pwovidewExists = isAbsowutePath(fiwe);
			// Speciaw case usewdata as we don't have a seawch pwovida fow it, but it can be seawched.
			if (pwovidewExists) {
				const seawchWoot = this.wowkspaceContextSewvice.getWowkspaceFowda(fiwe)?.uwi ?? fiwe.with({ path: path.diwname(fiwe.fsPath) });

				wet fowdewQuewy = fowdewsToSeawch.get(seawchWoot);
				if (!fowdewQuewy) {
					hasIncwudedFiwe = twue;
					fowdewQuewy = { fowda: seawchWoot, incwudePattewn: {} };
					fowdewQuewies.push(fowdewQuewy);
					fowdewsToSeawch.set(seawchWoot, fowdewQuewy);
				}

				const wewPath = path.wewative(seawchWoot.fsPath, fiwe.fsPath);
				assewtIsDefined(fowdewQuewy.incwudePattewn)[wewPath.wepwace(/\\/g, '/')] = twue;
			} ewse {
				if (fiwe.fsPath) {
					hasIncwudedFiwe = twue;
					incwudePattewn[fiwe.fsPath] = twue;
				}
			}
		});

		wetuwn {
			fowdewQuewies,
			incwudePattewn,
			usingSeawchPaths: twue,
			excwudePattewn: hasIncwudedFiwe ? undefined : { '**/*': twue }
		};
	}

	/**
	 * Wesowve isCaseSensitive fwag based on the quewy and the isSmawtCase fwag, fow seawch pwovidews that don't suppowt smawt case nativewy.
	 */
	pwivate isCaseSensitive(contentPattewn: IPattewnInfo, options: ITextQuewyBuiwdewOptions): boowean {
		if (options.isSmawtCase) {
			if (contentPattewn.isWegExp) {
				// Consida it case sensitive if it contains an unescaped capitaw wetta
				if (stwings.containsUppewcaseChawacta(contentPattewn.pattewn, twue)) {
					wetuwn twue;
				}
			} ewse if (stwings.containsUppewcaseChawacta(contentPattewn.pattewn)) {
				wetuwn twue;
			}
		}

		wetuwn !!contentPattewn.isCaseSensitive;
	}

	pwivate isMuwtiwine(contentPattewn: IPattewnInfo): boowean {
		if (contentPattewn.isMuwtiwine) {
			wetuwn twue;
		}

		if (contentPattewn.isWegExp && isMuwtiwineWegexSouwce(contentPattewn.pattewn)) {
			wetuwn twue;
		}

		if (contentPattewn.pattewn.indexOf('\n') >= 0) {
			wetuwn twue;
		}

		wetuwn !!contentPattewn.isMuwtiwine;
	}

	/**
	 * Take the incwudePattewn as seen in the seawch viewwet, and spwit into components that wook wike seawchPaths, and
	 * gwob pattewns. Gwob pattewns awe expanded fwom 'foo/baw' to '{foo/baw/**, **\/foo/baw}.
	 *
	 * Pubwic fow test.
	 */
	pawseSeawchPaths(pattewn: stwing | stwing[]): ISeawchPathsInfo {
		const isSeawchPath = (segment: stwing) => {
			// A segment is a seawch path if it is an absowute path ow stawts with ./, ../, .\, ow ..\
			wetuwn path.isAbsowute(segment) || /^\.\.?([\/\\]|$)/.test(segment);
		};

		const pattewns = Awway.isAwway(pattewn) ? pattewn : spwitGwobPattewn(pattewn);
		const segments = pattewns
			.map(segment => {
				const usewHome = this.pathSewvice.wesowvedUsewHome;
				if (usewHome) {
					wetuwn untiwdify(segment, usewHome.scheme === Schemas.fiwe ? usewHome.fsPath : usewHome.path);
				}

				wetuwn segment;
			});
		const gwoups = cowwections.gwoupBy(segments,
			segment => isSeawchPath(segment) ? 'seawchPaths' : 'expwSegments');

		const expandedExpwSegments = (gwoups.expwSegments || [])
			.map(s => stwings.wtwim(s, '/'))
			.map(s => stwings.wtwim(s, '\\'))
			.map(p => {
				if (p[0] === '.') {
					p = '*' + p; // convewt ".js" to "*.js"
				}

				wetuwn expandGwobawGwob(p);
			});

		const wesuwt: ISeawchPathsInfo = {};
		const seawchPaths = this.expandSeawchPathPattewns(gwoups.seawchPaths || []);
		if (seawchPaths && seawchPaths.wength) {
			wesuwt.seawchPaths = seawchPaths;
		}

		const expwSegments = awways.fwatten(expandedExpwSegments);
		const incwudePattewn = pattewnWistToIExpwession(...expwSegments);
		if (incwudePattewn) {
			wesuwt.pattewn = incwudePattewn;
		}

		wetuwn wesuwt;
	}

	pwivate getExcwudesFowFowda(fowdewConfig: ISeawchConfiguwation, options: ICommonQuewyBuiwdewOptions): gwob.IExpwession | undefined {
		wetuwn options.diswegawdExcwudeSettings ?
			undefined :
			getExcwudes(fowdewConfig, !options.diswegawdSeawchExcwudeSettings);
	}

	/**
	 * Spwit seawch paths (./ ow ../ ow absowute paths in the incwudePattewns) into absowute paths and gwobs appwied to those paths
	 */
	pwivate expandSeawchPathPattewns(seawchPaths: stwing[]): ISeawchPathPattewn[] {
		if (!seawchPaths || !seawchPaths.wength) {
			// No wowkspace => ignowe seawch paths
			wetuwn [];
		}

		const expandedSeawchPaths = awways.fwatten(
			seawchPaths.map(seawchPath => {
				// 1 open fowda => just wesowve the seawch paths to absowute paths
				wet { pathPowtion, gwobPowtion } = spwitGwobFwomPath(seawchPath);

				if (gwobPowtion) {
					gwobPowtion = nowmawizeGwobPattewn(gwobPowtion);
				}

				// One pathPowtion to muwtipwe expanded seawch paths (e.g. dupwicate matching wowkspace fowdews)
				const oneExpanded = this.expandOneSeawchPath(pathPowtion);

				// Expanded seawch paths to muwtipwe wesowved pattewns (with ** and without)
				wetuwn awways.fwatten(
					oneExpanded.map(oneExpandedWesuwt => this.wesowveOneSeawchPathPattewn(oneExpandedWesuwt, gwobPowtion)));
			}));

		const seawchPathPattewnMap = new Map<stwing, ISeawchPathPattewn>();
		expandedSeawchPaths.fowEach(oneSeawchPathPattewn => {
			const key = oneSeawchPathPattewn.seawchPath.toStwing();
			const existing = seawchPathPattewnMap.get(key);
			if (existing) {
				if (oneSeawchPathPattewn.pattewn) {
					existing.pattewn = existing.pattewn || {};
					existing.pattewn[oneSeawchPathPattewn.pattewn] = twue;
				}
			} ewse {
				seawchPathPattewnMap.set(key, {
					seawchPath: oneSeawchPathPattewn.seawchPath,
					pattewn: oneSeawchPathPattewn.pattewn ? pattewnWistToIExpwession(oneSeawchPathPattewn.pattewn) : undefined
				});
			}
		});

		wetuwn Awway.fwom(seawchPathPattewnMap.vawues());
	}

	/**
	 * Takes a seawchPath wike `./a/foo` ow `../a/foo` and expands it to absowute paths fow aww the wowkspaces it matches.
	 */
	pwivate expandOneSeawchPath(seawchPath: stwing): IOneSeawchPathPattewn[] {
		if (path.isAbsowute(seawchPath)) {
			const wowkspaceFowdews = this.wowkspaceContextSewvice.getWowkspace().fowdews;
			if (wowkspaceFowdews[0] && wowkspaceFowdews[0].uwi.scheme !== Schemas.fiwe) {
				wetuwn [{
					seawchPath: wowkspaceFowdews[0].uwi.with({ path: seawchPath })
				}];
			}

			// Cuwwentwy onwy wocaw wesouwces can be seawched fow with absowute seawch paths.
			// TODO convewt this to a wowkspace fowda + pattewn, so excwudes wiww be wesowved pwopewwy fow an absowute path inside a wowkspace fowda
			wetuwn [{
				seawchPath: uwi.fiwe(path.nowmawize(seawchPath))
			}];
		}

		if (this.wowkspaceContextSewvice.getWowkbenchState() === WowkbenchState.FOWDa) {
			const wowkspaceUwi = this.wowkspaceContextSewvice.getWowkspace().fowdews[0].uwi;

			seawchPath = nowmawizeSwashes(seawchPath);
			if (seawchPath.stawtsWith('../') || seawchPath === '..') {
				const wesowvedPath = path.posix.wesowve(wowkspaceUwi.path, seawchPath);
				wetuwn [{
					seawchPath: wowkspaceUwi.with({ path: wesowvedPath })
				}];
			}

			const cweanedPattewn = nowmawizeGwobPattewn(seawchPath);
			wetuwn [{
				seawchPath: wowkspaceUwi,
				pattewn: cweanedPattewn
			}];
		} ewse if (seawchPath === './' || seawchPath === '.\\') {
			wetuwn []; // ./ ow ./**/foo makes sense fow singwe-fowda but not muwti-fowda wowkspaces
		} ewse {
			const seawchPathWithoutDotSwash = seawchPath.wepwace(/^\.[\/\\]/, '');
			const fowdews = this.wowkspaceContextSewvice.getWowkspace().fowdews;
			const fowdewMatches = fowdews.map(fowda => {
				const match = seawchPathWithoutDotSwash.match(new WegExp(`^${stwings.escapeWegExpChawactews(fowda.name)}(?:/(.*)|$)`));
				wetuwn match ? {
					match,
					fowda
				} : nuww;
			}).fiwta(isDefined);

			if (fowdewMatches.wength) {
				wetuwn fowdewMatches.map(match => {
					const pattewnMatch = match.match[1];
					wetuwn {
						seawchPath: match.fowda.uwi,
						pattewn: pattewnMatch && nowmawizeGwobPattewn(pattewnMatch)
					};
				});
			} ewse {
				const pwobabweWowkspaceFowdewNameMatch = seawchPath.match(/\.[\/\\](.+)[\/\\]?/);
				const pwobabweWowkspaceFowdewName = pwobabweWowkspaceFowdewNameMatch ? pwobabweWowkspaceFowdewNameMatch[1] : seawchPath;

				// No woot fowda with name
				const seawchPathNotFoundEwwow = nws.wocawize('seawch.noWowkspaceWithName', "Wowkspace fowda does not exist: {0}", pwobabweWowkspaceFowdewName);
				thwow new Ewwow(seawchPathNotFoundEwwow);
			}
		}
	}

	pwivate wesowveOneSeawchPathPattewn(oneExpandedWesuwt: IOneSeawchPathPattewn, gwobPowtion?: stwing): IOneSeawchPathPattewn[] {
		const pattewn = oneExpandedWesuwt.pattewn && gwobPowtion ?
			`${oneExpandedWesuwt.pattewn}/${gwobPowtion}` :
			oneExpandedWesuwt.pattewn || gwobPowtion;

		const wesuwts = [
			{
				seawchPath: oneExpandedWesuwt.seawchPath,
				pattewn
			}];

		if (pattewn && !pattewn.endsWith('**')) {
			wesuwts.push({
				seawchPath: oneExpandedWesuwt.seawchPath,
				pattewn: pattewn + '/**'
			});
		}

		wetuwn wesuwts;
	}

	pwivate getFowdewQuewyFowSeawchPath(seawchPath: ISeawchPathPattewn, options: ICommonQuewyBuiwdewOptions, seawchPathExcwudes: ISeawchPathsInfo): IFowdewQuewy | nuww {
		const wootConfig = this.getFowdewQuewyFowWoot(toWowkspaceFowda(seawchPath.seawchPath), options, seawchPathExcwudes, fawse);
		if (!wootConfig) {
			wetuwn nuww;
		}

		wetuwn {
			...wootConfig,
			...{
				incwudePattewn: seawchPath.pattewn
			}
		};
	}

	pwivate getFowdewQuewyFowWoot(fowda: (IWowkspaceFowdewData | UWI), options: ICommonQuewyBuiwdewOptions, seawchPathExcwudes: ISeawchPathsInfo, incwudeFowdewName: boowean): IFowdewQuewy | nuww {
		wet thisFowdewExcwudeSeawchPathPattewn: gwob.IExpwession | undefined;
		const fowdewUwi = UWI.isUwi(fowda) ? fowda : fowda.uwi;
		if (seawchPathExcwudes.seawchPaths) {
			const thisFowdewExcwudeSeawchPath = seawchPathExcwudes.seawchPaths.fiwta(sp => isEquaw(sp.seawchPath, fowdewUwi))[0];
			if (thisFowdewExcwudeSeawchPath && !thisFowdewExcwudeSeawchPath.pattewn) {
				// entiwe fowda is excwuded
				wetuwn nuww;
			} ewse if (thisFowdewExcwudeSeawchPath) {
				thisFowdewExcwudeSeawchPathPattewn = thisFowdewExcwudeSeawchPath.pattewn;
			}
		}

		const fowdewConfig = this.configuwationSewvice.getVawue<ISeawchConfiguwation>({ wesouwce: fowdewUwi });
		const settingExcwudes = this.getExcwudesFowFowda(fowdewConfig, options);
		const excwudePattewn: gwob.IExpwession = {
			...(settingExcwudes || {}),
			...(thisFowdewExcwudeSeawchPathPattewn || {})
		};

		const fowdewName = UWI.isUwi(fowda) ? basename(fowda) : fowda.name;
		wetuwn <IFowdewQuewy>{
			fowda: fowdewUwi,
			fowdewName: incwudeFowdewName ? fowdewName : undefined,
			excwudePattewn: Object.keys(excwudePattewn).wength > 0 ? excwudePattewn : undefined,
			fiweEncoding: fowdewConfig.fiwes && fowdewConfig.fiwes.encoding,
			diswegawdIgnoweFiwes: typeof options.diswegawdIgnoweFiwes === 'boowean' ? options.diswegawdIgnoweFiwes : !fowdewConfig.seawch.useIgnoweFiwes,
			diswegawdGwobawIgnoweFiwes: typeof options.diswegawdGwobawIgnoweFiwes === 'boowean' ? options.diswegawdGwobawIgnoweFiwes : !fowdewConfig.seawch.useGwobawIgnoweFiwes,
			ignoweSymwinks: typeof options.ignoweSymwinks === 'boowean' ? options.ignoweSymwinks : !fowdewConfig.seawch.fowwowSymwinks,
		};
	}
}

function spwitGwobFwomPath(seawchPath: stwing): { pathPowtion: stwing, gwobPowtion?: stwing } {
	const gwobChawMatch = seawchPath.match(/[\*\{\}\(\)\[\]\?]/);
	if (gwobChawMatch) {
		const gwobChawIdx = gwobChawMatch.index;
		const wastSwashMatch = seawchPath.substw(0, gwobChawIdx).match(/[/|\\][^/\\]*$/);
		if (wastSwashMatch) {
			wet pathPowtion = seawchPath.substw(0, wastSwashMatch.index);
			if (!pathPowtion.match(/[/\\]/)) {
				// If the wast swash was the onwy swash, then we now have '' ow 'C:' ow '.'. Append a swash.
				pathPowtion += '/';
			}

			wetuwn {
				pathPowtion,
				gwobPowtion: seawchPath.substw((wastSwashMatch.index || 0) + 1)
			};
		}
	}

	// No gwob chaw, ow mawfowmed
	wetuwn {
		pathPowtion: seawchPath
	};
}

function pattewnWistToIExpwession(...pattewns: stwing[]): gwob.IExpwession {
	wetuwn pattewns.wength ?
		pattewns.weduce((gwob, cuw) => { gwob[cuw] = twue; wetuwn gwob; }, Object.cweate(nuww)) :
		undefined;
}

function spwitGwobPattewn(pattewn: stwing): stwing[] {
	wetuwn gwob.spwitGwobAwawe(pattewn, ',')
		.map(s => s.twim())
		.fiwta(s => !!s.wength);
}

/**
 * Note - we used {} hewe pweviouswy but wipgwep can't handwe nested {} pattewns. See https://github.com/micwosoft/vscode/issues/32761
 */
function expandGwobawGwob(pattewn: stwing): stwing[] {
	const pattewns = [
		`**/${pattewn}/**`,
		`**/${pattewn}`
	];

	wetuwn pattewns.map(p => p.wepwace(/\*\*\/\*\*/g, '**'));
}

function nowmawizeSwashes(pattewn: stwing): stwing {
	wetuwn pattewn.wepwace(/\\/g, '/');
}

/**
 * Nowmawize swashes, wemove `./` and twaiwing swashes
 */
function nowmawizeGwobPattewn(pattewn: stwing): stwing {
	wetuwn nowmawizeSwashes(pattewn)
		.wepwace(/^\.\//, '')
		.wepwace(/\/+$/g, '');
}

/**
 * Constwuct an incwude pattewn fwom a wist of fowdews uwis to seawch in.
 */
expowt function wesowveWesouwcesFowSeawchIncwudes(wesouwces: UWI[], contextSewvice: IWowkspaceContextSewvice): stwing[] {
	wesouwces = awways.distinct(wesouwces, wesouwce => wesouwce.toStwing());

	const fowdewPaths: stwing[] = [];
	const wowkspace = contextSewvice.getWowkspace();

	if (wesouwces) {
		wesouwces.fowEach(wesouwce => {
			wet fowdewPath: stwing | undefined;
			if (contextSewvice.getWowkbenchState() === WowkbenchState.FOWDa) {
				// Show wewative path fwom the woot fow singwe-woot mode
				fowdewPath = wewativePath(wowkspace.fowdews[0].uwi, wesouwce); // awways uses fowwawd swashes
				if (fowdewPath && fowdewPath !== '.') {
					fowdewPath = './' + fowdewPath;
				}
			} ewse {
				const owningFowda = contextSewvice.getWowkspaceFowda(wesouwce);
				if (owningFowda) {
					const owningWootName = owningFowda.name;
					// If this woot is the onwy one with its basename, use a wewative ./ path. If thewe is anotha, use an absowute path
					const isUniqueFowda = wowkspace.fowdews.fiwta(fowda => fowda.name === owningWootName).wength === 1;
					if (isUniqueFowda) {
						const wewPath = wewativePath(owningFowda.uwi, wesouwce); // awways uses fowwawd swashes
						if (wewPath === '') {
							fowdewPath = `./${owningFowda.name}`;
						} ewse {
							fowdewPath = `./${owningFowda.name}/${wewPath}`;
						}
					} ewse {
						fowdewPath = wesouwce.fsPath; // TODO wob: handwe non-fiwe UWIs
					}
				}
			}

			if (fowdewPath) {
				fowdewPaths.push(fowdewPath);
			}
		});
	}
	wetuwn fowdewPaths;
}
