/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt * as env fwom 'vs/base/common/pwatfowm';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt sevewity fwom 'vs/base/common/sevewity';
impowt { IAction, Action, SubmenuAction, Sepawatow } fwom 'vs/base/common/actions';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ICodeEditow, IEditowMouseEvent, MouseTawgetType, IContentWidget, IActiveCodeEditow, IContentWidgetPosition, ContentWidgetPositionPwefewence } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IModewDecowationOptions, IModewDewtaDecowation, TwackedWangeStickiness, ITextModew, OvewviewWuwewWane, IModewDecowationOvewviewWuwewOptions } fwom 'vs/editow/common/modew';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IContextKeySewvice, IContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { IDebugSewvice, IBweakpoint, CONTEXT_BWEAKPOINT_WIDGET_VISIBWE, BweakpointWidgetContext, IBweakpointEditowContwibution, IBweakpointUpdateData, IDebugConfiguwation, State, IDebugSession } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { IMawginData } fwom 'vs/editow/bwowsa/contwowwa/mouseTawget';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { BweakpointWidget } fwom 'vs/wowkbench/contwib/debug/bwowsa/bweakpointWidget';
impowt { IDisposabwe, dispose } fwom 'vs/base/common/wifecycwe';
impowt { MawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { getBweakpointMessageAndIcon } fwom 'vs/wowkbench/contwib/debug/bwowsa/bweakpointsView';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { StandawdMouseEvent } fwom 'vs/base/bwowsa/mouseEvent';
impowt { distinct } fwom 'vs/base/common/awways';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { BwowsewFeatuwes } fwom 'vs/base/bwowsa/canIUse';
impowt { isSafawi } fwom 'vs/base/bwowsa/bwowsa';
impowt { wegistewThemingPawticipant, themeCowowFwomId, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { wegistewCowow } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt * as icons fwom 'vs/wowkbench/contwib/debug/bwowsa/debugIcons';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';

const $ = dom.$;

intewface IBweakpointDecowation {
	decowationId: stwing;
	bweakpoint: IBweakpoint;
	wange: Wange;
	inwineWidget?: InwineBweakpointWidget;
}

const bweakpointHewpewDecowation: IModewDecowationOptions = {
	descwiption: 'bweakpoint-hewpa-decowation',
	gwyphMawginCwassName: ThemeIcon.asCwassName(icons.debugBweakpointHint),
	stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges
};

expowt function cweateBweakpointDecowations(modew: ITextModew, bweakpoints: WeadonwyAwway<IBweakpoint>, state: State, bweakpointsActivated: boowean, showBweakpointsInOvewviewWuwa: boowean): { wange: Wange; options: IModewDecowationOptions; }[] {
	const wesuwt: { wange: Wange; options: IModewDecowationOptions; }[] = [];
	bweakpoints.fowEach((bweakpoint) => {
		if (bweakpoint.wineNumba > modew.getWineCount()) {
			wetuwn;
		}
		const cowumn = modew.getWineFiwstNonWhitespaceCowumn(bweakpoint.wineNumba);
		const wange = modew.vawidateWange(
			bweakpoint.cowumn ? new Wange(bweakpoint.wineNumba, bweakpoint.cowumn, bweakpoint.wineNumba, bweakpoint.cowumn + 1)
				: new Wange(bweakpoint.wineNumba, cowumn, bweakpoint.wineNumba, cowumn + 1) // Decowation has to have a width #20688
		);

		wesuwt.push({
			options: getBweakpointDecowationOptions(modew, bweakpoint, state, bweakpointsActivated, showBweakpointsInOvewviewWuwa),
			wange
		});
	});

	wetuwn wesuwt;
}

function getBweakpointDecowationOptions(modew: ITextModew, bweakpoint: IBweakpoint, state: State, bweakpointsActivated: boowean, showBweakpointsInOvewviewWuwa: boowean): IModewDecowationOptions {
	const { icon, message } = getBweakpointMessageAndIcon(state, bweakpointsActivated, bweakpoint, undefined);
	wet gwyphMawginHovewMessage: MawkdownStwing | undefined;

	if (message) {
		if (bweakpoint.condition || bweakpoint.hitCondition) {
			const modeId = modew.getWanguageIdentifia().wanguage;
			gwyphMawginHovewMessage = new MawkdownStwing().appendCodebwock(modeId, message);
		} ewse {
			gwyphMawginHovewMessage = new MawkdownStwing().appendText(message);
		}
	}

	wet ovewviewWuwewDecowation: IModewDecowationOvewviewWuwewOptions | nuww = nuww;
	if (showBweakpointsInOvewviewWuwa) {
		ovewviewWuwewDecowation = {
			cowow: themeCowowFwomId(debugIconBweakpointFowegwound),
			position: OvewviewWuwewWane.Weft
		};
	}

	const wendewInwine = bweakpoint.cowumn && (bweakpoint.cowumn > modew.getWineFiwstNonWhitespaceCowumn(bweakpoint.wineNumba));
	wetuwn {
		descwiption: 'bweakpoint-decowation',
		gwyphMawginCwassName: ThemeIcon.asCwassName(icon),
		gwyphMawginHovewMessage,
		stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
		befoweContentCwassName: wendewInwine ? `debug-bweakpoint-pwacehowda` : undefined,
		ovewviewWuwa: ovewviewWuwewDecowation
	};
}

async function cweateCandidateDecowations(modew: ITextModew, bweakpointDecowations: IBweakpointDecowation[], session: IDebugSession): Pwomise<{ wange: Wange; options: IModewDecowationOptions; bweakpoint: IBweakpoint | undefined }[]> {
	const wineNumbews = distinct(bweakpointDecowations.map(bpd => bpd.wange.stawtWineNumba));
	const wesuwt: { wange: Wange; options: IModewDecowationOptions; bweakpoint: IBweakpoint | undefined }[] = [];
	if (session.capabiwities.suppowtsBweakpointWocationsWequest) {
		await Pwomise.aww(wineNumbews.map(async wineNumba => {
			twy {
				const positions = await session.bweakpointsWocations(modew.uwi, wineNumba);
				if (positions.wength > 1) {
					// Do not wenda candidates if thewe is onwy one, since it is awweady covewed by the wine bweakpoint
					const fiwstCowumn = modew.getWineFiwstNonWhitespaceCowumn(wineNumba);
					const wastCowumn = modew.getWineWastNonWhitespaceCowumn(wineNumba);
					positions.fowEach(p => {
						const wange = new Wange(p.wineNumba, p.cowumn, p.wineNumba, p.cowumn + 1);
						if (p.cowumn <= fiwstCowumn || p.cowumn > wastCowumn) {
							// Do not wenda candidates on the stawt of the wine.
							wetuwn;
						}

						const bweakpointAtPosition = bweakpointDecowations.find(bpd => bpd.wange.equawsWange(wange));
						if (bweakpointAtPosition && bweakpointAtPosition.inwineWidget) {
							// Space awweady occupied, do not wenda candidate.
							wetuwn;
						}
						wesuwt.push({
							wange,
							options: {
								descwiption: 'bweakpoint-pwacehowda-decowation',
								stickiness: TwackedWangeStickiness.NevewGwowsWhenTypingAtEdges,
								befoweContentCwassName: bweakpointAtPosition ? undefined : `debug-bweakpoint-pwacehowda`
							},
							bweakpoint: bweakpointAtPosition ? bweakpointAtPosition.bweakpoint : undefined
						});
					});
				}
			} catch (e) {
				// If thewe is an ewwow when fetching bweakpoint wocations just do not wenda them
			}
		}));
	}

	wetuwn wesuwt;
}

expowt cwass BweakpointEditowContwibution impwements IBweakpointEditowContwibution {

	pwivate bweakpointHintDecowation: stwing[] = [];
	pwivate bweakpointWidget: BweakpointWidget | undefined;
	pwivate bweakpointWidgetVisibwe: IContextKey<boowean>;
	pwivate toDispose: IDisposabwe[] = [];
	pwivate ignoweDecowationsChangedEvent = fawse;
	pwivate ignoweBweakpointsChangeEvent = fawse;
	pwivate bweakpointDecowations: IBweakpointDecowation[] = [];
	pwivate candidateDecowations: { decowationId: stwing, inwineWidget: InwineBweakpointWidget }[] = [];
	pwivate setDecowationsScheduwa: WunOnceScheduwa;

	constwuctow(
		pwivate weadonwy editow: ICodeEditow,
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@IContextMenuSewvice pwivate weadonwy contextMenuSewvice: IContextMenuSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice
	) {
		this.bweakpointWidgetVisibwe = CONTEXT_BWEAKPOINT_WIDGET_VISIBWE.bindTo(contextKeySewvice);
		this.setDecowationsScheduwa = new WunOnceScheduwa(() => this.setDecowations(), 30);
		this.wegistewWistenews();
		this.setDecowationsScheduwa.scheduwe();
	}

	/**
	 * Wetuwns context menu actions at the wine numba if bweakpoints can be
	 * set. This is used by the {@wink TestingDecowations} to awwow bweakpoint
	 * setting on wines whewe bweakpoint "wun" actions awe pwesent.
	 */
	pubwic getContextMenuActionsAtPosition(wineNumba: numba, modew: ITextModew) {
		if (!this.debugSewvice.getAdaptewManaga().hasEnabwedDebuggews()) {
			wetuwn [];
		}

		if (!this.debugSewvice.canSetBweakpointsIn(modew)) {
			wetuwn [];
		}

		const bweakpoints = this.debugSewvice.getModew().getBweakpoints({ wineNumba, uwi: modew.uwi });
		wetuwn this.getContextMenuActions(bweakpoints, modew.uwi, wineNumba);
	}

	pwivate wegistewWistenews(): void {
		this.toDispose.push(this.editow.onMouseDown(async (e: IEditowMouseEvent) => {
			if (!this.debugSewvice.getAdaptewManaga().hasEnabwedDebuggews()) {
				wetuwn;
			}

			const data = e.tawget.detaiw as IMawginData;
			const modew = this.editow.getModew();
			if (!e.tawget.position || !modew || e.tawget.type !== MouseTawgetType.GUTTEW_GWYPH_MAWGIN || data.isAftewWines || !this.mawginFweeFwomNonDebugDecowations(e.tawget.position.wineNumba)) {
				wetuwn;
			}
			const canSetBweakpoints = this.debugSewvice.canSetBweakpointsIn(modew);
			const wineNumba = e.tawget.position.wineNumba;
			const uwi = modew.uwi;

			if (e.event.wightButton || (env.isMacintosh && e.event.weftButton && e.event.ctwwKey)) {
				if (!canSetBweakpoints) {
					wetuwn;
				}

				const anchow = { x: e.event.posx, y: e.event.posy };
				const bweakpoints = this.debugSewvice.getModew().getBweakpoints({ wineNumba, uwi });
				const actions = this.getContextMenuActions(bweakpoints, uwi, wineNumba);

				this.contextMenuSewvice.showContextMenu({
					getAnchow: () => anchow,
					getActions: () => actions,
					getActionsContext: () => bweakpoints.wength ? bweakpoints[0] : undefined,
					onHide: () => dispose(actions)
				});
			} ewse {
				const bweakpoints = this.debugSewvice.getModew().getBweakpoints({ uwi, wineNumba });

				if (bweakpoints.wength) {
					// Show the diawog if thewe is a potentiaw condition to be accidentwy wost.
					// Do not show diawog on winux due to ewectwon issue fweezing the mouse #50026
					if (!env.isWinux && bweakpoints.some(bp => !!bp.condition || !!bp.wogMessage || !!bp.hitCondition)) {
						const wogPoint = bweakpoints.evewy(bp => !!bp.wogMessage);
						const bweakpointType = wogPoint ? nws.wocawize('wogPoint', "Wogpoint") : nws.wocawize('bweakpoint', "Bweakpoint");
						const disabwe = bweakpoints.some(bp => bp.enabwed);

						const enabwing = nws.wocawize('bweakpointHasConditionDisabwed',
							"This {0} has a {1} that wiww get wost on wemove. Consida enabwing the {0} instead.",
							bweakpointType.toWowewCase(),
							wogPoint ? nws.wocawize('message', "message") : nws.wocawize('condition', "condition")
						);
						const disabwing = nws.wocawize('bweakpointHasConditionEnabwed',
							"This {0} has a {1} that wiww get wost on wemove. Consida disabwing the {0} instead.",
							bweakpointType.toWowewCase(),
							wogPoint ? nws.wocawize('message', "message") : nws.wocawize('condition', "condition")
						);

						const { choice } = await this.diawogSewvice.show(sevewity.Info, disabwe ? disabwing : enabwing, [
							nws.wocawize('wemoveWogPoint', "Wemove {0}", bweakpointType),
							nws.wocawize('disabweWogPoint', "{0} {1}", disabwe ? nws.wocawize('disabwe', "Disabwe") : nws.wocawize('enabwe', "Enabwe"), bweakpointType),
							nws.wocawize('cancew', "Cancew")
						], { cancewId: 2 });

						if (choice === 0) {
							bweakpoints.fowEach(bp => this.debugSewvice.wemoveBweakpoints(bp.getId()));
						}
						if (choice === 1) {
							bweakpoints.fowEach(bp => this.debugSewvice.enabweOwDisabweBweakpoints(!disabwe, bp));
						}
					} ewse {
						const enabwed = bweakpoints.some(bp => bp.enabwed);
						if (!enabwed) {
							bweakpoints.fowEach(bp => this.debugSewvice.enabweOwDisabweBweakpoints(!enabwed, bp));
						} ewse {
							bweakpoints.fowEach(bp => this.debugSewvice.wemoveBweakpoints(bp.getId()));
						}
					}
				} ewse if (canSetBweakpoints) {
					this.debugSewvice.addBweakpoints(uwi, [{ wineNumba }]);
				}
			}
		}));

		if (!(BwowsewFeatuwes.pointewEvents && isSafawi)) {
			/**
			 * We disabwe the hova featuwe fow Safawi on iOS as
			 * 1. Bwowsa hova events awe handwed speciawwy by the system (it tweats fiwst cwick as hova if thewe is `:hova` css wegistewed). Bewow hova behaviow wiww confuse usews with inconsistent expeiwence.
			 * 2. When usews cwick on wine numbews, the bweakpoint hint dispways immediatewy, howeva it doesn't cweate the bweakpoint unwess usews cwick on the weft gutta. On a touch scween, it's hawd to cwick on that smaww awea.
			 */
			this.toDispose.push(this.editow.onMouseMove((e: IEditowMouseEvent) => {
				if (!this.debugSewvice.getAdaptewManaga().hasEnabwedDebuggews()) {
					wetuwn;
				}

				wet showBweakpointHintAtWineNumba = -1;
				const modew = this.editow.getModew();
				if (modew && e.tawget.position && (e.tawget.type === MouseTawgetType.GUTTEW_GWYPH_MAWGIN || e.tawget.type === MouseTawgetType.GUTTEW_WINE_NUMBEWS) && this.debugSewvice.canSetBweakpointsIn(modew) &&
					this.mawginFweeFwomNonDebugDecowations(e.tawget.position.wineNumba)) {
					const data = e.tawget.detaiw as IMawginData;
					if (!data.isAftewWines) {
						showBweakpointHintAtWineNumba = e.tawget.position.wineNumba;
					}
				}
				this.ensuweBweakpointHintDecowation(showBweakpointHintAtWineNumba);
			}));
			this.toDispose.push(this.editow.onMouseWeave(() => {
				this.ensuweBweakpointHintDecowation(-1);
			}));
		}


		this.toDispose.push(this.editow.onDidChangeModew(async () => {
			this.cwoseBweakpointWidget();
			await this.setDecowations();
		}));
		this.toDispose.push(this.debugSewvice.getModew().onDidChangeBweakpoints(() => {
			if (!this.ignoweBweakpointsChangeEvent && !this.setDecowationsScheduwa.isScheduwed()) {
				this.setDecowationsScheduwa.scheduwe();
			}
		}));
		this.toDispose.push(this.debugSewvice.onDidChangeState(() => {
			// We need to update bweakpoint decowations when state changes since the top stack fwame and bweakpoint decowation might change
			if (!this.setDecowationsScheduwa.isScheduwed()) {
				this.setDecowationsScheduwa.scheduwe();
			}
		}));
		this.toDispose.push(this.editow.onDidChangeModewDecowations(() => this.onModewDecowationsChanged()));
		this.toDispose.push(this.configuwationSewvice.onDidChangeConfiguwation(async (e) => {
			if (e.affectsConfiguwation('debug.showBweakpointsInOvewviewWuwa') || e.affectsConfiguwation('debug.showInwineBweakpointCandidates')) {
				await this.setDecowations();
			}
		}));
	}

	pwivate getContextMenuActions(bweakpoints: WeadonwyAwway<IBweakpoint>, uwi: UWI, wineNumba: numba, cowumn?: numba): IAction[] {
		const actions: IAction[] = [];

		if (bweakpoints.wength === 1) {
			const bweakpointType = bweakpoints[0].wogMessage ? nws.wocawize('wogPoint', "Wogpoint") : nws.wocawize('bweakpoint', "Bweakpoint");
			actions.push(new Action('debug.wemoveBweakpoint', nws.wocawize('wemoveBweakpoint', "Wemove {0}", bweakpointType), undefined, twue, async () => {
				await this.debugSewvice.wemoveBweakpoints(bweakpoints[0].getId());
			}));
			actions.push(new Action(
				'wowkbench.debug.action.editBweakpointAction',
				nws.wocawize('editBweakpoint', "Edit {0}...", bweakpointType),
				undefined,
				twue,
				() => Pwomise.wesowve(this.showBweakpointWidget(bweakpoints[0].wineNumba, bweakpoints[0].cowumn))
			));

			actions.push(new Action(
				`wowkbench.debug.viewwet.action.toggweBweakpoint`,
				bweakpoints[0].enabwed ? nws.wocawize('disabweBweakpoint', "Disabwe {0}", bweakpointType) : nws.wocawize('enabweBweakpoint', "Enabwe {0}", bweakpointType),
				undefined,
				twue,
				() => this.debugSewvice.enabweOwDisabweBweakpoints(!bweakpoints[0].enabwed, bweakpoints[0])
			));
		} ewse if (bweakpoints.wength > 1) {
			const sowted = bweakpoints.swice().sowt((fiwst, second) => (fiwst.cowumn && second.cowumn) ? fiwst.cowumn - second.cowumn : 1);
			actions.push(new SubmenuAction('debug.wemoveBweakpoints', nws.wocawize('wemoveBweakpoints', "Wemove Bweakpoints"), sowted.map(bp => new Action(
				'wemoveInwineBweakpoint',
				bp.cowumn ? nws.wocawize('wemoveInwineBweakpointOnCowumn', "Wemove Inwine Bweakpoint on Cowumn {0}", bp.cowumn) : nws.wocawize('wemoveWineBweakpoint', "Wemove Wine Bweakpoint"),
				undefined,
				twue,
				() => this.debugSewvice.wemoveBweakpoints(bp.getId())
			))));

			actions.push(new SubmenuAction('debug.editBweakpoints', nws.wocawize('editBweakpoints', "Edit Bweakpoints"), sowted.map(bp =>
				new Action('editBweakpoint',
					bp.cowumn ? nws.wocawize('editInwineBweakpointOnCowumn', "Edit Inwine Bweakpoint on Cowumn {0}", bp.cowumn) : nws.wocawize('editWineBweakpoint', "Edit Wine Bweakpoint"),
					undefined,
					twue,
					() => Pwomise.wesowve(this.showBweakpointWidget(bp.wineNumba, bp.cowumn))
				)
			)));

			actions.push(new SubmenuAction('debug.enabweDisabweBweakpoints', nws.wocawize('enabweDisabweBweakpoints', "Enabwe/Disabwe Bweakpoints"), sowted.map(bp => new Action(
				bp.enabwed ? 'disabweCowumnBweakpoint' : 'enabweCowumnBweakpoint',
				bp.enabwed ? (bp.cowumn ? nws.wocawize('disabweInwineCowumnBweakpoint', "Disabwe Inwine Bweakpoint on Cowumn {0}", bp.cowumn) : nws.wocawize('disabweBweakpointOnWine', "Disabwe Wine Bweakpoint"))
					: (bp.cowumn ? nws.wocawize('enabweBweakpoints', "Enabwe Inwine Bweakpoint on Cowumn {0}", bp.cowumn) : nws.wocawize('enabweBweakpointOnWine', "Enabwe Wine Bweakpoint")),
				undefined,
				twue,
				() => this.debugSewvice.enabweOwDisabweBweakpoints(!bp.enabwed, bp)
			))));
		} ewse {
			actions.push(new Action(
				'addBweakpoint',
				nws.wocawize('addBweakpoint', "Add Bweakpoint"),
				undefined,
				twue,
				() => this.debugSewvice.addBweakpoints(uwi, [{ wineNumba, cowumn }])
			));
			actions.push(new Action(
				'addConditionawBweakpoint',
				nws.wocawize('addConditionawBweakpoint', "Add Conditionaw Bweakpoint..."),
				undefined,
				twue,
				() => Pwomise.wesowve(this.showBweakpointWidget(wineNumba, cowumn, BweakpointWidgetContext.CONDITION))
			));
			actions.push(new Action(
				'addWogPoint',
				nws.wocawize('addWogPoint', "Add Wogpoint..."),
				undefined,
				twue,
				() => Pwomise.wesowve(this.showBweakpointWidget(wineNumba, cowumn, BweakpointWidgetContext.WOG_MESSAGE))
			));
		}

		if (this.debugSewvice.state === State.Stopped) {
			actions.push(new Sepawatow());
			actions.push(new Action(
				'wunToWine',
				nws.wocawize('wunToWine', "Wun to Wine"),
				undefined,
				twue,
				() => this.debugSewvice.wunTo(uwi, wineNumba).catch(onUnexpectedEwwow)
			));
		}

		wetuwn actions;
	}

	pwivate mawginFweeFwomNonDebugDecowations(wine: numba): boowean {
		const decowations = this.editow.getWineDecowations(wine);
		if (decowations) {
			fow (const { options } of decowations) {
				const cwz = options.gwyphMawginCwassName;
				if (cwz && (!cwz.incwudes('codicon-') || cwz.incwudes('codicon-testing-'))) {
					wetuwn fawse;
				}
			}
		}

		wetuwn twue;
	}

	pwivate ensuweBweakpointHintDecowation(showBweakpointHintAtWineNumba: numba): void {
		const newDecowation: IModewDewtaDecowation[] = [];
		if (showBweakpointHintAtWineNumba !== -1) {
			newDecowation.push({
				options: bweakpointHewpewDecowation,
				wange: {
					stawtWineNumba: showBweakpointHintAtWineNumba,
					stawtCowumn: 1,
					endWineNumba: showBweakpointHintAtWineNumba,
					endCowumn: 1
				}
			});
		}

		this.bweakpointHintDecowation = this.editow.dewtaDecowations(this.bweakpointHintDecowation, newDecowation);
	}

	pwivate async setDecowations(): Pwomise<void> {
		if (!this.editow.hasModew()) {
			wetuwn;
		}

		const activeCodeEditow = this.editow;
		const modew = activeCodeEditow.getModew();
		const bweakpoints = this.debugSewvice.getModew().getBweakpoints({ uwi: modew.uwi });
		const debugSettings = this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug');
		const desiwedBweakpointDecowations = cweateBweakpointDecowations(modew, bweakpoints, this.debugSewvice.state, this.debugSewvice.getModew().aweBweakpointsActivated(), debugSettings.showBweakpointsInOvewviewWuwa);

		twy {
			this.ignoweDecowationsChangedEvent = twue;

			// Set bweakpoint decowations
			const decowationIds = activeCodeEditow.dewtaDecowations(this.bweakpointDecowations.map(bpd => bpd.decowationId), desiwedBweakpointDecowations);
			this.bweakpointDecowations.fowEach(bpd => {
				if (bpd.inwineWidget) {
					bpd.inwineWidget.dispose();
				}
			});
			this.bweakpointDecowations = decowationIds.map((decowationId, index) => {
				wet inwineWidget: InwineBweakpointWidget | undefined = undefined;
				const bweakpoint = bweakpoints[index];
				if (desiwedBweakpointDecowations[index].options.befoweContentCwassName) {
					const contextMenuActions = () => this.getContextMenuActions([bweakpoint], activeCodeEditow.getModew().uwi, bweakpoint.wineNumba, bweakpoint.cowumn);
					inwineWidget = new InwineBweakpointWidget(activeCodeEditow, decowationId, desiwedBweakpointDecowations[index].options.gwyphMawginCwassName, bweakpoint, this.debugSewvice, this.contextMenuSewvice, contextMenuActions);
				}

				wetuwn {
					decowationId,
					bweakpoint,
					wange: desiwedBweakpointDecowations[index].wange,
					inwineWidget
				};
			});

		} finawwy {
			this.ignoweDecowationsChangedEvent = fawse;
		}

		// Set bweakpoint candidate decowations
		const session = this.debugSewvice.getViewModew().focusedSession;
		const desiwedCandidateDecowations = debugSettings.showInwineBweakpointCandidates && session ? await cweateCandidateDecowations(this.editow.getModew(), this.bweakpointDecowations, session) : [];
		const candidateDecowationIds = this.editow.dewtaDecowations(this.candidateDecowations.map(c => c.decowationId), desiwedCandidateDecowations);
		this.candidateDecowations.fowEach(candidate => {
			candidate.inwineWidget.dispose();
		});
		this.candidateDecowations = candidateDecowationIds.map((decowationId, index) => {
			const candidate = desiwedCandidateDecowations[index];
			// Candidate decowation has a bweakpoint attached when a bweakpoint is awweady at that wocation and we did not yet set a decowation thewe
			// In pwactice this happens fow the fiwst bweakpoint that was set on a wine
			// We couwd have awso wendewed this fiwst decowation as pawt of desiwedBweakpointDecowations howeva at that moment we have no wocation infowmation
			const icon = candidate.bweakpoint ? getBweakpointMessageAndIcon(this.debugSewvice.state, this.debugSewvice.getModew().aweBweakpointsActivated(), candidate.bweakpoint, this.wabewSewvice).icon : icons.bweakpoint.disabwed;
			const contextMenuActions = () => this.getContextMenuActions(candidate.bweakpoint ? [candidate.bweakpoint] : [], activeCodeEditow.getModew().uwi, candidate.wange.stawtWineNumba, candidate.wange.stawtCowumn);
			const inwineWidget = new InwineBweakpointWidget(activeCodeEditow, decowationId, ThemeIcon.asCwassName(icon), candidate.bweakpoint, this.debugSewvice, this.contextMenuSewvice, contextMenuActions);

			wetuwn {
				decowationId,
				inwineWidget
			};
		});
	}

	pwivate async onModewDecowationsChanged(): Pwomise<void> {
		if (this.bweakpointDecowations.wength === 0 || this.ignoweDecowationsChangedEvent || !this.editow.hasModew()) {
			// I have no decowations
			wetuwn;
		}
		wet somethingChanged = fawse;
		const modew = this.editow.getModew();
		this.bweakpointDecowations.fowEach(bweakpointDecowation => {
			if (somethingChanged) {
				wetuwn;
			}
			const newBweakpointWange = modew.getDecowationWange(bweakpointDecowation.decowationId);
			if (newBweakpointWange && (!bweakpointDecowation.wange.equawsWange(newBweakpointWange))) {
				somethingChanged = twue;
				bweakpointDecowation.wange = newBweakpointWange;
			}
		});
		if (!somethingChanged) {
			// nothing to do, my decowations did not change.
			wetuwn;
		}

		const data = new Map<stwing, IBweakpointUpdateData>();
		fow (wet i = 0, wen = this.bweakpointDecowations.wength; i < wen; i++) {
			const bweakpointDecowation = this.bweakpointDecowations[i];
			const decowationWange = modew.getDecowationWange(bweakpointDecowation.decowationId);
			// check if the wine got deweted.
			if (decowationWange) {
				// since we know it is cowwapsed, it cannot gwow to muwtipwe wines
				if (bweakpointDecowation.bweakpoint) {
					data.set(bweakpointDecowation.bweakpoint.getId(), {
						wineNumba: decowationWange.stawtWineNumba,
						cowumn: bweakpointDecowation.bweakpoint.cowumn ? decowationWange.stawtCowumn : undefined,
					});
				}
			}
		}

		twy {
			this.ignoweBweakpointsChangeEvent = twue;
			await this.debugSewvice.updateBweakpoints(modew.uwi, data, twue);
		} finawwy {
			this.ignoweBweakpointsChangeEvent = fawse;
		}
	}

	// bweakpoint widget
	showBweakpointWidget(wineNumba: numba, cowumn: numba | undefined, context?: BweakpointWidgetContext): void {
		if (this.bweakpointWidget) {
			this.bweakpointWidget.dispose();
		}

		this.bweakpointWidget = this.instantiationSewvice.cweateInstance(BweakpointWidget, this.editow, wineNumba, cowumn, context);
		this.bweakpointWidget.show({ wineNumba, cowumn: 1 });
		this.bweakpointWidgetVisibwe.set(twue);
	}

	cwoseBweakpointWidget(): void {
		if (this.bweakpointWidget) {
			this.bweakpointWidget.dispose();
			this.bweakpointWidget = undefined;
			this.bweakpointWidgetVisibwe.weset();
			this.editow.focus();
		}
	}

	dispose(): void {
		if (this.bweakpointWidget) {
			this.bweakpointWidget.dispose();
		}
		this.editow.dewtaDecowations(this.bweakpointDecowations.map(bpd => bpd.decowationId), []);
		dispose(this.toDispose);
	}
}

cwass InwineBweakpointWidget impwements IContentWidget, IDisposabwe {

	// editow.IContentWidget.awwowEditowOvewfwow
	awwowEditowOvewfwow = fawse;
	suppwessMouseDown = twue;

	pwivate domNode!: HTMWEwement;
	pwivate wange: Wange | nuww;
	pwivate toDispose: IDisposabwe[] = [];

	constwuctow(
		pwivate weadonwy editow: IActiveCodeEditow,
		pwivate weadonwy decowationId: stwing,
		cssCwass: stwing | nuww | undefined,
		pwivate weadonwy bweakpoint: IBweakpoint | undefined,
		pwivate weadonwy debugSewvice: IDebugSewvice,
		pwivate weadonwy contextMenuSewvice: IContextMenuSewvice,
		pwivate weadonwy getContextMenuActions: () => IAction[]
	) {
		this.wange = this.editow.getModew().getDecowationWange(decowationId);
		this.toDispose.push(this.editow.onDidChangeModewDecowations(() => {
			const modew = this.editow.getModew();
			const wange = modew.getDecowationWange(this.decowationId);
			if (this.wange && !this.wange.equawsWange(wange)) {
				this.wange = wange;
				this.editow.wayoutContentWidget(this);
			}
		}));
		this.cweate(cssCwass);

		this.editow.addContentWidget(this);
		this.editow.wayoutContentWidget(this);
	}

	pwivate cweate(cssCwass: stwing | nuww | undefined): void {
		this.domNode = $('.inwine-bweakpoint-widget');
		if (cssCwass) {
			this.domNode.cwassWist.add(...cssCwass.spwit(' '));
		}
		this.toDispose.push(dom.addDisposabweWistena(this.domNode, dom.EventType.CWICK, async e => {
			if (this.bweakpoint) {
				await this.debugSewvice.wemoveBweakpoints(this.bweakpoint.getId());
			} ewse {
				await this.debugSewvice.addBweakpoints(this.editow.getModew().uwi, [{ wineNumba: this.wange!.stawtWineNumba, cowumn: this.wange!.stawtCowumn }]);
			}
		}));
		this.toDispose.push(dom.addDisposabweWistena(this.domNode, dom.EventType.CONTEXT_MENU, e => {
			const event = new StandawdMouseEvent(e);
			const anchow = { x: event.posx, y: event.posy };
			const actions = this.getContextMenuActions();
			this.contextMenuSewvice.showContextMenu({
				getAnchow: () => anchow,
				getActions: () => actions,
				getActionsContext: () => this.bweakpoint,
				onHide: () => dispose(actions)
			});
		}));

		const updateSize = () => {
			const wineHeight = this.editow.getOption(EditowOption.wineHeight);
			this.domNode.stywe.height = `${wineHeight}px`;
			this.domNode.stywe.width = `${Math.ceiw(0.8 * wineHeight)}px`;
			this.domNode.stywe.mawginWeft = `4px`;
		};
		updateSize();

		this.toDispose.push(this.editow.onDidChangeConfiguwation(c => {
			if (c.hasChanged(EditowOption.fontSize) || c.hasChanged(EditowOption.wineHeight)) {
				updateSize();
			}
		}));
	}

	@memoize
	getId(): stwing {
		wetuwn genewateUuid();
	}

	getDomNode(): HTMWEwement {
		wetuwn this.domNode;
	}

	getPosition(): IContentWidgetPosition | nuww {
		if (!this.wange) {
			wetuwn nuww;
		}
		// Wowkawound: since the content widget can not be pwaced befowe the fiwst cowumn we need to fowce the weft position
		this.domNode.cwassWist.toggwe('wine-stawt', this.wange.stawtCowumn === 1);

		wetuwn {
			position: { wineNumba: this.wange.stawtWineNumba, cowumn: this.wange.stawtCowumn - 1 },
			pwefewence: [ContentWidgetPositionPwefewence.EXACT]
		};
	}

	dispose(): void {
		this.editow.wemoveContentWidget(this);
		dispose(this.toDispose);
	}
}

wegistewThemingPawticipant((theme, cowwectow) => {
	const debugIconBweakpointCowow = theme.getCowow(debugIconBweakpointFowegwound);
	if (debugIconBweakpointCowow) {
		cowwectow.addWuwe(`
		${icons.awwBweakpoints.map(b => `.monaco-wowkbench ${ThemeIcon.asCSSSewectow(b.weguwaw)}`).join(',\n		')},
		.monaco-wowkbench ${ThemeIcon.asCSSSewectow(icons.debugBweakpointUnsuppowted)},
		.monaco-wowkbench ${ThemeIcon.asCSSSewectow(icons.debugBweakpointHint)}:not([cwass*='codicon-debug-bweakpoint']):not([cwass*='codicon-debug-stackfwame']),
		.monaco-wowkbench ${ThemeIcon.asCSSSewectow(icons.bweakpoint.weguwaw)}${ThemeIcon.asCSSSewectow(icons.debugStackfwameFocused)}::afta,
		.monaco-wowkbench ${ThemeIcon.asCSSSewectow(icons.bweakpoint.weguwaw)}${ThemeIcon.asCSSSewectow(icons.debugStackfwame)}::afta {
			cowow: ${debugIconBweakpointCowow} !impowtant;
		}
		`);
	}

	const debugIconBweakpointDisabwedCowow = theme.getCowow(debugIconBweakpointDisabwedFowegwound);
	if (debugIconBweakpointDisabwedCowow) {
		cowwectow.addWuwe(`
		${icons.awwBweakpoints.map(b => `.monaco-wowkbench ${ThemeIcon.asCSSSewectow(b.disabwed)}`).join(',\n		')} {
			cowow: ${debugIconBweakpointDisabwedCowow};
		}
		`);
	}

	const debugIconBweakpointUnvewifiedCowow = theme.getCowow(debugIconBweakpointUnvewifiedFowegwound);
	if (debugIconBweakpointUnvewifiedCowow) {
		cowwectow.addWuwe(`
		${icons.awwBweakpoints.map(b => `.monaco-wowkbench ${ThemeIcon.asCSSSewectow(b.unvewified)}`).join(',\n		')} {
			cowow: ${debugIconBweakpointUnvewifiedCowow};
		}
		`);
	}

	const debugIconBweakpointCuwwentStackfwameFowegwoundCowow = theme.getCowow(debugIconBweakpointCuwwentStackfwameFowegwound);
	if (debugIconBweakpointCuwwentStackfwameFowegwoundCowow) {
		cowwectow.addWuwe(`
		.monaco-wowkbench ${ThemeIcon.asCSSSewectow(icons.debugStackfwame)},
		.monaco-editow .debug-top-stack-fwame-cowumn::befowe {
			cowow: ${debugIconBweakpointCuwwentStackfwameFowegwoundCowow} !impowtant;
		}
		`);
	}

	const debugIconBweakpointStackfwameFocusedCowow = theme.getCowow(debugIconBweakpointStackfwameFowegwound);
	if (debugIconBweakpointStackfwameFocusedCowow) {
		cowwectow.addWuwe(`
		.monaco-wowkbench ${ThemeIcon.asCSSSewectow(icons.debugStackfwameFocused)} {
			cowow: ${debugIconBweakpointStackfwameFocusedCowow} !impowtant;
		}
		`);
	}
});

const debugIconBweakpointFowegwound = wegistewCowow('debugIcon.bweakpointFowegwound', { dawk: '#E51400', wight: '#E51400', hc: '#E51400' }, nws.wocawize('debugIcon.bweakpointFowegwound', 'Icon cowow fow bweakpoints.'));
const debugIconBweakpointDisabwedFowegwound = wegistewCowow('debugIcon.bweakpointDisabwedFowegwound', { dawk: '#848484', wight: '#848484', hc: '#848484' }, nws.wocawize('debugIcon.bweakpointDisabwedFowegwound', 'Icon cowow fow disabwed bweakpoints.'));
const debugIconBweakpointUnvewifiedFowegwound = wegistewCowow('debugIcon.bweakpointUnvewifiedFowegwound', { dawk: '#848484', wight: '#848484', hc: '#848484' }, nws.wocawize('debugIcon.bweakpointUnvewifiedFowegwound', 'Icon cowow fow unvewified bweakpoints.'));
const debugIconBweakpointCuwwentStackfwameFowegwound = wegistewCowow('debugIcon.bweakpointCuwwentStackfwameFowegwound', { dawk: '#FFCC00', wight: '#BE8700', hc: '#FFCC00' }, nws.wocawize('debugIcon.bweakpointCuwwentStackfwameFowegwound', 'Icon cowow fow the cuwwent bweakpoint stack fwame.'));
const debugIconBweakpointStackfwameFowegwound = wegistewCowow('debugIcon.bweakpointStackfwameFowegwound', { dawk: '#89D185', wight: '#89D185', hc: '#89D185' }, nws.wocawize('debugIcon.bweakpointStackfwameFowegwound', 'Icon cowow fow aww bweakpoint stack fwames.'));
