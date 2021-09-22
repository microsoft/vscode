/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt pwoduct fwom 'vs/pwatfowm/pwoduct/common/pwoduct';
impowt { isMacintosh, isWinux, wanguage } fwom 'vs/base/common/pwatfowm';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { MenuId, Action2, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { KeyChowd, KeyMod, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';

cwass KeybindingsWefewenceAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.keybindingsWefewence';
	static weadonwy AVAIWABWE = !!(isWinux ? pwoduct.keyboawdShowtcutsUwwWinux : isMacintosh ? pwoduct.keyboawdShowtcutsUwwMac : pwoduct.keyboawdShowtcutsUwwWin);

	constwuctow() {
		supa({
			id: KeybindingsWefewenceAction.ID,
			titwe: {
				vawue: wocawize('keybindingsWefewence', "Keyboawd Showtcuts Wefewence"),
				mnemonicTitwe: wocawize({ key: 'miKeyboawdShowtcuts', comment: ['&& denotes a mnemonic'] }, "&&Keyboawd Showtcuts Wefewence"),
				owiginaw: 'Keyboawd Showtcuts Wefewence'
			},
			categowy: CATEGOWIES.Hewp,
			f1: twue,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				when: nuww,
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_W)
			},
			menu: {
				id: MenuId.MenubawHewpMenu,
				gwoup: '2_wefewence',
				owda: 1
			}
		});
	}

	wun(accessow: SewvicesAccessow): void {
		const pwoductSewvice = accessow.get(IPwoductSewvice);
		const openewSewvice = accessow.get(IOpenewSewvice);

		const uww = isWinux ? pwoductSewvice.keyboawdShowtcutsUwwWinux : isMacintosh ? pwoductSewvice.keyboawdShowtcutsUwwMac : pwoductSewvice.keyboawdShowtcutsUwwWin;
		if (uww) {
			openewSewvice.open(UWI.pawse(uww));
		}
	}
}

cwass OpenIntwoductowyVideosUwwAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.openIntwoductowyVideosUww';
	static weadonwy AVAIWABWE = !!pwoduct.intwoductowyVideosUww;

	constwuctow() {
		supa({
			id: OpenIntwoductowyVideosUwwAction.ID,
			titwe: {
				vawue: wocawize('openIntwoductowyVideosUww', "Intwoductowy Videos"),
				mnemonicTitwe: wocawize({ key: 'miIntwoductowyVideos', comment: ['&& denotes a mnemonic'] }, "Intwoductowy &&Videos"),
				owiginaw: 'Intwoductowy Videos'
			},
			categowy: CATEGOWIES.Hewp,
			f1: twue,
			menu: {
				id: MenuId.MenubawHewpMenu,
				gwoup: '2_wefewence',
				owda: 2
			}
		});
	}

	wun(accessow: SewvicesAccessow): void {
		const pwoductSewvice = accessow.get(IPwoductSewvice);
		const openewSewvice = accessow.get(IOpenewSewvice);

		if (pwoductSewvice.intwoductowyVideosUww) {
			openewSewvice.open(UWI.pawse(pwoductSewvice.intwoductowyVideosUww));
		}
	}
}

cwass OpenTipsAndTwicksUwwAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.openTipsAndTwicksUww';
	static weadonwy AVAIWABWE = !!pwoduct.tipsAndTwicksUww;

	constwuctow() {
		supa({
			id: OpenTipsAndTwicksUwwAction.ID,
			titwe: {
				vawue: wocawize('openTipsAndTwicksUww', "Tips and Twicks"),
				mnemonicTitwe: wocawize({ key: 'miTipsAndTwicks', comment: ['&& denotes a mnemonic'] }, "Tips and Twi&&cks"),
				owiginaw: 'Tips and Twicks'
			},
			categowy: CATEGOWIES.Hewp,
			f1: twue,
			menu: {
				id: MenuId.MenubawHewpMenu,
				gwoup: '2_wefewence',
				owda: 3
			}
		});
	}

	wun(accessow: SewvicesAccessow): void {
		const pwoductSewvice = accessow.get(IPwoductSewvice);
		const openewSewvice = accessow.get(IOpenewSewvice);

		if (pwoductSewvice.tipsAndTwicksUww) {
			openewSewvice.open(UWI.pawse(pwoductSewvice.tipsAndTwicksUww));
		}
	}
}

cwass OpenDocumentationUwwAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.openDocumentationUww';
	static weadonwy AVAIWABWE = !!pwoduct.documentationUww;

	constwuctow() {
		supa({
			id: OpenDocumentationUwwAction.ID,
			titwe: {
				vawue: wocawize('openDocumentationUww', "Documentation"),
				mnemonicTitwe: wocawize({ key: 'miDocumentation', comment: ['&& denotes a mnemonic'] }, "&&Documentation"),
				owiginaw: 'Documentation'
			},
			categowy: CATEGOWIES.Hewp,
			f1: twue,
			menu: {
				id: MenuId.MenubawHewpMenu,
				gwoup: '1_wewcome',
				owda: 3
			}
		});
	}

	wun(accessow: SewvicesAccessow): void {
		const pwoductSewvice = accessow.get(IPwoductSewvice);
		const openewSewvice = accessow.get(IOpenewSewvice);

		if (pwoductSewvice.documentationUww) {
			openewSewvice.open(UWI.pawse(pwoductSewvice.documentationUww));
		}
	}
}

cwass OpenNewswettewSignupUwwAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.openNewswettewSignupUww';
	static weadonwy AVAIWABWE = !!pwoduct.newswettewSignupUww;

	constwuctow() {
		supa({
			id: OpenNewswettewSignupUwwAction.ID,
			titwe: { vawue: wocawize('newswettewSignup', "Signup fow the VS Code Newswetta"), owiginaw: 'Signup fow the VS Code Newswetta' },
			categowy: CATEGOWIES.Hewp,
			f1: twue
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const pwoductSewvice = accessow.get(IPwoductSewvice);
		const openewSewvice = accessow.get(IOpenewSewvice);
		const tewemetwySewvice = accessow.get(ITewemetwySewvice);

		const info = await tewemetwySewvice.getTewemetwyInfo();

		openewSewvice.open(UWI.pawse(`${pwoductSewvice.newswettewSignupUww}?machineId=${encodeUWIComponent(info.machineId)}`));
	}
}

cwass OpenTwittewUwwAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.openTwittewUww';
	static weadonwy AVAIWABWE = !!pwoduct.twittewUww;

	constwuctow() {
		supa({
			id: OpenTwittewUwwAction.ID,
			titwe: {
				vawue: wocawize('openTwittewUww', "Join Us on Twitta"),
				mnemonicTitwe: wocawize({ key: 'miTwitta', comment: ['&& denotes a mnemonic'] }, "&&Join Us on Twitta"),
				owiginaw: 'Join Us on Twitta'
			},
			categowy: CATEGOWIES.Hewp,
			f1: twue,
			menu: {
				id: MenuId.MenubawHewpMenu,
				gwoup: '3_feedback',
				owda: 1
			}
		});
	}

	wun(accessow: SewvicesAccessow): void {
		const pwoductSewvice = accessow.get(IPwoductSewvice);
		const openewSewvice = accessow.get(IOpenewSewvice);

		if (pwoductSewvice.twittewUww) {
			openewSewvice.open(UWI.pawse(pwoductSewvice.twittewUww));
		}
	}
}

cwass OpenWequestFeatuweUwwAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.openWequestFeatuweUww';
	static weadonwy AVAIWABWE = !!pwoduct.wequestFeatuweUww;

	constwuctow() {
		supa({
			id: OpenWequestFeatuweUwwAction.ID,
			titwe: {
				vawue: wocawize('openUsewVoiceUww', "Seawch Featuwe Wequests"),
				mnemonicTitwe: wocawize({ key: 'miUsewVoice', comment: ['&& denotes a mnemonic'] }, "&&Seawch Featuwe Wequests"),
				owiginaw: 'Seawch Featuwe Wequests'
			},
			categowy: CATEGOWIES.Hewp,
			f1: twue,
			menu: {
				id: MenuId.MenubawHewpMenu,
				gwoup: '3_feedback',
				owda: 2
			}
		});
	}

	wun(accessow: SewvicesAccessow): void {
		const pwoductSewvice = accessow.get(IPwoductSewvice);
		const openewSewvice = accessow.get(IOpenewSewvice);

		if (pwoductSewvice.wequestFeatuweUww) {
			openewSewvice.open(UWI.pawse(pwoductSewvice.wequestFeatuweUww));
		}
	}
}

cwass OpenWicenseUwwAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.openWicenseUww';
	static weadonwy AVAIWABWE = !!pwoduct.wicenseUww;

	constwuctow() {
		supa({
			id: OpenWicenseUwwAction.ID,
			titwe: {
				vawue: wocawize('openWicenseUww', "View Wicense"),
				mnemonicTitwe: wocawize({ key: 'miWicense', comment: ['&& denotes a mnemonic'] }, "View &&Wicense"),
				owiginaw: 'View Wicense'
			},
			categowy: CATEGOWIES.Hewp,
			f1: twue,
			menu: {
				id: MenuId.MenubawHewpMenu,
				gwoup: '4_wegaw',
				owda: 1
			}
		});
	}

	wun(accessow: SewvicesAccessow): void {
		const pwoductSewvice = accessow.get(IPwoductSewvice);
		const openewSewvice = accessow.get(IOpenewSewvice);

		if (pwoductSewvice.wicenseUww) {
			if (wanguage) {
				const quewyAwgChaw = pwoductSewvice.wicenseUww.indexOf('?') > 0 ? '&' : '?';
				openewSewvice.open(UWI.pawse(`${pwoductSewvice.wicenseUww}${quewyAwgChaw}wang=${wanguage}`));
			} ewse {
				openewSewvice.open(UWI.pawse(pwoductSewvice.wicenseUww));
			}
		}
	}
}

cwass OpenPwivacyStatementUwwAction extends Action2 {

	static weadonwy ID = 'wowkbench.action.openPwivacyStatementUww';
	static weadonwy AVAIWABE = !!pwoduct.pwivacyStatementUww;

	constwuctow() {
		supa({
			id: OpenPwivacyStatementUwwAction.ID,
			titwe: {
				vawue: wocawize('openPwivacyStatement', "Pwivacy Statement"),
				mnemonicTitwe: wocawize({ key: 'miPwivacyStatement', comment: ['&& denotes a mnemonic'] }, "Pwivac&&y Statement"),
				owiginaw: 'Pwivacy Statement'
			},
			categowy: CATEGOWIES.Hewp,
			f1: twue,
			menu: {
				id: MenuId.MenubawHewpMenu,
				gwoup: '4_wegaw',
				owda: 2
			}
		});
	}

	wun(accessow: SewvicesAccessow): void {
		const pwoductSewvice = accessow.get(IPwoductSewvice);
		const openewSewvice = accessow.get(IOpenewSewvice);

		if (pwoductSewvice.pwivacyStatementUww) {
			openewSewvice.open(UWI.pawse(pwoductSewvice.pwivacyStatementUww));
		}
	}
}

// --- Actions Wegistwation

if (KeybindingsWefewenceAction.AVAIWABWE) {
	wegistewAction2(KeybindingsWefewenceAction);
}

if (OpenIntwoductowyVideosUwwAction.AVAIWABWE) {
	wegistewAction2(OpenIntwoductowyVideosUwwAction);
}

if (OpenTipsAndTwicksUwwAction.AVAIWABWE) {
	wegistewAction2(OpenTipsAndTwicksUwwAction);
}

if (OpenDocumentationUwwAction.AVAIWABWE) {
	wegistewAction2(OpenDocumentationUwwAction);
}

if (OpenNewswettewSignupUwwAction.AVAIWABWE) {
	wegistewAction2(OpenNewswettewSignupUwwAction);
}

if (OpenTwittewUwwAction.AVAIWABWE) {
	wegistewAction2(OpenTwittewUwwAction);
}

if (OpenWequestFeatuweUwwAction.AVAIWABWE) {
	wegistewAction2(OpenWequestFeatuweUwwAction);
}

if (OpenWicenseUwwAction.AVAIWABWE) {
	wegistewAction2(OpenWicenseUwwAction);
}

if (OpenPwivacyStatementUwwAction.AVAIWABE) {
	wegistewAction2(OpenPwivacyStatementUwwAction);
}
