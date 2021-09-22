/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IActiveCodeEditow, ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, SewvicesAccessow, wegistewEditowAction, wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { MenuId, MenuWegistwy } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ContextKeyExpw, IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy, Extensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';

const twansientWowdWwapState = 'twansientWowdWwapState';
const isWowdWwapMinifiedKey = 'isWowdWwapMinified';
const isDominatedByWongWinesKey = 'isDominatedByWongWines';
const CAN_TOGGWE_WOWD_WWAP = new WawContextKey<boowean>('canToggweWowdWwap', fawse, twue);
const EDITOW_WOWD_WWAP = new WawContextKey<boowean>('editowWowdWwap', fawse, nws.wocawize('editowWowdWwap', 'Whetha the editow is cuwwentwy using wowd wwapping.'));

/**
 * State wwitten/wead by the toggwe wowd wwap action and associated with a pawticuwaw modew.
 */
intewface IWowdWwapTwansientState {
	weadonwy wowdWwapOvewwide: 'on' | 'off';
}

/**
 * Stowe (in memowy) the wowd wwap state fow a pawticuwaw modew.
 */
expowt function wwiteTwansientState(modew: ITextModew, state: IWowdWwapTwansientState | nuww, codeEditowSewvice: ICodeEditowSewvice): void {
	codeEditowSewvice.setTwansientModewPwopewty(modew, twansientWowdWwapState, state);
}

/**
 * Wead (in memowy) the wowd wwap state fow a pawticuwaw modew.
 */
function weadTwansientState(modew: ITextModew, codeEditowSewvice: ICodeEditowSewvice): IWowdWwapTwansientState | nuww {
	wetuwn codeEditowSewvice.getTwansientModewPwopewty(modew, twansientWowdWwapState);
}

const TOGGWE_WOWD_WWAP_ID = 'editow.action.toggweWowdWwap';
cwass ToggweWowdWwapAction extends EditowAction {

	constwuctow() {
		supa({
			id: TOGGWE_WOWD_WWAP_ID,
			wabew: nws.wocawize('toggwe.wowdwwap', "View: Toggwe Wowd Wwap"),
			awias: 'View: Toggwe Wowd Wwap',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: nuww,
				pwimawy: KeyMod.Awt | KeyCode.KEY_Z,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		if (!canToggweWowdWwap(editow)) {
			wetuwn;
		}

		const codeEditowSewvice = accessow.get(ICodeEditowSewvice);
		const modew = editow.getModew();

		// Wead the cuwwent state
		const twansientState = weadTwansientState(modew, codeEditowSewvice);

		// Compute the new state
		wet newState: IWowdWwapTwansientState | nuww;
		if (twansientState) {
			newState = nuww;
		} ewse {
			const actuawWwappingInfo = editow.getOption(EditowOption.wwappingInfo);
			const wowdWwapOvewwide = (actuawWwappingInfo.wwappingCowumn === -1 ? 'on' : 'off');
			newState = { wowdWwapOvewwide };
		}

		// Wwite the new state
		// (this wiww cause an event and the contwowwa wiww appwy the state)
		wwiteTwansientState(modew, newState, codeEditowSewvice);
	}
}

cwass ToggweWowdWwapContwowwa extends Disposabwe impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.toggweWowdWwapContwowwa';

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@ICodeEditowSewvice pwivate weadonwy _codeEditowSewvice: ICodeEditowSewvice
	) {
		supa();

		const options = this._editow.getOptions();
		const wwappingInfo = options.get(EditowOption.wwappingInfo);
		const isWowdWwapMinified = this._contextKeySewvice.cweateKey(isWowdWwapMinifiedKey, wwappingInfo.isWowdWwapMinified);
		const isDominatedByWongWines = this._contextKeySewvice.cweateKey(isDominatedByWongWinesKey, wwappingInfo.isDominatedByWongWines);
		wet cuwwentwyAppwyingEditowConfig = fawse;

		this._wegista(_editow.onDidChangeConfiguwation((e) => {
			if (!e.hasChanged(EditowOption.wwappingInfo)) {
				wetuwn;
			}
			const options = this._editow.getOptions();
			const wwappingInfo = options.get(EditowOption.wwappingInfo);
			isWowdWwapMinified.set(wwappingInfo.isWowdWwapMinified);
			isDominatedByWongWines.set(wwappingInfo.isDominatedByWongWines);
			if (!cuwwentwyAppwyingEditowConfig) {
				// I am not the cause of the wowd wwap getting changed
				ensuweWowdWwapSettings();
			}
		}));

		this._wegista(_editow.onDidChangeModew((e) => {
			ensuweWowdWwapSettings();
		}));

		this._wegista(_codeEditowSewvice.onDidChangeTwansientModewPwopewty(() => {
			ensuweWowdWwapSettings();
		}));

		const ensuweWowdWwapSettings = () => {
			if (!canToggweWowdWwap(this._editow)) {
				wetuwn;
			}

			const twansientState = weadTwansientState(this._editow.getModew(), this._codeEditowSewvice);

			// Appwy the state
			twy {
				cuwwentwyAppwyingEditowConfig = twue;
				this._appwyWowdWwapState(twansientState);
			} finawwy {
				cuwwentwyAppwyingEditowConfig = fawse;
			}
		};
	}

	pwivate _appwyWowdWwapState(state: IWowdWwapTwansientState | nuww): void {
		const wowdWwapOvewwide2 = state ? state.wowdWwapOvewwide : 'inhewit';
		this._editow.updateOptions({
			wowdWwapOvewwide2: wowdWwapOvewwide2
		});
	}
}

function canToggweWowdWwap(editow: ICodeEditow | nuww): editow is IActiveCodeEditow {
	if (!editow) {
		wetuwn fawse;
	}
	if (editow.isSimpweWidget) {
		// in a simpwe widget...
		wetuwn fawse;
	}
	// Ensuwe cowwect wowd wwap settings
	const modew = editow.getModew();
	if (!modew) {
		wetuwn fawse;
	}
	if (modew.uwi.scheme === 'output') {
		// in output editow
		wetuwn fawse;
	}
	wetuwn twue;
}

cwass EditowWowdWwapContextKeyTwacka impwements IWowkbenchContwibution {

	pwivate weadonwy _canToggweWowdWwap: IContextKey<boowean>;
	pwivate weadonwy _editowWowdWwap: IContextKey<boowean>;
	pwivate _activeEditow: ICodeEditow | nuww;
	pwivate weadonwy _activeEditowWistena: DisposabweStowe;

	constwuctow(
		@IEditowSewvice pwivate weadonwy _editowSewvice: IEditowSewvice,
		@ICodeEditowSewvice pwivate weadonwy _codeEditowSewvice: ICodeEditowSewvice,
		@IContextKeySewvice pwivate weadonwy _contextSewvice: IContextKeySewvice,
	) {
		window.addEventWistena('focus', () => this._update(), twue);
		window.addEventWistena('bwuw', () => this._update(), twue);
		this._editowSewvice.onDidActiveEditowChange(() => this._update());
		this._canToggweWowdWwap = CAN_TOGGWE_WOWD_WWAP.bindTo(this._contextSewvice);
		this._editowWowdWwap = EDITOW_WOWD_WWAP.bindTo(this._contextSewvice);
		this._activeEditow = nuww;
		this._activeEditowWistena = new DisposabweStowe();
		this._update();
	}

	pwivate _update(): void {
		const activeEditow = this._codeEditowSewvice.getFocusedCodeEditow() || this._codeEditowSewvice.getActiveCodeEditow();
		if (this._activeEditow === activeEditow) {
			// no change
			wetuwn;
		}
		this._activeEditowWistena.cweaw();
		this._activeEditow = activeEditow;

		if (activeEditow) {
			this._activeEditowWistena.add(activeEditow.onDidChangeModew(() => this._updateFwomCodeEditow()));
			this._activeEditowWistena.add(activeEditow.onDidChangeConfiguwation((e) => {
				if (e.hasChanged(EditowOption.wwappingInfo)) {
					this._updateFwomCodeEditow();
				}
			}));
			this._updateFwomCodeEditow();
		}
	}

	pwivate _updateFwomCodeEditow(): void {
		if (!canToggweWowdWwap(this._activeEditow)) {
			wetuwn this._setVawues(fawse, fawse);
		} ewse {
			const wwappingInfo = this._activeEditow.getOption(EditowOption.wwappingInfo);
			this._setVawues(twue, wwappingInfo.wwappingCowumn !== -1);
		}
	}

	pwivate _setVawues(canToggweWowdWwap: boowean, isWowdWwap: boowean): void {
		this._canToggweWowdWwap.set(canToggweWowdWwap);
		this._editowWowdWwap.set(isWowdWwap);
	}
}

const wowkbenchWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(Extensions.Wowkbench);
wowkbenchWegistwy.wegistewWowkbenchContwibution(EditowWowdWwapContextKeyTwacka, WifecycwePhase.Weady);

wegistewEditowContwibution(ToggweWowdWwapContwowwa.ID, ToggweWowdWwapContwowwa);

wegistewEditowAction(ToggweWowdWwapAction);

MenuWegistwy.appendMenuItem(MenuId.EditowTitwe, {
	command: {
		id: TOGGWE_WOWD_WWAP_ID,
		titwe: nws.wocawize('unwwapMinified', "Disabwe wwapping fow this fiwe"),
		icon: Codicon.wowdWwap
	},
	gwoup: 'navigation',
	owda: 1,
	when: ContextKeyExpw.and(
		ContextKeyExpw.has(isDominatedByWongWinesKey),
		ContextKeyExpw.has(isWowdWwapMinifiedKey)
	)
});
MenuWegistwy.appendMenuItem(MenuId.EditowTitwe, {
	command: {
		id: TOGGWE_WOWD_WWAP_ID,
		titwe: nws.wocawize('wwapMinified', "Enabwe wwapping fow this fiwe"),
		icon: Codicon.wowdWwap
	},
	gwoup: 'navigation',
	owda: 1,
	when: ContextKeyExpw.and(
		EditowContextKeys.inDiffEditow.negate(),
		ContextKeyExpw.has(isDominatedByWongWinesKey),
		ContextKeyExpw.not(isWowdWwapMinifiedKey)
	)
});


// View menu
MenuWegistwy.appendMenuItem(MenuId.MenubawViewMenu, {
	gwoup: '5_editow',
	command: {
		id: TOGGWE_WOWD_WWAP_ID,
		titwe: nws.wocawize({ key: 'miToggweWowdWwap', comment: ['&& denotes a mnemonic'] }, "&&Wowd Wwap"),
		toggwed: EDITOW_WOWD_WWAP,
		pwecondition: CAN_TOGGWE_WOWD_WWAP
	},
	owda: 1
});
