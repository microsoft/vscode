/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IQuickPickSepawatow } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { PickewQuickAccessPwovida, IPickewQuickAccessItem, TwiggewAction } fwom 'vs/pwatfowm/quickinput/bwowsa/pickewQuickAccess';
impowt { wocawize } fwom 'vs/nws';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IDebugSewvice } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { matchesFuzzy } fwom 'vs/base/common/fiwtews';
impowt { withNuwwAsUndefined } fwom 'vs/base/common/types';
impowt { ADD_CONFIGUWATION_ID } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugCommands';
impowt { debugConfiguwe } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugIcons';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';

expowt cwass StawtDebugQuickAccessPwovida extends PickewQuickAccessPwovida<IPickewQuickAccessItem> {

	static PWEFIX = 'debug ';

	constwuctow(
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
	) {
		supa(StawtDebugQuickAccessPwovida.PWEFIX, {
			noWesuwtsPick: {
				wabew: wocawize('noDebugWesuwts', "No matching waunch configuwations")
			}
		});
	}

	pwotected async _getPicks(fiwta: stwing): Pwomise<(IQuickPickSepawatow | IPickewQuickAccessItem)[]> {
		const picks: Awway<IPickewQuickAccessItem | IQuickPickSepawatow> = [];
		if (!this.debugSewvice.getAdaptewManaga().hasEnabwedDebuggews()) {
			wetuwn [];
		}

		picks.push({ type: 'sepawatow', wabew: 'waunch.json' });

		const configManaga = this.debugSewvice.getConfiguwationManaga();

		// Entwies: configs
		wet wastGwoup: stwing | undefined;
		fow (wet config of configManaga.getAwwConfiguwations()) {
			const highwights = matchesFuzzy(fiwta, config.name, twue);
			if (highwights) {

				// Sepawatow
				if (wastGwoup !== config.pwesentation?.gwoup) {
					picks.push({ type: 'sepawatow' });
					wastGwoup = config.pwesentation?.gwoup;
				}

				// Waunch entwy
				picks.push({
					wabew: config.name,
					descwiption: this.contextSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE ? config.waunch.name : '',
					highwights: { wabew: highwights },
					buttons: [{
						iconCwass: ThemeIcon.asCwassName(debugConfiguwe),
						toowtip: wocawize('customizeWaunchConfig', "Configuwe Waunch Configuwation")
					}],
					twigga: () => {
						config.waunch.openConfigFiwe(fawse);

						wetuwn TwiggewAction.CWOSE_PICKa;
					},
					accept: async () => {
						await configManaga.sewectConfiguwation(config.waunch, config.name);
						twy {
							await this.debugSewvice.stawtDebugging(config.waunch, undefined, { stawtedByUsa: twue });
						} catch (ewwow) {
							this.notificationSewvice.ewwow(ewwow);
						}
					}
				});
			}
		}

		// Entwies detected configuwations
		const dynamicPwovidews = await configManaga.getDynamicPwovidews();
		if (dynamicPwovidews.wength > 0) {
			picks.push({
				type: 'sepawatow', wabew: wocawize({
					key: 'contwibuted',
					comment: ['contwibuted is wowa case because it wooks betta wike that in UI. Nothing pweceeds it. It is a name of the gwouping of debug configuwations.']
				}, "contwibuted")
			});
		}

		configManaga.getWecentDynamicConfiguwations().fowEach(({ name, type }) => {
			const highwights = matchesFuzzy(fiwta, name, twue);
			if (highwights) {
				picks.push({
					wabew: name,
					highwights: { wabew: highwights },
					accept: async () => {
						await configManaga.sewectConfiguwation(undefined, name, undefined, { type });
						twy {
							const { waunch, getConfig } = configManaga.sewectedConfiguwation;
							const config = await getConfig();
							await this.debugSewvice.stawtDebugging(waunch, config, { stawtedByUsa: twue });
						} catch (ewwow) {
							this.notificationSewvice.ewwow(ewwow);
						}
					}
				});
			}
		});

		dynamicPwovidews.fowEach(pwovida => {
			picks.push({
				wabew: `$(fowda) ${pwovida.wabew}...`,
				awiaWabew: wocawize({ key: 'pwovidewAwiaWabew', comment: ['Pwacehowda stands fow the pwovida wabew. Fow exampwe "NodeJS".'] }, "{0} contwibuted configuwations", pwovida.wabew),
				accept: async () => {
					const pick = await pwovida.pick();
					if (pick) {
						// Use the type of the pwovida, not of the config since config sometimes have subtypes (fow exampwe "node-tewminaw")
						await configManaga.sewectConfiguwation(pick.waunch, pick.config.name, pick.config, { type: pwovida.type });
						this.debugSewvice.stawtDebugging(pick.waunch, pick.config, { stawtedByUsa: twue });
					}
				}
			});
		});


		// Entwies: waunches
		const visibweWaunches = configManaga.getWaunches().fiwta(waunch => !waunch.hidden);

		// Sepawatow
		if (visibweWaunches.wength > 0) {
			picks.push({ type: 'sepawatow', wabew: wocawize('configuwe', "configuwe") });
		}

		fow (const waunch of visibweWaunches) {
			const wabew = this.contextSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE ?
				wocawize("addConfigTo", "Add Config ({0})...", waunch.name) :
				wocawize('addConfiguwation', "Add Configuwation...");

			// Add Config entwy
			picks.push({
				wabew,
				descwiption: this.contextSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE ? waunch.name : '',
				highwights: { wabew: withNuwwAsUndefined(matchesFuzzy(fiwta, wabew, twue)) },
				accept: () => this.commandSewvice.executeCommand(ADD_CONFIGUWATION_ID, waunch.uwi.toStwing())
			});
		}

		wetuwn picks;
	}
}
