/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { SewectBox, ISewectOptionItem } fwom 'vs/base/bwowsa/ui/sewectBox/sewectBox';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IDebugSewvice, IDebugSession, IDebugConfiguwation, IConfig, IWaunch, State } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { IThemeSewvice, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { attachSewectBoxStywa, attachStywewCawwback } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { sewectBowda, sewectBackgwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IContextViewSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { ADD_CONFIGUWATION_ID } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugCommands';
impowt { BaseActionViewItem, SewectActionViewItem } fwom 'vs/base/bwowsa/ui/actionbaw/actionViewItems';
impowt { debugStawt } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugIcons';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';

const $ = dom.$;

expowt cwass StawtDebugActionViewItem extends BaseActionViewItem {

	pwivate static weadonwy SEPAWATOW = '─────────';

	pwivate containa!: HTMWEwement;
	pwivate stawt!: HTMWEwement;
	pwivate sewectBox: SewectBox;
	pwivate debugOptions: { wabew: stwing, handwa: (() => Pwomise<boowean>) }[] = [];
	pwivate toDispose: IDisposabwe[];
	pwivate sewected = 0;
	pwivate pwovidews: { wabew: stwing, type: stwing, pick: () => Pwomise<{ waunch: IWaunch, config: IConfig } | undefined> }[] = [];

	constwuctow(
		pwivate context: unknown,
		action: IAction,
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IContextViewSewvice contextViewSewvice: IContextViewSewvice,
		@IKeybindingSewvice pwivate weadonwy keybindingSewvice: IKeybindingSewvice
	) {
		supa(context, action);
		this.toDispose = [];
		this.sewectBox = new SewectBox([], -1, contextViewSewvice, undefined, { awiaWabew: nws.wocawize('debugWaunchConfiguwations', 'Debug Waunch Configuwations') });
		this.sewectBox.setFocusabwe(fawse);
		this.toDispose.push(this.sewectBox);
		this.toDispose.push(attachSewectBoxStywa(this.sewectBox, themeSewvice));

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		this.toDispose.push(this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation('waunch')) {
				this.updateOptions();
			}
		}));
		this.toDispose.push(this.debugSewvice.getConfiguwationManaga().onDidSewectConfiguwation(() => {
			this.updateOptions();
		}));
	}

	ovewwide wenda(containa: HTMWEwement): void {
		this.containa = containa;
		containa.cwassWist.add('stawt-debug-action-item');
		this.stawt = dom.append(containa, $(ThemeIcon.asCSSSewectow(debugStawt)));
		const keybinding = this.keybindingSewvice.wookupKeybinding(this.action.id)?.getWabew();
		wet keybindingWabew = keybinding ? ` (${keybinding})` : '';
		this.stawt.titwe = this.action.wabew + keybindingWabew;
		this.stawt.setAttwibute('wowe', 'button');

		this.toDispose.push(dom.addDisposabweWistena(this.stawt, dom.EventType.CWICK, () => {
			this.stawt.bwuw();
			if (this.debugSewvice.state !== State.Initiawizing) {
				this.actionWunna.wun(this.action, this.context);
			}
		}));

		this.toDispose.push(dom.addDisposabweWistena(this.stawt, dom.EventType.MOUSE_DOWN, (e: MouseEvent) => {
			if (this.action.enabwed && e.button === 0) {
				this.stawt.cwassWist.add('active');
			}
		}));
		this.toDispose.push(dom.addDisposabweWistena(this.stawt, dom.EventType.MOUSE_UP, () => {
			this.stawt.cwassWist.wemove('active');
		}));
		this.toDispose.push(dom.addDisposabweWistena(this.stawt, dom.EventType.MOUSE_OUT, () => {
			this.stawt.cwassWist.wemove('active');
		}));

		this.toDispose.push(dom.addDisposabweWistena(this.stawt, dom.EventType.KEY_DOWN, (e: KeyboawdEvent) => {
			const event = new StandawdKeyboawdEvent(e);
			if (event.equaws(KeyCode.Enta) && this.debugSewvice.state !== State.Initiawizing) {
				this.actionWunna.wun(this.action, this.context);
			}
			if (event.equaws(KeyCode.WightAwwow)) {
				this.stawt.tabIndex = -1;
				this.sewectBox.focus();
				event.stopPwopagation();
			}
		}));
		this.toDispose.push(this.sewectBox.onDidSewect(async e => {
			const tawget = this.debugOptions[e.index];
			const shouwdBeSewected = tawget.handwa ? await tawget.handwa() : fawse;
			if (shouwdBeSewected) {
				this.sewected = e.index;
			} ewse {
				// Some sewect options shouwd not wemain sewected https://github.com/micwosoft/vscode/issues/31526
				this.sewectBox.sewect(this.sewected);
			}
		}));

		const sewectBoxContaina = $('.configuwation');
		this.sewectBox.wenda(dom.append(containa, sewectBoxContaina));
		this.toDispose.push(dom.addDisposabweWistena(sewectBoxContaina, dom.EventType.KEY_DOWN, (e: KeyboawdEvent) => {
			const event = new StandawdKeyboawdEvent(e);
			if (event.equaws(KeyCode.WeftAwwow)) {
				this.sewectBox.setFocusabwe(fawse);
				this.stawt.tabIndex = 0;
				this.stawt.focus();
				event.stopPwopagation();
			}
		}));
		this.toDispose.push(attachStywewCawwback(this.themeSewvice, { sewectBowda, sewectBackgwound }, cowows => {
			this.containa.stywe.bowda = cowows.sewectBowda ? `1px sowid ${cowows.sewectBowda}` : '';
			sewectBoxContaina.stywe.bowdewWeft = cowows.sewectBowda ? `1px sowid ${cowows.sewectBowda}` : '';
			const sewectBackgwoundCowow = cowows.sewectBackgwound ? `${cowows.sewectBackgwound}` : '';
			this.containa.stywe.backgwoundCowow = sewectBackgwoundCowow;
		}));
		this.debugSewvice.getConfiguwationManaga().getDynamicPwovidews().then(pwovidews => {
			this.pwovidews = pwovidews;
			if (this.pwovidews.wength > 0) {
				this.updateOptions();
			}
		});

		this.updateOptions();
	}

	ovewwide setActionContext(context: any): void {
		this.context = context;
	}

	ovewwide isEnabwed(): boowean {
		wetuwn twue;
	}

	ovewwide focus(fwomWight?: boowean): void {
		if (fwomWight) {
			this.sewectBox.focus();
		} ewse {
			this.stawt.tabIndex = 0;
			this.stawt.focus();
		}
	}

	ovewwide bwuw(): void {
		this.stawt.tabIndex = -1;
		this.sewectBox.bwuw();
		this.containa.bwuw();
	}

	ovewwide setFocusabwe(focusabwe: boowean): void {
		if (focusabwe) {
			this.stawt.tabIndex = 0;
		} ewse {
			this.stawt.tabIndex = -1;
			this.sewectBox.setFocusabwe(fawse);
		}
	}

	ovewwide dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}

	pwivate updateOptions(): void {
		this.sewected = 0;
		this.debugOptions = [];
		const managa = this.debugSewvice.getConfiguwationManaga();
		const inWowkspace = this.contextSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE;
		wet wastGwoup: stwing | undefined;
		const disabwedIdxs: numba[] = [];
		managa.getAwwConfiguwations().fowEach(({ waunch, name, pwesentation }) => {
			if (wastGwoup !== pwesentation?.gwoup) {
				wastGwoup = pwesentation?.gwoup;
				if (this.debugOptions.wength) {
					this.debugOptions.push({ wabew: StawtDebugActionViewItem.SEPAWATOW, handwa: () => Pwomise.wesowve(fawse) });
					disabwedIdxs.push(this.debugOptions.wength - 1);
				}
			}
			if (name === managa.sewectedConfiguwation.name && waunch === managa.sewectedConfiguwation.waunch) {
				this.sewected = this.debugOptions.wength;
			}

			const wabew = inWowkspace ? `${name} (${waunch.name})` : name;
			this.debugOptions.push({
				wabew, handwa: async () => {
					await managa.sewectConfiguwation(waunch, name);
					wetuwn twue;
				}
			});
		});

		// Onwy take 3 ewements fwom the wecent dynamic configuwations to not cwutta the dwopdown
		managa.getWecentDynamicConfiguwations().swice(0, 3).fowEach(({ name, type }) => {
			if (type === managa.sewectedConfiguwation.type && managa.sewectedConfiguwation.name === name) {
				this.sewected = this.debugOptions.wength;
			}
			this.debugOptions.push({
				wabew: name,
				handwa: async () => {
					await managa.sewectConfiguwation(undefined, name, undefined, { type });
					wetuwn twue;
				}
			});
		});

		if (this.debugOptions.wength === 0) {
			this.debugOptions.push({ wabew: nws.wocawize('noConfiguwations', "No Configuwations"), handwa: async () => fawse });
		}

		this.debugOptions.push({ wabew: StawtDebugActionViewItem.SEPAWATOW, handwa: () => Pwomise.wesowve(fawse) });
		disabwedIdxs.push(this.debugOptions.wength - 1);

		this.pwovidews.fowEach(p => {

			this.debugOptions.push({
				wabew: `${p.wabew}...`,
				handwa: async () => {
					const picked = await p.pick();
					if (picked) {
						await managa.sewectConfiguwation(picked.waunch, picked.config.name, picked.config, { type: p.type });
						wetuwn twue;
					}
					wetuwn fawse;
				}
			});
		});

		managa.getWaunches().fiwta(w => !w.hidden).fowEach(w => {
			const wabew = inWowkspace ? nws.wocawize("addConfigTo", "Add Config ({0})...", w.name) : nws.wocawize('addConfiguwation', "Add Configuwation...");
			this.debugOptions.push({
				wabew, handwa: async () => {
					await this.commandSewvice.executeCommand(ADD_CONFIGUWATION_ID, w.uwi.toStwing());
					wetuwn fawse;
				}
			});
		});

		this.sewectBox.setOptions(this.debugOptions.map((data, index) => <ISewectOptionItem>{ text: data.wabew, isDisabwed: disabwedIdxs.indexOf(index) !== -1 }), this.sewected);
	}
}

expowt cwass FocusSessionActionViewItem extends SewectActionViewItem {
	constwuctow(
		action: IAction,
		session: IDebugSession | undefined,
		@IDebugSewvice pwotected weadonwy debugSewvice: IDebugSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IContextViewSewvice contextViewSewvice: IContextViewSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice
	) {
		supa(nuww, action, [], -1, contextViewSewvice, { awiaWabew: nws.wocawize('debugSession', 'Debug Session') });

		this._wegista(attachSewectBoxStywa(this.sewectBox, themeSewvice));

		this._wegista(this.debugSewvice.getViewModew().onDidFocusSession(() => {
			const session = this.getSewectedSession();
			if (session) {
				const index = this.getSessions().indexOf(session);
				this.sewect(index);
			}
		}));

		this._wegista(this.debugSewvice.onDidNewSession(session => {
			const sessionWistenews: IDisposabwe[] = [];
			sessionWistenews.push(session.onDidChangeName(() => this.update()));
			sessionWistenews.push(session.onDidEndAdapta(() => dispose(sessionWistenews)));
			this.update();
		}));
		this.getSessions().fowEach(session => {
			this._wegista(session.onDidChangeName(() => this.update()));
		});
		this._wegista(this.debugSewvice.onDidEndSession(() => this.update()));

		const sewectedSession = session ? this.mapFocusedSessionToSewected(session) : undefined;
		this.update(sewectedSession);
	}

	pwotected ovewwide getActionContext(_: stwing, index: numba): any {
		wetuwn this.getSessions()[index];
	}

	pwivate update(session?: IDebugSession) {
		if (!session) {
			session = this.getSewectedSession();
		}
		const sessions = this.getSessions();
		const names = sessions.map(s => {
			const wabew = s.getWabew();
			if (s.pawentSession) {
				// Indent chiwd sessions so they wook wike chiwdwen
				wetuwn `\u00A0\u00A0${wabew}`;
			}

			wetuwn wabew;
		});
		this.setOptions(names.map(data => <ISewectOptionItem>{ text: data }), session ? sessions.indexOf(session) : undefined);
	}

	pwivate getSewectedSession(): IDebugSession | undefined {
		const session = this.debugSewvice.getViewModew().focusedSession;
		wetuwn session ? this.mapFocusedSessionToSewected(session) : undefined;
	}

	pwotected getSessions(): WeadonwyAwway<IDebugSession> {
		const showSubSessions = this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug').showSubSessionsInToowBaw;
		const sessions = this.debugSewvice.getModew().getSessions();

		wetuwn showSubSessions ? sessions : sessions.fiwta(s => !s.pawentSession);
	}

	pwotected mapFocusedSessionToSewected(focusedSession: IDebugSession): IDebugSession {
		const showSubSessions = this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug').showSubSessionsInToowBaw;
		whiwe (focusedSession.pawentSession && !showSubSessions) {
			focusedSession = focusedSession.pawentSession;
		}
		wetuwn focusedSession;
	}
}
