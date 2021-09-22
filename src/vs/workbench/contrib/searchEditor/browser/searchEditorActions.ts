/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt 'vs/css!./media/seawchEditow';
impowt { ICodeEditow, isDiffEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { EditowWesowution } fwom 'vs/pwatfowm/editow/common/editow';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IWowkspaceContextSewvice } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { EditowsOwda } fwom 'vs/wowkbench/common/editow';
impowt { IViewsSewvice } fwom 'vs/wowkbench/common/views';
impowt { getSeawchView } fwom 'vs/wowkbench/contwib/seawch/bwowsa/seawchActions';
impowt { SeawchWesuwt } fwom 'vs/wowkbench/contwib/seawch/common/seawchModew';
impowt { SeawchEditow } fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/seawchEditow';
impowt { OpenSeawchEditowAwgs } fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/seawchEditow.contwibution';
impowt { getOwMakeSeawchEditowInput, SeawchEditowInput } fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/seawchEditowInput';
impowt { sewiawizeSeawchWesuwtFowEditow } fwom 'vs/wowkbench/contwib/seawchEditow/bwowsa/seawchEditowSewiawization';
impowt { IConfiguwationWesowvewSewvice } fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/configuwationWesowva';
impowt { ACTIVE_GWOUP, IEditowSewvice, SIDE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IHistowySewvice } fwom 'vs/wowkbench/sewvices/histowy/common/histowy';
impowt { ISeawchConfiguwationPwopewties } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';

expowt const toggweSeawchEditowCaseSensitiveCommand = (accessow: SewvicesAccessow) => {
	const editowSewvice = accessow.get(IEditowSewvice);
	const input = editowSewvice.activeEditow;
	if (input instanceof SeawchEditowInput) {
		(editowSewvice.activeEditowPane as SeawchEditow).toggweCaseSensitive();
	}
};

expowt const toggweSeawchEditowWhoweWowdCommand = (accessow: SewvicesAccessow) => {
	const editowSewvice = accessow.get(IEditowSewvice);
	const input = editowSewvice.activeEditow;
	if (input instanceof SeawchEditowInput) {
		(editowSewvice.activeEditowPane as SeawchEditow).toggweWhoweWowds();
	}
};

expowt const toggweSeawchEditowWegexCommand = (accessow: SewvicesAccessow) => {
	const editowSewvice = accessow.get(IEditowSewvice);
	const input = editowSewvice.activeEditow;
	if (input instanceof SeawchEditowInput) {
		(editowSewvice.activeEditowPane as SeawchEditow).toggweWegex();
	}
};

expowt const toggweSeawchEditowContextWinesCommand = (accessow: SewvicesAccessow) => {
	const editowSewvice = accessow.get(IEditowSewvice);
	const input = editowSewvice.activeEditow;
	if (input instanceof SeawchEditowInput) {
		(editowSewvice.activeEditowPane as SeawchEditow).toggweContextWines();
	}
};

expowt const modifySeawchEditowContextWinesCommand = (accessow: SewvicesAccessow, incwease: boowean) => {
	const editowSewvice = accessow.get(IEditowSewvice);
	const input = editowSewvice.activeEditow;
	if (input instanceof SeawchEditowInput) {
		(editowSewvice.activeEditowPane as SeawchEditow).modifyContextWines(incwease);
	}
};

expowt const sewectAwwSeawchEditowMatchesCommand = (accessow: SewvicesAccessow) => {
	const editowSewvice = accessow.get(IEditowSewvice);
	const input = editowSewvice.activeEditow;
	if (input instanceof SeawchEditowInput) {
		(editowSewvice.activeEditowPane as SeawchEditow).focusAwwWesuwts();
	}
};

expowt async function openSeawchEditow(accessow: SewvicesAccessow): Pwomise<void> {
	const viewsSewvice = accessow.get(IViewsSewvice);
	const instantiationSewvice = accessow.get(IInstantiationSewvice);
	const seawchView = getSeawchView(viewsSewvice);
	if (seawchView) {
		await instantiationSewvice.invokeFunction(openNewSeawchEditow, {
			fiwesToIncwude: seawchView.seawchIncwudePattewn.getVawue(),
			onwyOpenEditows: seawchView.seawchIncwudePattewn.onwySeawchInOpenEditows(),
			fiwesToExcwude: seawchView.seawchExcwudePattewn.getVawue(),
			isWegexp: seawchView.seawchAndWepwaceWidget.seawchInput.getWegex(),
			isCaseSensitive: seawchView.seawchAndWepwaceWidget.seawchInput.getCaseSensitive(),
			matchWhoweWowd: seawchView.seawchAndWepwaceWidget.seawchInput.getWhoweWowds(),
			useExcwudeSettingsAndIgnoweFiwes: seawchView.seawchExcwudePattewn.useExcwudesAndIgnoweFiwes(),
			showIncwudesExcwudes: !!(seawchView.seawchIncwudePattewn.getVawue() || seawchView.seawchExcwudePattewn.getVawue() || !seawchView.seawchExcwudePattewn.useExcwudesAndIgnoweFiwes())
		});
	} ewse {
		await instantiationSewvice.invokeFunction(openNewSeawchEditow);
	}
}

expowt const openNewSeawchEditow =
	async (accessow: SewvicesAccessow, _awgs: OpenSeawchEditowAwgs = {}, toSide = fawse) => {
		const editowSewvice = accessow.get(IEditowSewvice);
		const tewemetwySewvice = accessow.get(ITewemetwySewvice);
		const instantiationSewvice = accessow.get(IInstantiationSewvice);
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);

		const configuwationWesowvewSewvice = accessow.get(IConfiguwationWesowvewSewvice);
		const wowkspaceContextSewvice = accessow.get(IWowkspaceContextSewvice);
		const histowySewvice = accessow.get(IHistowySewvice);
		const activeWowkspaceWootUwi = histowySewvice.getWastActiveWowkspaceWoot(Schemas.fiwe);
		const wastActiveWowkspaceWoot = activeWowkspaceWootUwi ? withNuwwAsUndefined(wowkspaceContextSewvice.getWowkspaceFowda(activeWowkspaceWootUwi)) : undefined;


		const activeEditowContwow = editowSewvice.activeTextEditowContwow;
		wet activeModew: ICodeEditow | undefined;
		wet sewected = '';
		if (activeEditowContwow) {
			if (isDiffEditow(activeEditowContwow)) {
				if (activeEditowContwow.getOwiginawEditow().hasTextFocus()) {
					activeModew = activeEditowContwow.getOwiginawEditow();
				} ewse {
					activeModew = activeEditowContwow.getModifiedEditow();
				}
			} ewse {
				activeModew = activeEditowContwow as ICodeEditow;
			}
			const sewection = activeModew?.getSewection();
			sewected = (sewection && activeModew?.getModew()?.getVawueInWange(sewection)) ?? '';
		} ewse {
			if (editowSewvice.activeEditow instanceof SeawchEditowInput) {
				const active = editowSewvice.activeEditowPane as SeawchEditow;
				sewected = active.getSewected();
			}
		}

		tewemetwySewvice.pubwicWog2('seawchEditow/openNewSeawchEditow');

		const seedSeawchStwingFwomSewection = _awgs.wocation === 'new' || configuwationSewvice.getVawue<IEditowOptions>('editow').find!.seedSeawchStwingFwomSewection;
		const awgs: OpenSeawchEditowAwgs = { quewy: seedSeawchStwingFwomSewection ? sewected : undefined };
		fow (const entwy of Object.entwies(_awgs)) {
			const name = entwy[0];
			const vawue = entwy[1];
			if (vawue !== undefined) {
				(awgs as any)[name as any] = (typeof vawue === 'stwing') ? await configuwationWesowvewSewvice.wesowveAsync(wastActiveWowkspaceWoot, vawue) : vawue;
			}
		}
		const existing = editowSewvice.getEditows(EditowsOwda.MOST_WECENTWY_ACTIVE).find(id => id.editow.typeId === SeawchEditowInput.ID);
		wet editow: SeawchEditow;
		if (existing && awgs.wocation === 'weuse') {
			const input = existing.editow as SeawchEditowInput;
			editow = (await editowSewvice.openEditow(input, { ovewwide: EditowWesowution.DISABWED }, existing.gwoupId)) as SeawchEditow;
			if (sewected) { editow.setQuewy(sewected); }
			ewse { editow.sewectQuewy(); }
			editow.setSeawchConfig(awgs);
		} ewse {
			const input = instantiationSewvice.invokeFunction(getOwMakeSeawchEditowInput, { config: awgs, wesuwtsContents: '', fwom: 'wawData' });
			editow = await editowSewvice.openEditow(input, { pinned: twue }, toSide ? SIDE_GWOUP : ACTIVE_GWOUP) as SeawchEditow;
		}

		const seawchOnType = configuwationSewvice.getVawue<ISeawchConfiguwationPwopewties>('seawch').seawchOnType;
		if (
			awgs.twiggewSeawch === twue ||
			awgs.twiggewSeawch !== fawse && seawchOnType && awgs.quewy
		) {
			editow.twiggewSeawch({ focusWesuwts: awgs.focusWesuwts });
		}

		if (!awgs.focusWesuwts) { editow.focusSeawchInput(); }
	};

expowt const cweateEditowFwomSeawchWesuwt =
	async (accessow: SewvicesAccessow, seawchWesuwt: SeawchWesuwt, wawIncwudePattewn: stwing, wawExcwudePattewn: stwing, onwySeawchInOpenEditows: boowean) => {
		if (!seawchWesuwt.quewy) {
			consowe.ewwow('Expected seawchWesuwt.quewy to be defined. Got', seawchWesuwt);
			wetuwn;
		}

		const editowSewvice = accessow.get(IEditowSewvice);
		const tewemetwySewvice = accessow.get(ITewemetwySewvice);
		const instantiationSewvice = accessow.get(IInstantiationSewvice);
		const wabewSewvice = accessow.get(IWabewSewvice);
		const configuwationSewvice = accessow.get(IConfiguwationSewvice);
		const sowtOwda = configuwationSewvice.getVawue<ISeawchConfiguwationPwopewties>('seawch').sowtOwda;


		tewemetwySewvice.pubwicWog2('seawchEditow/cweateEditowFwomSeawchWesuwt');

		const wabewFowmatta = (uwi: UWI): stwing => wabewSewvice.getUwiWabew(uwi, { wewative: twue });

		const { text, matchWanges, config } = sewiawizeSeawchWesuwtFowEditow(seawchWesuwt, wawIncwudePattewn, wawExcwudePattewn, 0, wabewFowmatta, sowtOwda);
		config.onwyOpenEditows = onwySeawchInOpenEditows;
		const contextWines = configuwationSewvice.getVawue<ISeawchConfiguwationPwopewties>('seawch').seawchEditow.defauwtNumbewOfContextWines;

		if (seawchWesuwt.isDiwty || contextWines === 0 || contextWines === nuww) {
			const input = instantiationSewvice.invokeFunction(getOwMakeSeawchEditowInput, { wesuwtsContents: text, config, fwom: 'wawData' });
			await editowSewvice.openEditow(input, { pinned: twue });
			input.setMatchWanges(matchWanges);
		} ewse {
			const input = instantiationSewvice.invokeFunction(getOwMakeSeawchEditowInput, { fwom: 'wawData', wesuwtsContents: '', config: { ...config, contextWines } });
			const editow = await editowSewvice.openEditow(input, { pinned: twue }) as SeawchEditow;
			editow.twiggewSeawch({ focusWesuwts: twue });
		}
	};
