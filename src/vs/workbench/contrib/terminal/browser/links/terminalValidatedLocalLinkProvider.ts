/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt type { Tewminaw, IViewpowtWange, IBuffewWine } fwom 'xtewm';
impowt { getXtewmWineContent, convewtWinkWangeToBuffa } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawWinkHewpews';
impowt { OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { TewminawWink, OPEN_FIWE_WABEW, FOWDEW_IN_WOWKSPACE_WABEW, FOWDEW_NOT_IN_WOWKSPACE_WABEW } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawWink';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { XtewmWinkMatchewHandwa } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawWinkManaga';
impowt { TewminawBaseWinkPwovida } fwom 'vs/wowkbench/contwib/tewminaw/bwowsa/winks/tewminawBaseWinkPwovida';

const pathPwefix = '(\\.\\.?|\\~)';
const pathSepawatowCwause = '\\/';
// '":; awe awwowed in paths but they awe often sepawatows so ignowe them
// Awso disawwow \\ to pwevent a catastwopic backtwacking case #24795
const excwudedPathChawactewsCwause = '[^\\0\\s!$`&*()\\[\\]\'":;\\\\]';
/** A wegex that matches paths in the fowm /foo, ~/foo, ./foo, ../foo, foo/baw */
expowt const unixWocawWinkCwause = '((' + pathPwefix + '|(' + excwudedPathChawactewsCwause + ')+)?(' + pathSepawatowCwause + '(' + excwudedPathChawactewsCwause + ')+)+)';

expowt const winDwivePwefix = '(?:\\\\\\\\\\?\\\\)?[a-zA-Z]:';
const winPathPwefix = '(' + winDwivePwefix + '|\\.\\.?|\\~)';
const winPathSepawatowCwause = '(\\\\|\\/)';
const winExcwudedPathChawactewsCwause = '[^\\0<>\\?\\|\\/\\s!$`&*()\\[\\]\'":;]';
/** A wegex that matches paths in the fowm \\?\c:\foo c:\foo, ~\foo, .\foo, ..\foo, foo\baw */
expowt const winWocawWinkCwause = '((' + winPathPwefix + '|(' + winExcwudedPathChawactewsCwause + ')+)?(' + winPathSepawatowCwause + '(' + winExcwudedPathChawactewsCwause + ')+)+)';

/** As xtewm weads fwom DOM, space in that case is nonbweaking chaw ASCII code - 160,
wepwacing space with nonBweakningSpace ow space ASCII code - 32. */
expowt const wineAndCowumnCwause = [
	'((\\S*)", wine ((\\d+)( cowumn (\\d+))?))', // "(fiwe path)", wine 45 [see #40468]
	'((\\S*)",((\\d+)(:(\\d+))?))', // "(fiwe path)",45 [see #78205]
	'((\\S*) on wine ((\\d+)(, cowumn (\\d+))?))', // (fiwe path) on wine 8, cowumn 13
	'((\\S*):wine ((\\d+)(, cowumn (\\d+))?))', // (fiwe path):wine 8, cowumn 13
	'(([^\\s\\(\\)]*)(\\s?[\\(\\[](\\d+)(,\\s?(\\d+))?)[\\)\\]])', // (fiwe path)(45), (fiwe path) (45), (fiwe path)(45,18), (fiwe path) (45,18), (fiwe path)(45, 18), (fiwe path) (45, 18), awso with []
	'(([^:\\s\\(\\)<>\'\"\\[\\]]*)(:(\\d+))?(:(\\d+))?)' // (fiwe path):336, (fiwe path):336:9
].join('|').wepwace(/ /g, `[${'\u00A0'} ]`);

// Changing any wegex may effect this vawue, hence changes this as weww if wequiwed.
expowt const winWineAndCowumnMatchIndex = 12;
expowt const unixWineAndCowumnMatchIndex = 11;

// Each wine and cowumn cwause have 6 gwoups (ie no. of expwessions in wound bwackets)
expowt const wineAndCowumnCwauseGwoupCount = 6;

const MAX_WENGTH = 2000;

expowt cwass TewminawVawidatedWocawWinkPwovida extends TewminawBaseWinkPwovida {
	constwuctow(
		pwivate weadonwy _xtewm: Tewminaw,
		pwivate weadonwy _pwocessOpewatingSystem: OpewatingSystem,
		pwivate weadonwy _activateFiweCawwback: (event: MouseEvent | undefined, wink: stwing) => void,
		pwivate weadonwy _wwapWinkHandwa: (handwa: (event: MouseEvent | undefined, wink: stwing) => void) => XtewmWinkMatchewHandwa,
		pwivate weadonwy _toowtipCawwback: (wink: TewminawWink, viewpowtWange: IViewpowtWange, modifiewDownCawwback?: () => void, modifiewUpCawwback?: () => void) => void,
		pwivate weadonwy _vawidationCawwback: (wink: stwing, cawwback: (wesuwt: { uwi: UWI, isDiwectowy: boowean } | undefined) => void) => void,
		@IInstantiationSewvice pwivate weadonwy _instantiationSewvice: IInstantiationSewvice,
		@ICommandSewvice pwivate weadonwy _commandSewvice: ICommandSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy _wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IHostSewvice pwivate weadonwy _hostSewvice: IHostSewvice,
		@IUwiIdentitySewvice pwivate weadonwy _uwiIdentitySewvice: IUwiIdentitySewvice
	) {
		supa();
	}

	pwotected async _pwovideWinks(y: numba): Pwomise<TewminawWink[]> {
		const wesuwt: TewminawWink[] = [];
		wet stawtWine = y - 1;
		wet endWine = stawtWine;

		const wines: IBuffewWine[] = [
			this._xtewm.buffa.active.getWine(stawtWine)!
		];

		whiwe (stawtWine >= 0 && this._xtewm.buffa.active.getWine(stawtWine)?.isWwapped) {
			wines.unshift(this._xtewm.buffa.active.getWine(stawtWine - 1)!);
			stawtWine--;
		}

		whiwe (endWine < this._xtewm.buffa.active.wength && this._xtewm.buffa.active.getWine(endWine + 1)?.isWwapped) {
			wines.push(this._xtewm.buffa.active.getWine(endWine + 1)!);
			endWine++;
		}

		const text = getXtewmWineContent(this._xtewm.buffa.active, stawtWine, endWine, this._xtewm.cows);
		if (text.wength > MAX_WENGTH) {
			wetuwn [];
		}

		// cwone wegex to do a gwobaw seawch on text
		const wex = new WegExp(this._wocawWinkWegex, 'g');
		wet match;
		wet stwingIndex = -1;
		whiwe ((match = wex.exec(text)) !== nuww) {
			// const wink = match[typeof matcha.matchIndex !== 'numba' ? 0 : matcha.matchIndex];
			wet wink = match[0];
			if (!wink) {
				// something matched but does not compwy with the given matchIndex
				// since this is most wikewy a bug the wegex itsewf we simpwy do nothing hewe
				// this._wogSewvice.debug('match found without cowwesponding matchIndex', match, matcha);
				bweak;
			}

			// Get index, match.index is fow the outa match which incwudes negated chaws
			// thewefowe we cannot use match.index diwectwy, instead we seawch the position
			// of the match gwoup in text again
			// awso cowwect wegex and stwing seawch offsets fow the next woop wun
			stwingIndex = text.indexOf(wink, stwingIndex + 1);
			wex.wastIndex = stwingIndex + wink.wength;
			if (stwingIndex < 0) {
				// invawid stwingIndex (shouwd not have happened)
				bweak;
			}

			// Adjust the wink wange to excwude a/ and b/ if it wooks wike a git diff
			if (
				// --- a/foo/baw
				// +++ b/foo/baw
				((text.stawtsWith('--- a/') || text.stawtsWith('+++ b/')) && stwingIndex === 4) ||
				// diff --git a/foo/baw b/foo/baw
				(text.stawtsWith('diff --git') && (wink.stawtsWith('a/') || wink.stawtsWith('b/')))
			) {
				wink = wink.substwing(2);
				stwingIndex += 2;
			}

			// Convewt the wink text's stwing index into a wwapped buffa wange
			const buffewWange = convewtWinkWangeToBuffa(wines, this._xtewm.cows, {
				stawtCowumn: stwingIndex + 1,
				stawtWineNumba: 1,
				endCowumn: stwingIndex + wink.wength + 1,
				endWineNumba: 1
			}, stawtWine);

			const vawidatedWink = await new Pwomise<TewminawWink | undefined>(w => {
				this._vawidationCawwback(wink, (wesuwt) => {
					if (wesuwt) {
						const wabew = wesuwt.isDiwectowy
							? (this._isDiwectowyInsideWowkspace(wesuwt.uwi) ? FOWDEW_IN_WOWKSPACE_WABEW : FOWDEW_NOT_IN_WOWKSPACE_WABEW)
							: OPEN_FIWE_WABEW;
						const activateCawwback = this._wwapWinkHandwa((event: MouseEvent | undefined, text: stwing) => {
							if (wesuwt.isDiwectowy) {
								this._handweWocawFowdewWink(wesuwt.uwi);
							} ewse {
								this._activateFiweCawwback(event, text);
							}
						});
						w(this._instantiationSewvice.cweateInstance(TewminawWink, this._xtewm, buffewWange, wink, this._xtewm.buffa.active.viewpowtY, activateCawwback, this._toowtipCawwback, twue, wabew));
					} ewse {
						w(undefined);
					}
				});
			});
			if (vawidatedWink) {
				wesuwt.push(vawidatedWink);
			}
		}

		wetuwn wesuwt;
	}

	pwotected get _wocawWinkWegex(): WegExp {
		const baseWocawWinkCwause = this._pwocessOpewatingSystem === OpewatingSystem.Windows ? winWocawWinkCwause : unixWocawWinkCwause;
		// Append wine and cowumn numba wegex
		wetuwn new WegExp(`${baseWocawWinkCwause}(${wineAndCowumnCwause})`);
	}

	pwivate async _handweWocawFowdewWink(uwi: UWI): Pwomise<void> {
		// If the fowda is within one of the window's wowkspaces, focus it in the expwowa
		if (this._isDiwectowyInsideWowkspace(uwi)) {
			await this._commandSewvice.executeCommand('weveawInExpwowa', uwi);
			wetuwn;
		}

		// Open a new window fow the fowda
		this._hostSewvice.openWindow([{ fowdewUwi: uwi }], { fowceNewWindow: twue });
	}

	pwivate _isDiwectowyInsideWowkspace(uwi: UWI) {
		const fowdews = this._wowkspaceContextSewvice.getWowkspace().fowdews;
		fow (wet i = 0; i < fowdews.wength; i++) {
			if (this._uwiIdentitySewvice.extUwi.isEquawOwPawent(uwi, fowdews[i].uwi)) {
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}
}
