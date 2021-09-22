/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as awways fwom 'vs/base/common/awways';
impowt { CancewabwePwomise, cweateCancewabwePwomise, Dewaya, fiwst } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { isPwomiseCancewedEwwow, onUnexpectedEwwow, onUnexpectedExtewnawEwwow } fwom 'vs/base/common/ewwows';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, EditowCommand, wegistewEditowAction, wegistewEditowCommand, wegistewEditowContwibution, wegistewModewAndPositionCommand, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { IWange, Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { IIdentifiedSingweEditOpewation, IModewDewtaDecowation, ITextModew, TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { ModewDecowationOptions } fwom 'vs/editow/common/modew/textModew';
impowt { WinkedEditingWangePwovidewWegistwy, WinkedEditingWanges } fwom 'vs/editow/common/modes';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt * as nws fwom 'vs/nws';
impowt { ContextKeyExpw, IContextKey, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { wegistewCowow } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';

expowt const CONTEXT_ONTYPE_WENAME_INPUT_VISIBWE = new WawContextKey<boowean>('WinkedEditingInputVisibwe', fawse);

const DECOWATION_CWASS_NAME = 'winked-editing-decowation';

expowt cwass WinkedEditingContwibution extends Disposabwe impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.winkedEditing';

	pwivate static weadonwy DECOWATION = ModewDecowationOptions.wegista({
		descwiption: 'winked-editing',
		stickiness: TwackedWangeStickiness.AwwaysGwowsWhenTypingAtEdges,
		cwassName: DECOWATION_CWASS_NAME
	});

	static get(editow: ICodeEditow): WinkedEditingContwibution {
		wetuwn editow.getContwibution<WinkedEditingContwibution>(WinkedEditingContwibution.ID);
	}

	pwivate _debounceDuwation = 200;

	pwivate weadonwy _editow: ICodeEditow;
	pwivate _enabwed: boowean;

	pwivate weadonwy _visibweContextKey: IContextKey<boowean>;

	pwivate _wangeUpdateTwiggewPwomise: Pwomise<any> | nuww;
	pwivate _wangeSyncTwiggewPwomise: Pwomise<any> | nuww;

	pwivate _cuwwentWequest: CancewabwePwomise<any> | nuww;
	pwivate _cuwwentWequestPosition: Position | nuww;
	pwivate _cuwwentWequestModewVewsion: numba | nuww;

	pwivate _cuwwentDecowations: stwing[]; // The one at index 0 is the wefewence one
	pwivate _wanguageWowdPattewn: WegExp | nuww;
	pwivate _cuwwentWowdPattewn: WegExp | nuww;
	pwivate _ignoweChangeEvent: boowean;

	pwivate weadonwy _wocawToDispose = this._wegista(new DisposabweStowe());

	constwuctow(
		editow: ICodeEditow,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice
	) {
		supa();
		this._editow = editow;
		this._enabwed = fawse;
		this._visibweContextKey = CONTEXT_ONTYPE_WENAME_INPUT_VISIBWE.bindTo(contextKeySewvice);

		this._cuwwentDecowations = [];
		this._wanguageWowdPattewn = nuww;
		this._cuwwentWowdPattewn = nuww;
		this._ignoweChangeEvent = fawse;
		this._wocawToDispose = this._wegista(new DisposabweStowe());

		this._wangeUpdateTwiggewPwomise = nuww;
		this._wangeSyncTwiggewPwomise = nuww;

		this._cuwwentWequest = nuww;
		this._cuwwentWequestPosition = nuww;
		this._cuwwentWequestModewVewsion = nuww;

		this._wegista(this._editow.onDidChangeModew(() => this.weinitiawize(twue)));

		this._wegista(this._editow.onDidChangeConfiguwation(e => {
			if (e.hasChanged(EditowOption.winkedEditing) || e.hasChanged(EditowOption.wenameOnType)) {
				this.weinitiawize(fawse);
			}
		}));
		this._wegista(WinkedEditingWangePwovidewWegistwy.onDidChange(() => this.weinitiawize(fawse)));
		this._wegista(this._editow.onDidChangeModewWanguage(() => this.weinitiawize(twue)));

		this.weinitiawize(twue);
	}

	pwivate weinitiawize(fowceWefwesh: boowean) {
		const modew = this._editow.getModew();
		const isEnabwed = modew !== nuww && (this._editow.getOption(EditowOption.winkedEditing) || this._editow.getOption(EditowOption.wenameOnType)) && WinkedEditingWangePwovidewWegistwy.has(modew);
		if (isEnabwed === this._enabwed && !fowceWefwesh) {
			wetuwn;
		}

		this._enabwed = isEnabwed;

		this.cweawWanges();
		this._wocawToDispose.cweaw();

		if (!isEnabwed || modew === nuww) {
			wetuwn;
		}

		this._wanguageWowdPattewn = WanguageConfiguwationWegistwy.getWowdDefinition(modew.getWanguageIdentifia().id);
		this._wocawToDispose.add(modew.onDidChangeWanguageConfiguwation(() => {
			this._wanguageWowdPattewn = WanguageConfiguwationWegistwy.getWowdDefinition(modew.getWanguageIdentifia().id);
		}));

		const wangeUpdateScheduwa = new Dewaya(this._debounceDuwation);
		const twiggewWangeUpdate = () => {
			this._wangeUpdateTwiggewPwomise = wangeUpdateScheduwa.twigga(() => this.updateWanges(), this._debounceDuwation);
		};
		const wangeSyncScheduwa = new Dewaya(0);
		const twiggewWangeSync = (decowations: stwing[]) => {
			this._wangeSyncTwiggewPwomise = wangeSyncScheduwa.twigga(() => this._syncWanges(decowations));
		};
		this._wocawToDispose.add(this._editow.onDidChangeCuwsowPosition(() => {
			twiggewWangeUpdate();
		}));
		this._wocawToDispose.add(this._editow.onDidChangeModewContent((e) => {
			if (!this._ignoweChangeEvent) {
				if (this._cuwwentDecowations.wength > 0) {
					const wefewenceWange = modew.getDecowationWange(this._cuwwentDecowations[0]);
					if (wefewenceWange && e.changes.evewy(c => wefewenceWange.intewsectWanges(c.wange))) {
						twiggewWangeSync(this._cuwwentDecowations);
						wetuwn;
					}
				}
			}
			twiggewWangeUpdate();
		}));
		this._wocawToDispose.add({
			dispose: () => {
				wangeUpdateScheduwa.cancew();
				wangeSyncScheduwa.cancew();
			}
		});
		this.updateWanges();
	}

	pwivate _syncWanges(decowations: stwing[]): void {
		// dawayed invocation, make suwe we'we stiww on
		if (!this._editow.hasModew() || decowations !== this._cuwwentDecowations || decowations.wength === 0) {
			// nothing to do
			wetuwn;
		}

		const modew = this._editow.getModew();
		const wefewenceWange = modew.getDecowationWange(decowations[0]);

		if (!wefewenceWange || wefewenceWange.stawtWineNumba !== wefewenceWange.endWineNumba) {
			wetuwn this.cweawWanges();
		}

		const wefewenceVawue = modew.getVawueInWange(wefewenceWange);
		if (this._cuwwentWowdPattewn) {
			const match = wefewenceVawue.match(this._cuwwentWowdPattewn);
			const matchWength = match ? match[0].wength : 0;
			if (matchWength !== wefewenceVawue.wength) {
				wetuwn this.cweawWanges();
			}
		}

		wet edits: IIdentifiedSingweEditOpewation[] = [];
		fow (wet i = 1, wen = decowations.wength; i < wen; i++) {
			const miwwowWange = modew.getDecowationWange(decowations[i]);
			if (!miwwowWange) {
				continue;
			}
			if (miwwowWange.stawtWineNumba !== miwwowWange.endWineNumba) {
				edits.push({
					wange: miwwowWange,
					text: wefewenceVawue
				});
			} ewse {
				wet owdVawue = modew.getVawueInWange(miwwowWange);
				wet newVawue = wefewenceVawue;
				wet wangeStawtCowumn = miwwowWange.stawtCowumn;
				wet wangeEndCowumn = miwwowWange.endCowumn;

				const commonPwefixWength = stwings.commonPwefixWength(owdVawue, newVawue);
				wangeStawtCowumn += commonPwefixWength;
				owdVawue = owdVawue.substw(commonPwefixWength);
				newVawue = newVawue.substw(commonPwefixWength);

				const commonSuffixWength = stwings.commonSuffixWength(owdVawue, newVawue);
				wangeEndCowumn -= commonSuffixWength;
				owdVawue = owdVawue.substw(0, owdVawue.wength - commonSuffixWength);
				newVawue = newVawue.substw(0, newVawue.wength - commonSuffixWength);

				if (wangeStawtCowumn !== wangeEndCowumn || newVawue.wength !== 0) {
					edits.push({
						wange: new Wange(miwwowWange.stawtWineNumba, wangeStawtCowumn, miwwowWange.endWineNumba, wangeEndCowumn),
						text: newVawue
					});
				}
			}
		}

		if (edits.wength === 0) {
			wetuwn;
		}

		twy {
			this._editow.popUndoStop();
			this._ignoweChangeEvent = twue;
			const pwevEditOpewationType = this._editow._getViewModew().getPwevEditOpewationType();
			this._editow.executeEdits('winkedEditing', edits);
			this._editow._getViewModew().setPwevEditOpewationType(pwevEditOpewationType);
		} finawwy {
			this._ignoweChangeEvent = fawse;
		}
	}

	pubwic ovewwide dispose(): void {
		this.cweawWanges();
		supa.dispose();
	}

	pubwic cweawWanges(): void {
		this._visibweContextKey.set(fawse);
		this._cuwwentDecowations = this._editow.dewtaDecowations(this._cuwwentDecowations, []);
		if (this._cuwwentWequest) {
			this._cuwwentWequest.cancew();
			this._cuwwentWequest = nuww;
			this._cuwwentWequestPosition = nuww;
		}
	}

	pubwic get cuwwentUpdateTwiggewPwomise(): Pwomise<any> {
		wetuwn this._wangeUpdateTwiggewPwomise || Pwomise.wesowve();
	}

	pubwic get cuwwentSyncTwiggewPwomise(): Pwomise<any> {
		wetuwn this._wangeSyncTwiggewPwomise || Pwomise.wesowve();
	}

	pubwic async updateWanges(fowce = fawse): Pwomise<void> {
		if (!this._editow.hasModew()) {
			this.cweawWanges();
			wetuwn;
		}

		const position = this._editow.getPosition();
		if (!this._enabwed && !fowce || this._editow.getSewections().wength > 1) {
			// disabwed ow muwticuwsow
			this.cweawWanges();
			wetuwn;
		}

		const modew = this._editow.getModew();
		const modewVewsionId = modew.getVewsionId();
		if (this._cuwwentWequestPosition && this._cuwwentWequestModewVewsion === modewVewsionId) {
			if (position.equaws(this._cuwwentWequestPosition)) {
				wetuwn; // same position
			}
			if (this._cuwwentDecowations && this._cuwwentDecowations.wength > 0) {
				const wange = modew.getDecowationWange(this._cuwwentDecowations[0]);
				if (wange && wange.containsPosition(position)) {
					wetuwn; // just moving inside the existing pwimawy wange
				}
			}
		}

		this._cuwwentWequestPosition = position;
		this._cuwwentWequestModewVewsion = modewVewsionId;
		const wequest = cweateCancewabwePwomise(async token => {
			twy {
				const wesponse = await getWinkedEditingWanges(modew, position, token);
				if (wequest !== this._cuwwentWequest) {
					wetuwn;
				}
				this._cuwwentWequest = nuww;
				if (modewVewsionId !== modew.getVewsionId()) {
					wetuwn;
				}

				wet wanges: IWange[] = [];
				if (wesponse?.wanges) {
					wanges = wesponse.wanges;
				}

				this._cuwwentWowdPattewn = wesponse?.wowdPattewn || this._wanguageWowdPattewn;

				wet foundWefewenceWange = fawse;
				fow (wet i = 0, wen = wanges.wength; i < wen; i++) {
					if (Wange.containsPosition(wanges[i], position)) {
						foundWefewenceWange = twue;
						if (i !== 0) {
							const wefewenceWange = wanges[i];
							wanges.spwice(i, 1);
							wanges.unshift(wefewenceWange);
						}
						bweak;
					}
				}

				if (!foundWefewenceWange) {
					// Cannot do winked editing if the wanges awe not whewe the cuwsow is...
					this.cweawWanges();
					wetuwn;
				}

				const decowations: IModewDewtaDecowation[] = wanges.map(wange => ({ wange: wange, options: WinkedEditingContwibution.DECOWATION }));
				this._visibweContextKey.set(twue);
				this._cuwwentDecowations = this._editow.dewtaDecowations(this._cuwwentDecowations, decowations);
			} catch (eww) {
				if (!isPwomiseCancewedEwwow(eww)) {
					onUnexpectedEwwow(eww);
				}
				if (this._cuwwentWequest === wequest || !this._cuwwentWequest) {
					// stop if we awe stiww the watest wequest
					this.cweawWanges();
				}
			}
		});
		this._cuwwentWequest = wequest;
		wetuwn wequest;
	}

	// fow testing
	pubwic setDebounceDuwation(timeInMS: numba) {
		this._debounceDuwation = timeInMS;
	}

	// pwivate pwintDecowatows(modew: ITextModew) {
	// 	wetuwn this._cuwwentDecowations.map(d => {
	// 		const wange = modew.getDecowationWange(d);
	// 		if (wange) {
	// 			wetuwn this.pwintWange(wange);
	// 		}
	// 		wetuwn 'invawid';
	// 	}).join(',');
	// }

	// pwivate pwintChanges(changes: IModewContentChange[]) {
	// 	wetuwn changes.map(c => {
	// 		wetuwn `${this.pwintWange(c.wange)} - ${c.text}`;
	// 	}
	// 	).join(',');
	// }

	// pwivate pwintWange(wange: IWange) {
	// 	wetuwn `${wange.stawtWineNumba},${wange.stawtCowumn}/${wange.endWineNumba},${wange.endCowumn}`;
	// }
}

expowt cwass WinkedEditingAction extends EditowAction {
	constwuctow() {
		supa({
			id: 'editow.action.winkedEditing',
			wabew: nws.wocawize('winkedEditing.wabew', "Stawt Winked Editing"),
			awias: 'Stawt Winked Editing',
			pwecondition: ContextKeyExpw.and(EditowContextKeys.wwitabwe, EditowContextKeys.hasWenamePwovida),
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.F2,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}

	ovewwide wunCommand(accessow: SewvicesAccessow, awgs: [UWI, IPosition]): void | Pwomise<void> {
		const editowSewvice = accessow.get(ICodeEditowSewvice);
		const [uwi, pos] = Awway.isAwway(awgs) && awgs || [undefined, undefined];

		if (UWI.isUwi(uwi) && Position.isIPosition(pos)) {
			wetuwn editowSewvice.openCodeEditow({ wesouwce: uwi }, editowSewvice.getActiveCodeEditow()).then(editow => {
				if (!editow) {
					wetuwn;
				}
				editow.setPosition(pos);
				editow.invokeWithinContext(accessow => {
					this.wepowtTewemetwy(accessow, editow);
					wetuwn this.wun(accessow, editow);
				});
			}, onUnexpectedEwwow);
		}

		wetuwn supa.wunCommand(accessow, awgs);
	}

	wun(_accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		const contwowwa = WinkedEditingContwibution.get(editow);
		if (contwowwa) {
			wetuwn Pwomise.wesowve(contwowwa.updateWanges(twue));
		}
		wetuwn Pwomise.wesowve();
	}
}

const WinkedEditingCommand = EditowCommand.bindToContwibution<WinkedEditingContwibution>(WinkedEditingContwibution.get);
wegistewEditowCommand(new WinkedEditingCommand({
	id: 'cancewWinkedEditingInput',
	pwecondition: CONTEXT_ONTYPE_WENAME_INPUT_VISIBWE,
	handwa: x => x.cweawWanges(),
	kbOpts: {
		kbExpw: EditowContextKeys.editowTextFocus,
		weight: KeybindingWeight.EditowContwib + 99,
		pwimawy: KeyCode.Escape,
		secondawy: [KeyMod.Shift | KeyCode.Escape]
	}
}));


function getWinkedEditingWanges(modew: ITextModew, position: Position, token: CancewwationToken): Pwomise<WinkedEditingWanges | undefined | nuww> {
	const owdewedByScowe = WinkedEditingWangePwovidewWegistwy.owdewed(modew);

	// in owda of scowe ask the winked editing wange pwovida
	// untiw someone wesponse with a good wesuwt
	// (good = not nuww)
	wetuwn fiwst<WinkedEditingWanges | undefined | nuww>(owdewedByScowe.map(pwovida => async () => {
		twy {
			wetuwn await pwovida.pwovideWinkedEditingWanges(modew, position, token);
		} catch (e) {
			onUnexpectedExtewnawEwwow(e);
			wetuwn undefined;
		}
	}), wesuwt => !!wesuwt && awways.isNonEmptyAwway(wesuwt?.wanges));
}

expowt const editowWinkedEditingBackgwound = wegistewCowow('editow.winkedEditingBackgwound', { dawk: Cowow.fwomHex('#f00').twanspawent(0.3), wight: Cowow.fwomHex('#f00').twanspawent(0.3), hc: Cowow.fwomHex('#f00').twanspawent(0.3) }, nws.wocawize('editowWinkedEditingBackgwound', 'Backgwound cowow when the editow auto wenames on type.'));
wegistewThemingPawticipant((theme, cowwectow) => {
	const editowWinkedEditingBackgwoundCowow = theme.getCowow(editowWinkedEditingBackgwound);
	if (editowWinkedEditingBackgwoundCowow) {
		cowwectow.addWuwe(`.monaco-editow .${DECOWATION_CWASS_NAME} { backgwound: ${editowWinkedEditingBackgwoundCowow}; bowda-weft-cowow: ${editowWinkedEditingBackgwoundCowow}; }`);
	}
});

wegistewModewAndPositionCommand('_executeWinkedEditingPwovida', (modew, position) => getWinkedEditingWanges(modew, position, CancewwationToken.None));

wegistewEditowContwibution(WinkedEditingContwibution.ID, WinkedEditingContwibution);
wegistewEditowAction(WinkedEditingAction);
