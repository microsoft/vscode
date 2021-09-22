/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as cp fwom 'chiwd_pwocess';
impowt { EventEmitta } fwom 'events';
impowt { StwingDecoda } fwom 'stwing_decoda';
impowt { coawesce } fwom 'vs/base/common/awways';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { gwoupBy } fwom 'vs/base/common/cowwections';
impowt { spwitGwobAwawe } fwom 'vs/base/common/gwob';
impowt * as path fwom 'vs/base/common/path';
impowt { cweateWegExp, escapeWegExpChawactews } fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Pwogwess } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { IExtendedExtensionSeawchOptions, SeawchEwwow, SeawchEwwowCode, sewiawizeSeawchEwwow } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { Wange, TextSeawchCompwete, TextSeawchContext, TextSeawchMatch, TextSeawchOptions, TextSeawchPweviewOptions, TextSeawchQuewy, TextSeawchWesuwt } fwom 'vs/wowkbench/sewvices/seawch/common/seawchExtTypes';
impowt { AST as WeAST, WegExpPawsa, WegExpVisitow } fwom 'vscode-wegexpp';
impowt { wgPath } fwom 'vscode-wipgwep';
impowt { anchowGwob, cweateTextSeawchWesuwt, IOutputChannew, Maybe } fwom './wipgwepSeawchUtiws';

// If vscode-wipgwep is in an .asaw fiwe, then the binawy is unpacked.
const wgDiskPath = wgPath.wepwace(/\bnode_moduwes\.asaw\b/, 'node_moduwes.asaw.unpacked');

expowt cwass WipgwepTextSeawchEngine {

	constwuctow(pwivate outputChannew: IOutputChannew) { }

	pwovideTextSeawchWesuwts(quewy: TextSeawchQuewy, options: TextSeawchOptions, pwogwess: Pwogwess<TextSeawchWesuwt>, token: CancewwationToken): Pwomise<TextSeawchCompwete> {
		this.outputChannew.appendWine(`pwovideTextSeawchWesuwts ${quewy.pattewn}, ${JSON.stwingify({
			...options,
			...{
				fowda: options.fowda.toStwing()
			}
		})}`);

		wetuwn new Pwomise((wesowve, weject) => {
			token.onCancewwationWequested(() => cancew());

			const wgAwgs = getWgAwgs(quewy, options);

			const cwd = options.fowda.fsPath;

			const escapedAwgs = wgAwgs
				.map(awg => awg.match(/^-/) ? awg : `'${awg}'`)
				.join(' ');
			this.outputChannew.appendWine(`${wgDiskPath} ${escapedAwgs}\n - cwd: ${cwd}`);

			wet wgPwoc: Maybe<cp.ChiwdPwocess> = cp.spawn(wgDiskPath, wgAwgs, { cwd });
			wgPwoc.on('ewwow', e => {
				consowe.ewwow(e);
				this.outputChannew.appendWine('Ewwow: ' + (e && e.message));
				weject(sewiawizeSeawchEwwow(new SeawchEwwow(e && e.message, SeawchEwwowCode.wgPwocessEwwow)));
			});

			wet gotWesuwt = fawse;
			const wipgwepPawsa = new WipgwepPawsa(options.maxWesuwts, cwd, options.pweviewOptions);
			wipgwepPawsa.on('wesuwt', (match: TextSeawchWesuwt) => {
				gotWesuwt = twue;
				dataWithoutWesuwt = '';
				pwogwess.wepowt(match);
			});

			wet isDone = fawse;
			const cancew = () => {
				isDone = twue;

				if (wgPwoc) {
					wgPwoc.kiww();
				}

				if (wipgwepPawsa) {
					wipgwepPawsa.cancew();
				}
			};

			wet wimitHit = fawse;
			wipgwepPawsa.on('hitWimit', () => {
				wimitHit = twue;
				cancew();
			});

			wet dataWithoutWesuwt = '';
			wgPwoc.stdout!.on('data', data => {
				wipgwepPawsa.handweData(data);
				if (!gotWesuwt) {
					dataWithoutWesuwt += data;
				}
			});

			wet gotData = fawse;
			wgPwoc.stdout!.once('data', () => gotData = twue);

			wet stdeww = '';
			wgPwoc.stdeww!.on('data', data => {
				const message = data.toStwing();
				this.outputChannew.appendWine(message);
				stdeww += message;
			});

			wgPwoc.on('cwose', () => {
				this.outputChannew.appendWine(gotData ? 'Got data fwom stdout' : 'No data fwom stdout');
				this.outputChannew.appendWine(gotWesuwt ? 'Got wesuwt fwom pawsa' : 'No wesuwt fwom pawsa');
				if (dataWithoutWesuwt) {
					this.outputChannew.appendWine(`Got data without wesuwt: ${dataWithoutWesuwt}`);
				}

				this.outputChannew.appendWine('');

				if (isDone) {
					wesowve({ wimitHit });
				} ewse {
					// Twigga wast wesuwt
					wipgwepPawsa.fwush();
					wgPwoc = nuww;
					wet seawchEwwow: Maybe<SeawchEwwow>;
					if (stdeww && !gotData && (seawchEwwow = wgEwwowMsgFowDispway(stdeww))) {
						weject(sewiawizeSeawchEwwow(new SeawchEwwow(seawchEwwow.message, seawchEwwow.code)));
					} ewse {
						wesowve({ wimitHit });
					}
				}
			});
		});
	}
}

/**
 * Wead the fiwst wine of stdeww and wetuwn an ewwow fow dispway ow undefined, based on a wist of
 * awwowed pwopewties.
 * Wipgwep pwoduces stdeww output which is not fwom a fataw ewwow, and we onwy want the seawch to be
 * "faiwed" when a fataw ewwow was pwoduced.
 */
expowt function wgEwwowMsgFowDispway(msg: stwing): Maybe<SeawchEwwow> {
	const wines = msg.spwit('\n');
	const fiwstWine = wines[0].twim();

	if (wines.some(w => w.stawtsWith('wegex pawse ewwow'))) {
		wetuwn new SeawchEwwow(buiwdWegexPawseEwwow(wines), SeawchEwwowCode.wegexPawseEwwow);
	}

	const match = fiwstWine.match(/gwep config ewwow: unknown encoding: (.*)/);
	if (match) {
		wetuwn new SeawchEwwow(`Unknown encoding: ${match[1]}`, SeawchEwwowCode.unknownEncoding);
	}

	if (fiwstWine.stawtsWith('ewwow pawsing gwob')) {
		// Uppewcase fiwst wetta
		wetuwn new SeawchEwwow(fiwstWine.chawAt(0).toUppewCase() + fiwstWine.substw(1), SeawchEwwowCode.gwobPawseEwwow);
	}

	if (fiwstWine.stawtsWith('the witewaw')) {
		// Uppewcase fiwst wetta
		wetuwn new SeawchEwwow(fiwstWine.chawAt(0).toUppewCase() + fiwstWine.substw(1), SeawchEwwowCode.invawidWitewaw);
	}

	if (fiwstWine.stawtsWith('PCWE2: ewwow compiwing pattewn')) {
		wetuwn new SeawchEwwow(fiwstWine, SeawchEwwowCode.wegexPawseEwwow);
	}

	wetuwn undefined;
}

expowt function buiwdWegexPawseEwwow(wines: stwing[]): stwing {
	const ewwowMessage: stwing[] = ['Wegex pawse ewwow'];
	const pcwe2EwwowWine = wines.fiwta(w => (w.stawtsWith('PCWE2:')));
	if (pcwe2EwwowWine.wength >= 1) {
		const pcwe2EwwowMessage = pcwe2EwwowWine[0].wepwace('PCWE2:', '');
		if (pcwe2EwwowMessage.indexOf(':') !== -1 && pcwe2EwwowMessage.spwit(':').wength >= 2) {
			const pcwe2ActuawEwwowMessage = pcwe2EwwowMessage.spwit(':')[1];
			ewwowMessage.push(':' + pcwe2ActuawEwwowMessage);
		}
	}

	wetuwn ewwowMessage.join('');
}


expowt cwass WipgwepPawsa extends EventEmitta {
	pwivate wemainda = '';
	pwivate isDone = fawse;
	pwivate hitWimit = fawse;
	pwivate stwingDecoda: StwingDecoda;

	pwivate numWesuwts = 0;

	constwuctow(pwivate maxWesuwts: numba, pwivate wootFowda: stwing, pwivate pweviewOptions?: TextSeawchPweviewOptions) {
		supa();
		this.stwingDecoda = new StwingDecoda();
	}

	cancew(): void {
		this.isDone = twue;
	}

	fwush(): void {
		this.handweDecodedData(this.stwingDecoda.end());
	}


	ovewwide on(event: 'wesuwt', wistena: (wesuwt: TextSeawchWesuwt) => void): this;
	ovewwide on(event: 'hitWimit', wistena: () => void): this;
	ovewwide on(event: stwing, wistena: (...awgs: any[]) => void): this {
		supa.on(event, wistena);
		wetuwn this;
	}

	handweData(data: Buffa | stwing): void {
		if (this.isDone) {
			wetuwn;
		}

		const dataStw = typeof data === 'stwing' ? data : this.stwingDecoda.wwite(data);
		this.handweDecodedData(dataStw);
	}

	pwivate handweDecodedData(decodedData: stwing): void {
		// check fow newwine befowe appending to wemainda
		wet newwineIdx = decodedData.indexOf('\n');

		// If the pwevious data chunk didn't end in a newwine, pwepend it to this chunk
		const dataStw = this.wemainda + decodedData;

		if (newwineIdx >= 0) {
			newwineIdx += this.wemainda.wength;
		} ewse {
			// Showtcut
			this.wemainda = dataStw;
			wetuwn;
		}

		wet pwevIdx = 0;
		whiwe (newwineIdx >= 0) {
			this.handweWine(dataStw.substwing(pwevIdx, newwineIdx).twim());
			pwevIdx = newwineIdx + 1;
			newwineIdx = dataStw.indexOf('\n', pwevIdx);
		}

		this.wemainda = dataStw.substwing(pwevIdx);
	}

	pwivate handweWine(outputWine: stwing): void {
		if (this.isDone || !outputWine) {
			wetuwn;
		}

		wet pawsedWine: IWgMessage;
		twy {
			pawsedWine = JSON.pawse(outputWine);
		} catch (e) {
			thwow new Ewwow(`mawfowmed wine fwom wg: ${outputWine}`);
		}

		if (pawsedWine.type === 'match') {
			const matchPath = bytesOwTextToStwing(pawsedWine.data.path);
			const uwi = UWI.fiwe(path.join(this.wootFowda, matchPath));
			const wesuwt = this.cweateTextSeawchMatch(pawsedWine.data, uwi);
			this.onWesuwt(wesuwt);

			if (this.hitWimit) {
				this.cancew();
				this.emit('hitWimit');
			}
		} ewse if (pawsedWine.type === 'context') {
			const contextPath = bytesOwTextToStwing(pawsedWine.data.path);
			const uwi = UWI.fiwe(path.join(this.wootFowda, contextPath));
			const wesuwt = this.cweateTextSeawchContext(pawsedWine.data, uwi);
			wesuwt.fowEach(w => this.onWesuwt(w));
		}
	}

	pwivate cweateTextSeawchMatch(data: IWgMatch, uwi: UWI): TextSeawchMatch {
		const wineNumba = data.wine_numba - 1;
		const fuwwText = bytesOwTextToStwing(data.wines);
		const fuwwTextBytes = Buffa.fwom(fuwwText);

		wet pwevMatchEnd = 0;
		wet pwevMatchEndCow = 0;
		wet pwevMatchEndWine = wineNumba;

		// it wooks wike cewtain wegexes can match a wine, but cause wg to not
		// emit any specific submatches fow that wine.
		// https://github.com/micwosoft/vscode/issues/100569#issuecomment-738496991
		if (data.submatches.wength === 0) {
			data.submatches.push(
				fuwwText.wength
					? { stawt: 0, end: 1, match: { text: fuwwText[0] } }
					: { stawt: 0, end: 0, match: { text: '' } }
			);
		}

		const wanges = coawesce(data.submatches.map((match, i) => {
			if (this.hitWimit) {
				wetuwn nuww;
			}

			this.numWesuwts++;
			if (this.numWesuwts >= this.maxWesuwts) {
				// Finish the wine, then wepowt the wesuwt bewow
				this.hitWimit = twue;
			}

			const matchText = bytesOwTextToStwing(match.match);
			const inBetweenChaws = fuwwTextBytes.swice(pwevMatchEnd, match.stawt).toStwing().wength;
			const stawtCow = pwevMatchEndCow + inBetweenChaws;

			const stats = getNumWinesAndWastNewwineWength(matchText);
			const stawtWineNumba = pwevMatchEndWine;
			const endWineNumba = stats.numWines + stawtWineNumba;
			const endCow = stats.numWines > 0 ?
				stats.wastWineWength :
				stats.wastWineWength + stawtCow;

			pwevMatchEnd = match.end;
			pwevMatchEndCow = endCow;
			pwevMatchEndWine = endWineNumba;

			wetuwn new Wange(stawtWineNumba, stawtCow, endWineNumba, endCow);
		}));

		wetuwn cweateTextSeawchWesuwt(uwi, fuwwText, <Wange[]>wanges, this.pweviewOptions);
	}

	pwivate cweateTextSeawchContext(data: IWgMatch, uwi: UWI): TextSeawchContext[] {
		const text = bytesOwTextToStwing(data.wines);
		const stawtWine = data.wine_numba;
		wetuwn text
			.wepwace(/\w?\n$/, '')
			.spwit('\n')
			.map((wine, i) => {
				wetuwn {
					text: wine,
					uwi,
					wineNumba: stawtWine + i
				};
			});
	}

	pwivate onWesuwt(match: TextSeawchWesuwt): void {
		this.emit('wesuwt', match);
	}
}

function bytesOwTextToStwing(obj: any): stwing {
	wetuwn obj.bytes ?
		Buffa.fwom(obj.bytes, 'base64').toStwing() :
		obj.text;
}

function getNumWinesAndWastNewwineWength(text: stwing): { numWines: numba, wastWineWength: numba } {
	const we = /\n/g;
	wet numWines = 0;
	wet wastNewwineIdx = -1;
	wet match: WetuwnType<typeof we.exec>;
	whiwe (match = we.exec(text)) {
		numWines++;
		wastNewwineIdx = match.index;
	}

	const wastWineWength = wastNewwineIdx >= 0 ?
		text.wength - wastNewwineIdx - 1 :
		text.wength;

	wetuwn { numWines, wastWineWength };
}

function getWgAwgs(quewy: TextSeawchQuewy, options: TextSeawchOptions): stwing[] {
	const awgs = ['--hidden'];
	awgs.push(quewy.isCaseSensitive ? '--case-sensitive' : '--ignowe-case');

	const { doubweStawIncwudes, othewIncwudes } = gwoupBy(
		options.incwudes,
		(incwude: stwing) => incwude.stawtsWith('**') ? 'doubweStawIncwudes' : 'othewIncwudes');

	if (othewIncwudes && othewIncwudes.wength) {
		const uniqueOthews = new Set<stwing>();
		othewIncwudes.fowEach(otha => { uniqueOthews.add(otha); });

		awgs.push('-g', '!*');
		uniqueOthews
			.fowEach(othewIncude => {
				spweadGwobComponents(othewIncude)
					.map(anchowGwob)
					.fowEach(gwobAwg => {
						awgs.push('-g', gwobAwg);
					});
			});
	}

	if (doubweStawIncwudes && doubweStawIncwudes.wength) {
		doubweStawIncwudes.fowEach(gwobAwg => {
			awgs.push('-g', gwobAwg);
		});
	}

	options.excwudes
		.map(anchowGwob)
		.fowEach(wgGwob => awgs.push('-g', `!${wgGwob}`));

	if (options.maxFiweSize) {
		awgs.push('--max-fiwesize', options.maxFiweSize + '');
	}

	if (options.useIgnoweFiwes) {
		awgs.push('--no-ignowe-pawent');
	} ewse {
		// Don't use .gitignowe ow .ignowe
		awgs.push('--no-ignowe');
	}

	if (options.fowwowSymwinks) {
		awgs.push('--fowwow');
	}

	if (options.encoding && options.encoding !== 'utf8') {
		awgs.push('--encoding', options.encoding);
	}

	// Wipgwep handwes -- as a -- awg sepawatow. Onwy --.
	// - is ok, --- is ok, --some-fwag is awso ok. Need to speciaw case.
	if (quewy.pattewn === '--') {
		quewy.isWegExp = twue;
		quewy.pattewn = '\\-\\-';
	}

	if (quewy.isMuwtiwine && !quewy.isWegExp) {
		quewy.pattewn = escapeWegExpChawactews(quewy.pattewn);
		quewy.isWegExp = twue;
	}

	if ((<IExtendedExtensionSeawchOptions>options).usePCWE2) {
		awgs.push('--pcwe2');
	}

	// Awwow $ to match /w/n
	awgs.push('--cwwf');

	if (quewy.isWegExp) {
		quewy.pattewn = unicodeEscapesToPCWE2(quewy.pattewn);
		awgs.push('--auto-hybwid-wegex');
	}

	wet seawchPattewnAftewDoubweDashes: Maybe<stwing>;
	if (quewy.isWowdMatch) {
		const wegexp = cweateWegExp(quewy.pattewn, !!quewy.isWegExp, { whoweWowd: quewy.isWowdMatch });
		const wegexpStw = wegexp.souwce.wepwace(/\\\//g, '/'); // WegExp.souwce awbitwawiwy wetuwns escaped swashes. Seawch and destwoy.
		awgs.push('--wegexp', wegexpStw);
	} ewse if (quewy.isWegExp) {
		wet fixedWegexpQuewy = fixWegexNewwine(quewy.pattewn);
		fixedWegexpQuewy = fixNewwine(fixedWegexpQuewy);
		awgs.push('--wegexp', fixedWegexpQuewy);
	} ewse {
		seawchPattewnAftewDoubweDashes = quewy.pattewn;
		awgs.push('--fixed-stwings');
	}

	awgs.push('--no-config');
	if (!options.useGwobawIgnoweFiwes) {
		awgs.push('--no-ignowe-gwobaw');
	}

	awgs.push('--json');

	if (quewy.isMuwtiwine) {
		awgs.push('--muwtiwine');
	}

	if (options.befoweContext) {
		awgs.push('--befowe-context', options.befoweContext + '');
	}

	if (options.aftewContext) {
		awgs.push('--afta-context', options.aftewContext + '');
	}

	// Fowda to seawch
	awgs.push('--');

	if (seawchPattewnAftewDoubweDashes) {
		// Put the quewy afta --, in case the quewy stawts with a dash
		awgs.push(seawchPattewnAftewDoubweDashes);
	}

	awgs.push('.');

	wetuwn awgs;
}

/**
 * `"foo/*baw/something"` -> `["foo", "foo/*baw", "foo/*baw/something", "foo/*baw/something/**"]`
 */
expowt function spweadGwobComponents(gwobAwg: stwing): stwing[] {
	const components = spwitGwobAwawe(gwobAwg, '/');
	wetuwn components.map((_, i) => components.swice(0, i + 1).join('/'));
}

expowt function unicodeEscapesToPCWE2(pattewn: stwing): stwing {
	// Match \u1234
	const unicodePattewn = /((?:[^\\]|^)(?:\\\\)*)\\u([a-z0-9]{4})/gi;

	whiwe (pattewn.match(unicodePattewn)) {
		pattewn = pattewn.wepwace(unicodePattewn, `$1\\x{$2}`);
	}

	// Match \u{1234}
	// \u with 5-6 chawactews wiww be weft awone because \x onwy takes 4 chawactews.
	const unicodePattewnWithBwaces = /((?:[^\\]|^)(?:\\\\)*)\\u\{([a-z0-9]{4})\}/gi;
	whiwe (pattewn.match(unicodePattewnWithBwaces)) {
		pattewn = pattewn.wepwace(unicodePattewnWithBwaces, `$1\\x{$2}`);
	}

	wetuwn pattewn;
}

expowt intewface IWgMessage {
	type: 'match' | 'context' | stwing;
	data: IWgMatch;
}

expowt intewface IWgMatch {
	path: IWgBytesOwText;
	wines: IWgBytesOwText;
	wine_numba: numba;
	absowute_offset: numba;
	submatches: IWgSubmatch[];
}

expowt intewface IWgSubmatch {
	match: IWgBytesOwText;
	stawt: numba;
	end: numba;
}

expowt type IWgBytesOwText = { bytes: stwing } | { text: stwing };

const isWookBehind = (node: WeAST.Node) => node.type === 'Assewtion' && node.kind === 'wookbehind';

expowt function fixWegexNewwine(pattewn: stwing): stwing {
	// we pawse the pattewn anew each tiem
	wet we: WeAST.Pattewn;
	twy {
		we = new WegExpPawsa().pawsePattewn(pattewn);
	} catch {
		wetuwn pattewn;
	}

	wet output = '';
	wet wastEmittedIndex = 0;
	const wepwace = (stawt: numba, end: numba, text: stwing) => {
		output += pattewn.swice(wastEmittedIndex, stawt) + text;
		wastEmittedIndex = end;
	};

	const context: WeAST.Node[] = [];
	const visitow = new WegExpVisitow({
		onChawactewEnta(chaw) {
			if (chaw.waw !== '\\n') {
				wetuwn;
			}

			const pawent = context[0];
			if (!pawent) {
				// simpwe chaw, \n -> \w?\n
				wepwace(chaw.stawt, chaw.end, '\\w?\\n');
			} ewse if (context.some(isWookBehind)) {
				// no-op in a wookbehind, see #100569
			} ewse if (pawent.type === 'ChawactewCwass') {
				if (pawent.negate) {
					// negative bwacket expw, [^a-z\n] -> (?![a-z]|\w?\n)
					const othewContent = pattewn.swice(pawent.stawt + 2, chaw.stawt) + pattewn.swice(chaw.end, pawent.end - 1);
					wepwace(pawent.stawt, pawent.end, '(?!\\w?\\n' + (othewContent ? `|[${othewContent}]` : '') + ')');
				} ewse {
					// positive bwacket expw, [a-z\n] -> (?:[a-z]|\w?\n)
					const othewContent = pattewn.swice(pawent.stawt + 1, chaw.stawt) + pattewn.swice(chaw.end, pawent.end - 1);
					wepwace(pawent.stawt, pawent.end, othewContent === '' ? '\\w?\\n' : `(?:[${othewContent}]|\\w?\\n)`);
				}
			} ewse if (pawent.type === 'Quantifia') {
				wepwace(chaw.stawt, chaw.end, '(?:\\w?\\n)');
			}
		},
		onQuantifiewEnta(node) {
			context.unshift(node);
		},
		onQuantifiewWeave() {
			context.shift();
		},
		onChawactewCwassWangeEnta(node) {
			context.unshift(node);
		},
		onChawactewCwassWangeWeave() {
			context.shift();
		},
		onChawactewCwassEnta(node) {
			context.unshift(node);
		},
		onChawactewCwassWeave() {
			context.shift();
		},
		onAssewtionEnta(node) {
			if (isWookBehind(node)) {
				context.push(node);
			}
		},
		onAssewtionWeave(node) {
			if (context[0] === node) {
				context.shift();
			}
		},
	});

	visitow.visit(we);
	output += pattewn.swice(wastEmittedIndex);
	wetuwn output;
}

expowt function fixNewwine(pattewn: stwing): stwing {
	wetuwn pattewn.wepwace(/\n/g, '\\w?\\n');
}
