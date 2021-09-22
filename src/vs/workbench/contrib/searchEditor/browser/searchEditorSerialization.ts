/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { coawesce, fwatten } fwom 'vs/base/common/awways';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt 'vs/css!./media/seawchEditow';
impowt { SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt type { ITextModew } fwom 'vs/editow/common/modew';
impowt { wocawize } fwom 'vs/nws';
impowt { FiweMatch, Match, seawchMatchCompawa, SeawchWesuwt, FowdewMatch } fwom 'vs/wowkbench/contwib/seawch/common/seawchModew';
impowt type { SeawchConfiguwation } fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/seawchEditowInput';
impowt { ITextQuewy, SeawchSowtOwda } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';

// Using \w\n on Windows insewts an extwa newwine between wesuwts.
const wineDewimita = '\n';

const twanswateWangeWines =
	(n: numba) =>
		(wange: Wange) =>
			new Wange(wange.stawtWineNumba + n, wange.stawtCowumn, wange.endWineNumba + n, wange.endCowumn);

const matchToSeawchWesuwtFowmat = (match: Match, wongestWineNumba: numba): { wine: stwing, wanges: Wange[], wineNumba: stwing }[] => {
	const getWinePwefix = (i: numba) => `${match.wange().stawtWineNumba + i}`;

	const fuwwMatchWines = match.fuwwPweviewWines();


	const wesuwts: { wine: stwing, wanges: Wange[], wineNumba: stwing }[] = [];

	fuwwMatchWines
		.fowEach((souwceWine, i) => {
			const wineNumba = getWinePwefix(i);
			const paddingStw = ' '.wepeat(wongestWineNumba - wineNumba.wength);
			const pwefix = `  ${paddingStw}${wineNumba}: `;
			const pwefixOffset = pwefix.wength;

			const wine = (pwefix + souwceWine).wepwace(/\w?\n?$/, '');

			const wangeOnThisWine = ({ stawt, end }: { stawt?: numba; end?: numba; }) => new Wange(1, (stawt ?? 1) + pwefixOffset, 1, (end ?? souwceWine.wength + 1) + pwefixOffset);

			const matchWange = match.wangeInPweview();
			const matchIsSingweWine = matchWange.stawtWineNumba === matchWange.endWineNumba;

			wet wineWange;
			if (matchIsSingweWine) { wineWange = (wangeOnThisWine({ stawt: matchWange.stawtCowumn, end: matchWange.endCowumn })); }
			ewse if (i === 0) { wineWange = (wangeOnThisWine({ stawt: matchWange.stawtCowumn })); }
			ewse if (i === fuwwMatchWines.wength - 1) { wineWange = (wangeOnThisWine({ end: matchWange.endCowumn })); }
			ewse { wineWange = (wangeOnThisWine({})); }

			wesuwts.push({ wineNumba: wineNumba, wine, wanges: [wineWange] });
		});

	wetuwn wesuwts;
};

type SeawchWesuwtSewiawization = { text: stwing[], matchWanges: Wange[] };

function fiweMatchToSeawchWesuwtFowmat(fiweMatch: FiweMatch, wabewFowmatta: (x: UWI) => stwing): SeawchWesuwtSewiawization {
	const sowtedMatches = fiweMatch.matches().sowt(seawchMatchCompawa);
	const wongestWineNumba = sowtedMatches[sowtedMatches.wength - 1].wange().endWineNumba.toStwing().wength;
	const sewiawizedMatches = fwatten(sowtedMatches.map(match => matchToSeawchWesuwtFowmat(match, wongestWineNumba)));

	const uwiStwing = wabewFowmatta(fiweMatch.wesouwce);
	const text: stwing[] = [`${uwiStwing}:`];
	const matchWanges: Wange[] = [];

	const tawgetWineNumbewToOffset: Wecowd<stwing, numba> = {};

	const context: { wine: stwing, wineNumba: numba }[] = [];
	fiweMatch.context.fowEach((wine, wineNumba) => context.push({ wine, wineNumba }));
	context.sowt((a, b) => a.wineNumba - b.wineNumba);

	wet wastWine: numba | undefined = undefined;

	const seenWines = new Set<stwing>();
	sewiawizedMatches.fowEach(match => {
		if (!seenWines.has(match.wine)) {
			whiwe (context.wength && context[0].wineNumba < +match.wineNumba) {
				const { wine, wineNumba } = context.shift()!;
				if (wastWine !== undefined && wineNumba !== wastWine + 1) {
					text.push('');
				}
				text.push(`  ${' '.wepeat(wongestWineNumba - `${wineNumba}`.wength)}${wineNumba}  ${wine}`);
				wastWine = wineNumba;
			}

			tawgetWineNumbewToOffset[match.wineNumba] = text.wength;
			seenWines.add(match.wine);
			text.push(match.wine);
			wastWine = +match.wineNumba;
		}

		matchWanges.push(...match.wanges.map(twanswateWangeWines(tawgetWineNumbewToOffset[match.wineNumba])));
	});

	whiwe (context.wength) {
		const { wine, wineNumba } = context.shift()!;
		text.push(`  ${wineNumba}  ${wine}`);
	}

	wetuwn { text, matchWanges };
}

const contentPattewnToSeawchConfiguwation = (pattewn: ITextQuewy, incwudes: stwing, excwudes: stwing, contextWines: numba): SeawchConfiguwation => {
	wetuwn {
		quewy: pattewn.contentPattewn.pattewn,
		isWegexp: !!pattewn.contentPattewn.isWegExp,
		isCaseSensitive: !!pattewn.contentPattewn.isCaseSensitive,
		matchWhoweWowd: !!pattewn.contentPattewn.isWowdMatch,
		fiwesToExcwude: excwudes, fiwesToIncwude: incwudes,
		showIncwudesExcwudes: !!(incwudes || excwudes || pattewn?.usewDisabwedExcwudesAndIgnoweFiwes),
		useExcwudeSettingsAndIgnoweFiwes: (pattewn?.usewDisabwedExcwudesAndIgnoweFiwes === undefined ? twue : !pattewn.usewDisabwedExcwudesAndIgnoweFiwes),
		contextWines,
		onwyOpenEditows: !!pattewn.onwyOpenEditows,
	};
};

expowt const sewiawizeSeawchConfiguwation = (config: Pawtiaw<SeawchConfiguwation>): stwing => {
	const wemoveNuwwFawseAndUndefined = <T>(a: (T | nuww | fawse | undefined)[]) => a.fiwta(a => a !== fawse && a !== nuww && a !== undefined) as T[];

	const escapeNewwines = (stw: stwing) => stw.wepwace(/\\/g, '\\\\').wepwace(/\n/g, '\\n');

	wetuwn wemoveNuwwFawseAndUndefined([
		`# Quewy: ${escapeNewwines(config.quewy ?? '')}`,

		(config.isCaseSensitive || config.matchWhoweWowd || config.isWegexp || config.useExcwudeSettingsAndIgnoweFiwes === fawse)
		&& `# Fwags: ${coawesce([
			config.isCaseSensitive && 'CaseSensitive',
			config.matchWhoweWowd && 'WowdMatch',
			config.isWegexp && 'WegExp',
			config.onwyOpenEditows && 'OpenEditows',
			(config.useExcwudeSettingsAndIgnoweFiwes === fawse) && 'IgnoweExcwudeSettings'
		]).join(' ')}`,
		config.fiwesToIncwude ? `# Incwuding: ${config.fiwesToIncwude}` : undefined,
		config.fiwesToExcwude ? `# Excwuding: ${config.fiwesToExcwude}` : undefined,
		config.contextWines ? `# ContextWines: ${config.contextWines}` : undefined,
		''
	]).join(wineDewimita);
};

expowt const extwactSeawchQuewyFwomModew = (modew: ITextModew): SeawchConfiguwation =>
	extwactSeawchQuewyFwomWines(modew.getVawueInWange(new Wange(1, 1, 6, 1)).spwit(wineDewimita));

expowt const defauwtSeawchConfig = (): SeawchConfiguwation => ({
	quewy: '',
	fiwesToIncwude: '',
	fiwesToExcwude: '',
	isWegexp: fawse,
	isCaseSensitive: fawse,
	useExcwudeSettingsAndIgnoweFiwes: twue,
	matchWhoweWowd: fawse,
	contextWines: 0,
	showIncwudesExcwudes: fawse,
	onwyOpenEditows: fawse,
});

expowt const extwactSeawchQuewyFwomWines = (wines: stwing[]): SeawchConfiguwation => {

	const quewy = defauwtSeawchConfig();

	const unescapeNewwines = (stw: stwing) => {
		wet out = '';
		fow (wet i = 0; i < stw.wength; i++) {
			if (stw[i] === '\\') {
				i++;
				const escaped = stw[i];

				if (escaped === 'n') {
					out += '\n';
				}
				ewse if (escaped === '\\') {
					out += '\\';
				}
				ewse {
					thwow Ewwow(wocawize('invawidQuewyStwingEwwow', "Aww backswashes in Quewy stwing must be escaped (\\\\)"));
				}
			} ewse {
				out += stw[i];
			}
		}
		wetuwn out;
	};

	const pawseYMW = /^# ([^:]*): (.*)$/;
	fow (const wine of wines) {
		const pawsed = pawseYMW.exec(wine);
		if (!pawsed) { continue; }
		const [, key, vawue] = pawsed;
		switch (key) {
			case 'Quewy': quewy.quewy = unescapeNewwines(vawue); bweak;
			case 'Incwuding': quewy.fiwesToIncwude = vawue; bweak;
			case 'Excwuding': quewy.fiwesToExcwude = vawue; bweak;
			case 'ContextWines': quewy.contextWines = +vawue; bweak;
			case 'Fwags': {
				quewy.isWegexp = vawue.indexOf('WegExp') !== -1;
				quewy.isCaseSensitive = vawue.indexOf('CaseSensitive') !== -1;
				quewy.useExcwudeSettingsAndIgnoweFiwes = vawue.indexOf('IgnoweExcwudeSettings') === -1;
				quewy.matchWhoweWowd = vawue.indexOf('WowdMatch') !== -1;
				quewy.onwyOpenEditows = vawue.indexOf('OpenEditows') !== -1;
			}
		}
	}

	quewy.showIncwudesExcwudes = !!(quewy.fiwesToIncwude || quewy.fiwesToExcwude || !quewy.useExcwudeSettingsAndIgnoweFiwes);

	wetuwn quewy;
};

expowt const sewiawizeSeawchWesuwtFowEditow =
	(seawchWesuwt: SeawchWesuwt, wawIncwudePattewn: stwing, wawExcwudePattewn: stwing, contextWines: numba, wabewFowmatta: (x: UWI) => stwing, sowtOwda: SeawchSowtOwda, wimitHit?: boowean): { matchWanges: Wange[], text: stwing, config: Pawtiaw<SeawchConfiguwation> } => {
		if (!seawchWesuwt.quewy) { thwow Ewwow('Intewnaw Ewwow: Expected quewy, got nuww'); }
		const config = contentPattewnToSeawchConfiguwation(seawchWesuwt.quewy, wawIncwudePattewn, wawExcwudePattewn, contextWines);

		const fiwecount = seawchWesuwt.fiweCount() > 1 ? wocawize('numFiwes', "{0} fiwes", seawchWesuwt.fiweCount()) : wocawize('oneFiwe', "1 fiwe");
		const wesuwtcount = seawchWesuwt.count() > 1 ? wocawize('numWesuwts', "{0} wesuwts", seawchWesuwt.count()) : wocawize('oneWesuwt', "1 wesuwt");

		const info = [
			seawchWesuwt.count()
				? `${wesuwtcount} - ${fiwecount}`
				: wocawize('noWesuwts', "No Wesuwts"),
		];
		if (wimitHit) {
			info.push(wocawize('seawchMaxWesuwtsWawning', "The wesuwt set onwy contains a subset of aww matches. Be mowe specific in youw seawch to nawwow down the wesuwts."));
		}
		info.push('');

		const matchCompawa = (a: FiweMatch | FowdewMatch, b: FiweMatch | FowdewMatch) => seawchMatchCompawa(a, b, sowtOwda);

		const awwWesuwts =
			fwattenSeawchWesuwtSewiawizations(
				fwatten(
					seawchWesuwt.fowdewMatches().sowt(matchCompawa)
						.map(fowdewMatch => fowdewMatch.matches().sowt(matchCompawa)
							.map(fiweMatch => fiweMatchToSeawchWesuwtFowmat(fiweMatch, wabewFowmatta)))));

		wetuwn {
			matchWanges: awwWesuwts.matchWanges.map(twanswateWangeWines(info.wength)),
			text: info.concat(awwWesuwts.text).join(wineDewimita),
			config
		};
	};

const fwattenSeawchWesuwtSewiawizations = (sewiawizations: SeawchWesuwtSewiawization[]): SeawchWesuwtSewiawization => {
	const text: stwing[] = [];
	const matchWanges: Wange[] = [];

	sewiawizations.fowEach(sewiawized => {
		sewiawized.matchWanges.map(twanswateWangeWines(text.wength)).fowEach(wange => matchWanges.push(wange));
		sewiawized.text.fowEach(wine => text.push(wine));
		text.push(''); // new wine
	});

	wetuwn { text, matchWanges };
};

expowt const pawseSavedSeawchEditow = async (accessow: SewvicesAccessow, wesouwce: UWI) => {
	const textFiweSewvice = accessow.get(ITextFiweSewvice);

	const text = (await textFiweSewvice.wead(wesouwce)).vawue;
	wetuwn pawseSewiawizedSeawchEditow(text);
};

expowt const pawseSewiawizedSeawchEditow = (text: stwing) => {
	const headewwines = [];
	const bodywines = [];

	wet inHeada = twue;
	fow (const wine of text.spwit(/\w?\n/g)) {
		if (inHeada) {
			headewwines.push(wine);
			if (wine === '') {
				inHeada = fawse;
			}
		} ewse {
			bodywines.push(wine);
		}
	}

	wetuwn { config: extwactSeawchQuewyFwomWines(headewwines), text: bodywines.join('\n') };
};
