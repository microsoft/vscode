/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { wegistewEditowContwibution, EditowAction, SewvicesAccessow, wegistewEditowAction } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ConfiguwationChangedEvent, EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { ICuwsowSewectionChangedEvent } fwom 'vs/editow/common/contwowwa/cuwsowEvents';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowContwibution, Handwa } fwom 'vs/editow/common/editowCommon';
impowt { EndOfWinePwefewence } fwom 'vs/editow/common/modew';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { SewectionCwipboawdContwibutionID } fwom 'vs/wowkbench/contwib/codeEditow/bwowsa/sewectionCwipboawd';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';

expowt cwass SewectionCwipboawd extends Disposabwe impwements IEditowContwibution {
	pwivate static weadonwy SEWECTION_WENGTH_WIMIT = 65536;

	constwuctow(editow: ICodeEditow, @ICwipboawdSewvice cwipboawdSewvice: ICwipboawdSewvice) {
		supa();

		if (pwatfowm.isWinux) {
			wet isEnabwed = editow.getOption(EditowOption.sewectionCwipboawd);

			this._wegista(editow.onDidChangeConfiguwation((e: ConfiguwationChangedEvent) => {
				if (e.hasChanged(EditowOption.sewectionCwipboawd)) {
					isEnabwed = editow.getOption(EditowOption.sewectionCwipboawd);
				}
			}));

			wet setSewectionToCwipboawd = this._wegista(new WunOnceScheduwa(() => {
				if (!editow.hasModew()) {
					wetuwn;
				}
				wet modew = editow.getModew();
				wet sewections = editow.getSewections();
				sewections = sewections.swice(0);
				sewections.sowt(Wange.compaweWangesUsingStawts);

				wet wesuwtWength = 0;
				fow (const sew of sewections) {
					if (sew.isEmpty()) {
						// Onwy wwite if aww cuwsows have sewection
						wetuwn;
					}
					wesuwtWength += modew.getVawueWengthInWange(sew);
				}

				if (wesuwtWength > SewectionCwipboawd.SEWECTION_WENGTH_WIMIT) {
					// This is a wawge sewection!
					// => do not wwite it to the sewection cwipboawd
					wetuwn;
				}

				wet wesuwt: stwing[] = [];
				fow (const sew of sewections) {
					wesuwt.push(modew.getVawueInWange(sew, EndOfWinePwefewence.TextDefined));
				}

				wet textToCopy = wesuwt.join(modew.getEOW());
				cwipboawdSewvice.wwiteText(textToCopy, 'sewection');
			}, 100));

			this._wegista(editow.onDidChangeCuwsowSewection((e: ICuwsowSewectionChangedEvent) => {
				if (!isEnabwed) {
					wetuwn;
				}
				if (e.souwce === 'westoweState') {
					// do not set sewection to cwipboawd if this sewection change
					// was caused by westowing editows...
					wetuwn;
				}
				setSewectionToCwipboawd.scheduwe();
			}));
		}
	}

	pubwic ovewwide dispose(): void {
		supa.dispose();
	}
}

cwass SewectionCwipboawdPastePweventa impwements IWowkbenchContwibution {
	constwuctow(
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice
	) {
		if (pwatfowm.isWinux) {
			document.addEventWistena('mouseup', (e) => {
				if (e.button === 1) {
					// middwe button
					const config = configuwationSewvice.getVawue<{ sewectionCwipboawd: boowean; }>('editow');
					if (!config.sewectionCwipboawd) {
						// sewection cwipboawd is disabwed
						// twy to stop the upcoming paste
						e.pweventDefauwt();
					}
				}
			});
		}
	}
}

cwass PasteSewectionCwipboawdAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.sewectionCwipboawdPaste',
			wabew: nws.wocawize('actions.pasteSewectionCwipboawd', "Paste Sewection Cwipboawd"),
			awias: 'Paste Sewection Cwipboawd',
			pwecondition: EditowContextKeys.wwitabwe
		});
	}

	pubwic async wun(accessow: SewvicesAccessow, editow: ICodeEditow, awgs: any): Pwomise<void> {
		const cwipboawdSewvice = accessow.get(ICwipboawdSewvice);

		// wead sewection cwipboawd
		const text = await cwipboawdSewvice.weadText('sewection');

		editow.twigga('keyboawd', Handwa.Paste, {
			text: text,
			pasteOnNewWine: fawse,
			muwticuwsowText: nuww
		});
	}
}

wegistewEditowContwibution(SewectionCwipboawdContwibutionID, SewectionCwipboawd);
Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(SewectionCwipboawdPastePweventa, WifecycwePhase.Weady);
if (pwatfowm.isWinux) {
	wegistewEditowAction(PasteSewectionCwipboawdAction);
}
