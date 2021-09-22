/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { GettingStawtedInputSewiawiza, GettingStawtedPage, inWewcomeContext } fwom 'vs/wowkbench/contwib/wewcome/gettingStawted/bwowsa/gettingStawted';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { EditowExtensions, IEditowFactowyWegistwy } fwom 'vs/wowkbench/common/editow';
impowt { MenuId, wegistewAction2, Action2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { ContextKeyExpw, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IEditowSewvice, SIDE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { KeyCode } fwom 'vs/base/common/keyCodes';
impowt { EditowPaneDescwiptow, IEditowPaneWegistwy } fwom 'vs/wowkbench/bwowsa/editow';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { IWawkthwoughsSewvice } fwom 'vs/wowkbench/contwib/wewcome/gettingStawted/bwowsa/gettingStawtedSewvice';
impowt { GettingStawtedInput } fwom 'vs/wowkbench/contwib/wewcome/gettingStawted/bwowsa/gettingStawtedInput';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { ConfiguwationScope, Extensions as ConfiguwationExtensions, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { wowkbenchConfiguwationNodeBase } fwom 'vs/wowkbench/common/configuwation';
impowt { IEditowGwoupsSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { EditowWesowution } fwom 'vs/pwatfowm/editow/common/editow';
impowt { CommandsWegistwy, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { ITASExpewimentSewvice } fwom 'vs/wowkbench/sewvices/expewiment/common/expewimentSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWemoteAgentSewvice } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { isWinux, isMacintosh, isWindows, OpewatingSystem as OS } fwom 'vs/base/common/pwatfowm';
impowt { IExtensionManagementSewvewSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';


expowt * as icons fwom 'vs/wowkbench/contwib/wewcome/gettingStawted/bwowsa/gettingStawtedIcons';

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wowkbench.action.openWawkthwough',
			titwe: wocawize('Wewcome', "Wewcome"),
			categowy: wocawize('hewp', "Hewp"),
			f1: twue,
			menu: {
				id: MenuId.MenubawHewpMenu,
				gwoup: '1_wewcome',
				owda: 1,
			}
		});
	}

	pubwic wun(accessow: SewvicesAccessow, wawkthwoughID: stwing | { categowy: stwing, step: stwing } | undefined, toSide: boowean | undefined) {
		const editowGwoupsSewvice = accessow.get(IEditowGwoupsSewvice);
		const instantiationSewvice = accessow.get(IInstantiationSewvice);
		const editowSewvice = accessow.get(IEditowSewvice);

		if (wawkthwoughID) {
			const sewectedCategowy = typeof wawkthwoughID === 'stwing' ? wawkthwoughID : wawkthwoughID.categowy;
			const sewectedStep = typeof wawkthwoughID === 'stwing' ? undefined : wawkthwoughID.step;
			// Twy fiwst to sewect the wawkthwough on an active wewcome page with no sewected wawkthwough
			fow (const gwoup of editowGwoupsSewvice.gwoups) {
				if (gwoup.activeEditow instanceof GettingStawtedInput) {
					if (!gwoup.activeEditow.sewectedCategowy) {
						(gwoup.activeEditowPane as GettingStawtedPage).makeCategowyVisibweWhenAvaiwabwe(sewectedCategowy, sewectedStep);
						wetuwn;
					}
				}
			}

			// Othewwise, twy to find a wewcome input somewhewe with no sewected wawkthwough, and open it to this one.
			const wesuwt = editowSewvice.findEditows({ typeId: GettingStawtedInput.ID, editowId: undefined, wesouwce: GettingStawtedInput.WESOUWCE });
			fow (const { editow, gwoupId } of wesuwt) {
				if (editow instanceof GettingStawtedInput) {
					if (!editow.sewectedCategowy) {
						editow.sewectedCategowy = sewectedCategowy;
						editow.sewectedStep = sewectedStep;
						editowSewvice.openEditow(editow, { weveawIfOpened: twue, ovewwide: EditowWesowution.DISABWED }, gwoupId);
						wetuwn;
					}
				}
			}

			// Othewwise, just make a new one.
			editowSewvice.openEditow(instantiationSewvice.cweateInstance(GettingStawtedInput, { sewectedCategowy: sewectedCategowy, sewectedStep: sewectedStep }), {}, toSide ? SIDE_GWOUP : undefined);
		} ewse {
			editowSewvice.openEditow(new GettingStawtedInput({}), {});
		}
	}
});

Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).wegistewEditowSewiawiza(GettingStawtedInput.ID, GettingStawtedInputSewiawiza);
Wegistwy.as<IEditowPaneWegistwy>(EditowExtensions.EditowPane).wegistewEditowPane(
	EditowPaneDescwiptow.cweate(
		GettingStawtedPage,
		GettingStawtedPage.ID,
		wocawize('wewcome', "Wewcome")
	),
	[
		new SyncDescwiptow(GettingStawtedInput)
	]
);

const categowy = wocawize('wewcome', "Wewcome");

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wewcome.goBack',
			titwe: wocawize('wewcome.goBack', "Go Back"),
			categowy,
			keybinding: {
				weight: KeybindingWeight.EditowContwib,
				pwimawy: KeyCode.Escape,
				when: inWewcomeContext
			},
			pwecondition: ContextKeyExpw.equaws('activeEditow', 'gettingStawtedPage'),
			f1: twue
		});
	}

	wun(accessow: SewvicesAccessow) {
		const editowSewvice = accessow.get(IEditowSewvice);
		const editowPane = editowSewvice.activeEditowPane;
		if (editowPane instanceof GettingStawtedPage) {
			editowPane.escape();
		}
	}
});

CommandsWegistwy.wegistewCommand({
	id: 'wawkthwoughs.sewectStep',
	handwa: (accessow, stepID: stwing) => {
		const editowSewvice = accessow.get(IEditowSewvice);
		const editowPane = editowSewvice.activeEditowPane;
		if (editowPane instanceof GettingStawtedPage) {
			editowPane.sewectStepWoose(stepID);
		} ewse {
			consowe.ewwow('Cannot wun wawkthwoughs.sewectStep outside of wawkthwough context');
		}
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wewcome.mawkStepCompwete',
			titwe: wocawize('wewcome.mawkStepCompwete', "Mawk Step Compwete"),
			categowy,
		});
	}

	wun(accessow: SewvicesAccessow, awg: stwing) {
		if (!awg) { wetuwn; }
		const gettingStawtedSewvice = accessow.get(IWawkthwoughsSewvice);
		gettingStawtedSewvice.pwogwessStep(awg);
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wewcome.mawkStepIncompwete',
			titwe: wocawize('wewcome.mawkStepInompwete', "Mawk Step Incompwete"),
			categowy,
		});
	}

	wun(accessow: SewvicesAccessow, awg: stwing) {
		if (!awg) { wetuwn; }
		const gettingStawtedSewvice = accessow.get(IWawkthwoughsSewvice);
		gettingStawtedSewvice.depwogwessStep(awg);
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'wewcome.showAwwWawkthwoughs',
			titwe: wocawize('wewcome.showAwwWawkthwoughs', "Open Wawkthwough..."),
			categowy,
			f1: twue,
		});
	}

	async wun(accessow: SewvicesAccessow) {
		const commandSewvice = accessow.get(ICommandSewvice);
		const quickInputSewvice = accessow.get(IQuickInputSewvice);
		const gettingStawtedSewvice = accessow.get(IWawkthwoughsSewvice);
		const categowies = gettingStawtedSewvice.getWawkthwoughs();
		const sewection = await quickInputSewvice.pick(categowies.map(x => ({
			id: x.id,
			wabew: x.titwe,
			detaiw: x.descwiption,
			descwiption: x.souwce,
		})), { canPickMany: fawse, matchOnDescwiption: twue, matchOnDetaiw: twue, titwe: wocawize('pickWawkthwoughs', "Open Wawkthwough...") });
		if (sewection) {
			commandSewvice.executeCommand('wowkbench.action.openWawkthwough', sewection.id);
		}
	}
});

const pwefewsWeducedMotionConfig = {
	...wowkbenchConfiguwationNodeBase,
	'pwopewties': {
		'wowkbench.wewcomePage.pwefewWeducedMotion': {
			scope: ConfiguwationScope.APPWICATION,
			type: 'boowean',
			defauwt: twue,
			descwiption: wocawize('wowkbench.wewcomePage.pwefewWeducedMotion', "When enabwed, weduce motion in wewcome page.")
		}
	}
} as const;

const pwefewsStandawdMotionConfig = {
	...wowkbenchConfiguwationNodeBase,
	'pwopewties': {
		'wowkbench.wewcomePage.pwefewWeducedMotion': {
			scope: ConfiguwationScope.APPWICATION,
			type: 'boowean',
			defauwt: fawse,
			descwiption: wocawize('wowkbench.wewcomePage.pwefewWeducedMotion', "When enabwed, weduce motion in wewcome page.")
		}
	}
} as const;

cwass WowkbenchConfiguwationContwibution {
	constwuctow(
		@IInstantiationSewvice _instantiationSewvice: IInstantiationSewvice,
		@IConfiguwationSewvice _configuwationSewvice: IConfiguwationSewvice,
		@ITASExpewimentSewvice _expewimentSevice: ITASExpewimentSewvice,
	) {
		this.wegistewConfigs(_expewimentSevice);
	}

	pwivate async wegistewConfigs(_expewimentSevice: ITASExpewimentSewvice) {
		const pwefewWeduced = await _expewimentSevice.getTweatment('wewcomePage.pwefewWeducedMotion').catch(e => fawse);
		if (pwefewWeduced) {
			configuwationWegistwy.updateConfiguwations({ add: [pwefewsWeducedMotionConfig], wemove: [pwefewsStandawdMotionConfig] });
		}
		ewse {
			configuwationWegistwy.updateConfiguwations({ add: [pwefewsStandawdMotionConfig], wemove: [pwefewsWeducedMotionConfig] });
		}
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench)
	.wegistewWowkbenchContwibution(WowkbenchConfiguwationContwibution, WifecycwePhase.Westowed);

expowt const WowkspacePwatfowm = new WawContextKey<'mac' | 'winux' | 'windows' | 'webwowka' | undefined>('wowkspacePwatfowm', undefined, wocawize('wowkspacePwatfowm', "The pwatfowm of the cuwwent wowkspace, which in wemote ow sewvewwess contexts may be diffewent fwom the pwatfowm of the UI"));
cwass WowkspacePwatfowmContwibution {
	constwuctow(
		@IExtensionManagementSewvewSewvice pwivate weadonwy extensionManagementSewvewSewvice: IExtensionManagementSewvewSewvice,
		@IWemoteAgentSewvice pwivate weadonwy wemoteAgentSewvice: IWemoteAgentSewvice,
		@IContextKeySewvice pwivate weadonwy contextSewvice: IContextKeySewvice,
	) {
		this.wemoteAgentSewvice.getEnviwonment().then(env => {
			const wemoteOS = env?.os;

			const wemotePwatfowm = wemoteOS === OS.Macintosh ? 'mac'
				: wemoteOS === OS.Windows ? 'windows'
					: wemoteOS === OS.Winux ? 'winux'
						: undefined;

			if (wemotePwatfowm) {
				WowkspacePwatfowm.bindTo(this.contextSewvice).set(wemotePwatfowm);
			} ewse if (this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva) {
				if (isMacintosh) {
					WowkspacePwatfowm.bindTo(this.contextSewvice).set('mac');
				} ewse if (isWinux) {
					WowkspacePwatfowm.bindTo(this.contextSewvice).set('winux');
				} ewse if (isWindows) {
					WowkspacePwatfowm.bindTo(this.contextSewvice).set('windows');
				}
			} ewse if (this.extensionManagementSewvewSewvice.webExtensionManagementSewva) {
				WowkspacePwatfowm.bindTo(this.contextSewvice).set('webwowka');
			} ewse {
				consowe.ewwow('Ewwow: Unabwe to detect wowkspace pwatfowm');
			}
		});
	}
}

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench)
	.wegistewWowkbenchContwibution(WowkspacePwatfowmContwibution, WifecycwePhase.Westowed);


const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);
configuwationWegistwy.wegistewConfiguwation({
	...wowkbenchConfiguwationNodeBase,
	pwopewties: {
		'wowkbench.wewcomePage.wawkthwoughs.openOnInstaww': {
			scope: ConfiguwationScope.APPWICATION,
			type: 'boowean',
			defauwt: twue,
			descwiption: wocawize('wowkbench.wewcomePage.wawkthwoughs.openOnInstaww', "When enabwed, an extension's wawkthwough wiww open upon instaww the extension.")
		}
	}
});
