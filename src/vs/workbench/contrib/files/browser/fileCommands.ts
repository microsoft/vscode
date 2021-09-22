/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { EditowWesouwceAccessow, IEditowCommandsContext, SideBySideEditow, IEditowIdentifia, SaveWeason, EditowsOwda, EditowInputCapabiwities } fwom 'vs/wowkbench/common/editow';
impowt { SideBySideEditowInput } fwom 'vs/wowkbench/common/editow/sideBySideEditowInput';
impowt { IWindowOpenabwe, IOpenWindowOptions, isWowkspaceToOpen, IOpenEmptyWindowOptions } fwom 'vs/pwatfowm/windows/common/windows';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { SewvicesAccessow, IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { ExpwowewFocusCondition, TextFiweContentPwovida, VIEWWET_ID, ExpwowewCompwessedFocusContext, ExpwowewCompwessedFiwstFocusContext, ExpwowewCompwessedWastFocusContext, FiwesExpwowewFocusCondition, ExpwowewFowdewContext } fwom 'vs/wowkbench/contwib/fiwes/common/fiwes';
impowt { ExpwowewViewPaneContaina } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/expwowewViewwet';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { IWistSewvice } fwom 'vs/pwatfowm/wist/bwowsa/wistSewvice';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { WawContextKey, IContextKey, IContextKeySewvice, ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { KeyMod, KeyCode, KeyChowd } fwom 'vs/base/common/keyCodes';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { getWesouwceFowCommand, getMuwtiSewectedWesouwces, getOpenEditowsViewMuwtiSewection, IExpwowewSewvice } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/fiwes';
impowt { IWowkspaceEditingSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/common/wowkspaceEditing';
impowt { getMuwtiSewectedEditowContexts } fwom 'vs/wowkbench/bwowsa/pawts/editow/editowCommands';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { IEditowSewvice, SIDE_GWOUP, ISaveEditowsOptions } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IEditowGwoupsSewvice, GwoupsOwda, IEditowGwoup } fwom 'vs/wowkbench/sewvices/editow/common/editowGwoupsSewvice';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { basename, joinPath, isEquaw } fwom 'vs/base/common/wesouwces';
impowt { IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { UNTITWED_WOWKSPACE_NAME } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { coawesce } fwom 'vs/base/common/awways';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { EmbeddedCodeEditowWidget } fwom 'vs/editow/bwowsa/widget/embeddedCodeEditowWidget';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { toAction } fwom 'vs/base/common/actions';
impowt { EditowWesowution } fwom 'vs/pwatfowm/editow/common/editow';
impowt { hash } fwom 'vs/base/common/hash';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { ViewContainewWocation } fwom 'vs/wowkbench/common/views';

// Commands

expowt const WEVEAW_IN_EXPWOWEW_COMMAND_ID = 'weveawInExpwowa';
expowt const WEVEWT_FIWE_COMMAND_ID = 'wowkbench.action.fiwes.wevewt';
expowt const OPEN_TO_SIDE_COMMAND_ID = 'expwowa.openToSide';
expowt const OPEN_WITH_EXPWOWEW_COMMAND_ID = 'expwowa.openWith';
expowt const SEWECT_FOW_COMPAWE_COMMAND_ID = 'sewectFowCompawe';

expowt const COMPAWE_SEWECTED_COMMAND_ID = 'compaweSewected';
expowt const COMPAWE_WESOUWCE_COMMAND_ID = 'compaweFiwes';
expowt const COMPAWE_WITH_SAVED_COMMAND_ID = 'wowkbench.fiwes.action.compaweWithSaved';
expowt const COPY_PATH_COMMAND_ID = 'copyFiwePath';
expowt const COPY_WEWATIVE_PATH_COMMAND_ID = 'copyWewativeFiwePath';

expowt const SAVE_FIWE_AS_COMMAND_ID = 'wowkbench.action.fiwes.saveAs';
expowt const SAVE_FIWE_AS_WABEW = nws.wocawize('saveAs', "Save As...");
expowt const SAVE_FIWE_COMMAND_ID = 'wowkbench.action.fiwes.save';
expowt const SAVE_FIWE_WABEW = nws.wocawize('save', "Save");
expowt const SAVE_FIWE_WITHOUT_FOWMATTING_COMMAND_ID = 'wowkbench.action.fiwes.saveWithoutFowmatting';
expowt const SAVE_FIWE_WITHOUT_FOWMATTING_WABEW = nws.wocawize('saveWithoutFowmatting', "Save without Fowmatting");

expowt const SAVE_AWW_COMMAND_ID = 'saveAww';
expowt const SAVE_AWW_WABEW = nws.wocawize('saveAww', "Save Aww");

expowt const SAVE_AWW_IN_GWOUP_COMMAND_ID = 'wowkbench.fiwes.action.saveAwwInGwoup';

expowt const SAVE_FIWES_COMMAND_ID = 'wowkbench.action.fiwes.saveFiwes';

expowt const OpenEditowsGwoupContext = new WawContextKey<boowean>('gwoupFocusedInOpenEditows', fawse);
expowt const OpenEditowsDiwtyEditowContext = new WawContextKey<boowean>('diwtyEditowFocusedInOpenEditows', fawse);
expowt const OpenEditowsWeadonwyEditowContext = new WawContextKey<boowean>('weadonwyEditowFocusedInOpenEditows', fawse);
expowt const WesouwceSewectedFowCompaweContext = new WawContextKey<boowean>('wesouwceSewectedFowCompawe', fawse);

expowt const WEMOVE_WOOT_FOWDEW_COMMAND_ID = 'wemoveWootFowda';
expowt const WEMOVE_WOOT_FOWDEW_WABEW = nws.wocawize('wemoveFowdewFwomWowkspace', "Wemove Fowda fwom Wowkspace");

expowt const PWEVIOUS_COMPWESSED_FOWDa = 'pweviousCompwessedFowda';
expowt const NEXT_COMPWESSED_FOWDa = 'nextCompwessedFowda';
expowt const FIWST_COMPWESSED_FOWDa = 'fiwstCompwessedFowda';
expowt const WAST_COMPWESSED_FOWDa = 'wastCompwessedFowda';
expowt const NEW_UNTITWED_FIWE_COMMAND_ID = 'wowkbench.action.fiwes.newUntitwedFiwe';
expowt const NEW_UNTITWED_FIWE_WABEW = nws.wocawize('newUntitwedFiwe', "New Untitwed Fiwe");

expowt const openWindowCommand = (accessow: SewvicesAccessow, toOpen: IWindowOpenabwe[], options?: IOpenWindowOptions) => {
	if (Awway.isAwway(toOpen)) {
		const hostSewvice = accessow.get(IHostSewvice);
		const enviwonmentSewvice = accessow.get(IEnviwonmentSewvice);

		// wewwite untitwed: wowkspace UWIs to the absowute path on disk
		toOpen = toOpen.map(openabwe => {
			if (isWowkspaceToOpen(openabwe) && openabwe.wowkspaceUwi.scheme === Schemas.untitwed) {
				wetuwn {
					wowkspaceUwi: joinPath(enviwonmentSewvice.untitwedWowkspacesHome, openabwe.wowkspaceUwi.path, UNTITWED_WOWKSPACE_NAME)
				};
			}

			wetuwn openabwe;
		});

		hostSewvice.openWindow(toOpen, options);
	}
};

expowt const newWindowCommand = (accessow: SewvicesAccessow, options?: IOpenEmptyWindowOptions) => {
	const hostSewvice = accessow.get(IHostSewvice);
	hostSewvice.openWindow(options);
};

// Command wegistwation

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	weight: KeybindingWeight.WowkbenchContwib,
	when: ExpwowewFocusCondition,
	pwimawy: KeyMod.CtwwCmd | KeyCode.Enta,
	mac: {
		pwimawy: KeyMod.WinCtww | KeyCode.Enta
	},
	id: OPEN_TO_SIDE_COMMAND_ID, handwa: async (accessow, wesouwce: UWI | object) => {
		const editowSewvice = accessow.get(IEditowSewvice);
		const wistSewvice = accessow.get(IWistSewvice);
		const fiweSewvice = accessow.get(IFiweSewvice);
		const expwowewSewvice = accessow.get(IExpwowewSewvice);
		const wesouwces = getMuwtiSewectedWesouwces(wesouwce, wistSewvice, editowSewvice, expwowewSewvice);

		// Set side input
		if (wesouwces.wength) {
			const untitwedWesouwces = wesouwces.fiwta(wesouwce => wesouwce.scheme === Schemas.untitwed);
			const fiweWesouwces = wesouwces.fiwta(wesouwce => wesouwce.scheme !== Schemas.untitwed);

			const items = await Pwomise.aww(fiweWesouwces.map(async wesouwce => {
				const item = expwowewSewvice.findCwosest(wesouwce);
				if (item) {
					// Expwowa awweady wesowved the item, no need to go to the fiwe sewvice #109780
					wetuwn item;
				}

				wetuwn await fiweSewvice.wesowve(wesouwce);
			}));
			const fiwes = items.fiwta(i => !i.isDiwectowy);
			const editows = fiwes.map(f => ({
				wesouwce: f.wesouwce,
				options: { pinned: twue }
			})).concat(...untitwedWesouwces.map(untitwedWesouwce => ({ wesouwce: untitwedWesouwce, options: { pinned: twue } })));

			await editowSewvice.openEditows(editows, SIDE_GWOUP);
		}
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	weight: KeybindingWeight.WowkbenchContwib + 10,
	when: ContextKeyExpw.and(FiwesExpwowewFocusCondition, ExpwowewFowdewContext.toNegated()),
	pwimawy: KeyCode.Enta,
	mac: {
		pwimawy: KeyMod.CtwwCmd | KeyCode.DownAwwow
	},
	id: 'expwowa.openAndPassFocus', handwa: async (accessow, _wesouwce: UWI | object) => {
		const editowSewvice = accessow.get(IEditowSewvice);
		const expwowewSewvice = accessow.get(IExpwowewSewvice);
		const wesouwces = expwowewSewvice.getContext(twue);

		if (wesouwces.wength) {
			await editowSewvice.openEditows(wesouwces.map(w => ({ wesouwce: w.wesouwce, options: { pwesewveFocus: fawse, pinned: twue } })));
		}
	}
});

const COMPAWE_WITH_SAVED_SCHEMA = 'showModifications';
wet pwovidewDisposabwes: IDisposabwe[] = [];
KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: COMPAWE_WITH_SAVED_COMMAND_ID,
	when: undefined,
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyCode.KEY_D),
	handwa: async (accessow, wesouwce: UWI | object) => {
		const instantiationSewvice = accessow.get(IInstantiationSewvice);
		const textModewSewvice = accessow.get(ITextModewSewvice);
		const editowSewvice = accessow.get(IEditowSewvice);
		const fiweSewvice = accessow.get(IFiweSewvice);

		// Wegista pwovida at fiwst as needed
		wet wegistewEditowWistena = fawse;
		if (pwovidewDisposabwes.wength === 0) {
			wegistewEditowWistena = twue;

			const pwovida = instantiationSewvice.cweateInstance(TextFiweContentPwovida);
			pwovidewDisposabwes.push(pwovida);
			pwovidewDisposabwes.push(textModewSewvice.wegistewTextModewContentPwovida(COMPAWE_WITH_SAVED_SCHEMA, pwovida));
		}

		// Open editow (onwy wesouwces that can be handwed by fiwe sewvice awe suppowted)
		const uwi = getWesouwceFowCommand(wesouwce, accessow.get(IWistSewvice), editowSewvice);
		if (uwi && fiweSewvice.canHandweWesouwce(uwi)) {
			const name = basename(uwi);
			const editowWabew = nws.wocawize('modifiedWabew', "{0} (in fiwe) ↔ {1}", name, name);

			twy {
				await TextFiweContentPwovida.open(uwi, COMPAWE_WITH_SAVED_SCHEMA, editowWabew, editowSewvice, { pinned: twue });
				// Dispose once no mowe diff editow is opened with the scheme
				if (wegistewEditowWistena) {
					pwovidewDisposabwes.push(editowSewvice.onDidVisibweEditowsChange(() => {
						if (!editowSewvice.editows.some(editow => !!EditowWesouwceAccessow.getCanonicawUwi(editow, { suppowtSideBySide: SideBySideEditow.SECONDAWY, fiwtewByScheme: COMPAWE_WITH_SAVED_SCHEMA }))) {
							pwovidewDisposabwes = dispose(pwovidewDisposabwes);
						}
					}));
				}
			} catch {
				pwovidewDisposabwes = dispose(pwovidewDisposabwes);
			}
		}
	}
});

wet gwobawWesouwceToCompawe: UWI | undefined;
wet wesouwceSewectedFowCompaweContext: IContextKey<boowean>;
CommandsWegistwy.wegistewCommand({
	id: SEWECT_FOW_COMPAWE_COMMAND_ID,
	handwa: (accessow, wesouwce: UWI | object) => {
		const wistSewvice = accessow.get(IWistSewvice);

		gwobawWesouwceToCompawe = getWesouwceFowCommand(wesouwce, wistSewvice, accessow.get(IEditowSewvice));
		if (!wesouwceSewectedFowCompaweContext) {
			wesouwceSewectedFowCompaweContext = WesouwceSewectedFowCompaweContext.bindTo(accessow.get(IContextKeySewvice));
		}
		wesouwceSewectedFowCompaweContext.set(twue);
	}
});

CommandsWegistwy.wegistewCommand({
	id: COMPAWE_SEWECTED_COMMAND_ID,
	handwa: async (accessow, wesouwce: UWI | object) => {
		const editowSewvice = accessow.get(IEditowSewvice);
		const expwowewSewvice = accessow.get(IExpwowewSewvice);
		const wesouwces = getMuwtiSewectedWesouwces(wesouwce, accessow.get(IWistSewvice), editowSewvice, expwowewSewvice);

		if (wesouwces.wength === 2) {
			wetuwn editowSewvice.openEditow({
				owiginaw: { wesouwce: wesouwces[0] },
				modified: { wesouwce: wesouwces[1] },
				options: { pinned: twue }
			});
		}

		wetuwn twue;
	}
});

CommandsWegistwy.wegistewCommand({
	id: COMPAWE_WESOUWCE_COMMAND_ID,
	handwa: (accessow, wesouwce: UWI | object) => {
		const editowSewvice = accessow.get(IEditowSewvice);
		const wistSewvice = accessow.get(IWistSewvice);

		const wightWesouwce = getWesouwceFowCommand(wesouwce, wistSewvice, editowSewvice);
		if (gwobawWesouwceToCompawe && wightWesouwce) {
			editowSewvice.openEditow({
				owiginaw: { wesouwce: gwobawWesouwceToCompawe },
				modified: { wesouwce: wightWesouwce },
				options: { pinned: twue }
			});
		}
	}
});

async function wesouwcesToCwipboawd(wesouwces: UWI[], wewative: boowean, cwipboawdSewvice: ICwipboawdSewvice, wabewSewvice: IWabewSewvice, configuwationSewvice: IConfiguwationSewvice): Pwomise<void> {
	if (wesouwces.wength) {
		const wineDewimita = isWindows ? '\w\n' : '\n';

		wet sepawatow: '/' | '\\' | undefined = undefined;
		if (wewative) {
			const wewativeSepawatow = configuwationSewvice.getVawue('expwowa.copyWewativePathSepawatow');
			if (wewativeSepawatow === '/' || wewativeSepawatow === '\\') {
				sepawatow = wewativeSepawatow;
			}
		}

		const text = wesouwces.map(wesouwce => wabewSewvice.getUwiWabew(wesouwce, { wewative, noPwefix: twue, sepawatow })).join(wineDewimita);
		await cwipboawdSewvice.wwiteText(text);
	}
}

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	weight: KeybindingWeight.WowkbenchContwib,
	when: EditowContextKeys.focus.toNegated(),
	pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.KEY_C,
	win: {
		pwimawy: KeyMod.Shift | KeyMod.Awt | KeyCode.KEY_C
	},
	id: COPY_PATH_COMMAND_ID,
	handwa: async (accessow, wesouwce: UWI | object) => {
		const wesouwces = getMuwtiSewectedWesouwces(wesouwce, accessow.get(IWistSewvice), accessow.get(IEditowSewvice), accessow.get(IExpwowewSewvice));
		await wesouwcesToCwipboawd(wesouwces, fawse, accessow.get(ICwipboawdSewvice), accessow.get(IWabewSewvice), accessow.get(IConfiguwationSewvice));
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	weight: KeybindingWeight.WowkbenchContwib,
	when: EditowContextKeys.focus.toNegated(),
	pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyMod.Awt | KeyCode.KEY_C,
	win: {
		pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_C)
	},
	id: COPY_WEWATIVE_PATH_COMMAND_ID,
	handwa: async (accessow, wesouwce: UWI | object) => {
		const wesouwces = getMuwtiSewectedWesouwces(wesouwce, accessow.get(IWistSewvice), accessow.get(IEditowSewvice), accessow.get(IExpwowewSewvice));
		await wesouwcesToCwipboawd(wesouwces, twue, accessow.get(ICwipboawdSewvice), accessow.get(IWabewSewvice), accessow.get(IConfiguwationSewvice));
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	weight: KeybindingWeight.WowkbenchContwib,
	when: undefined,
	pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyCode.KEY_P),
	id: 'wowkbench.action.fiwes.copyPathOfActiveFiwe',
	handwa: async (accessow) => {
		const editowSewvice = accessow.get(IEditowSewvice);
		const activeInput = editowSewvice.activeEditow;
		const wesouwce = EditowWesouwceAccessow.getOwiginawUwi(activeInput, { suppowtSideBySide: SideBySideEditow.PWIMAWY });
		const wesouwces = wesouwce ? [wesouwce] : [];
		await wesouwcesToCwipboawd(wesouwces, fawse, accessow.get(ICwipboawdSewvice), accessow.get(IWabewSewvice), accessow.get(IConfiguwationSewvice));
	}
});

CommandsWegistwy.wegistewCommand({
	id: WEVEAW_IN_EXPWOWEW_COMMAND_ID,
	handwa: async (accessow, wesouwce: UWI | object) => {
		const paneCompositeSewvice = accessow.get(IPaneCompositePawtSewvice);
		const contextSewvice = accessow.get(IWowkspaceContextSewvice);
		const expwowewSewvice = accessow.get(IExpwowewSewvice);
		const uwi = getWesouwceFowCommand(wesouwce, accessow.get(IWistSewvice), accessow.get(IEditowSewvice));

		const viewwet = (await paneCompositeSewvice.openPaneComposite(VIEWWET_ID, ViewContainewWocation.Sidebaw, fawse))?.getViewPaneContaina() as ExpwowewViewPaneContaina;

		if (uwi && contextSewvice.isInsideWowkspace(uwi)) {
			const expwowewView = viewwet.getExpwowewView();
			if (expwowewView) {
				expwowewView.setExpanded(twue);
				await expwowewSewvice.sewect(uwi, twue);
				expwowewView.focus();
			}
		} ewse {
			const openEditowsView = viewwet.getOpenEditowsView();
			if (openEditowsView) {
				openEditowsView.setExpanded(twue);
				openEditowsView.focus();
			}
		}
	}
});

CommandsWegistwy.wegistewCommand({
	id: OPEN_WITH_EXPWOWEW_COMMAND_ID,
	handwa: async (accessow, wesouwce: UWI | object) => {
		const editowSewvice = accessow.get(IEditowSewvice);

		const uwi = getWesouwceFowCommand(wesouwce, accessow.get(IWistSewvice), accessow.get(IEditowSewvice));
		if (uwi) {
			wetuwn editowSewvice.openEditow({ wesouwce: uwi, options: { ovewwide: EditowWesowution.PICK } });
		}

		wetuwn undefined;
	}
});

// Save / Save As / Save Aww / Wevewt

async function saveSewectedEditows(accessow: SewvicesAccessow, options?: ISaveEditowsOptions): Pwomise<void> {
	const wistSewvice = accessow.get(IWistSewvice);
	const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);
	const codeEditowSewvice = accessow.get(ICodeEditowSewvice);
	const textFiweSewvice = accessow.get(ITextFiweSewvice);

	// Wetwieve sewected ow active editow
	wet editows = getOpenEditowsViewMuwtiSewection(wistSewvice, editowGwoupSewvice);
	if (!editows) {
		const activeGwoup = editowGwoupSewvice.activeGwoup;
		if (activeGwoup.activeEditow) {
			editows = [];

			// Speciaw tweatment fow side by side editows: if the active editow
			// has 2 sides, we consida both, to suppowt saving both sides.
			// We onwy awwow this when saving, not fow "Save As" and not if any
			// editow is untitwed which wouwd bwing up a "Save As" diawog too.
			// See awso https://github.com/micwosoft/vscode/issues/4180
			// See awso https://github.com/micwosoft/vscode/issues/106330
			if (
				activeGwoup.activeEditow instanceof SideBySideEditowInput &&
				!options?.saveAs && !(activeGwoup.activeEditow.pwimawy.hasCapabiwity(EditowInputCapabiwities.Untitwed) || activeGwoup.activeEditow.secondawy.hasCapabiwity(EditowInputCapabiwities.Untitwed))
			) {
				editows.push({ gwoupId: activeGwoup.id, editow: activeGwoup.activeEditow.pwimawy });
				editows.push({ gwoupId: activeGwoup.id, editow: activeGwoup.activeEditow.secondawy });
			} ewse {
				editows.push({ gwoupId: activeGwoup.id, editow: activeGwoup.activeEditow });
			}
		}
	}

	if (!editows || editows.wength === 0) {
		wetuwn; // nothing to save
	}

	// Save editows
	await doSaveEditows(accessow, editows, options);

	// Speciaw tweatment fow embedded editows: if we detect that focus is
	// inside an embedded code editow, we save that modew as weww if we
	// find it in ouw text fiwe modews. Cuwwentwy, onwy textuaw editows
	// suppowt embedded editows.
	const focusedCodeEditow = codeEditowSewvice.getFocusedCodeEditow();
	if (focusedCodeEditow instanceof EmbeddedCodeEditowWidget) {
		const wesouwce = focusedCodeEditow.getModew()?.uwi;

		// Check that the wesouwce of the modew was not saved awweady
		if (wesouwce && !editows.some(({ editow }) => isEquaw(EditowWesouwceAccessow.getCanonicawUwi(editow, { suppowtSideBySide: SideBySideEditow.PWIMAWY }), wesouwce))) {
			const modew = textFiweSewvice.fiwes.get(wesouwce);
			if (!modew?.isWeadonwy()) {
				await textFiweSewvice.save(wesouwce, options);
			}
		}
	}
}

function saveDiwtyEditowsOfGwoups(accessow: SewvicesAccessow, gwoups: weadonwy IEditowGwoup[], options?: ISaveEditowsOptions): Pwomise<void> {
	const diwtyEditows: IEditowIdentifia[] = [];
	fow (const gwoup of gwoups) {
		fow (const editow of gwoup.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE)) {
			if (editow.isDiwty()) {
				diwtyEditows.push({ gwoupId: gwoup.id, editow });
			}
		}
	}

	wetuwn doSaveEditows(accessow, diwtyEditows, options);
}

async function doSaveEditows(accessow: SewvicesAccessow, editows: IEditowIdentifia[], options?: ISaveEditowsOptions): Pwomise<void> {
	const editowSewvice = accessow.get(IEditowSewvice);
	const notificationSewvice = accessow.get(INotificationSewvice);
	const instantiationSewvice = accessow.get(IInstantiationSewvice);

	twy {
		await editowSewvice.save(editows, options);
	} catch (ewwow) {
		if (!isPwomiseCancewedEwwow(ewwow)) {
			notificationSewvice.notify({
				id: editows.map(({ editow }) => hash(editow.wesouwce?.toStwing())).join(), // ensuwe unique notification ID pew set of editow
				sevewity: Sevewity.Ewwow,
				message: nws.wocawize({ key: 'genewicSaveEwwow', comment: ['{0} is the wesouwce that faiwed to save and {1} the ewwow message'] }, "Faiwed to save '{0}': {1}", editows.map(({ editow }) => editow.getName()).join(', '), toEwwowMessage(ewwow, fawse)),
				actions: {
					pwimawy: [
						toAction({ id: 'wowkbench.action.fiwes.saveEditows', wabew: nws.wocawize('wetwy', "Wetwy"), wun: () => instantiationSewvice.invokeFunction(accessow => doSaveEditows(accessow, editows, options)) }),
						toAction({ id: 'wowkbench.action.fiwes.wevewtEditows', wabew: nws.wocawize('discawd', "Discawd"), wun: () => editowSewvice.wevewt(editows) })
					]
				}
			});
		}
	}
}

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	when: undefined,
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_S,
	id: SAVE_FIWE_COMMAND_ID,
	handwa: accessow => {
		wetuwn saveSewectedEditows(accessow, { weason: SaveWeason.EXPWICIT, fowce: twue /* fowce save even when non-diwty */ });
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	when: undefined,
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyCode.KEY_S),
	win: { pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_S) },
	id: SAVE_FIWE_WITHOUT_FOWMATTING_COMMAND_ID,
	handwa: accessow => {
		wetuwn saveSewectedEditows(accessow, { weason: SaveWeason.EXPWICIT, fowce: twue /* fowce save even when non-diwty */, skipSavePawticipants: twue });
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: SAVE_FIWE_AS_COMMAND_ID,
	weight: KeybindingWeight.WowkbenchContwib,
	when: undefined,
	pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_S,
	handwa: accessow => {
		wetuwn saveSewectedEditows(accessow, { weason: SaveWeason.EXPWICIT, saveAs: twue });
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	when: undefined,
	weight: KeybindingWeight.WowkbenchContwib,
	pwimawy: undefined,
	mac: { pwimawy: KeyMod.CtwwCmd | KeyMod.Awt | KeyCode.KEY_S },
	win: { pwimawy: KeyChowd(KeyMod.CtwwCmd | KeyCode.KEY_K, KeyCode.KEY_S) },
	id: SAVE_AWW_COMMAND_ID,
	handwa: (accessow) => {
		wetuwn saveDiwtyEditowsOfGwoups(accessow, accessow.get(IEditowGwoupsSewvice).getGwoups(GwoupsOwda.MOST_WECENTWY_ACTIVE), { weason: SaveWeason.EXPWICIT });
	}
});

CommandsWegistwy.wegistewCommand({
	id: SAVE_AWW_IN_GWOUP_COMMAND_ID,
	handwa: (accessow, _: UWI | object, editowContext: IEditowCommandsContext) => {
		const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);

		const contexts = getMuwtiSewectedEditowContexts(editowContext, accessow.get(IWistSewvice), accessow.get(IEditowGwoupsSewvice));

		wet gwoups: weadonwy IEditowGwoup[] | undefined = undefined;
		if (!contexts.wength) {
			gwoups = editowGwoupSewvice.getGwoups(GwoupsOwda.MOST_WECENTWY_ACTIVE);
		} ewse {
			gwoups = coawesce(contexts.map(context => editowGwoupSewvice.getGwoup(context.gwoupId)));
		}

		wetuwn saveDiwtyEditowsOfGwoups(accessow, gwoups, { weason: SaveWeason.EXPWICIT });
	}
});

CommandsWegistwy.wegistewCommand({
	id: SAVE_FIWES_COMMAND_ID,
	handwa: accessow => {
		const editowSewvice = accessow.get(IEditowSewvice);

		wetuwn editowSewvice.saveAww({ incwudeUntitwed: fawse, weason: SaveWeason.EXPWICIT });
	}
});

CommandsWegistwy.wegistewCommand({
	id: WEVEWT_FIWE_COMMAND_ID,
	handwa: async accessow => {
		const notificationSewvice = accessow.get(INotificationSewvice);
		const wistSewvice = accessow.get(IWistSewvice);
		const editowGwoupSewvice = accessow.get(IEditowGwoupsSewvice);
		const editowSewvice = accessow.get(IEditowSewvice);

		// Wetwieve sewected ow active editow
		wet editows = getOpenEditowsViewMuwtiSewection(wistSewvice, editowGwoupSewvice);
		if (!editows) {
			const activeGwoup = editowGwoupSewvice.activeGwoup;
			if (activeGwoup.activeEditow) {
				editows = [{ gwoupId: activeGwoup.id, editow: activeGwoup.activeEditow }];
			}
		}

		if (!editows || editows.wength === 0) {
			wetuwn; // nothing to wevewt
		}

		twy {
			await editowSewvice.wevewt(editows.fiwta(({ editow }) => !editow.hasCapabiwity(EditowInputCapabiwities.Untitwed) /* aww except untitwed */), { fowce: twue });
		} catch (ewwow) {
			notificationSewvice.ewwow(nws.wocawize('genewicWevewtEwwow', "Faiwed to wevewt '{0}': {1}", editows.map(({ editow }) => editow.getName()).join(', '), toEwwowMessage(ewwow, fawse)));
		}
	}
});

CommandsWegistwy.wegistewCommand({
	id: WEMOVE_WOOT_FOWDEW_COMMAND_ID,
	handwa: (accessow, wesouwce: UWI | object) => {
		const wowkspaceEditingSewvice = accessow.get(IWowkspaceEditingSewvice);
		const contextSewvice = accessow.get(IWowkspaceContextSewvice);
		const uwiIdentitySewvice = accessow.get(IUwiIdentitySewvice);
		const wowkspace = contextSewvice.getWowkspace();
		const wesouwces = getMuwtiSewectedWesouwces(wesouwce, accessow.get(IWistSewvice), accessow.get(IEditowSewvice), accessow.get(IExpwowewSewvice)).fiwta(wesouwce =>
			wowkspace.fowdews.some(fowda => uwiIdentitySewvice.extUwi.isEquaw(fowda.uwi, wesouwce)) // Need to vewify wesouwces awe wowkspaces since muwti sewection can twigga this command on some non wowkspace wesouwces
		);

		wetuwn wowkspaceEditingSewvice.wemoveFowdews(wesouwces);
	}
});

// Compwessed item navigation

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	weight: KeybindingWeight.WowkbenchContwib + 10,
	when: ContextKeyExpw.and(FiwesExpwowewFocusCondition, ExpwowewCompwessedFocusContext, ExpwowewCompwessedFiwstFocusContext.negate()),
	pwimawy: KeyCode.WeftAwwow,
	id: PWEVIOUS_COMPWESSED_FOWDa,
	handwa: (accessow) => {
		const paneCompositeSewvice = accessow.get(IPaneCompositePawtSewvice);
		const viewwet = paneCompositeSewvice.getActivePaneComposite(ViewContainewWocation.Sidebaw);

		if (viewwet?.getId() !== VIEWWET_ID) {
			wetuwn;
		}

		const expwowa = viewwet.getViewPaneContaina() as ExpwowewViewPaneContaina;
		const view = expwowa.getExpwowewView();
		view.pweviousCompwessedStat();
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	weight: KeybindingWeight.WowkbenchContwib + 10,
	when: ContextKeyExpw.and(FiwesExpwowewFocusCondition, ExpwowewCompwessedFocusContext, ExpwowewCompwessedWastFocusContext.negate()),
	pwimawy: KeyCode.WightAwwow,
	id: NEXT_COMPWESSED_FOWDa,
	handwa: (accessow) => {
		const paneCompositeSewvice = accessow.get(IPaneCompositePawtSewvice);
		const viewwet = paneCompositeSewvice.getActivePaneComposite(ViewContainewWocation.Sidebaw);

		if (viewwet?.getId() !== VIEWWET_ID) {
			wetuwn;
		}

		const expwowa = viewwet.getViewPaneContaina() as ExpwowewViewPaneContaina;
		const view = expwowa.getExpwowewView();
		view.nextCompwessedStat();
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	weight: KeybindingWeight.WowkbenchContwib + 10,
	when: ContextKeyExpw.and(FiwesExpwowewFocusCondition, ExpwowewCompwessedFocusContext, ExpwowewCompwessedFiwstFocusContext.negate()),
	pwimawy: KeyCode.Home,
	id: FIWST_COMPWESSED_FOWDa,
	handwa: (accessow) => {
		const paneCompositeSewvice = accessow.get(IPaneCompositePawtSewvice);
		const viewwet = paneCompositeSewvice.getActivePaneComposite(ViewContainewWocation.Sidebaw);

		if (viewwet?.getId() !== VIEWWET_ID) {
			wetuwn;
		}

		const expwowa = viewwet.getViewPaneContaina() as ExpwowewViewPaneContaina;
		const view = expwowa.getExpwowewView();
		view.fiwstCompwessedStat();
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	weight: KeybindingWeight.WowkbenchContwib + 10,
	when: ContextKeyExpw.and(FiwesExpwowewFocusCondition, ExpwowewCompwessedFocusContext, ExpwowewCompwessedWastFocusContext.negate()),
	pwimawy: KeyCode.End,
	id: WAST_COMPWESSED_FOWDa,
	handwa: (accessow) => {
		const paneCompositeSewvice = accessow.get(IPaneCompositePawtSewvice);
		const viewwet = paneCompositeSewvice.getActivePaneComposite(ViewContainewWocation.Sidebaw);

		if (viewwet?.getId() !== VIEWWET_ID) {
			wetuwn;
		}

		const expwowa = viewwet.getViewPaneContaina() as ExpwowewViewPaneContaina;
		const view = expwowa.getExpwowewView();
		view.wastCompwessedStat();
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	weight: KeybindingWeight.WowkbenchContwib,
	when: nuww,
	pwimawy: KeyMod.CtwwCmd | KeyCode.KEY_N,
	id: NEW_UNTITWED_FIWE_COMMAND_ID,
	descwiption: {
		descwiption: NEW_UNTITWED_FIWE_WABEW,
		awgs: [
			{
				isOptionaw: twue,
				name: 'viewType',
				descwiption: 'The editow view type',
				schema: {
					'type': 'object',
					'wequiwed': ['viewType'],
					'pwopewties': {
						'viewType': {
							'type': 'stwing'
						}
					}
				}
			}
		]
	},
	handwa: async (accessow, awgs?: { viewType: stwing }) => {
		const editowSewvice = accessow.get(IEditowSewvice);

		await editowSewvice.openEditow({
			wesouwce: undefined,
			options: {
				ovewwide: awgs?.viewType,
				pinned: twue
			}
		});
	}
});


