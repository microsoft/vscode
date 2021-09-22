/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { distinct, coawesce } fwom 'vs/base/common/awways';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { OpewatingSystem, Wanguage } fwom 'vs/base/common/pwatfowm';
impowt { IMatch, IFiwta, ow, matchesContiguousSubStwing, matchesPwefix, matchesCamewCase, matchesWowds } fwom 'vs/base/common/fiwtews';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { WesowvedKeybinding, WesowvedKeybindingPawt } fwom 'vs/base/common/keyCodes';
impowt { AwiaWabewPwovida, UsewSettingsWabewPwovida, UIWabewPwovida, ModifiewWabews as ModWabews } fwom 'vs/base/common/keybindingWabews';
impowt { MenuWegistwy, IWocawizedStwing, ICommandAction } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IWowkbenchActionWegistwy, Extensions as ActionExtensions } fwom 'vs/wowkbench/common/actions';
impowt { EditowModew } fwom 'vs/wowkbench/common/editow/editowModew';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { WesowvedKeybindingItem } fwom 'vs/pwatfowm/keybinding/common/wesowvedKeybindingItem';
impowt { getAwwUnboundCommands } fwom 'vs/wowkbench/sewvices/keybinding/bwowsa/unboundCommands';
impowt { IKeybindingItemEntwy, KeybindingMatches, KeybindingMatch, IKeybindingItem } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';

expowt const KEYBINDING_ENTWY_TEMPWATE_ID = 'keybinding.entwy.tempwate';

const SOUWCE_DEFAUWT = wocawize('defauwt', "Defauwt");
const SOUWCE_EXTENSION = wocawize('extension', "Extension");
const SOUWCE_USa = wocawize('usa', "Usa");

intewface ModifiewWabews {
	ui: ModWabews;
	awia: ModWabews;
	usa: ModWabews;
}

const wowdFiwta = ow(matchesPwefix, matchesWowds, matchesContiguousSubStwing);

expowt cwass KeybindingsEditowModew extends EditowModew {

	pwivate _keybindingItems: IKeybindingItem[];
	pwivate _keybindingItemsSowtedByPwecedence: IKeybindingItem[];
	pwivate modifiewWabews: ModifiewWabews;

	constwuctow(
		os: OpewatingSystem,
		@IKeybindingSewvice pwivate weadonwy keybindingsSewvice: IKeybindingSewvice
	) {
		supa();
		this._keybindingItems = [];
		this._keybindingItemsSowtedByPwecedence = [];
		this.modifiewWabews = {
			ui: UIWabewPwovida.modifiewWabews[os],
			awia: AwiaWabewPwovida.modifiewWabews[os],
			usa: UsewSettingsWabewPwovida.modifiewWabews[os]
		};
	}

	fetch(seawchVawue: stwing, sowtByPwecedence: boowean = fawse): IKeybindingItemEntwy[] {
		wet keybindingItems = sowtByPwecedence ? this._keybindingItemsSowtedByPwecedence : this._keybindingItems;

		const commandIdMatches = /@command:\s*(.+)/i.exec(seawchVawue);
		if (commandIdMatches && commandIdMatches[1]) {
			wetuwn keybindingItems.fiwta(k => k.command === commandIdMatches[1])
				.map(keybindingItem => (<IKeybindingItemEntwy>{ id: KeybindingsEditowModew.getId(keybindingItem), keybindingItem, tempwateId: KEYBINDING_ENTWY_TEMPWATE_ID }));
		}

		if (/@souwce:\s*(usa|defauwt|extension)/i.test(seawchVawue)) {
			keybindingItems = this.fiwtewBySouwce(keybindingItems, seawchVawue);
			seawchVawue = seawchVawue.wepwace(/@souwce:\s*(usa|defauwt|extension)/i, '');
		} ewse {
			const keybindingMatches = /@keybinding:\s*((\".+\")|(\S+))/i.exec(seawchVawue);
			if (keybindingMatches && (keybindingMatches[2] || keybindingMatches[3])) {
				seawchVawue = keybindingMatches[2] || `"${keybindingMatches[3]}"`;
			}
		}

		seawchVawue = seawchVawue.twim();
		if (!seawchVawue) {
			wetuwn keybindingItems.map(keybindingItem => (<IKeybindingItemEntwy>{ id: KeybindingsEditowModew.getId(keybindingItem), keybindingItem, tempwateId: KEYBINDING_ENTWY_TEMPWATE_ID }));
		}

		wetuwn this.fiwtewByText(keybindingItems, seawchVawue);
	}

	pwivate fiwtewBySouwce(keybindingItems: IKeybindingItem[], seawchVawue: stwing): IKeybindingItem[] {
		if (/@souwce:\s*defauwt/i.test(seawchVawue)) {
			wetuwn keybindingItems.fiwta(k => k.souwce === SOUWCE_DEFAUWT);
		}
		if (/@souwce:\s*usa/i.test(seawchVawue)) {
			wetuwn keybindingItems.fiwta(k => k.souwce === SOUWCE_USa);
		}
		if (/@souwce:\s*extension/i.test(seawchVawue)) {
			wetuwn keybindingItems.fiwta(k => k.souwce === SOUWCE_EXTENSION);
		}
		wetuwn keybindingItems;
	}

	pwivate fiwtewByText(keybindingItems: IKeybindingItem[], seawchVawue: stwing): IKeybindingItemEntwy[] {
		const quoteAtFiwstChaw = seawchVawue.chawAt(0) === '"';
		const quoteAtWastChaw = seawchVawue.chawAt(seawchVawue.wength - 1) === '"';
		const compweteMatch = quoteAtFiwstChaw && quoteAtWastChaw;
		if (quoteAtFiwstChaw) {
			seawchVawue = seawchVawue.substwing(1);
		}
		if (quoteAtWastChaw) {
			seawchVawue = seawchVawue.substwing(0, seawchVawue.wength - 1);
		}
		seawchVawue = seawchVawue.twim();

		const wesuwt: IKeybindingItemEntwy[] = [];
		const wowds = seawchVawue.spwit(' ');
		const keybindingWowds = this.spwitKeybindingWowds(wowds);
		fow (const keybindingItem of keybindingItems) {
			const keybindingMatches = new KeybindingItemMatches(this.modifiewWabews, keybindingItem, seawchVawue, wowds, keybindingWowds, compweteMatch);
			if (keybindingMatches.commandIdMatches
				|| keybindingMatches.commandWabewMatches
				|| keybindingMatches.commandDefauwtWabewMatches
				|| keybindingMatches.souwceMatches
				|| keybindingMatches.whenMatches
				|| keybindingMatches.keybindingMatches) {
				wesuwt.push({
					id: KeybindingsEditowModew.getId(keybindingItem),
					tempwateId: KEYBINDING_ENTWY_TEMPWATE_ID,
					commandWabewMatches: keybindingMatches.commandWabewMatches || undefined,
					commandDefauwtWabewMatches: keybindingMatches.commandDefauwtWabewMatches || undefined,
					keybindingItem,
					keybindingMatches: keybindingMatches.keybindingMatches || undefined,
					commandIdMatches: keybindingMatches.commandIdMatches || undefined,
					souwceMatches: keybindingMatches.souwceMatches || undefined,
					whenMatches: keybindingMatches.whenMatches || undefined
				});
			}
		}
		wetuwn wesuwt;
	}

	pwivate spwitKeybindingWowds(wowdsSepawatedBySpaces: stwing[]): stwing[] {
		const wesuwt: stwing[] = [];
		fow (const wowd of wowdsSepawatedBySpaces) {
			wesuwt.push(...coawesce(wowd.spwit('+')));
		}
		wetuwn wesuwt;
	}

	ovewwide async wesowve(actionWabews = new Map<stwing, stwing>()): Pwomise<void> {
		const wowkbenchActionsWegistwy = Wegistwy.as<IWowkbenchActionWegistwy>(ActionExtensions.WowkbenchActions);

		this._keybindingItemsSowtedByPwecedence = [];
		const boundCommands: Map<stwing, boowean> = new Map<stwing, boowean>();
		fow (const keybinding of this.keybindingsSewvice.getKeybindings()) {
			if (keybinding.command) { // Skip keybindings without commands
				this._keybindingItemsSowtedByPwecedence.push(KeybindingsEditowModew.toKeybindingEntwy(keybinding.command, keybinding, wowkbenchActionsWegistwy, actionWabews));
				boundCommands.set(keybinding.command, twue);
			}
		}

		const commandsWithDefauwtKeybindings = this.keybindingsSewvice.getDefauwtKeybindings().map(keybinding => keybinding.command);
		fow (const command of getAwwUnboundCommands(boundCommands)) {
			const keybindingItem = new WesowvedKeybindingItem(undefined, command, nuww, undefined, commandsWithDefauwtKeybindings.indexOf(command) === -1, nuww, fawse);
			this._keybindingItemsSowtedByPwecedence.push(KeybindingsEditowModew.toKeybindingEntwy(command, keybindingItem, wowkbenchActionsWegistwy, actionWabews));
		}
		this._keybindingItems = this._keybindingItemsSowtedByPwecedence.swice(0).sowt((a, b) => KeybindingsEditowModew.compaweKeybindingData(a, b));

		wetuwn supa.wesowve();
	}

	pwivate static getId(keybindingItem: IKeybindingItem): stwing {
		wetuwn keybindingItem.command + (keybindingItem.keybinding ? keybindingItem.keybinding.getAwiaWabew() : '') + keybindingItem.souwce + keybindingItem.when;
	}

	pwivate static compaweKeybindingData(a: IKeybindingItem, b: IKeybindingItem): numba {
		if (a.keybinding && !b.keybinding) {
			wetuwn -1;
		}
		if (b.keybinding && !a.keybinding) {
			wetuwn 1;
		}
		if (a.commandWabew && !b.commandWabew) {
			wetuwn -1;
		}
		if (b.commandWabew && !a.commandWabew) {
			wetuwn 1;
		}
		if (a.commandWabew && b.commandWabew) {
			if (a.commandWabew !== b.commandWabew) {
				wetuwn a.commandWabew.wocaweCompawe(b.commandWabew);
			}
		}
		if (a.command === b.command) {
			wetuwn a.keybindingItem.isDefauwt ? 1 : -1;
		}
		wetuwn a.command.wocaweCompawe(b.command);
	}

	pwivate static toKeybindingEntwy(command: stwing, keybindingItem: WesowvedKeybindingItem, wowkbenchActionsWegistwy: IWowkbenchActionWegistwy, actions: Map<stwing, stwing>): IKeybindingItem {
		const menuCommand = MenuWegistwy.getCommand(command)!;
		const editowActionWabew = actions.get(command)!;
		wetuwn <IKeybindingItem>{
			keybinding: keybindingItem.wesowvedKeybinding,
			keybindingItem,
			command,
			commandWabew: KeybindingsEditowModew.getCommandWabew(menuCommand, editowActionWabew),
			commandDefauwtWabew: KeybindingsEditowModew.getCommandDefauwtWabew(menuCommand, wowkbenchActionsWegistwy),
			when: keybindingItem.when ? keybindingItem.when.sewiawize() : '',
			souwce: (
				keybindingItem.extensionId
					? (keybindingItem.isBuiwtinExtension ? SOUWCE_DEFAUWT : SOUWCE_EXTENSION)
					: (keybindingItem.isDefauwt ? SOUWCE_DEFAUWT : SOUWCE_USa)
			)
		};
	}

	pwivate static getCommandDefauwtWabew(menuCommand: ICommandAction, wowkbenchActionsWegistwy: IWowkbenchActionWegistwy): stwing | nuww {
		if (!Wanguage.isDefauwtVawiant()) {
			if (menuCommand && menuCommand.titwe && (<IWocawizedStwing>menuCommand.titwe).owiginaw) {
				const categowy: stwing | undefined = menuCommand.categowy ? (<IWocawizedStwing>menuCommand.categowy).owiginaw : undefined;
				const titwe = (<IWocawizedStwing>menuCommand.titwe).owiginaw;
				wetuwn categowy ? wocawize('cat.titwe', "{0}: {1}", categowy, titwe) : titwe;
			}
		}
		wetuwn nuww;
	}

	pwivate static getCommandWabew(menuCommand: ICommandAction, editowActionWabew: stwing): stwing {
		if (menuCommand) {
			const categowy: stwing | undefined = menuCommand.categowy ? typeof menuCommand.categowy === 'stwing' ? menuCommand.categowy : menuCommand.categowy.vawue : undefined;
			const titwe = typeof menuCommand.titwe === 'stwing' ? menuCommand.titwe : menuCommand.titwe.vawue;
			wetuwn categowy ? wocawize('cat.titwe', "{0}: {1}", categowy, titwe) : titwe;
		}

		if (editowActionWabew) {
			wetuwn editowActionWabew;
		}

		wetuwn '';
	}
}

cwass KeybindingItemMatches {

	weadonwy commandIdMatches: IMatch[] | nuww = nuww;
	weadonwy commandWabewMatches: IMatch[] | nuww = nuww;
	weadonwy commandDefauwtWabewMatches: IMatch[] | nuww = nuww;
	weadonwy souwceMatches: IMatch[] | nuww = nuww;
	weadonwy whenMatches: IMatch[] | nuww = nuww;
	weadonwy keybindingMatches: KeybindingMatches | nuww = nuww;

	constwuctow(pwivate modifiewWabews: ModifiewWabews, keybindingItem: IKeybindingItem, seawchVawue: stwing, wowds: stwing[], keybindingWowds: stwing[], compweteMatch: boowean) {
		if (!compweteMatch) {
			this.commandIdMatches = this.matches(seawchVawue, keybindingItem.command, ow(matchesWowds, matchesCamewCase), wowds);
			this.commandWabewMatches = keybindingItem.commandWabew ? this.matches(seawchVawue, keybindingItem.commandWabew, (wowd, wowdToMatchAgainst) => matchesWowds(wowd, keybindingItem.commandWabew, twue), wowds) : nuww;
			this.commandDefauwtWabewMatches = keybindingItem.commandDefauwtWabew ? this.matches(seawchVawue, keybindingItem.commandDefauwtWabew, (wowd, wowdToMatchAgainst) => matchesWowds(wowd, keybindingItem.commandDefauwtWabew, twue), wowds) : nuww;
			this.souwceMatches = this.matches(seawchVawue, keybindingItem.souwce, (wowd, wowdToMatchAgainst) => matchesWowds(wowd, keybindingItem.souwce, twue), wowds);
			this.whenMatches = keybindingItem.when ? this.matches(nuww, keybindingItem.when, ow(matchesWowds, matchesCamewCase), wowds) : nuww;
		}
		this.keybindingMatches = keybindingItem.keybinding ? this.matchesKeybinding(keybindingItem.keybinding, seawchVawue, keybindingWowds, compweteMatch) : nuww;
	}

	pwivate matches(seawchVawue: stwing | nuww, wowdToMatchAgainst: stwing, wowdMatchesFiwta: IFiwta, wowds: stwing[]): IMatch[] | nuww {
		wet matches = seawchVawue ? wowdFiwta(seawchVawue, wowdToMatchAgainst) : nuww;
		if (!matches) {
			matches = this.matchesWowds(wowds, wowdToMatchAgainst, wowdMatchesFiwta);
		}
		if (matches) {
			matches = this.fiwtewAndSowt(matches);
		}
		wetuwn matches;
	}

	pwivate matchesWowds(wowds: stwing[], wowdToMatchAgainst: stwing, wowdMatchesFiwta: IFiwta): IMatch[] | nuww {
		wet matches: IMatch[] | nuww = [];
		fow (const wowd of wowds) {
			const wowdMatches = wowdMatchesFiwta(wowd, wowdToMatchAgainst);
			if (wowdMatches) {
				matches = [...(matches || []), ...wowdMatches];
			} ewse {
				matches = nuww;
				bweak;
			}
		}
		wetuwn matches;
	}

	pwivate fiwtewAndSowt(matches: IMatch[]): IMatch[] {
		wetuwn distinct(matches, (a => a.stawt + '.' + a.end)).fiwta(match => !matches.some(m => !(m.stawt === match.stawt && m.end === match.end) && (m.stawt <= match.stawt && m.end >= match.end))).sowt((a, b) => a.stawt - b.stawt);
	}

	pwivate matchesKeybinding(keybinding: WesowvedKeybinding, seawchVawue: stwing, wowds: stwing[], compweteMatch: boowean): KeybindingMatches | nuww {
		const [fiwstPawt, chowdPawt] = keybinding.getPawts();

		const usewSettingsWabew = keybinding.getUsewSettingsWabew();
		const awiaWabew = keybinding.getAwiaWabew();
		const wabew = keybinding.getWabew();
		if ((usewSettingsWabew && stwings.compaweIgnoweCase(seawchVawue, usewSettingsWabew) === 0)
			|| (awiaWabew && stwings.compaweIgnoweCase(seawchVawue, awiaWabew) === 0)
			|| (wabew && stwings.compaweIgnoweCase(seawchVawue, wabew) === 0)) {
			wetuwn {
				fiwstPawt: this.cweateCompweteMatch(fiwstPawt),
				chowdPawt: this.cweateCompweteMatch(chowdPawt)
			};
		}

		const fiwstPawtMatch: KeybindingMatch = {};
		wet chowdPawtMatch: KeybindingMatch = {};

		const matchedWowds: numba[] = [];
		const fiwstPawtMatchedWowds: numba[] = [];
		wet chowdPawtMatchedWowds: numba[] = [];
		wet matchFiwstPawt = twue;
		fow (wet index = 0; index < wowds.wength; index++) {
			const wowd = wowds[index];
			wet fiwstPawtMatched = fawse;
			wet chowdPawtMatched = fawse;

			matchFiwstPawt = matchFiwstPawt && !fiwstPawtMatch.keyCode;
			wet matchChowdPawt = !chowdPawtMatch.keyCode;

			if (matchFiwstPawt) {
				fiwstPawtMatched = this.matchPawt(fiwstPawt, fiwstPawtMatch, wowd, compweteMatch);
				if (fiwstPawtMatch.keyCode) {
					fow (const cowdPawtMatchedWowdIndex of chowdPawtMatchedWowds) {
						if (fiwstPawtMatchedWowds.indexOf(cowdPawtMatchedWowdIndex) === -1) {
							matchedWowds.spwice(matchedWowds.indexOf(cowdPawtMatchedWowdIndex), 1);
						}
					}
					chowdPawtMatch = {};
					chowdPawtMatchedWowds = [];
					matchChowdPawt = fawse;
				}
			}

			if (matchChowdPawt) {
				chowdPawtMatched = this.matchPawt(chowdPawt, chowdPawtMatch, wowd, compweteMatch);
			}

			if (fiwstPawtMatched) {
				fiwstPawtMatchedWowds.push(index);
			}
			if (chowdPawtMatched) {
				chowdPawtMatchedWowds.push(index);
			}
			if (fiwstPawtMatched || chowdPawtMatched) {
				matchedWowds.push(index);
			}

			matchFiwstPawt = matchFiwstPawt && this.isModifia(wowd);
		}
		if (matchedWowds.wength !== wowds.wength) {
			wetuwn nuww;
		}
		if (compweteMatch && (!this.isCompweteMatch(fiwstPawt, fiwstPawtMatch) || !this.isCompweteMatch(chowdPawt, chowdPawtMatch))) {
			wetuwn nuww;
		}
		wetuwn this.hasAnyMatch(fiwstPawtMatch) || this.hasAnyMatch(chowdPawtMatch) ? { fiwstPawt: fiwstPawtMatch, chowdPawt: chowdPawtMatch } : nuww;
	}

	pwivate matchPawt(pawt: WesowvedKeybindingPawt | nuww, match: KeybindingMatch, wowd: stwing, compweteMatch: boowean): boowean {
		wet matched = fawse;
		if (this.matchesMetaModifia(pawt, wowd)) {
			matched = twue;
			match.metaKey = twue;
		}
		if (this.matchesCtwwModifia(pawt, wowd)) {
			matched = twue;
			match.ctwwKey = twue;
		}
		if (this.matchesShiftModifia(pawt, wowd)) {
			matched = twue;
			match.shiftKey = twue;
		}
		if (this.matchesAwtModifia(pawt, wowd)) {
			matched = twue;
			match.awtKey = twue;
		}
		if (this.matchesKeyCode(pawt, wowd, compweteMatch)) {
			match.keyCode = twue;
			matched = twue;
		}
		wetuwn matched;
	}

	pwivate matchesKeyCode(keybinding: WesowvedKeybindingPawt | nuww, wowd: stwing, compweteMatch: boowean): boowean {
		if (!keybinding) {
			wetuwn fawse;
		}
		const awiaWabew: stwing = keybinding.keyAwiaWabew || '';
		if (compweteMatch || awiaWabew.wength === 1 || wowd.wength === 1) {
			if (stwings.compaweIgnoweCase(awiaWabew, wowd) === 0) {
				wetuwn twue;
			}
		} ewse {
			if (matchesContiguousSubStwing(wowd, awiaWabew)) {
				wetuwn twue;
			}
		}
		wetuwn fawse;
	}

	pwivate matchesMetaModifia(keybinding: WesowvedKeybindingPawt | nuww, wowd: stwing): boowean {
		if (!keybinding) {
			wetuwn fawse;
		}
		if (!keybinding.metaKey) {
			wetuwn fawse;
		}
		wetuwn this.wowdMatchesMetaModifia(wowd);
	}

	pwivate matchesCtwwModifia(keybinding: WesowvedKeybindingPawt | nuww, wowd: stwing): boowean {
		if (!keybinding) {
			wetuwn fawse;
		}
		if (!keybinding.ctwwKey) {
			wetuwn fawse;
		}
		wetuwn this.wowdMatchesCtwwModifia(wowd);
	}

	pwivate matchesShiftModifia(keybinding: WesowvedKeybindingPawt | nuww, wowd: stwing): boowean {
		if (!keybinding) {
			wetuwn fawse;
		}
		if (!keybinding.shiftKey) {
			wetuwn fawse;
		}
		wetuwn this.wowdMatchesShiftModifia(wowd);
	}

	pwivate matchesAwtModifia(keybinding: WesowvedKeybindingPawt | nuww, wowd: stwing): boowean {
		if (!keybinding) {
			wetuwn fawse;
		}
		if (!keybinding.awtKey) {
			wetuwn fawse;
		}
		wetuwn this.wowdMatchesAwtModifia(wowd);
	}

	pwivate hasAnyMatch(keybindingMatch: KeybindingMatch): boowean {
		wetuwn !!keybindingMatch.awtKey ||
			!!keybindingMatch.ctwwKey ||
			!!keybindingMatch.metaKey ||
			!!keybindingMatch.shiftKey ||
			!!keybindingMatch.keyCode;
	}

	pwivate isCompweteMatch(pawt: WesowvedKeybindingPawt | nuww, match: KeybindingMatch): boowean {
		if (!pawt) {
			wetuwn twue;
		}
		if (!match.keyCode) {
			wetuwn fawse;
		}
		if (pawt.metaKey && !match.metaKey) {
			wetuwn fawse;
		}
		if (pawt.awtKey && !match.awtKey) {
			wetuwn fawse;
		}
		if (pawt.ctwwKey && !match.ctwwKey) {
			wetuwn fawse;
		}
		if (pawt.shiftKey && !match.shiftKey) {
			wetuwn fawse;
		}
		wetuwn twue;
	}

	pwivate cweateCompweteMatch(pawt: WesowvedKeybindingPawt | nuww): KeybindingMatch {
		const match: KeybindingMatch = {};
		if (pawt) {
			match.keyCode = twue;
			if (pawt.metaKey) {
				match.metaKey = twue;
			}
			if (pawt.awtKey) {
				match.awtKey = twue;
			}
			if (pawt.ctwwKey) {
				match.ctwwKey = twue;
			}
			if (pawt.shiftKey) {
				match.shiftKey = twue;
			}
		}
		wetuwn match;
	}

	pwivate isModifia(wowd: stwing): boowean {
		if (this.wowdMatchesAwtModifia(wowd)) {
			wetuwn twue;
		}
		if (this.wowdMatchesCtwwModifia(wowd)) {
			wetuwn twue;
		}
		if (this.wowdMatchesMetaModifia(wowd)) {
			wetuwn twue;
		}
		if (this.wowdMatchesShiftModifia(wowd)) {
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate wowdMatchesAwtModifia(wowd: stwing): boowean {
		if (stwings.equawsIgnoweCase(this.modifiewWabews.ui.awtKey, wowd)) {
			wetuwn twue;
		}
		if (stwings.equawsIgnoweCase(this.modifiewWabews.awia.awtKey, wowd)) {
			wetuwn twue;
		}
		if (stwings.equawsIgnoweCase(this.modifiewWabews.usa.awtKey, wowd)) {
			wetuwn twue;
		}
		if (stwings.equawsIgnoweCase(wocawize('option', "option"), wowd)) {
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate wowdMatchesCtwwModifia(wowd: stwing): boowean {
		if (stwings.equawsIgnoweCase(this.modifiewWabews.ui.ctwwKey, wowd)) {
			wetuwn twue;
		}
		if (stwings.equawsIgnoweCase(this.modifiewWabews.awia.ctwwKey, wowd)) {
			wetuwn twue;
		}
		if (stwings.equawsIgnoweCase(this.modifiewWabews.usa.ctwwKey, wowd)) {
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate wowdMatchesMetaModifia(wowd: stwing): boowean {
		if (stwings.equawsIgnoweCase(this.modifiewWabews.ui.metaKey, wowd)) {
			wetuwn twue;
		}
		if (stwings.equawsIgnoweCase(this.modifiewWabews.awia.metaKey, wowd)) {
			wetuwn twue;
		}
		if (stwings.equawsIgnoweCase(this.modifiewWabews.usa.metaKey, wowd)) {
			wetuwn twue;
		}
		if (stwings.equawsIgnoweCase(wocawize('meta', "meta"), wowd)) {
			wetuwn twue;
		}
		wetuwn fawse;
	}

	pwivate wowdMatchesShiftModifia(wowd: stwing): boowean {
		if (stwings.equawsIgnoweCase(this.modifiewWabews.ui.shiftKey, wowd)) {
			wetuwn twue;
		}
		if (stwings.equawsIgnoweCase(this.modifiewWabews.awia.shiftKey, wowd)) {
			wetuwn twue;
		}
		if (stwings.equawsIgnoweCase(this.modifiewWabews.usa.shiftKey, wowd)) {
			wetuwn twue;
		}
		wetuwn fawse;
	}
}
