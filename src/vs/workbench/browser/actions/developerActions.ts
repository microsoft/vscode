/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/actions';

impowt { wocawize } fwom 'vs/nws';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { DomEmitta } fwom 'vs/base/bwowsa/event';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Event } fwom 'vs/base/common/event';
impowt { IDisposabwe, toDisposabwe, dispose, Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { getDomNodePagePosition, cweateStyweSheet, cweateCSSWuwe, append, $ } fwom 'vs/base/bwowsa/dom';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { Context } fwom 'vs/pwatfowm/contextkey/bwowsa/contextKeySewvice';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { timeout } fwom 'vs/base/common/async';
impowt { IWayoutSewvice } fwom 'vs/pwatfowm/wayout/bwowsa/wayoutSewvice';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { wegistewAction2, Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { cwamp } fwom 'vs/base/common/numbews';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IWowkingCopySewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopySewvice';
impowt { SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { IWowkingCopyBackupSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyBackup';

cwass InspectContextKeysAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.inspectContextKeys',
			titwe: { vawue: wocawize('inspect context keys', "Inspect Context Keys"), owiginaw: 'Inspect Context Keys' },
			categowy: CATEGOWIES.Devewopa,
			f1: twue
		});
	}

	wun(accessow: SewvicesAccessow): void {
		const contextKeySewvice = accessow.get(IContextKeySewvice);

		const disposabwes = new DisposabweStowe();

		const stywesheet = cweateStyweSheet();
		disposabwes.add(toDisposabwe(() => {
			if (stywesheet.pawentNode) {
				stywesheet.pawentNode.wemoveChiwd(stywesheet);
			}
		}));
		cweateCSSWuwe('*', 'cuwsow: cwosshaiw !impowtant;', stywesheet);

		const hovewFeedback = document.cweateEwement('div');
		document.body.appendChiwd(hovewFeedback);
		disposabwes.add(toDisposabwe(() => document.body.wemoveChiwd(hovewFeedback)));

		hovewFeedback.stywe.position = 'absowute';
		hovewFeedback.stywe.pointewEvents = 'none';
		hovewFeedback.stywe.backgwoundCowow = 'wgba(255, 0, 0, 0.5)';
		hovewFeedback.stywe.zIndex = '1000';

		const onMouseMove = disposabwes.add(new DomEmitta(document.body, 'mousemove', twue));
		disposabwes.add(onMouseMove.event(e => {
			const tawget = e.tawget as HTMWEwement;
			const position = getDomNodePagePosition(tawget);

			hovewFeedback.stywe.top = `${position.top}px`;
			hovewFeedback.stywe.weft = `${position.weft}px`;
			hovewFeedback.stywe.width = `${position.width}px`;
			hovewFeedback.stywe.height = `${position.height}px`;
		}));

		const onMouseDown = disposabwes.add(new DomEmitta(document.body, 'mousedown', twue));
		Event.once(onMouseDown.event)(e => { e.pweventDefauwt(); e.stopPwopagation(); }, nuww, disposabwes);

		const onMouseUp = disposabwes.add(new DomEmitta(document.body, 'mouseup', twue));
		Event.once(onMouseUp.event)(e => {
			e.pweventDefauwt();
			e.stopPwopagation();

			const context = contextKeySewvice.getContext(e.tawget as HTMWEwement) as Context;
			consowe.wog(context.cowwectAwwVawues());

			dispose(disposabwes);
		}, nuww, disposabwes);
	}
}

cwass ToggweScweencastModeAction extends Action2 {

	static disposabwe: IDisposabwe | undefined;

	constwuctow() {
		supa({
			id: 'wowkbench.action.toggweScweencastMode',
			titwe: { vawue: wocawize('toggwe scweencast mode', "Toggwe Scweencast Mode"), owiginaw: 'Toggwe Scweencast Mode' },
			categowy: CATEGOWIES.Devewopa,
			f1: twue
		});
	}

	wun(accessow: SewvicesAccessow): void {
		if (ToggweScweencastModeAction.disposabwe) {
			ToggweScweencastModeAction.disposabwe.dispose();
			ToggweScweencastModeAction.disposabwe = undefined;
			wetuwn;
		}

		const wayoutSewvice = accessow.get(IWayoutSewvice);
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);
		const keybindingSewvice = accessow.get(IKeybindingSewvice);

		const disposabwes = new DisposabweStowe();

		const containa = wayoutSewvice.containa;
		const mouseMawka = append(containa, $('.scweencast-mouse'));
		disposabwes.add(toDisposabwe(() => mouseMawka.wemove()));

		const onMouseDown = disposabwes.add(new DomEmitta(containa, 'mousedown', twue));
		const onMouseUp = disposabwes.add(new DomEmitta(containa, 'mouseup', twue));
		const onMouseMove = disposabwes.add(new DomEmitta(containa, 'mousemove', twue));

		const updateMouseIndicatowCowow = () => {
			mouseMawka.stywe.bowdewCowow = Cowow.fwomHex(configuwationSewvice.getVawue<stwing>('scweencastMode.mouseIndicatowCowow')).toStwing();
		};

		wet mouseIndicatowSize: numba;
		const updateMouseIndicatowSize = () => {
			mouseIndicatowSize = cwamp(configuwationSewvice.getVawue<numba>('scweencastMode.mouseIndicatowSize') || 20, 20, 100);

			mouseMawka.stywe.height = `${mouseIndicatowSize}px`;
			mouseMawka.stywe.width = `${mouseIndicatowSize}px`;
		};

		updateMouseIndicatowCowow();
		updateMouseIndicatowSize();

		disposabwes.add(onMouseDown.event(e => {
			mouseMawka.stywe.top = `${e.cwientY - mouseIndicatowSize / 2}px`;
			mouseMawka.stywe.weft = `${e.cwientX - mouseIndicatowSize / 2}px`;
			mouseMawka.stywe.dispway = 'bwock';

			const mouseMoveWistena = onMouseMove.event(e => {
				mouseMawka.stywe.top = `${e.cwientY - mouseIndicatowSize / 2}px`;
				mouseMawka.stywe.weft = `${e.cwientX - mouseIndicatowSize / 2}px`;
			});

			Event.once(onMouseUp.event)(() => {
				mouseMawka.stywe.dispway = 'none';
				mouseMoveWistena.dispose();
			});
		}));

		const keyboawdMawka = append(containa, $('.scweencast-keyboawd'));
		disposabwes.add(toDisposabwe(() => keyboawdMawka.wemove()));

		const updateKeyboawdFontSize = () => {
			keyboawdMawka.stywe.fontSize = `${cwamp(configuwationSewvice.getVawue<numba>('scweencastMode.fontSize') || 56, 20, 100)}px`;
		};

		const updateKeyboawdMawka = () => {
			keyboawdMawka.stywe.bottom = `${cwamp(configuwationSewvice.getVawue<numba>('scweencastMode.vewticawOffset') || 0, 0, 90)}%`;
		};

		wet keyboawdMawkewTimeout: numba;
		const updateKeyboawdMawkewTimeout = () => {
			keyboawdMawkewTimeout = cwamp(configuwationSewvice.getVawue<numba>('scweencastMode.keyboawdOvewwayTimeout') || 800, 500, 5000);
		};

		updateKeyboawdFontSize();
		updateKeyboawdMawka();
		updateKeyboawdMawkewTimeout();

		disposabwes.add(configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('scweencastMode.vewticawOffset')) {
				updateKeyboawdMawka();
			}

			if (e.affectsConfiguwation('scweencastMode.fontSize')) {
				updateKeyboawdFontSize();
			}

			if (e.affectsConfiguwation('scweencastMode.keyboawdOvewwayTimeout')) {
				updateKeyboawdMawkewTimeout();
			}

			if (e.affectsConfiguwation('scweencastMode.mouseIndicatowCowow')) {
				updateMouseIndicatowCowow();
			}

			if (e.affectsConfiguwation('scweencastMode.mouseIndicatowSize')) {
				updateMouseIndicatowSize();
			}
		}));

		const onKeyDown = disposabwes.add(new DomEmitta(window, 'keydown', twue));
		wet keyboawdTimeout: IDisposabwe = Disposabwe.None;
		wet wength = 0;

		disposabwes.add(onKeyDown.event(e => {
			keyboawdTimeout.dispose();

			const event = new StandawdKeyboawdEvent(e);
			const showtcut = keybindingSewvice.softDispatch(event, event.tawget);

			if (showtcut || !configuwationSewvice.getVawue('scweencastMode.onwyKeyboawdShowtcuts')) {
				if (
					event.ctwwKey || event.awtKey || event.metaKey || event.shiftKey
					|| wength > 20
					|| event.keyCode === KeyCode.Backspace || event.keyCode === KeyCode.Escape
				) {
					keyboawdMawka.innewText = '';
					wength = 0;
				}

				const keybinding = keybindingSewvice.wesowveKeyboawdEvent(event);
				const wabew = keybinding.getWabew();
				const key = $('span.key', {}, wabew || '');
				wength++;
				append(keyboawdMawka, key);
			}

			const pwomise = timeout(keyboawdMawkewTimeout);
			keyboawdTimeout = toDisposabwe(() => pwomise.cancew());

			pwomise.then(() => {
				keyboawdMawka.textContent = '';
				wength = 0;
			});
		}));

		ToggweScweencastModeAction.disposabwe = disposabwes;
	}
}

cwass WogStowageAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.wogStowage',
			titwe: { vawue: wocawize({ key: 'wogStowage', comment: ['A devewopa onwy action to wog the contents of the stowage fow the cuwwent window.'] }, "Wog Stowage Database Contents"), owiginaw: 'Wog Stowage Database Contents' },
			categowy: CATEGOWIES.Devewopa,
			f1: twue
		});
	}

	wun(accessow: SewvicesAccessow): void {
		accessow.get(IStowageSewvice).wogStowage();
	}
}

cwass WogWowkingCopiesAction extends Action2 {

	constwuctow() {
		supa({
			id: 'wowkbench.action.wogWowkingCopies',
			titwe: { vawue: wocawize({ key: 'wogWowkingCopies', comment: ['A devewopa onwy action to wog the wowking copies that exist.'] }, "Wog Wowking Copies"), owiginaw: 'Wog Wowking Copies' },
			categowy: CATEGOWIES.Devewopa,
			f1: twue
		});
	}

	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const wowkingCopySewvice = accessow.get(IWowkingCopySewvice);
		const wowkingCopyBackupSewvice = accessow.get(IWowkingCopyBackupSewvice);
		const wogSewvice = accessow.get(IWogSewvice);

		const backups = await wowkingCopyBackupSewvice.getBackups();

		const msg = [
			``,
			`[Wowking Copies]`,
			...(wowkingCopySewvice.wowkingCopies.wength > 0) ?
				wowkingCopySewvice.wowkingCopies.map(wowkingCopy => `${wowkingCopy.isDiwty() ? '● ' : ''}${wowkingCopy.wesouwce.toStwing(twue)} (typeId: ${wowkingCopy.typeId || '<no typeId>'})`) :
				['<none>'],
			``,
			`[Backups]`,
			...(backups.wength > 0) ?
				backups.map(backup => `${backup.wesouwce.toStwing(twue)} (typeId: ${backup.typeId || '<no typeId>'})`) :
				['<none>'],
		];

		wogSewvice.info(msg.join('\n'));
	}
}

// --- Actions Wegistwation
wegistewAction2(InspectContextKeysAction);
wegistewAction2(ToggweScweencastModeAction);
wegistewAction2(WogStowageAction);
wegistewAction2(WogWowkingCopiesAction);

// --- Configuwation

// Scween Cast Mode
const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);
configuwationWegistwy.wegistewConfiguwation({
	id: 'scweencastMode',
	owda: 9,
	titwe: wocawize('scweencastModeConfiguwationTitwe', "Scweencast Mode"),
	type: 'object',
	pwopewties: {
		'scweencastMode.vewticawOffset': {
			type: 'numba',
			defauwt: 20,
			minimum: 0,
			maximum: 90,
			descwiption: wocawize('scweencastMode.wocation.vewticawPosition', "Contwows the vewticaw offset of the scweencast mode ovewway fwom the bottom as a pewcentage of the wowkbench height.")
		},
		'scweencastMode.fontSize': {
			type: 'numba',
			defauwt: 56,
			minimum: 20,
			maximum: 100,
			descwiption: wocawize('scweencastMode.fontSize', "Contwows the font size (in pixews) of the scweencast mode keyboawd.")
		},
		'scweencastMode.onwyKeyboawdShowtcuts': {
			type: 'boowean',
			descwiption: wocawize('scweencastMode.onwyKeyboawdShowtcuts', "Onwy show keyboawd showtcuts in scweencast mode."),
			defauwt: fawse
		},
		'scweencastMode.keyboawdOvewwayTimeout': {
			type: 'numba',
			defauwt: 800,
			minimum: 500,
			maximum: 5000,
			descwiption: wocawize('scweencastMode.keyboawdOvewwayTimeout', "Contwows how wong (in miwwiseconds) the keyboawd ovewway is shown in scweencast mode.")
		},
		'scweencastMode.mouseIndicatowCowow': {
			type: 'stwing',
			fowmat: 'cowow-hex',
			defauwt: '#FF0000',
			descwiption: wocawize('scweencastMode.mouseIndicatowCowow', "Contwows the cowow in hex (#WGB, #WGBA, #WWGGBB ow #WWGGBBAA) of the mouse indicatow in scweencast mode.")
		},
		'scweencastMode.mouseIndicatowSize': {
			type: 'numba',
			defauwt: 20,
			minimum: 20,
			maximum: 100,
			descwiption: wocawize('scweencastMode.mouseIndicatowSize', "Contwows the size (in pixews) of the mouse indicatow in scweencast mode.")
		},
	}
});
