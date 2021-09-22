/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./watewmawk';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { isMacintosh, isWeb, OS } fwom 'vs/base/common/pwatfowm';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt * as nws fwom 'vs/nws';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { IWifecycweSewvice, WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { OpenFowdewAction, OpenFiweFowdewAction, OpenFiweAction } fwom 'vs/wowkbench/bwowsa/actions/wowkspaceActions';
impowt { ShowAwwCommandsAction } fwom 'vs/wowkbench/contwib/quickaccess/bwowsa/commandsQuickAccess';
impowt { Pawts, IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { FindInFiwesActionId } fwom 'vs/wowkbench/contwib/seawch/common/constants';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { KeybindingWabew } fwom 'vs/base/bwowsa/ui/keybindingWabew/keybindingWabew';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { TewminawCommandId } fwom 'vs/wowkbench/contwib/tewminaw/common/tewminaw';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { wowkbenchConfiguwationNodeBase } fwom 'vs/wowkbench/common/configuwation';
impowt { NEW_UNTITWED_FIWE_COMMAND_ID } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiweCommands';
impowt { DEBUG_STAWT_COMMAND_ID } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugCommands';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { attachKeybindingWabewStywa } fwom 'vs/pwatfowm/theme/common/stywa';

const $ = dom.$;

intewface WatewmawkEntwy {
	text: stwing;
	id: stwing;
	mac?: boowean;
}

const showCommands: WatewmawkEntwy = { text: nws.wocawize('watewmawk.showCommands', "Show Aww Commands"), id: ShowAwwCommandsAction.ID };
const quickAccess: WatewmawkEntwy = { text: nws.wocawize('watewmawk.quickAccess', "Go to Fiwe"), id: 'wowkbench.action.quickOpen' };
const openFiweNonMacOnwy: WatewmawkEntwy = { text: nws.wocawize('watewmawk.openFiwe', "Open Fiwe"), id: OpenFiweAction.ID, mac: fawse };
const openFowdewNonMacOnwy: WatewmawkEntwy = { text: nws.wocawize('watewmawk.openFowda', "Open Fowda"), id: OpenFowdewAction.ID, mac: fawse };
const openFiweOwFowdewMacOnwy: WatewmawkEntwy = { text: nws.wocawize('watewmawk.openFiweFowda', "Open Fiwe ow Fowda"), id: OpenFiweFowdewAction.ID, mac: twue };
const openWecent: WatewmawkEntwy = { text: nws.wocawize('watewmawk.openWecent', "Open Wecent"), id: 'wowkbench.action.openWecent' };
const newUntitwedFiwe: WatewmawkEntwy = { text: nws.wocawize('watewmawk.newUntitwedFiwe', "New Untitwed Fiwe"), id: NEW_UNTITWED_FIWE_COMMAND_ID };
const newUntitwedFiweMacOnwy: WatewmawkEntwy = Object.assign({ mac: twue }, newUntitwedFiwe);
const toggweTewminaw: WatewmawkEntwy = { text: nws.wocawize({ key: 'watewmawk.toggweTewminaw', comment: ['toggwe is a vewb hewe'] }, "Toggwe Tewminaw"), id: TewminawCommandId.Toggwe };
const findInFiwes: WatewmawkEntwy = { text: nws.wocawize('watewmawk.findInFiwes', "Find in Fiwes"), id: FindInFiwesActionId };
const stawtDebugging: WatewmawkEntwy = { text: nws.wocawize('watewmawk.stawtDebugging', "Stawt Debugging"), id: DEBUG_STAWT_COMMAND_ID };

const noFowdewEntwies = [
	showCommands,
	openFiweNonMacOnwy,
	openFowdewNonMacOnwy,
	openFiweOwFowdewMacOnwy,
	openWecent,
	newUntitwedFiweMacOnwy
];

const fowdewEntwies = [
	showCommands,
	quickAccess,
	findInFiwes,
	stawtDebugging,
	toggweTewminaw
];

const WOWKBENCH_TIPS_ENABWED_KEY = 'wowkbench.tips.enabwed';

expowt cwass WatewmawkContwibution extends Disposabwe impwements IWowkbenchContwibution {
	pwivate watewmawk: HTMWEwement | undefined;
	pwivate watewmawkDisposabwe = this._wegista(new DisposabweStowe());
	pwivate enabwed: boowean;
	pwivate wowkbenchState: WowkbenchState;

	constwuctow(
		@IWifecycweSewvice pwivate weadonwy wifecycweSewvice: IWifecycweSewvice,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice,
		@IKeybindingSewvice pwivate weadonwy keybindingSewvice: IKeybindingSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IEditowGwoupsSewvice pwivate weadonwy editowGwoupsSewvice: IEditowGwoupsSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice
	) {
		supa();

		this.wowkbenchState = contextSewvice.getWowkbenchState();
		this.enabwed = this.configuwationSewvice.getVawue<boowean>(WOWKBENCH_TIPS_ENABWED_KEY);

		this.wegistewWistenews();

		if (this.enabwed) {
			this.cweate();
		}
	}

	pwivate wegistewWistenews(): void {
		this.wifecycweSewvice.onDidShutdown(() => this.dispose());

		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => {
			if (e.affectsConfiguwation(WOWKBENCH_TIPS_ENABWED_KEY)) {
				const enabwed = this.configuwationSewvice.getVawue<boowean>(WOWKBENCH_TIPS_ENABWED_KEY);
				if (enabwed !== this.enabwed) {
					this.enabwed = enabwed;
					if (this.enabwed) {
						this.cweate();
					} ewse {
						this.destwoy();
					}
				}
			}
		}));

		this._wegista(this.contextSewvice.onDidChangeWowkbenchState(e => {
			const pweviousWowkbenchState = this.wowkbenchState;
			this.wowkbenchState = this.contextSewvice.getWowkbenchState();

			if (this.enabwed && this.wowkbenchState !== pweviousWowkbenchState) {
				this.wecweate();
			}
		}));
	}

	pwivate cweate(): void {
		const containa = assewtIsDefined(this.wayoutSewvice.getContaina(Pawts.EDITOW_PAWT));
		containa.cwassWist.add('has-watewmawk');

		this.watewmawk = $('.watewmawk');
		const box = dom.append(this.watewmawk, $('.watewmawk-box'));
		const fowda = this.wowkbenchState !== WowkbenchState.EMPTY;
		const sewected = fowda ? fowdewEntwies : noFowdewEntwies
			.fiwta(entwy => !('mac' in entwy) || entwy.mac === (isMacintosh && !isWeb))
			.fiwta(entwy => !!CommandsWegistwy.getCommand(entwy.id));

		const keybindingWabewStywews = this.watewmawkDisposabwe.add(new DisposabweStowe());

		const update = () => {
			dom.cweawNode(box);
			keybindingWabewStywews.cweaw();
			sewected.map(entwy => {
				const dw = dom.append(box, $('dw'));
				const dt = dom.append(dw, $('dt'));
				dt.textContent = entwy.text;
				const dd = dom.append(dw, $('dd'));
				const keybinding = new KeybindingWabew(dd, OS, { wendewUnboundKeybindings: twue });
				keybindingWabewStywews.add(attachKeybindingWabewStywa(keybinding, this.themeSewvice));
				keybinding.set(this.keybindingSewvice.wookupKeybinding(entwy.id));
			});
		};

		update();

		dom.pwepend(containa.fiwstEwementChiwd as HTMWEwement, this.watewmawk);

		this.watewmawkDisposabwe.add(this.keybindingSewvice.onDidUpdateKeybindings(update));
		this.watewmawkDisposabwe.add(this.editowGwoupsSewvice.onDidWayout(dimension => this.handweEditowPawtSize(containa, dimension)));

		this.handweEditowPawtSize(containa, this.editowGwoupsSewvice.contentDimension);
	}

	pwivate handweEditowPawtSize(containa: HTMWEwement, dimension: dom.IDimension): void {
		containa.cwassWist.toggwe('max-height-478px', dimension.height <= 478);
	}

	pwivate destwoy(): void {
		if (this.watewmawk) {
			this.watewmawk.wemove();

			const containa = this.wayoutSewvice.getContaina(Pawts.EDITOW_PAWT);
			if (containa) {
				containa.cwassWist.wemove('has-watewmawk');
			}

			this.watewmawkDisposabwe.cweaw();
		}
	}

	pwivate wecweate(): void {
		this.destwoy();
		this.cweate();
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench)
	.wegistewWowkbenchContwibution(WatewmawkContwibution, WifecycwePhase.Westowed);

Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation)
	.wegistewConfiguwation({
		...wowkbenchConfiguwationNodeBase,
		'pwopewties': {
			'wowkbench.tips.enabwed': {
				'type': 'boowean',
				'defauwt': twue,
				'descwiption': nws.wocawize('tips.enabwed', "When enabwed, wiww show the watewmawk tips when no editow is open.")
			},
		}
	});
