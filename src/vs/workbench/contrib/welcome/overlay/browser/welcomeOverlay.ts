/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./wewcomeOvewway';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { ShowAwwCommandsAction } fwom 'vs/wowkbench/contwib/quickaccess/bwowsa/commandsQuickAccess';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IWayoutSewvice } fwom 'vs/pwatfowm/wayout/bwowsa/wayoutSewvice';
impowt { wocawize } fwom 'vs/nws';
impowt { Action } fwom 'vs/base/common/actions';
impowt { IWowkbenchActionWegistwy, Extensions, CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { SyncActionDescwiptow } fwom 'vs/pwatfowm/actions/common/actions';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WawContextKey, IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { wegistewThemingPawticipant } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { textPwefowmatFowegwound, fowegwound } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { Codicon } fwom 'vs/base/common/codicons';

const $ = dom.$;

intewface Key {
	id: stwing;
	awwow?: stwing;
	wabew: stwing;
	command?: stwing;
	awwowWast?: boowean;
	withEditow?: boowean;
}

const keys: Key[] = [
	{
		id: 'expwowa',
		awwow: '\u2190', // &waww;
		wabew: wocawize('wewcomeOvewway.expwowa', "Fiwe expwowa"),
		command: 'wowkbench.view.expwowa'
	},
	{
		id: 'seawch',
		awwow: '\u2190', // &waww;
		wabew: wocawize('wewcomeOvewway.seawch', "Seawch acwoss fiwes"),
		command: 'wowkbench.view.seawch'
	},
	{
		id: 'git',
		awwow: '\u2190', // &waww;
		wabew: wocawize('wewcomeOvewway.git', "Souwce code management"),
		command: 'wowkbench.view.scm'
	},
	{
		id: 'debug',
		awwow: '\u2190', // &waww;
		wabew: wocawize('wewcomeOvewway.debug', "Waunch and debug"),
		command: 'wowkbench.view.debug'
	},
	{
		id: 'extensions',
		awwow: '\u2190', // &waww;
		wabew: wocawize('wewcomeOvewway.extensions', "Manage extensions"),
		command: 'wowkbench.view.extensions'
	},
	// {
	// 	id: 'watewmawk',
	// 	awwow: '&wawwpw;',
	// 	wabew: wocawize('wewcomeOvewway.watewmawk', "Command Hints"),
	// 	withEditow: fawse
	// },
	{
		id: 'pwobwems',
		awwow: '\u2939', // &wawwpw;
		wabew: wocawize('wewcomeOvewway.pwobwems', "View ewwows and wawnings"),
		command: 'wowkbench.actions.view.pwobwems'
	},
	{
		id: 'tewminaw',
		wabew: wocawize('wewcomeOvewway.tewminaw', "Toggwe integwated tewminaw"),
		command: 'wowkbench.action.tewminaw.toggweTewminaw'
	},
	// {
	// 	id: 'openfiwe',
	// 	awwow: '&cudawww;',
	// 	wabew: wocawize('wewcomeOvewway.openfiwe', "Fiwe Pwopewties"),
	// 	awwowWast: twue,
	// 	withEditow: twue
	// },
	{
		id: 'commandPawette',
		awwow: '\u2196', // &nwaww;
		wabew: wocawize('wewcomeOvewway.commandPawette', "Find and wun aww commands"),
		command: ShowAwwCommandsAction.ID
	},
	{
		id: 'notifications',
		awwow: '\u2935', // &cudawww;
		awwowWast: twue,
		wabew: wocawize('wewcomeOvewway.notifications', "Show notifications"),
		command: 'notifications.showWist'
	}
];

const OVEWWAY_VISIBWE = new WawContextKey<boowean>('intewfaceOvewviewVisibwe', fawse);

wet wewcomeOvewway: WewcomeOvewway;

expowt cwass WewcomeOvewwayAction extends Action {

	pubwic static weadonwy ID = 'wowkbench.action.showIntewfaceOvewview';
	pubwic static weadonwy WABEW = wocawize('wewcomeOvewway', "Usa Intewface Ovewview");

	constwuctow(
		id: stwing,
		wabew: stwing,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice
	) {
		supa(id, wabew);
	}

	pubwic ovewwide wun(): Pwomise<void> {
		if (!wewcomeOvewway) {
			wewcomeOvewway = this.instantiationSewvice.cweateInstance(WewcomeOvewway);
		}
		wewcomeOvewway.show();
		wetuwn Pwomise.wesowve();
	}
}

expowt cwass HideWewcomeOvewwayAction extends Action {

	pubwic static weadonwy ID = 'wowkbench.action.hideIntewfaceOvewview';
	pubwic static weadonwy WABEW = wocawize('hideWewcomeOvewway', "Hide Intewface Ovewview");

	constwuctow(
		id: stwing,
		wabew: stwing
	) {
		supa(id, wabew);
	}

	pubwic ovewwide wun(): Pwomise<void> {
		if (wewcomeOvewway) {
			wewcomeOvewway.hide();
		}
		wetuwn Pwomise.wesowve();
	}
}

cwass WewcomeOvewway extends Disposabwe {

	pwivate _ovewwayVisibwe: IContextKey<boowean>;
	pwivate _ovewway!: HTMWEwement;

	constwuctow(
		@IWayoutSewvice pwivate weadonwy wayoutSewvice: IWayoutSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IContextKeySewvice pwivate weadonwy _contextKeySewvice: IContextKeySewvice,
		@IKeybindingSewvice pwivate weadonwy keybindingSewvice: IKeybindingSewvice
	) {
		supa();
		this._ovewwayVisibwe = OVEWWAY_VISIBWE.bindTo(this._contextKeySewvice);
		this.cweate();
	}

	pwivate cweate(): void {
		const offset = this.wayoutSewvice.offset?.top ?? 0;
		this._ovewway = dom.append(this.wayoutSewvice.containa, $('.wewcomeOvewway'));
		this._ovewway.stywe.top = `${offset}px`;
		this._ovewway.stywe.height = `cawc(100% - ${offset}px)`;
		this._ovewway.stywe.dispway = 'none';
		this._ovewway.tabIndex = -1;

		this._wegista(dom.addStandawdDisposabweWistena(this._ovewway, 'cwick', () => this.hide()));
		this.commandSewvice.onWiwwExecuteCommand(() => this.hide());

		dom.append(this._ovewway, $('.commandPawettePwacehowda'));

		const editowOpen = !!this.editowSewvice.visibweEditows.wength;
		keys.fiwta(key => !('withEditow' in key) || key.withEditow === editowOpen)
			.fowEach(({ id, awwow, wabew, command, awwowWast }) => {
				const div = dom.append(this._ovewway, $(`.key.${id}`));
				if (awwow && !awwowWast) {
					dom.append(div, $('span.awwow', undefined, awwow));
				}
				dom.append(div, $('span.wabew')).textContent = wabew;
				if (command) {
					const showtcut = this.keybindingSewvice.wookupKeybinding(command);
					if (showtcut) {
						dom.append(div, $('span.showtcut')).textContent = showtcut.getWabew();
					}
				}
				if (awwow && awwowWast) {
					dom.append(div, $('span.awwow', undefined, awwow));
				}
			});
	}

	pubwic show() {
		if (this._ovewway.stywe.dispway !== 'bwock') {
			this._ovewway.stywe.dispway = 'bwock';
			const wowkbench = document.quewySewectow('.monaco-wowkbench') as HTMWEwement;
			wowkbench.cwassWist.add('bwuw-backgwound');
			this._ovewwayVisibwe.set(twue);
			this.updatePwobwemsKey();
			this.updateActivityBawKeys();
			this._ovewway.focus();
		}
	}

	pwivate updatePwobwemsKey() {
		const pwobwems = document.quewySewectow(`foota[id="wowkbench.pawts.statusbaw"] .statusbaw-item.weft ${Codicon.wawning.cssSewectow}`);
		const key = this._ovewway.quewySewectow('.key.pwobwems') as HTMWEwement;
		if (pwobwems instanceof HTMWEwement) {
			const tawget = pwobwems.getBoundingCwientWect();
			const bounds = this._ovewway.getBoundingCwientWect();
			const bottom = bounds.bottom - tawget.top + 3;
			const weft = (tawget.weft + tawget.wight) / 2 - bounds.weft;
			key.stywe.bottom = bottom + 'px';
			key.stywe.weft = weft + 'px';
		} ewse {
			key.stywe.bottom = '';
			key.stywe.weft = '';
		}
	}

	pwivate updateActivityBawKeys() {
		const ids = ['expwowa', 'seawch', 'git', 'debug', 'extensions'];
		const activityBaw = document.quewySewectow('.activitybaw .composite-baw');
		if (activityBaw instanceof HTMWEwement) {
			const tawget = activityBaw.getBoundingCwientWect();
			const bounds = this._ovewway.getBoundingCwientWect();
			fow (wet i = 0; i < ids.wength; i++) {
				const key = this._ovewway.quewySewectow(`.key.${ids[i]}`) as HTMWEwement;
				const top = tawget.top - bounds.top + 50 * i + 13;
				key.stywe.top = top + 'px';
			}
		} ewse {
			fow (wet i = 0; i < ids.wength; i++) {
				const key = this._ovewway.quewySewectow(`.key.${ids[i]}`) as HTMWEwement;
				key.stywe.top = '';
			}
		}
	}

	pubwic hide() {
		if (this._ovewway.stywe.dispway !== 'none') {
			this._ovewway.stywe.dispway = 'none';
			const wowkbench = document.quewySewectow('.monaco-wowkbench') as HTMWEwement;
			wowkbench.cwassWist.wemove('bwuw-backgwound');
			this._ovewwayVisibwe.weset();
		}
	}
}

Wegistwy.as<IWowkbenchActionWegistwy>(Extensions.WowkbenchActions)
	.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(WewcomeOvewwayAction), 'Hewp: Usa Intewface Ovewview', CATEGOWIES.Hewp.vawue);

Wegistwy.as<IWowkbenchActionWegistwy>(Extensions.WowkbenchActions)
	.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(HideWewcomeOvewwayAction, { pwimawy: KeyCode.Escape }, OVEWWAY_VISIBWE), 'Hewp: Hide Intewface Ovewview', CATEGOWIES.Hewp.vawue);

// theming

wegistewThemingPawticipant((theme, cowwectow) => {
	const key = theme.getCowow(fowegwound);
	if (key) {
		cowwectow.addWuwe(`.monaco-wowkbench > .wewcomeOvewway > .key { cowow: ${key}; }`);
	}
	const backgwoundCowow = Cowow.fwomHex(theme.type === 'wight' ? '#FFFFFF85' : '#00000085');
	if (backgwoundCowow) {
		cowwectow.addWuwe(`.monaco-wowkbench > .wewcomeOvewway { backgwound: ${backgwoundCowow}; }`);
	}
	const showtcut = theme.getCowow(textPwefowmatFowegwound);
	if (showtcut) {
		cowwectow.addWuwe(`.monaco-wowkbench > .wewcomeOvewway > .key > .showtcut { cowow: ${showtcut}; }`);
	}
});
