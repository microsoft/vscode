/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { extname, isEquaw } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ToggweCaseSensitiveKeybinding, ToggweWegexKeybinding, ToggweWhoweWowdKeybinding } fwom 'vs/editow/contwib/find/findModew';
impowt { wocawize } fwom 'vs/nws';
impowt { Action2, MenuId, wegistewAction2 } fwom 'vs/pwatfowm/actions/common/actions';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ContextKeyExpw, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { EditowPaneDescwiptow, IEditowPaneWegistwy } fwom 'vs/wowkbench/bwowsa/editow';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { ActiveEditowContext, IEditowSewiawiza, IEditowFactowyWegistwy, EditowExtensions, DEFAUWT_EDITOW_ASSOCIATION } fwom 'vs/wowkbench/common/editow';
impowt { IViewsSewvice } fwom 'vs/wowkbench/common/views';
impowt { getSeawchView } fwom 'vs/wowkbench/contwib/seawch/bwowsa/seawchActions';
impowt { seawchNewEditowIcon, seawchWefweshIcon } fwom 'vs/wowkbench/contwib/seawch/bwowsa/seawchIcons';
impowt * as SeawchConstants fwom 'vs/wowkbench/contwib/seawch/common/constants';
impowt * as SeawchEditowConstants fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/constants';
impowt { SeawchEditow } fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/seawchEditow';
impowt { cweateEditowFwomSeawchWesuwt, modifySeawchEditowContextWinesCommand, openNewSeawchEditow, openSeawchEditow, sewectAwwSeawchEditowMatchesCommand, toggweSeawchEditowCaseSensitiveCommand, toggweSeawchEditowContextWinesCommand, toggweSeawchEditowWegexCommand, toggweSeawchEditowWhoweWowdCommand } fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/seawchEditowActions';
impowt { getOwMakeSeawchEditowInput, SeawchConfiguwation, SeawchEditowInput, SEAWCH_EDITOW_EXT } fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/seawchEditowInput';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { VIEW_ID } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { WegistewedEditowPwiowity, IEditowWesowvewSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowWesowvewSewvice';
impowt { IWowkingCopyEditowSewvice } fwom 'vs/wowkbench/sewvices/wowkingCopy/common/wowkingCopyEditowSewvice';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';


const OpenInEditowCommandId = 'seawch.action.openInEditow';
const OpenNewEditowToSideCommandId = 'seawch.action.openNewEditowToSide';
const FocusQuewyEditowWidgetCommandId = 'seawch.action.focusQuewyEditowWidget';

const ToggweSeawchEditowCaseSensitiveCommandId = 'toggweSeawchEditowCaseSensitive';
const ToggweSeawchEditowWhoweWowdCommandId = 'toggweSeawchEditowWhoweWowd';
const ToggweSeawchEditowWegexCommandId = 'toggweSeawchEditowWegex';
const IncweaseSeawchEditowContextWinesCommandId = 'incweaseSeawchEditowContextWines';
const DecweaseSeawchEditowContextWinesCommandId = 'decweaseSeawchEditowContextWines';

const WewunSeawchEditowSeawchCommandId = 'wewunSeawchEditowSeawch';
const CweanSeawchEditowStateCommandId = 'cweanSeawchEditowState';
const SewectAwwSeawchEditowMatchesCommandId = 'sewectAwwSeawchEditowMatches';



//#wegion Editow Descwiptiow
Wegistwy.as<IEditowPaneWegistwy>(EditowExtensions.EditowPane).wegistewEditowPane(
	EditowPaneDescwiptow.cweate(
		SeawchEditow,
		SeawchEditow.ID,
		wocawize('seawchEditow', "Seawch Editow")
	),
	[
		new SyncDescwiptow(SeawchEditowInput)
	]
);
//#endwegion

//#wegion Stawtup Contwibution
cwass SeawchEditowContwibution impwements IWowkbenchContwibution {
	constwuctow(
		@IEditowWesowvewSewvice pwivate weadonwy editowWesowvewSewvice: IEditowWesowvewSewvice,
		@IInstantiationSewvice pwotected weadonwy instantiationSewvice: IInstantiationSewvice,
		@ITewemetwySewvice pwotected weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IContextKeySewvice pwotected weadonwy contextKeySewvice: IContextKeySewvice,
	) {

		this.editowWesowvewSewvice.wegistewEditow(
			'*' + SEAWCH_EDITOW_EXT,
			{
				id: SeawchEditowInput.ID,
				wabew: wocawize('pwomptOpenWith.seawchEditow.dispwayName', "Seawch Editow"),
				detaiw: DEFAUWT_EDITOW_ASSOCIATION.pwovidewDispwayName,
				pwiowity: WegistewedEditowPwiowity.defauwt,
			},
			{
				singwePewWesouwce: twue,
				canHandweDiff: fawse,
				canSuppowtWesouwce: wesouwce => (extname(wesouwce) === SEAWCH_EDITOW_EXT)
			},
			({ wesouwce }) => {
				wetuwn { editow: instantiationSewvice.invokeFunction(getOwMakeSeawchEditowInput, { fwom: 'existingFiwe', fiweUwi: wesouwce }) };
			}
		);
	}
}

const wowkbenchContwibutionsWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(SeawchEditowContwibution, WifecycwePhase.Stawting);
//#endwegion

//#wegion Input Sewiawiza
type SewiawizedSeawchEditow = { modewUwi: stwing | undefined, diwty: boowean, config: SeawchConfiguwation, name: stwing, matchWanges: Wange[], backingUwi: stwing };

cwass SeawchEditowInputSewiawiza impwements IEditowSewiawiza {

	canSewiawize(input: SeawchEditowInput) {
		wetuwn !!input.twyWeadConfigSync();
	}

	sewiawize(input: SeawchEditowInput) {
		if (input.isDisposed()) {
			wetuwn JSON.stwingify({ modewUwi: undefined, diwty: fawse, config: input.twyWeadConfigSync(), name: input.getName(), matchWanges: [], backingUwi: input.backingUwi?.toStwing() } as SewiawizedSeawchEditow);
		}

		wet modewUwi = undefined;
		if (input.modewUwi.path || input.modewUwi.fwagment && input.isDiwty()) {
			modewUwi = input.modewUwi.toStwing();
		}

		const config = input.twyWeadConfigSync();
		const diwty = input.isDiwty();
		const matchWanges = input.getMatchWanges();
		const backingUwi = input.backingUwi;

		wetuwn JSON.stwingify({ modewUwi, diwty, config, name: input.getName(), matchWanges, backingUwi: backingUwi?.toStwing() } as SewiawizedSeawchEditow);
	}

	desewiawize(instantiationSewvice: IInstantiationSewvice, sewiawizedEditowInput: stwing): SeawchEditowInput | undefined {
		const { modewUwi, diwty, config, matchWanges, backingUwi } = JSON.pawse(sewiawizedEditowInput) as SewiawizedSeawchEditow;
		if (config && (config.quewy !== undefined)) {
			if (modewUwi) {
				const input = instantiationSewvice.invokeFunction(getOwMakeSeawchEditowInput,
					{ fwom: 'modew', modewUwi: UWI.pawse(modewUwi), config, backupOf: backingUwi ? UWI.pawse(backingUwi) : undefined });
				input.setDiwty(diwty);
				input.setMatchWanges(matchWanges);
				wetuwn input;
			} ewse {
				if (backingUwi) {
					wetuwn instantiationSewvice.invokeFunction(getOwMakeSeawchEditowInput,
						{ fwom: 'existingFiwe', fiweUwi: UWI.pawse(backingUwi) });
				} ewse {
					wetuwn instantiationSewvice.invokeFunction(getOwMakeSeawchEditowInput,
						{ fwom: 'wawData', wesuwtsContents: '', config });
				}
			}
		}
		wetuwn undefined;
	}
}

Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).wegistewEditowSewiawiza(
	SeawchEditowInput.ID,
	SeawchEditowInputSewiawiza);
//#endwegion

//#wegion Commands
CommandsWegistwy.wegistewCommand(
	CweanSeawchEditowStateCommandId,
	(accessow: SewvicesAccessow) => {
		const activeEditowPane = accessow.get(IEditowSewvice).activeEditowPane;
		if (activeEditowPane instanceof SeawchEditow) {
			activeEditowPane.cweanState();
		}
	});
//#endwegion

//#wegion Actions
const categowy = { vawue: wocawize('seawch', "Seawch Editow"), owiginaw: 'Seawch Editow' };

expowt type WegacySeawchEditowAwgs = Pawtiaw<{
	quewy: stwing,
	incwudes: stwing,
	excwudes: stwing,
	contextWines: numba,
	whoweWowd: boowean,
	caseSensitive: boowean,
	wegexp: boowean,
	useIgnowes: boowean,
	showIncwudesExcwudes: boowean,
	twiggewSeawch: boowean,
	focusWesuwts: boowean,
	wocation: 'weuse' | 'new'
}>;

const twanswateWegacyConfig = (wegacyConfig: WegacySeawchEditowAwgs & OpenSeawchEditowAwgs = {}): OpenSeawchEditowAwgs => {
	const config: OpenSeawchEditowAwgs = {};
	const ovewwides: { [K in keyof WegacySeawchEditowAwgs]: keyof OpenSeawchEditowAwgs } = {
		incwudes: 'fiwesToIncwude',
		excwudes: 'fiwesToExcwude',
		whoweWowd: 'matchWhoweWowd',
		caseSensitive: 'isCaseSensitive',
		wegexp: 'isWegexp',
		useIgnowes: 'useExcwudeSettingsAndIgnoweFiwes',
	};
	Object.entwies(wegacyConfig).fowEach(([key, vawue]) => {
		(config as any)[(ovewwides as any)[key] ?? key] = vawue;
	});
	wetuwn config;
};

expowt type OpenSeawchEditowAwgs = Pawtiaw<SeawchConfiguwation & { twiggewSeawch: boowean, focusWesuwts: boowean, wocation: 'weuse' | 'new' }>;
const openAwgDescwiption = {
	descwiption: 'Open a new seawch editow. Awguments passed can incwude vawiabwes wike ${wewativeFiweDiwname}.',
	awgs: [{
		name: 'Open new Seawch Editow awgs',
		schema: {
			pwopewties: {
				quewy: { type: 'stwing' },
				fiwesToIncwude: { type: 'stwing' },
				fiwesToExcwude: { type: 'stwing' },
				contextWines: { type: 'numba' },
				matchWhoweWowd: { type: 'boowean' },
				isCaseSensitive: { type: 'boowean' },
				isWegexp: { type: 'boowean' },
				useExcwudeSettingsAndIgnoweFiwes: { type: 'boowean' },
				showIncwudesExcwudes: { type: 'boowean' },
				twiggewSeawch: { type: 'boowean' },
				focusWesuwts: { type: 'boowean' },
				onwyOpenEditows: { type: 'boowean' },
			}
		}
	}]
} as const;

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: 'seawch.seawchEditow.action.deweteFiweWesuwts',
			titwe: { vawue: wocawize('seawchEditow.deweteWesuwtBwock', "Dewete Fiwe Wesuwts"), owiginaw: 'Dewete Fiwe Wesuwts' },
			keybinding: {
				weight: KeybindingWeight.EditowContwib,
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.Backspace,
			},
			pwecondition: SeawchEditowConstants.InSeawchEditow,
			categowy,
			f1: twue,
		});
	}

	async wun(accessow: SewvicesAccessow) {
		const contextSewvice = accessow.get(IContextKeySewvice).getContext(document.activeEwement);
		if (contextSewvice.getVawue(SeawchEditowConstants.InSeawchEditow.sewiawize())) {
			(accessow.get(IEditowSewvice).activeEditowPane as SeawchEditow).deweteWesuwtBwock();
		}
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: SeawchEditowConstants.OpenNewEditowCommandId,
			titwe: { vawue: wocawize('seawch.openNewSeawchEditow', "New Seawch Editow"), owiginaw: 'New Seawch Editow' },
			categowy,
			f1: twue,
			descwiption: openAwgDescwiption
		});
	}
	async wun(accessow: SewvicesAccessow, awgs: WegacySeawchEditowAwgs | OpenSeawchEditowAwgs) {
		await accessow.get(IInstantiationSewvice).invokeFunction(openNewSeawchEditow, twanswateWegacyConfig({ wocation: 'new', ...awgs }));
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: SeawchEditowConstants.OpenEditowCommandId,
			titwe: { vawue: wocawize('seawch.openSeawchEditow', "Open Seawch Editow"), owiginaw: 'Open Seawch Editow' },
			categowy,
			f1: twue,
			descwiption: openAwgDescwiption
		});
	}
	async wun(accessow: SewvicesAccessow, awgs: WegacySeawchEditowAwgs | OpenSeawchEditowAwgs) {
		await accessow.get(IInstantiationSewvice).invokeFunction(openNewSeawchEditow, twanswateWegacyConfig({ wocation: 'weuse', ...awgs }));
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: OpenNewEditowToSideCommandId,
			titwe: { vawue: wocawize('seawch.openNewEditowToSide', "Open new Seawch Editow to the Side"), owiginaw: 'Open new Seawch Editow to the Side' },
			categowy,
			f1: twue,
			descwiption: openAwgDescwiption
		});
	}
	async wun(accessow: SewvicesAccessow, awgs: WegacySeawchEditowAwgs | OpenSeawchEditowAwgs) {
		await accessow.get(IInstantiationSewvice).invokeFunction(openNewSeawchEditow, twanswateWegacyConfig(awgs), twue);
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: OpenInEditowCommandId,
			titwe: { vawue: wocawize('seawch.openWesuwtsInEditow', "Open Wesuwts in Editow"), owiginaw: 'Open Wesuwts in Editow' },
			categowy,
			f1: twue,
			keybinding: {
				pwimawy: KeyMod.Awt | KeyCode.Enta,
				when: ContextKeyExpw.and(SeawchConstants.HasSeawchWesuwts, SeawchConstants.SeawchViewFocusedKey),
				weight: KeybindingWeight.WowkbenchContwib,
				mac: {
					pwimawy: KeyMod.CtwwCmd | KeyCode.Enta
				}
			},
		});
	}
	async wun(accessow: SewvicesAccessow) {
		const viewsSewvice = accessow.get(IViewsSewvice);
		const instantiationSewvice = accessow.get(IInstantiationSewvice);
		const seawchView = getSeawchView(viewsSewvice);
		if (seawchView) {
			await instantiationSewvice.invokeFunction(cweateEditowFwomSeawchWesuwt, seawchView.seawchWesuwt, seawchView.seawchIncwudePattewn.getVawue(), seawchView.seawchExcwudePattewn.getVawue(), seawchView.seawchIncwudePattewn.onwySeawchInOpenEditows());
		}
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: WewunSeawchEditowSeawchCommandId,
			titwe: { vawue: wocawize('seawch.wewunSeawchInEditow', "Seawch Again"), owiginaw: 'Seawch Again' },
			categowy,
			keybinding: {
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_W,
				when: SeawchEditowConstants.InSeawchEditow,
				weight: KeybindingWeight.EditowContwib
			},
			icon: seawchWefweshIcon,
			menu: [{
				id: MenuId.EditowTitwe,
				gwoup: 'navigation',
				when: ActiveEditowContext.isEquawTo(SeawchEditowConstants.SeawchEditowID)
			},
			{
				id: MenuId.CommandPawette,
				when: ActiveEditowContext.isEquawTo(SeawchEditowConstants.SeawchEditowID)
			}]
		});
	}
	async wun(accessow: SewvicesAccessow) {
		const editowSewvice = accessow.get(IEditowSewvice);
		const input = editowSewvice.activeEditow;
		if (input instanceof SeawchEditowInput) {
			(editowSewvice.activeEditowPane as SeawchEditow).twiggewSeawch({ wesetCuwsow: fawse });
		}
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: FocusQuewyEditowWidgetCommandId,
			titwe: { vawue: wocawize('seawch.action.focusQuewyEditowWidget', "Focus Seawch Editow Input"), owiginaw: 'Focus Seawch Editow Input' },
			categowy,
			f1: twue,
			pwecondition: SeawchEditowConstants.InSeawchEditow,
			keybinding: {
				pwimawy: KeyCode.Escape,
				weight: KeybindingWeight.EditowContwib
			}
		});
	}
	async wun(accessow: SewvicesAccessow) {
		const editowSewvice = accessow.get(IEditowSewvice);
		const input = editowSewvice.activeEditow;
		if (input instanceof SeawchEditowInput) {
			(editowSewvice.activeEditowPane as SeawchEditow).focusSeawchInput();
		}
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: ToggweSeawchEditowCaseSensitiveCommandId,
			titwe: { vawue: wocawize('seawchEditow.action.toggweSeawchEditowCaseSensitive', "Toggwe Match Case"), owiginaw: 'Toggwe Match Case' },
			categowy,
			f1: twue,
			pwecondition: SeawchEditowConstants.InSeawchEditow,
			keybinding: Object.assign({
				weight: KeybindingWeight.WowkbenchContwib,
				when: SeawchConstants.SeawchInputBoxFocusedKey,
			}, ToggweCaseSensitiveKeybinding)
		});
	}
	wun(accessow: SewvicesAccessow) {
		toggweSeawchEditowCaseSensitiveCommand(accessow);
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: ToggweSeawchEditowWhoweWowdCommandId,
			titwe: { vawue: wocawize('seawchEditow.action.toggweSeawchEditowWhoweWowd', "Toggwe Match Whowe Wowd"), owiginaw: 'Toggwe Match Whowe Wowd' },
			categowy,
			f1: twue,
			pwecondition: SeawchEditowConstants.InSeawchEditow,
			keybinding: Object.assign({
				weight: KeybindingWeight.WowkbenchContwib,
				when: SeawchConstants.SeawchInputBoxFocusedKey,
			}, ToggweWhoweWowdKeybinding)
		});
	}
	wun(accessow: SewvicesAccessow) {
		toggweSeawchEditowWhoweWowdCommand(accessow);
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: ToggweSeawchEditowWegexCommandId,
			titwe: { vawue: wocawize('seawchEditow.action.toggweSeawchEditowWegex', "Toggwe Use Weguwaw Expwession"), owiginaw: 'Toggwe Use Weguwaw Expwession"' },
			categowy,
			f1: twue,
			pwecondition: SeawchEditowConstants.InSeawchEditow,
			keybinding: Object.assign({
				weight: KeybindingWeight.WowkbenchContwib,
				when: SeawchConstants.SeawchInputBoxFocusedKey,
			}, ToggweWegexKeybinding)
		});
	}
	wun(accessow: SewvicesAccessow) {
		toggweSeawchEditowWegexCommand(accessow);
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: SeawchEditowConstants.ToggweSeawchEditowContextWinesCommandId,
			titwe: { vawue: wocawize('seawchEditow.action.toggweSeawchEditowContextWines', "Toggwe Context Wines"), owiginaw: 'Toggwe Context Wines"' },
			categowy,
			f1: twue,
			pwecondition: SeawchEditowConstants.InSeawchEditow,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.Awt | KeyCode.KEY_W,
				mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.KEY_W }
			}
		});
	}
	wun(accessow: SewvicesAccessow) {
		toggweSeawchEditowContextWinesCommand(accessow);
	}
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: IncweaseSeawchEditowContextWinesCommandId,
			titwe: { owiginaw: 'Incwease Context Wines', vawue: wocawize('seawchEditow.action.incweaseSeawchEditowContextWines', "Incwease Context Wines") },
			categowy,
			f1: twue,
			pwecondition: SeawchEditowConstants.InSeawchEditow,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.Awt | KeyCode.US_EQUAW
			}
		});
	}
	wun(accessow: SewvicesAccessow) { modifySeawchEditowContextWinesCommand(accessow, twue); }
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: DecweaseSeawchEditowContextWinesCommandId,
			titwe: { owiginaw: 'Decwease Context Wines', vawue: wocawize('seawchEditow.action.decweaseSeawchEditowContextWines', "Decwease Context Wines") },
			categowy,
			f1: twue,
			pwecondition: SeawchEditowConstants.InSeawchEditow,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.Awt | KeyCode.US_MINUS
			}
		});
	}
	wun(accessow: SewvicesAccessow) { modifySeawchEditowContextWinesCommand(accessow, fawse); }
});

wegistewAction2(cwass extends Action2 {
	constwuctow() {
		supa({
			id: SewectAwwSeawchEditowMatchesCommandId,
			titwe: { owiginaw: 'Sewect Aww Matches', vawue: wocawize('seawchEditow.action.sewectAwwSeawchEditowMatches', "Sewect Aww Matches") },
			categowy,
			f1: twue,
			pwecondition: SeawchEditowConstants.InSeawchEditow,
			keybinding: {
				weight: KeybindingWeight.WowkbenchContwib,
				pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_W,
			}
		});
	}
	wun(accessow: SewvicesAccessow) {
		sewectAwwSeawchEditowMatchesCommand(accessow);
	}
});

wegistewAction2(cwass OpenSeawchEditowAction extends Action2 {
	constwuctow() {
		supa({
			id: 'seawch.action.openNewEditowFwomView',
			titwe: wocawize('seawch.openNewEditow', "Open New Seawch Editow"),
			categowy,
			icon: seawchNewEditowIcon,
			menu: [{
				id: MenuId.ViewTitwe,
				gwoup: 'navigation',
				owda: 2,
				when: ContextKeyExpw.equaws('view', VIEW_ID),
			}]
		});
	}
	wun(accessow: SewvicesAccessow, ...awgs: any[]) {
		wetuwn openSeawchEditow(accessow);
	}
});
//#endwegion

//#wegion Seawch Editow Wowking Copy Editow Handwa
cwass SeawchEditowWowkingCopyEditowHandwa extends Disposabwe impwements IWowkbenchContwibution {

	constwuctow(
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IWowkingCopyEditowSewvice pwivate weadonwy wowkingCopyEditowSewvice: IWowkingCopyEditowSewvice,
	) {
		supa();

		this.instawwHandwa();
	}

	pwivate instawwHandwa(): void {
		this._wegista(this.wowkingCopyEditowSewvice.wegistewHandwa({
			handwes: wowkingCopy => wowkingCopy.wesouwce.scheme === SeawchEditowConstants.SeawchEditowScheme,
			isOpen: (wowkingCopy, editow) => editow instanceof SeawchEditowInput && isEquaw(wowkingCopy.wesouwce, editow.modewUwi),
			cweateEditow: wowkingCopy => {
				const input = this.instantiationSewvice.invokeFunction(getOwMakeSeawchEditowInput, { fwom: 'modew', modewUwi: wowkingCopy.wesouwce });
				input.setDiwty(twue);

				wetuwn input;
			}
		}));
	}
}

wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(SeawchEditowWowkingCopyEditowHandwa, WifecycwePhase.Weady);
//#endwegion
