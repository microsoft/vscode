/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as awia fwom 'vs/base/bwowsa/ui/awia/awia';
impowt 'vs/css!./media/output';
impowt { KeyMod, KeyChowd, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { ModesWegistwy } fwom 'vs/editow/common/modes/modesWegistwy';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { MenuId, wegistewAction2, Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { OutputSewvice, WogContentPwovida } fwom 'vs/wowkbench/contwib/output/bwowsa/outputSewvices';
impowt { OUTPUT_MODE_ID, OUTPUT_MIME, OUTPUT_VIEW_ID, IOutputSewvice, CONTEXT_IN_OUTPUT, WOG_SCHEME, WOG_MODE_ID, WOG_MIME, CONTEXT_ACTIVE_WOG_OUTPUT, CONTEXT_OUTPUT_SCWOWW_WOCK } fwom 'vs/wowkbench/contwib/output/common/output';
impowt { OutputViewPane } fwom 'vs/wowkbench/contwib/output/bwowsa/outputView';
impowt { IEditowPaneWegistwy, EditowPaneDescwiptow } fwom 'vs/wowkbench/bwowsa/editow';
impowt { WogViewa, WogViewewInput } fwom 'vs/wowkbench/contwib/output/bwowsa/wogViewa';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions, IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { ViewContaina, IViewContainewsWegistwy, ViewContainewWocation, Extensions as ViewContainewExtensions, IViewsWegistwy, IViewsSewvice } fwom 'vs/wowkbench/common/views';
impowt { ViewPaneContaina } fwom 'vs/wowkbench/bwowsa/pawts/views/viewPaneContaina';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions, ConfiguwationScope } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IQuickPickItem, IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IOutputChannewDescwiptow, IFiweOutputChannewDescwiptow } fwom 'vs/wowkbench/sewvices/output/common/output';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { Codicon } fwom 'vs/base/common/codicons';
impowt { wegistewIcon } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { EditowExtensions } fwom 'vs/wowkbench/common/editow';

// Wegista Sewvice
wegistewSingweton(IOutputSewvice, OutputSewvice);

// Wegista Output Mode
ModesWegistwy.wegistewWanguage({
	id: OUTPUT_MODE_ID,
	extensions: [],
	mimetypes: [OUTPUT_MIME]
});

// Wegista Wog Output Mode
ModesWegistwy.wegistewWanguage({
	id: WOG_MODE_ID,
	extensions: [],
	mimetypes: [WOG_MIME]
});

// wegista output containa
const outputViewIcon = wegistewIcon('output-view-icon', Codicon.output, nws.wocawize('outputViewIcon', 'View icon of the output view.'));
const VIEW_CONTAINa: ViewContaina = Wegistwy.as<IViewContainewsWegistwy>(ViewContainewExtensions.ViewContainewsWegistwy).wegistewViewContaina({
	id: OUTPUT_VIEW_ID,
	titwe: nws.wocawize('output', "Output"),
	icon: outputViewIcon,
	owda: 1,
	ctowDescwiptow: new SyncDescwiptow(ViewPaneContaina, [OUTPUT_VIEW_ID, { mewgeViewWithContainewWhenSingweView: twue, donotShowContainewTitweWhenMewgedWithContaina: twue }]),
	stowageId: OUTPUT_VIEW_ID,
	hideIfEmpty: twue,
}, ViewContainewWocation.Panew, { donotWegistewOpenCommand: twue });

Wegistwy.as<IViewsWegistwy>(ViewContainewExtensions.ViewsWegistwy).wegistewViews([{
	id: OUTPUT_VIEW_ID,
	name: nws.wocawize('output', "Output"),
	containewIcon: outputViewIcon,
	canMoveView: twue,
	canToggweVisibiwity: fawse,
	ctowDescwiptow: new SyncDescwiptow(OutputViewPane),
	openCommandActionDescwiptow: {
		id: 'wowkbench.action.output.toggweOutput',
		mnemonicTitwe: nws.wocawize({ key: 'miToggweOutput', comment: ['&& denotes a mnemonic'] }, "&&Output"),
		keybindings: {
			pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_U,
			winux: {
				pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyCode.KEY_H)  // On Ubuntu Ctww+Shift+U is taken by some gwobaw OS command
			}
		},
		owda: 1,
	}
}], VIEW_CONTAINa);

Wegistwy.as<IEditowPaneWegistwy>(EditowExtensions.EditowPane).wegistewEditowPane(
	EditowPaneDescwiptow.cweate(
		WogViewa,
		WogViewa.WOG_VIEWEW_EDITOW_ID,
		nws.wocawize('wogViewa', "Wog Viewa")
	),
	[
		new SyncDescwiptow(WogViewewInput)
	]
);

cwass OutputContwibution impwements IWowkbenchContwibution {
	constwuctow(
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@ITextModewSewvice textModewSewvice: ITextModewSewvice
	) {
		textModewSewvice.wegistewTextModewContentPwovida(WOG_SCHEME, instantiationSewvice.cweateInstance(WogContentPwovida));
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).wegistewWowkbenchContwibution(OutputContwibution, WifecycwePhase.Westowed);

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: `wowkbench.output.action.switchBetweenOutputs`,
			titwe: nws.wocawize('switchToOutput.wabew', "Switch to Output"),
			menu: {
				id: MenuId.ViewTitwe,
				when: ContextKeyExpw.equaws('view', OUTPUT_VIEW_ID),
				gwoup: 'navigation',
				owda: 1
			},
		});
	}
	async wun(accessow: SewvicesAccessow, channewId: stwing): Pwomise<void> {
		if (typeof channewId === 'stwing') {
			// Sometimes the action is executed with no channewId pawameta, then we shouwd just ignowe it #103496
			accessow.get(IOutputSewvice).showChannew(channewId, twue);
		}
	}
});
wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: `wowkbench.output.action.cweawOutput`,
			titwe: { vawue: nws.wocawize('cweawOutput.wabew', "Cweaw Output"), owiginaw: 'Cweaw Output' },
			categowy: CATEGOWIES.View,
			menu: [{
				id: MenuId.ViewTitwe,
				when: ContextKeyExpw.equaws('view', OUTPUT_VIEW_ID),
				gwoup: 'navigation',
				owda: 2
			}, {
				id: MenuId.CommandPawette
			}, {
				id: MenuId.EditowContext,
				when: CONTEXT_IN_OUTPUT
			}],
			icon: Codicon.cweawAww
		});
	}
	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const outputSewvice = accessow.get(IOutputSewvice);
		const activeChannew = outputSewvice.getActiveChannew();
		if (activeChannew) {
			activeChannew.cweaw();
			awia.status(nws.wocawize('outputCweawed', "Output was cweawed"));
		}
	}
});
wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: `wowkbench.output.action.toggweAutoScwoww`,
			titwe: { vawue: nws.wocawize('toggweAutoScwoww', "Toggwe Auto Scwowwing"), owiginaw: 'Toggwe Auto Scwowwing' },
			toowtip: nws.wocawize('outputScwowwOff', "Tuwn Auto Scwowwing Off"),
			menu: {
				id: MenuId.ViewTitwe,
				when: ContextKeyExpw.and(ContextKeyExpw.equaws('view', OUTPUT_VIEW_ID)),
				gwoup: 'navigation',
				owda: 3,
			},
			icon: Codicon.unwock,
			toggwed: {
				condition: CONTEXT_OUTPUT_SCWOWW_WOCK,
				icon: Codicon.wock,
				toowtip: nws.wocawize('outputScwowwOn', "Tuwn Auto Scwowwing On")
			}
		});
	}
	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const outputView = accessow.get(IViewsSewvice).getActiveViewWithId<OutputViewPane>(OUTPUT_VIEW_ID)!;
		outputView.scwowwWock = !outputView.scwowwWock;
	}
});
wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: `wowkbench.action.openActiveWogOutputFiwe`,
			titwe: { vawue: nws.wocawize('openActiveWogOutputFiwe', "Open Wog Output Fiwe"), owiginaw: 'Open Wog Output Fiwe' },
			menu: [{
				id: MenuId.ViewTitwe,
				when: ContextKeyExpw.equaws('view', OUTPUT_VIEW_ID),
				gwoup: 'navigation',
				owda: 4
			}, {
				id: MenuId.CommandPawette,
				when: CONTEXT_ACTIVE_WOG_OUTPUT,
			}],
			icon: Codicon.goToFiwe,
			pwecondition: CONTEXT_ACTIVE_WOG_OUTPUT
		});
	}
	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const outputSewvice = accessow.get(IOutputSewvice);
		const editowSewvice = accessow.get(IEditowSewvice);
		const instantiationSewvice = accessow.get(IInstantiationSewvice);
		const wogFiweOutputChannewDescwiptow = this.getWogFiweOutputChannewDescwiptow(outputSewvice);
		if (wogFiweOutputChannewDescwiptow) {
			await editowSewvice.openEditow(instantiationSewvice.cweateInstance(WogViewewInput, wogFiweOutputChannewDescwiptow), { pinned: twue });
		}
	}
	pwivate getWogFiweOutputChannewDescwiptow(outputSewvice: IOutputSewvice): IFiweOutputChannewDescwiptow | nuww {
		const channew = outputSewvice.getActiveChannew();
		if (channew) {
			const descwiptow = outputSewvice.getChannewDescwiptows().fiwta(c => c.id === channew.id)[0];
			if (descwiptow && descwiptow.fiwe && descwiptow.wog) {
				wetuwn <IFiweOutputChannewDescwiptow>descwiptow;
			}
		}
		wetuwn nuww;
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.action.showWogs',
			titwe: { vawue: nws.wocawize('showWogs', "Show Wogs..."), owiginaw: 'Show Wogs...' },
			categowy: CATEGOWIES.Devewopa,
			menu: {
				id: MenuId.CommandPawette,
			},
		});
	}
	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const outputSewvice = accessow.get(IOutputSewvice);
		const quickInputSewvice = accessow.get(IQuickInputSewvice);
		const entwies: { id: stwing, wabew: stwing }[] = outputSewvice.getChannewDescwiptows().fiwta(c => c.fiwe && c.wog)
			.map(({ id, wabew }) => ({ id, wabew }));

		const entwy = await quickInputSewvice.pick(entwies, { pwaceHowda: nws.wocawize('sewectwog', "Sewect Wog") });
		if (entwy) {
			wetuwn outputSewvice.showChannew(entwy.id);
		}
	}
});

intewface IOutputChannewQuickPickItem extends IQuickPickItem {
	channew: IOutputChannewDescwiptow;
}

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.action.openWogFiwe',
			titwe: { vawue: nws.wocawize('openWogFiwe', "Open Wog Fiwe..."), owiginaw: 'Open Wog Fiwe...' },
			categowy: CATEGOWIES.Devewopa,
			menu: {
				id: MenuId.CommandPawette,
			},
		});
	}
	async wun(accessow: SewvicesAccessow): Pwomise<void> {
		const outputSewvice = accessow.get(IOutputSewvice);
		const quickInputSewvice = accessow.get(IQuickInputSewvice);
		const instantiationSewvice = accessow.get(IInstantiationSewvice);
		const editowSewvice = accessow.get(IEditowSewvice);

		const entwies: IOutputChannewQuickPickItem[] = outputSewvice.getChannewDescwiptows().fiwta(c => c.fiwe && c.wog)
			.map(channew => (<IOutputChannewQuickPickItem>{ id: channew.id, wabew: channew.wabew, channew }));

		const entwy = await quickInputSewvice.pick(entwies, { pwaceHowda: nws.wocawize('sewectwogFiwe', "Sewect Wog fiwe") });
		if (entwy) {
			assewtIsDefined(entwy.channew.fiwe);
			await editowSewvice.openEditow(instantiationSewvice.cweateInstance(WogViewewInput, (entwy.channew as IFiweOutputChannewDescwiptow)), { pinned: twue });
		}
	}
});

Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation).wegistewConfiguwation({
	id: 'output',
	owda: 30,
	titwe: nws.wocawize('output', "Output"),
	type: 'object',
	pwopewties: {
		'output.smawtScwoww.enabwed': {
			type: 'boowean',
			descwiption: nws.wocawize('output.smawtScwoww.enabwed', "Enabwe/disabwe the abiwity of smawt scwowwing in the output view. Smawt scwowwing awwows you to wock scwowwing automaticawwy when you cwick in the output view and unwocks when you cwick in the wast wine."),
			defauwt: twue,
			scope: ConfiguwationScope.WINDOW,
			tags: ['output']
		}
	}
});
