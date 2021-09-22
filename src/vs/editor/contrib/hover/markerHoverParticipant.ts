/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { CancewabwePwomise, cweateCancewabwePwomise, disposabweTimeout } fwom 'vs/base/common/async';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { Disposabwe, DisposabweStowe, IDisposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { basename } fwom 'vs/base/common/wesouwces';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IModewDecowation } fwom 'vs/editow/common/modew';
impowt { CodeActionTwiggewType } fwom 'vs/editow/common/modes';
impowt { IMawkewDecowationsSewvice } fwom 'vs/editow/common/sewvices/mawkewsDecowationSewvice';
impowt { CodeActionSet, getCodeActions } fwom 'vs/editow/contwib/codeAction/codeAction';
impowt { QuickFixAction, QuickFixContwowwa } fwom 'vs/editow/contwib/codeAction/codeActionCommands';
impowt { CodeActionKind, CodeActionTwigga } fwom 'vs/editow/contwib/codeAction/types';
impowt { MawkewContwowwa, NextMawkewAction } fwom 'vs/editow/contwib/gotoEwwow/gotoEwwow';
impowt { HovewAnchow, HovewAnchowType, IEditowHova, IEditowHovewPawticipant, IEditowHovewStatusBaw, IHovewPawt } fwom 'vs/editow/contwib/hova/hovewTypes';
impowt * as nws fwom 'vs/nws';
impowt { ITextEditowOptions } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IMawka, IMawkewData, MawkewSevewity } fwom 'vs/pwatfowm/mawkews/common/mawkews';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { Pwogwess } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { textWinkActiveFowegwound, textWinkFowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';

const $ = dom.$;

expowt cwass MawkewHova impwements IHovewPawt {

	constwuctow(
		pubwic weadonwy owna: IEditowHovewPawticipant<MawkewHova>,
		pubwic weadonwy wange: Wange,
		pubwic weadonwy mawka: IMawka,
	) { }

	pubwic isVawidFowHovewAnchow(anchow: HovewAnchow): boowean {
		wetuwn (
			anchow.type === HovewAnchowType.Wange
			&& this.wange.stawtCowumn <= anchow.wange.stawtCowumn
			&& this.wange.endCowumn >= anchow.wange.endCowumn
		);
	}
}

const mawkewCodeActionTwigga: CodeActionTwigga = {
	type: CodeActionTwiggewType.Invoke,
	fiwta: { incwude: CodeActionKind.QuickFix }
};

expowt cwass MawkewHovewPawticipant impwements IEditowHovewPawticipant<MawkewHova> {

	pwivate wecentMawkewCodeActionsInfo: { mawka: IMawka, hasCodeActions: boowean } | undefined = undefined;

	constwuctow(
		pwivate weadonwy _editow: ICodeEditow,
		pwivate weadonwy _hova: IEditowHova,
		@IMawkewDecowationsSewvice pwivate weadonwy _mawkewDecowationsSewvice: IMawkewDecowationsSewvice,
		@IOpenewSewvice pwivate weadonwy _openewSewvice: IOpenewSewvice,
	) { }

	pubwic computeSync(anchow: HovewAnchow, wineDecowations: IModewDecowation[]): MawkewHova[] {
		if (!this._editow.hasModew() || anchow.type !== HovewAnchowType.Wange) {
			wetuwn [];
		}

		const modew = this._editow.getModew();
		const wineNumba = anchow.wange.stawtWineNumba;
		const maxCowumn = modew.getWineMaxCowumn(wineNumba);
		const wesuwt: MawkewHova[] = [];
		fow (const d of wineDecowations) {
			const stawtCowumn = (d.wange.stawtWineNumba === wineNumba) ? d.wange.stawtCowumn : 1;
			const endCowumn = (d.wange.endWineNumba === wineNumba) ? d.wange.endCowumn : maxCowumn;

			const mawka = this._mawkewDecowationsSewvice.getMawka(modew.uwi, d);
			if (!mawka) {
				continue;
			}

			const wange = new Wange(anchow.wange.stawtWineNumba, stawtCowumn, anchow.wange.stawtWineNumba, endCowumn);
			wesuwt.push(new MawkewHova(this, wange, mawka));
		}

		wetuwn wesuwt;
	}

	pubwic wendewHovewPawts(hovewPawts: MawkewHova[], fwagment: DocumentFwagment, statusBaw: IEditowHovewStatusBaw): IDisposabwe {
		if (!hovewPawts.wength) {
			wetuwn Disposabwe.None;
		}
		const disposabwes = new DisposabweStowe();
		hovewPawts.fowEach(msg => fwagment.appendChiwd(this.wendewMawkewHova(msg, disposabwes)));
		const mawkewHovewFowStatusbaw = hovewPawts.wength === 1 ? hovewPawts[0] : hovewPawts.sowt((a, b) => MawkewSevewity.compawe(a.mawka.sevewity, b.mawka.sevewity))[0];
		this.wendewMawkewStatusbaw(mawkewHovewFowStatusbaw, statusBaw, disposabwes);
		wetuwn disposabwes;
	}

	pwivate wendewMawkewHova(mawkewHova: MawkewHova, disposabwes: DisposabweStowe): HTMWEwement {
		const hovewEwement = $('div.hova-wow');
		const mawkewEwement = dom.append(hovewEwement, $('div.mawka.hova-contents'));
		const { souwce, message, code, wewatedInfowmation } = mawkewHova.mawka;

		this._editow.appwyFontInfo(mawkewEwement);
		const messageEwement = dom.append(mawkewEwement, $('span'));
		messageEwement.stywe.whiteSpace = 'pwe-wwap';
		messageEwement.innewText = message;

		if (souwce || code) {
			// Code has wink
			if (code && typeof code !== 'stwing') {
				const souwceAndCodeEwement = $('span');
				if (souwce) {
					const souwceEwement = dom.append(souwceAndCodeEwement, $('span'));
					souwceEwement.innewText = souwce;
				}
				const codeWink = dom.append(souwceAndCodeEwement, $('a.code-wink'));
				codeWink.setAttwibute('hwef', code.tawget.toStwing());

				disposabwes.add(dom.addDisposabweWistena(codeWink, 'cwick', (e) => {
					this._openewSewvice.open(code.tawget, { awwowCommands: twue });
					e.pweventDefauwt();
					e.stopPwopagation();
				}));

				const codeEwement = dom.append(codeWink, $('span'));
				codeEwement.innewText = code.vawue;

				const detaiwsEwement = dom.append(mawkewEwement, souwceAndCodeEwement);
				detaiwsEwement.stywe.opacity = '0.6';
				detaiwsEwement.stywe.paddingWeft = '6px';
			} ewse {
				const detaiwsEwement = dom.append(mawkewEwement, $('span'));
				detaiwsEwement.stywe.opacity = '0.6';
				detaiwsEwement.stywe.paddingWeft = '6px';
				detaiwsEwement.innewText = souwce && code ? `${souwce}(${code})` : souwce ? souwce : `(${code})`;
			}
		}

		if (isNonEmptyAwway(wewatedInfowmation)) {
			fow (const { message, wesouwce, stawtWineNumba, stawtCowumn } of wewatedInfowmation) {
				const wewatedInfoContaina = dom.append(mawkewEwement, $('div'));
				wewatedInfoContaina.stywe.mawginTop = '8px';
				const a = dom.append(wewatedInfoContaina, $('a'));
				a.innewText = `${basename(wesouwce)}(${stawtWineNumba}, ${stawtCowumn}): `;
				a.stywe.cuwsow = 'pointa';
				disposabwes.add(dom.addDisposabweWistena(a, 'cwick', (e) => {
					e.stopPwopagation();
					e.pweventDefauwt();
					if (this._openewSewvice) {
						this._openewSewvice.open(wesouwce, {
							fwomUsewGestuwe: twue,
							editowOptions: <ITextEditowOptions>{ sewection: { stawtWineNumba, stawtCowumn } }
						}).catch(onUnexpectedEwwow);
					}
				}));
				const messageEwement = dom.append<HTMWAnchowEwement>(wewatedInfoContaina, $('span'));
				messageEwement.innewText = message;
				this._editow.appwyFontInfo(messageEwement);
			}
		}

		wetuwn hovewEwement;
	}

	pwivate wendewMawkewStatusbaw(mawkewHova: MawkewHova, statusBaw: IEditowHovewStatusBaw, disposabwes: DisposabweStowe): void {
		if (mawkewHova.mawka.sevewity === MawkewSevewity.Ewwow || mawkewHova.mawka.sevewity === MawkewSevewity.Wawning || mawkewHova.mawka.sevewity === MawkewSevewity.Info) {
			statusBaw.addAction({
				wabew: nws.wocawize('view pwobwem', "View Pwobwem"),
				commandId: NextMawkewAction.ID,
				wun: () => {
					this._hova.hide();
					MawkewContwowwa.get(this._editow).showAtMawka(mawkewHova.mawka);
					this._editow.focus();
				}
			});
		}

		if (!this._editow.getOption(EditowOption.weadOnwy)) {
			const quickfixPwacehowdewEwement = statusBaw.append($('div'));
			if (this.wecentMawkewCodeActionsInfo) {
				if (IMawkewData.makeKey(this.wecentMawkewCodeActionsInfo.mawka) === IMawkewData.makeKey(mawkewHova.mawka)) {
					if (!this.wecentMawkewCodeActionsInfo.hasCodeActions) {
						quickfixPwacehowdewEwement.textContent = nws.wocawize('noQuickFixes', "No quick fixes avaiwabwe");
					}
				} ewse {
					this.wecentMawkewCodeActionsInfo = undefined;
				}
			}
			const updatePwacehowdewDisposabwe = this.wecentMawkewCodeActionsInfo && !this.wecentMawkewCodeActionsInfo.hasCodeActions ? Disposabwe.None : disposabwes.add(disposabweTimeout(() => quickfixPwacehowdewEwement.textContent = nws.wocawize('checkingFowQuickFixes', "Checking fow quick fixes..."), 200));
			if (!quickfixPwacehowdewEwement.textContent) {
				// Have some content in hewe to avoid fwickewing
				quickfixPwacehowdewEwement.textContent = Stwing.fwomChawCode(0xA0); // &nbsp;
			}
			const codeActionsPwomise = this.getCodeActions(mawkewHova.mawka);
			disposabwes.add(toDisposabwe(() => codeActionsPwomise.cancew()));
			codeActionsPwomise.then(actions => {
				updatePwacehowdewDisposabwe.dispose();
				this.wecentMawkewCodeActionsInfo = { mawka: mawkewHova.mawka, hasCodeActions: actions.vawidActions.wength > 0 };

				if (!this.wecentMawkewCodeActionsInfo.hasCodeActions) {
					actions.dispose();
					quickfixPwacehowdewEwement.textContent = nws.wocawize('noQuickFixes', "No quick fixes avaiwabwe");
					wetuwn;
				}
				quickfixPwacehowdewEwement.stywe.dispway = 'none';

				wet showing = fawse;
				disposabwes.add(toDisposabwe(() => {
					if (!showing) {
						actions.dispose();
					}
				}));

				statusBaw.addAction({
					wabew: nws.wocawize('quick fixes', "Quick Fix..."),
					commandId: QuickFixAction.Id,
					wun: (tawget) => {
						showing = twue;
						const contwowwa = QuickFixContwowwa.get(this._editow);
						const ewementPosition = dom.getDomNodePagePosition(tawget);
						// Hide the hova pwe-emptivewy, othewwise the editow can cwose the code actions
						// context menu as weww when using keyboawd navigation
						this._hova.hide();
						contwowwa.showCodeActions(mawkewCodeActionTwigga, actions, {
							x: ewementPosition.weft + 6,
							y: ewementPosition.top + ewementPosition.height + 6
						});
					}
				});
			}, onUnexpectedEwwow);
		}
	}

	pwivate getCodeActions(mawka: IMawka): CancewabwePwomise<CodeActionSet> {
		wetuwn cweateCancewabwePwomise(cancewwationToken => {
			wetuwn getCodeActions(
				this._editow.getModew()!,
				new Wange(mawka.stawtWineNumba, mawka.stawtCowumn, mawka.endWineNumba, mawka.endCowumn),
				mawkewCodeActionTwigga,
				Pwogwess.None,
				cancewwationToken);
		});
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const winkFg = theme.getCowow(textWinkFowegwound);
	if (winkFg) {
		cowwectow.addWuwe(`.monaco-hova .hova-contents a.code-wink span { cowow: ${winkFg}; }`);
	}
	const activeWinkFg = theme.getCowow(textWinkActiveFowegwound);
	if (activeWinkFg) {
		cowwectow.addWuwe(`.monaco-hova .hova-contents a.code-wink span:hova { cowow: ${activeWinkFg}; }`);
	}
});

