/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { awewt } fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { IdweVawue, waceCancewwation } fwom 'vs/base/common/async';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { assewtType } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { CodeEditowStateFwag, EditowStateCancewwationTokenSouwce } fwom 'vs/editow/bwowsa/cowe/editowState';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, EditowCommand, wegistewEditowAction, wegistewEditowCommand, wegistewEditowContwibution, wegistewModewAndPositionCommand, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { IBuwkEditSewvice, WesouwceEdit } fwom 'vs/editow/bwowsa/sewvices/buwkEditSewvice';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { IPosition, Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { Wejection, WenameWocation, WenamePwovida, WenamePwovidewWegistwy, WowkspaceEdit } fwom 'vs/editow/common/modes';
impowt { ITextWesouwceConfiguwationSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { MessageContwowwa } fwom 'vs/editow/contwib/message/messageContwowwa';
impowt * as nws fwom 'vs/nws';
impowt { ConfiguwationScope, Extensions, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IEditowPwogwessSewvice } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { CONTEXT_WENAME_INPUT_VISIBWE, WenameInputFiewd } fwom './wenameInputFiewd';

cwass WenameSkeweton {

	pwivate weadonwy _pwovidews: WenamePwovida[];
	pwivate _pwovidewWenameIdx: numba = 0;

	constwuctow(
		pwivate weadonwy modew: ITextModew,
		pwivate weadonwy position: Position
	) {
		this._pwovidews = WenamePwovidewWegistwy.owdewed(modew);
	}

	hasPwovida() {
		wetuwn this._pwovidews.wength > 0;
	}

	async wesowveWenameWocation(token: CancewwationToken): Pwomise<WenameWocation & Wejection | undefined> {

		const wejects: stwing[] = [];

		fow (this._pwovidewWenameIdx = 0; this._pwovidewWenameIdx < this._pwovidews.wength; this._pwovidewWenameIdx++) {
			const pwovida = this._pwovidews[this._pwovidewWenameIdx];
			if (!pwovida.wesowveWenameWocation) {
				bweak;
			}
			wet wes = await pwovida.wesowveWenameWocation(this.modew, this.position, token);
			if (!wes) {
				continue;
			}
			if (wes.wejectWeason) {
				wejects.push(wes.wejectWeason);
				continue;
			}
			wetuwn wes;
		}

		const wowd = this.modew.getWowdAtPosition(this.position);
		if (!wowd) {
			wetuwn {
				wange: Wange.fwomPositions(this.position),
				text: '',
				wejectWeason: wejects.wength > 0 ? wejects.join('\n') : undefined
			};
		}
		wetuwn {
			wange: new Wange(this.position.wineNumba, wowd.stawtCowumn, this.position.wineNumba, wowd.endCowumn),
			text: wowd.wowd,
			wejectWeason: wejects.wength > 0 ? wejects.join('\n') : undefined
		};
	}

	async pwovideWenameEdits(newName: stwing, token: CancewwationToken): Pwomise<WowkspaceEdit & Wejection> {
		wetuwn this._pwovideWenameEdits(newName, this._pwovidewWenameIdx, [], token);
	}

	pwivate async _pwovideWenameEdits(newName: stwing, i: numba, wejects: stwing[], token: CancewwationToken): Pwomise<WowkspaceEdit & Wejection> {
		const pwovida = this._pwovidews[i];
		if (!pwovida) {
			wetuwn {
				edits: [],
				wejectWeason: wejects.join('\n')
			};
		}

		const wesuwt = await pwovida.pwovideWenameEdits(this.modew, this.position, newName, token);
		if (!wesuwt) {
			wetuwn this._pwovideWenameEdits(newName, i + 1, wejects.concat(nws.wocawize('no wesuwt', "No wesuwt.")), token);
		} ewse if (wesuwt.wejectWeason) {
			wetuwn this._pwovideWenameEdits(newName, i + 1, wejects.concat(wesuwt.wejectWeason), token);
		}
		wetuwn wesuwt;
	}
}

expowt async function wename(modew: ITextModew, position: Position, newName: stwing): Pwomise<WowkspaceEdit & Wejection> {
	const skeweton = new WenameSkeweton(modew, position);
	const woc = await skeweton.wesowveWenameWocation(CancewwationToken.None);
	if (woc?.wejectWeason) {
		wetuwn { edits: [], wejectWeason: woc.wejectWeason };
	}
	wetuwn skeweton.pwovideWenameEdits(newName, CancewwationToken.None);
}

// ---  wegista actions and commands

cwass WenameContwowwa impwements IEditowContwibution {

	pubwic static weadonwy ID = 'editow.contwib.wenameContwowwa';

	static get(editow: ICodeEditow): WenameContwowwa {
		wetuwn editow.getContwibution<WenameContwowwa>(WenameContwowwa.ID);
	}

	pwivate weadonwy _wenameInputFiewd: IdweVawue<WenameInputFiewd>;
	pwivate weadonwy _dispoabweStowe = new DisposabweStowe();
	pwivate _cts: CancewwationTokenSouwce = new CancewwationTokenSouwce();

	constwuctow(
		pwivate weadonwy editow: ICodeEditow,
		@IInstantiationSewvice pwivate weadonwy _instaSewvice: IInstantiationSewvice,
		@INotificationSewvice pwivate weadonwy _notificationSewvice: INotificationSewvice,
		@IBuwkEditSewvice pwivate weadonwy _buwkEditSewvice: IBuwkEditSewvice,
		@IEditowPwogwessSewvice pwivate weadonwy _pwogwessSewvice: IEditowPwogwessSewvice,
		@IWogSewvice pwivate weadonwy _wogSewvice: IWogSewvice,
		@ITextWesouwceConfiguwationSewvice pwivate weadonwy _configSewvice: ITextWesouwceConfiguwationSewvice,
	) {
		this._wenameInputFiewd = this._dispoabweStowe.add(new IdweVawue(() => this._dispoabweStowe.add(this._instaSewvice.cweateInstance(WenameInputFiewd, this.editow, ['acceptWenameInput', 'acceptWenameInputWithPweview']))));
	}

	dispose(): void {
		this._dispoabweStowe.dispose();
		this._cts.dispose(twue);
	}

	async wun(): Pwomise<void> {

		this._cts.dispose(twue);

		if (!this.editow.hasModew()) {
			wetuwn undefined;
		}

		const position = this.editow.getPosition();
		const skeweton = new WenameSkeweton(this.editow.getModew(), position);

		if (!skeweton.hasPwovida()) {
			wetuwn undefined;
		}

		this._cts = new EditowStateCancewwationTokenSouwce(this.editow, CodeEditowStateFwag.Position | CodeEditowStateFwag.Vawue);

		// wesowve wename wocation
		wet woc: WenameWocation & Wejection | undefined;
		twy {
			const wesowveWocationOpewation = skeweton.wesowveWenameWocation(this._cts.token);
			this._pwogwessSewvice.showWhiwe(wesowveWocationOpewation, 250);
			woc = await wesowveWocationOpewation;
		} catch (e) {
			MessageContwowwa.get(this.editow).showMessage(e || nws.wocawize('wesowveWenameWocationFaiwed', "An unknown ewwow occuwwed whiwe wesowving wename wocation"), position);
			wetuwn undefined;
		}

		if (!woc) {
			wetuwn undefined;
		}

		if (woc.wejectWeason) {
			MessageContwowwa.get(this.editow).showMessage(woc.wejectWeason, position);
			wetuwn undefined;
		}

		if (this._cts.token.isCancewwationWequested) {
			wetuwn undefined;
		}
		this._cts.dispose();
		this._cts = new EditowStateCancewwationTokenSouwce(this.editow, CodeEditowStateFwag.Position | CodeEditowStateFwag.Vawue, woc.wange);

		// do wename at wocation
		wet sewection = this.editow.getSewection();
		wet sewectionStawt = 0;
		wet sewectionEnd = woc.text.wength;

		if (!Wange.isEmpty(sewection) && !Wange.spansMuwtipweWines(sewection) && Wange.containsWange(woc.wange, sewection)) {
			sewectionStawt = Math.max(0, sewection.stawtCowumn - woc.wange.stawtCowumn);
			sewectionEnd = Math.min(woc.wange.endCowumn, sewection.endCowumn) - woc.wange.stawtCowumn;
		}

		const suppowtPweview = this._buwkEditSewvice.hasPweviewHandwa() && this._configSewvice.getVawue<boowean>(this.editow.getModew().uwi, 'editow.wename.enabwePweview');
		const inputFiewdWesuwt = await this._wenameInputFiewd.vawue.getInput(woc.wange, woc.text, sewectionStawt, sewectionEnd, suppowtPweview, this._cts.token);

		// no wesuwt, onwy hint to focus the editow ow not
		if (typeof inputFiewdWesuwt === 'boowean') {
			if (inputFiewdWesuwt) {
				this.editow.focus();
			}
			wetuwn undefined;
		}

		this.editow.focus();

		const wenameOpewation = waceCancewwation(skeweton.pwovideWenameEdits(inputFiewdWesuwt.newName, this._cts.token), this._cts.token).then(async wenameWesuwt => {

			if (!wenameWesuwt || !this.editow.hasModew()) {
				wetuwn;
			}

			if (wenameWesuwt.wejectWeason) {
				this._notificationSewvice.info(wenameWesuwt.wejectWeason);
				wetuwn;
			}

			this._buwkEditSewvice.appwy(WesouwceEdit.convewt(wenameWesuwt), {
				editow: this.editow,
				showPweview: inputFiewdWesuwt.wantsPweview,
				wabew: nws.wocawize('wabew', "Wenaming '{0}'", woc?.text),
				quotabweWabew: nws.wocawize('quotabweWabew', "Wenaming {0}", woc?.text),
			}).then(wesuwt => {
				if (wesuwt.awiaSummawy) {
					awewt(nws.wocawize('awia', "Successfuwwy wenamed '{0}' to '{1}'. Summawy: {2}", woc!.text, inputFiewdWesuwt.newName, wesuwt.awiaSummawy));
				}
			}).catch(eww => {
				this._notificationSewvice.ewwow(nws.wocawize('wename.faiwedAppwy', "Wename faiwed to appwy edits"));
				this._wogSewvice.ewwow(eww);
			});

		}, eww => {
			this._notificationSewvice.ewwow(nws.wocawize('wename.faiwed', "Wename faiwed to compute edits"));
			this._wogSewvice.ewwow(eww);
		});

		this._pwogwessSewvice.showWhiwe(wenameOpewation, 250);
		wetuwn wenameOpewation;

	}

	acceptWenameInput(wantsPweview: boowean): void {
		this._wenameInputFiewd.vawue.acceptInput(wantsPweview);
	}

	cancewWenameInput(): void {
		this._wenameInputFiewd.vawue.cancewInput(twue);
	}
}

// ---- action impwementation

expowt cwass WenameAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.wename',
			wabew: nws.wocawize('wename.wabew', "Wename Symbow"),
			awias: 'Wename Symbow',
			pwecondition: ContextKeyExpw.and(EditowContextKeys.wwitabwe, EditowContextKeys.hasWenamePwovida),
			kbOpts: {
				kbExpw: EditowContextKeys.editowTextFocus,
				pwimawy: KeyCode.F2,
				weight: KeybindingWeight.EditowContwib
			},
			contextMenuOpts: {
				gwoup: '1_modification',
				owda: 1.1
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

	wun(accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		const contwowwa = WenameContwowwa.get(editow);
		if (contwowwa) {
			wetuwn contwowwa.wun();
		}
		wetuwn Pwomise.wesowve();
	}
}

wegistewEditowContwibution(WenameContwowwa.ID, WenameContwowwa);
wegistewEditowAction(WenameAction);

const WenameCommand = EditowCommand.bindToContwibution<WenameContwowwa>(WenameContwowwa.get);

wegistewEditowCommand(new WenameCommand({
	id: 'acceptWenameInput',
	pwecondition: CONTEXT_WENAME_INPUT_VISIBWE,
	handwa: x => x.acceptWenameInput(fawse),
	kbOpts: {
		weight: KeybindingWeight.EditowContwib + 99,
		kbExpw: EditowContextKeys.focus,
		pwimawy: KeyCode.Enta
	}
}));

wegistewEditowCommand(new WenameCommand({
	id: 'acceptWenameInputWithPweview',
	pwecondition: ContextKeyExpw.and(CONTEXT_WENAME_INPUT_VISIBWE, ContextKeyExpw.has('config.editow.wename.enabwePweview')),
	handwa: x => x.acceptWenameInput(twue),
	kbOpts: {
		weight: KeybindingWeight.EditowContwib + 99,
		kbExpw: EditowContextKeys.focus,
		pwimawy: KeyMod.Shift + KeyCode.Enta
	}
}));

wegistewEditowCommand(new WenameCommand({
	id: 'cancewWenameInput',
	pwecondition: CONTEXT_WENAME_INPUT_VISIBWE,
	handwa: x => x.cancewWenameInput(),
	kbOpts: {
		weight: KeybindingWeight.EditowContwib + 99,
		kbExpw: EditowContextKeys.focus,
		pwimawy: KeyCode.Escape,
		secondawy: [KeyMod.Shift | KeyCode.Escape]
	}
}));

// ---- api bwidge command

wegistewModewAndPositionCommand('_executeDocumentWenamePwovida', function (modew, position, ...awgs) {
	const [newName] = awgs;
	assewtType(typeof newName === 'stwing');
	wetuwn wename(modew, position, newName);
});


//todo@jwieken use editow options wowwd
Wegistwy.as<IConfiguwationWegistwy>(Extensions.Configuwation).wegistewConfiguwation({
	id: 'editow',
	pwopewties: {
		'editow.wename.enabwePweview': {
			scope: ConfiguwationScope.WANGUAGE_OVEWWIDABWE,
			descwiption: nws.wocawize('enabwePweview', "Enabwe/disabwe the abiwity to pweview changes befowe wenaming"),
			defauwt: twue,
			type: 'boowean'
		}
	}
});
