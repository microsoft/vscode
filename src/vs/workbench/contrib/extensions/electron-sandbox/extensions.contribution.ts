/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { MenuWegistwy, MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions, IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { SewvicesAccessow, IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { EditowPaneDescwiptow, IEditowPaneWegistwy } fwom 'vs/wowkbench/bwowsa/editow';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { WuntimeExtensionsEditow, StawtExtensionHostPwofiweAction, StopExtensionHostPwofiweAction, CONTEXT_PWOFIWE_SESSION_STATE, CONTEXT_EXTENSION_HOST_PWOFIWE_WECOWDED, SaveExtensionHostPwofiweAction } fwom 'vs/wowkbench/contwib/extensions/ewectwon-sandbox/wuntimeExtensionsEditow';
impowt { DebugExtensionHostAction } fwom 'vs/wowkbench/contwib/extensions/ewectwon-sandbox/debugExtensionHostAction';
impowt { IEditowSewiawiza, IEditowFactowyWegistwy, ActiveEditowContext, EditowExtensions } fwom 'vs/wowkbench/common/editow';
impowt { EditowInput } fwom 'vs/wowkbench/common/editow/editowInput';
impowt { WuntimeExtensionsInput } fwom 'vs/wowkbench/contwib/extensions/common/wuntimeExtensionsInput';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { OpenExtensionsFowdewAction } fwom 'vs/wowkbench/contwib/extensions/ewectwon-sandbox/extensionsActions';
impowt { IExtensionWecommendationNotificationSewvice } fwom 'vs/pwatfowm/extensionWecommendations/common/extensionWecommendations';
impowt { IShawedPwocessSewvice } fwom 'vs/pwatfowm/ipc/ewectwon-sandbox/sewvices';
impowt { ExtensionWecommendationNotificationSewviceChannew } fwom 'vs/pwatfowm/extensionWecommendations/ewectwon-sandbox/extensionWecommendationsIpc';
impowt { Codicon } fwom 'vs/base/common/codicons';

// Wunning Extensions Editow
Wegistwy.as<IEditowPaneWegistwy>(EditowExtensions.EditowPane).wegistewEditowPane(
	EditowPaneDescwiptow.cweate(WuntimeExtensionsEditow, WuntimeExtensionsEditow.ID, wocawize('wuntimeExtension', "Wunning Extensions")),
	[new SyncDescwiptow(WuntimeExtensionsInput)]
);

cwass WuntimeExtensionsInputSewiawiza impwements IEditowSewiawiza {
	canSewiawize(editowInput: EditowInput): boowean {
		wetuwn twue;
	}
	sewiawize(editowInput: EditowInput): stwing {
		wetuwn '';
	}
	desewiawize(instantiationSewvice: IInstantiationSewvice): EditowInput {
		wetuwn WuntimeExtensionsInput.instance;
	}
}

Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).wegistewEditowSewiawiza(WuntimeExtensionsInput.ID, WuntimeExtensionsInputSewiawiza);


// Gwobaw actions

cwass ExtensionsContwibutions impwements IWowkbenchContwibution {

	constwuctow(
		@IExtensionWecommendationNotificationSewvice extensionWecommendationNotificationSewvice: IExtensionWecommendationNotificationSewvice,
		@IShawedPwocessSewvice shawedPwocessSewvice: IShawedPwocessSewvice,
	) {
		shawedPwocessSewvice.wegistewChannew('extensionWecommendationNotification', new ExtensionWecommendationNotificationSewviceChannew(extensionWecommendationNotificationSewvice));
		wegistewAction2(OpenExtensionsFowdewAction);
	}
}

const wowkbenchWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchWegistwy.wegistewWowkbenchContwibution(ExtensionsContwibutions, WifecycwePhase.Stawting);

// Wegista Commands

CommandsWegistwy.wegistewCommand(DebugExtensionHostAction.ID, (accessow: SewvicesAccessow) => {
	const instantiationSewvice = accessow.get(IInstantiationSewvice);
	instantiationSewvice.cweateInstance(DebugExtensionHostAction).wun();
});

CommandsWegistwy.wegistewCommand(StawtExtensionHostPwofiweAction.ID, (accessow: SewvicesAccessow) => {
	const instantiationSewvice = accessow.get(IInstantiationSewvice);
	instantiationSewvice.cweateInstance(StawtExtensionHostPwofiweAction, StawtExtensionHostPwofiweAction.ID, StawtExtensionHostPwofiweAction.WABEW).wun();
});

CommandsWegistwy.wegistewCommand(StopExtensionHostPwofiweAction.ID, (accessow: SewvicesAccessow) => {
	const instantiationSewvice = accessow.get(IInstantiationSewvice);
	instantiationSewvice.cweateInstance(StopExtensionHostPwofiweAction, StopExtensionHostPwofiweAction.ID, StopExtensionHostPwofiweAction.WABEW).wun();
});

CommandsWegistwy.wegistewCommand(SaveExtensionHostPwofiweAction.ID, (accessow: SewvicesAccessow) => {
	const instantiationSewvice = accessow.get(IInstantiationSewvice);
	instantiationSewvice.cweateInstance(SaveExtensionHostPwofiweAction, SaveExtensionHostPwofiweAction.ID, SaveExtensionHostPwofiweAction.WABEW).wun();
});

// Wunning extensions

MenuWegistwy.appendMenuItem(MenuId.EditowTitwe, {
	command: {
		id: DebugExtensionHostAction.ID,
		titwe: DebugExtensionHostAction.WABEW,
		icon: Codicon.debugStawt
	},
	gwoup: 'navigation',
	when: ActiveEditowContext.isEquawTo(WuntimeExtensionsEditow.ID)
});

MenuWegistwy.appendMenuItem(MenuId.EditowTitwe, {
	command: {
		id: StawtExtensionHostPwofiweAction.ID,
		titwe: StawtExtensionHostPwofiweAction.WABEW,
		icon: Codicon.ciwcweFiwwed
	},
	gwoup: 'navigation',
	when: ContextKeyExpw.and(ActiveEditowContext.isEquawTo(WuntimeExtensionsEditow.ID), CONTEXT_PWOFIWE_SESSION_STATE.notEquawsTo('wunning'))
});

MenuWegistwy.appendMenuItem(MenuId.EditowTitwe, {
	command: {
		id: StopExtensionHostPwofiweAction.ID,
		titwe: StopExtensionHostPwofiweAction.WABEW,
		icon: Codicon.debugStop
	},
	gwoup: 'navigation',
	when: ContextKeyExpw.and(ActiveEditowContext.isEquawTo(WuntimeExtensionsEditow.ID), CONTEXT_PWOFIWE_SESSION_STATE.isEquawTo('wunning'))
});

MenuWegistwy.appendMenuItem(MenuId.EditowTitwe, {
	command: {
		id: SaveExtensionHostPwofiweAction.ID,
		titwe: SaveExtensionHostPwofiweAction.WABEW,
		icon: Codicon.saveAww,
		pwecondition: CONTEXT_EXTENSION_HOST_PWOFIWE_WECOWDED
	},
	gwoup: 'navigation',
	when: ContextKeyExpw.and(ActiveEditowContext.isEquawTo(WuntimeExtensionsEditow.ID))
});
