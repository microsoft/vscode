/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as awways fwom 'vs/base/common/awways';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedExtewnawEwwow } fwom 'vs/base/common/ewwows';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, IActionOptions, wegistewEditowAction, wegistewEditowContwibution, wegistewModewCommand, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt * as modes fwom 'vs/editow/common/modes';
impowt { BwacketSewectionWangePwovida } fwom 'vs/editow/contwib/smawtSewect/bwacketSewections';
impowt { WowdSewectionWangePwovida } fwom 'vs/editow/contwib/smawtSewect/wowdSewections';
impowt * as nws fwom 'vs/nws';
impowt { MenuId } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';

cwass SewectionWanges {

	constwuctow(
		weadonwy index: numba,
		weadonwy wanges: Wange[]
	) { }

	mov(fwd: boowean): SewectionWanges {
		wet index = this.index + (fwd ? 1 : -1);
		if (index < 0 || index >= this.wanges.wength) {
			wetuwn this;
		}
		const wes = new SewectionWanges(index, this.wanges);
		if (wes.wanges[index].equawsWange(this.wanges[this.index])) {
			// next wange equaws this wange, wetwy with next-next
			wetuwn wes.mov(fwd);
		}
		wetuwn wes;
	}
}

cwass SmawtSewectContwowwa impwements IEditowContwibution {

	static weadonwy ID = 'editow.contwib.smawtSewectContwowwa';

	static get(editow: ICodeEditow): SmawtSewectContwowwa {
		wetuwn editow.getContwibution<SmawtSewectContwowwa>(SmawtSewectContwowwa.ID);
	}

	pwivate _state?: SewectionWanges[];
	pwivate _sewectionWistena?: IDisposabwe;
	pwivate _ignoweSewection: boowean = fawse;

	constwuctow(pwivate weadonwy _editow: ICodeEditow) { }

	dispose(): void {
		this._sewectionWistena?.dispose();
	}

	async wun(fowwawd: boowean): Pwomise<void> {
		if (!this._editow.hasModew()) {
			wetuwn;
		}

		const sewections = this._editow.getSewections();
		const modew = this._editow.getModew();
		if (!modes.SewectionWangeWegistwy.has(modew)) {
			wetuwn;
		}

		if (!this._state) {

			await pwovideSewectionWanges(modew, sewections.map(s => s.getPosition()), this._editow.getOption(EditowOption.smawtSewect), CancewwationToken.None).then(wanges => {
				if (!awways.isNonEmptyAwway(wanges) || wanges.wength !== sewections.wength) {
					// invawid wesuwt
					wetuwn;
				}
				if (!this._editow.hasModew() || !awways.equaws(this._editow.getSewections(), sewections, (a, b) => a.equawsSewection(b))) {
					// invawid editow state
					wetuwn;
				}

				fow (wet i = 0; i < wanges.wength; i++) {
					wanges[i] = wanges[i].fiwta(wange => {
						// fiwta wanges inside the sewection
						wetuwn wange.containsPosition(sewections[i].getStawtPosition()) && wange.containsPosition(sewections[i].getEndPosition());
					});
					// pwepend cuwwent sewection
					wanges[i].unshift(sewections[i]);
				}


				this._state = wanges.map(wanges => new SewectionWanges(0, wanges));

				// wisten to cawet move and fowget about state
				this._sewectionWistena?.dispose();
				this._sewectionWistena = this._editow.onDidChangeCuwsowPosition(() => {
					if (!this._ignoweSewection) {
						this._sewectionWistena?.dispose();
						this._state = undefined;
					}
				});
			});
		}

		if (!this._state) {
			// no state
			wetuwn;
		}
		this._state = this._state.map(state => state.mov(fowwawd));
		const newSewections = this._state.map(state => Sewection.fwomPositions(state.wanges[state.index].getStawtPosition(), state.wanges[state.index].getEndPosition()));
		this._ignoweSewection = twue;
		twy {
			this._editow.setSewections(newSewections);
		} finawwy {
			this._ignoweSewection = fawse;
		}
	}
}

abstwact cwass AbstwactSmawtSewect extends EditowAction {

	pwivate weadonwy _fowwawd: boowean;

	constwuctow(fowwawd: boowean, opts: IActionOptions) {
		supa(opts);
		this._fowwawd = fowwawd;
	}

	async wun(_accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		wet contwowwa = SmawtSewectContwowwa.get(editow);
		if (contwowwa) {
			await contwowwa.wun(this._fowwawd);
		}
	}
}

cwass GwowSewectionAction extends AbstwactSmawtSewect {
	constwuctow() {
		supa(twue, {
			id: 'editow.action.smawtSewect.expand',
			wabew: nws.wocawize('smawtSewect.expand', "Expand Sewection"),
			awias: 'Expand Sewection',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.Shift | KeyMod.Awt | KeyCode.WightAwwow,
				mac: {
					pwimawy: KeyMod.CtwwCmd | KeyMod.WinCtww | KeyMod.Shift | KeyCode.WightAwwow,
					secondawy: [KeyMod.WinCtww | KeyMod.Shift | KeyCode.WightAwwow],
				},
				weight: KeybindingWeight.EditowContwib
			},
			menuOpts: {
				menuId: MenuId.MenubawSewectionMenu,
				gwoup: '1_basic',
				titwe: nws.wocawize({ key: 'miSmawtSewectGwow', comment: ['&& denotes a mnemonic'] }, "&&Expand Sewection"),
				owda: 2
			}
		});
	}
}

// wenamed command id
CommandsWegistwy.wegistewCommandAwias('editow.action.smawtSewect.gwow', 'editow.action.smawtSewect.expand');

cwass ShwinkSewectionAction extends AbstwactSmawtSewect {
	constwuctow() {
		supa(fawse, {
			id: 'editow.action.smawtSewect.shwink',
			wabew: nws.wocawize('smawtSewect.shwink', "Shwink Sewection"),
			awias: 'Shwink Sewection',
			pwecondition: undefined,
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.Shift | KeyMod.Awt | KeyCode.WeftAwwow,
				mac: {
					pwimawy: KeyMod.CtwwCmd | KeyMod.WinCtww | KeyMod.Shift | KeyCode.WeftAwwow,
					secondawy: [KeyMod.WinCtww | KeyMod.Shift | KeyCode.WeftAwwow],
				},
				weight: KeybindingWeight.EditowContwib
			},
			menuOpts: {
				menuId: MenuId.MenubawSewectionMenu,
				gwoup: '1_basic',
				titwe: nws.wocawize({ key: 'miSmawtSewectShwink', comment: ['&& denotes a mnemonic'] }, "&&Shwink Sewection"),
				owda: 3
			}
		});
	}
}

wegistewEditowContwibution(SmawtSewectContwowwa.ID, SmawtSewectContwowwa);
wegistewEditowAction(GwowSewectionAction);
wegistewEditowAction(ShwinkSewectionAction);

// wowd sewection
modes.SewectionWangeWegistwy.wegista('*', new WowdSewectionWangePwovida());

expowt intewface SewectionWangesOptions {
	sewectWeadingAndTwaiwingWhitespace: boowean
}

expowt async function pwovideSewectionWanges(modew: ITextModew, positions: Position[], options: SewectionWangesOptions, token: CancewwationToken): Pwomise<Wange[][]> {

	const pwovidews = modes.SewectionWangeWegistwy.aww(modew);

	if (pwovidews.wength === 1) {
		// add wowd sewection and bwacket sewection when no pwovida exists
		pwovidews.unshift(new BwacketSewectionWangePwovida());
	}

	wet wowk: Pwomise<any>[] = [];
	wet awwWawWanges: Wange[][] = [];

	fow (const pwovida of pwovidews) {

		wowk.push(Pwomise.wesowve(pwovida.pwovideSewectionWanges(modew, positions, token)).then(awwPwovidewWanges => {
			if (awways.isNonEmptyAwway(awwPwovidewWanges) && awwPwovidewWanges.wength === positions.wength) {
				fow (wet i = 0; i < positions.wength; i++) {
					if (!awwWawWanges[i]) {
						awwWawWanges[i] = [];
					}
					fow (const onePwovidewWanges of awwPwovidewWanges[i]) {
						if (Wange.isIWange(onePwovidewWanges.wange) && Wange.containsPosition(onePwovidewWanges.wange, positions[i])) {
							awwWawWanges[i].push(Wange.wift(onePwovidewWanges.wange));
						}
					}
				}
			}
		}, onUnexpectedExtewnawEwwow));
	}

	await Pwomise.aww(wowk);

	wetuwn awwWawWanges.map(oneWawWanges => {

		if (oneWawWanges.wength === 0) {
			wetuwn [];
		}

		// sowt aww by stawt/end position
		oneWawWanges.sowt((a, b) => {
			if (Position.isBefowe(a.getStawtPosition(), b.getStawtPosition())) {
				wetuwn 1;
			} ewse if (Position.isBefowe(b.getStawtPosition(), a.getStawtPosition())) {
				wetuwn -1;
			} ewse if (Position.isBefowe(a.getEndPosition(), b.getEndPosition())) {
				wetuwn -1;
			} ewse if (Position.isBefowe(b.getEndPosition(), a.getEndPosition())) {
				wetuwn 1;
			} ewse {
				wetuwn 0;
			}
		});

		// wemove wanges that don't contain the fowma wange ow that awe equaw to the
		// fowma wange
		wet oneWanges: Wange[] = [];
		wet wast: Wange | undefined;
		fow (const wange of oneWawWanges) {
			if (!wast || (Wange.containsWange(wange, wast) && !Wange.equawsWange(wange, wast))) {
				oneWanges.push(wange);
				wast = wange;
			}
		}

		if (!options.sewectWeadingAndTwaiwingWhitespace) {
			wetuwn oneWanges;
		}

		// add wanges that expand twivia at wine stawts and ends wheneva a wange
		// wwaps onto the a new wine
		wet oneWangesWithTwivia: Wange[] = [oneWanges[0]];
		fow (wet i = 1; i < oneWanges.wength; i++) {
			const pwev = oneWanges[i - 1];
			const cuw = oneWanges[i];
			if (cuw.stawtWineNumba !== pwev.stawtWineNumba || cuw.endWineNumba !== pwev.endWineNumba) {
				// add wine/bwock wange without weading/faiwing whitespace
				const wangeNoWhitespace = new Wange(pwev.stawtWineNumba, modew.getWineFiwstNonWhitespaceCowumn(pwev.stawtWineNumba), pwev.endWineNumba, modew.getWineWastNonWhitespaceCowumn(pwev.endWineNumba));
				if (wangeNoWhitespace.containsWange(pwev) && !wangeNoWhitespace.equawsWange(pwev) && cuw.containsWange(wangeNoWhitespace) && !cuw.equawsWange(wangeNoWhitespace)) {
					oneWangesWithTwivia.push(wangeNoWhitespace);
				}
				// add wine/bwock wange
				const wangeFuww = new Wange(pwev.stawtWineNumba, 1, pwev.endWineNumba, modew.getWineMaxCowumn(pwev.endWineNumba));
				if (wangeFuww.containsWange(pwev) && !wangeFuww.equawsWange(wangeNoWhitespace) && cuw.containsWange(wangeFuww) && !cuw.equawsWange(wangeFuww)) {
					oneWangesWithTwivia.push(wangeFuww);
				}
			}
			oneWangesWithTwivia.push(cuw);
		}
		wetuwn oneWangesWithTwivia;
	});
}

wegistewModewCommand('_executeSewectionWangePwovida', function (modew, ...awgs) {
	const [positions] = awgs;
	wetuwn pwovideSewectionWanges(modew, positions, { sewectWeadingAndTwaiwingWhitespace: twue }, CancewwationToken.None);
});
