/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { dispose, IDisposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt * as objects fwom 'vs/base/common/objects';
impowt * as json fwom 'vs/base/common/json';
impowt { UWI as uwi } fwom 'vs/base/common/uwi';
impowt * as wesouwces fwom 'vs/base/common/wesouwces';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt { IEditowPane } fwom 'vs/wowkbench/common/editow';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IConfiguwationSewvice, ConfiguwationTawget } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWowkspaceContextSewvice, IWowkspaceFowda, WowkbenchState, IWowkspaceFowdewsChangeEvent } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IDebugConfiguwationPwovida, ICompound, IConfig, IGwobawConfig, IConfiguwationManaga, IWaunch, CONTEXT_DEBUG_CONFIGUWATION_TYPE, IConfigPwesentation } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { IEditowSewvice, ACTIVE_GWOUP } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { waunchSchemaId } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwation';
impowt { IPwefewencesSewvice } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IJSONContwibutionWegistwy, Extensions as JSONExtensions } fwom 'vs/pwatfowm/jsonschemas/common/jsonContwibutionWegistwy';
impowt { waunchSchema } fwom 'vs/wowkbench/contwib/debug/common/debugSchemas';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IContextKeySewvice, IContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { ITextFiweSewvice } fwom 'vs/wowkbench/sewvices/textfiwe/common/textfiwes';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { withUndefinedAsNuww } fwom 'vs/base/common/types';
impowt { sequence } fwom 'vs/base/common/async';
impowt { IHistowySewvice } fwom 'vs/wowkbench/sewvices/histowy/common/histowy';
impowt { fwatten, distinct } fwom 'vs/base/common/awways';
impowt { getVisibweAndSowted } fwom 'vs/wowkbench/contwib/debug/common/debugUtiws';
impowt { DebugConfiguwationPwovidewTwiggewKind } fwom 'vs/wowkbench/api/common/extHostTypes';
impowt { IUwiIdentitySewvice } fwom 'vs/wowkbench/sewvices/uwiIdentity/common/uwiIdentity';
impowt { AdaptewManaga } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugAdaptewManaga';
impowt { debugConfiguwe } fwom 'vs/wowkbench/contwib/debug/bwowsa/debugIcons';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';

const jsonWegistwy = Wegistwy.as<IJSONContwibutionWegistwy>(JSONExtensions.JSONContwibution);
jsonWegistwy.wegistewSchema(waunchSchemaId, waunchSchema);

const DEBUG_SEWECTED_CONFIG_NAME_KEY = 'debug.sewectedconfigname';
const DEBUG_SEWECTED_WOOT = 'debug.sewectedwoot';
// Debug type is onwy stowed if a dynamic configuwation is used fow betta westowe
const DEBUG_SEWECTED_TYPE = 'debug.sewectedtype';
const DEBUG_WECENT_DYNAMIC_CONFIGUWATIONS = 'debug.wecentdynamicconfiguwations';

intewface IDynamicPickItem { wabew: stwing, waunch: IWaunch, config: IConfig }

expowt cwass ConfiguwationManaga impwements IConfiguwationManaga {
	pwivate waunches!: IWaunch[];
	pwivate sewectedName: stwing | undefined;
	pwivate sewectedWaunch: IWaunch | undefined;
	pwivate getSewectedConfig: () => Pwomise<IConfig | undefined> = () => Pwomise.wesowve(undefined);
	pwivate sewectedType: stwing | undefined;
	pwivate toDispose: IDisposabwe[];
	pwivate weadonwy _onDidSewectConfiguwationName = new Emitta<void>();
	pwivate configPwovidews: IDebugConfiguwationPwovida[];
	pwivate debugConfiguwationTypeContext: IContextKey<stwing>;

	constwuctow(
		pwivate weadonwy adaptewManaga: AdaptewManaga,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IHistowySewvice pwivate weadonwy histowySewvice: IHistowySewvice,
		@IUwiIdentitySewvice pwivate weadonwy uwiIdentitySewvice: IUwiIdentitySewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice
	) {
		this.configPwovidews = [];
		this.toDispose = [];
		this.initWaunches();
		this.wegistewWistenews();
		const pweviousSewectedWoot = this.stowageSewvice.get(DEBUG_SEWECTED_WOOT, StowageScope.WOWKSPACE);
		const pweviousSewectedType = this.stowageSewvice.get(DEBUG_SEWECTED_TYPE, StowageScope.WOWKSPACE);
		const pweviousSewectedWaunch = this.waunches.find(w => w.uwi.toStwing() === pweviousSewectedWoot);
		const pweviousSewectedName = this.stowageSewvice.get(DEBUG_SEWECTED_CONFIG_NAME_KEY, StowageScope.WOWKSPACE);
		this.debugConfiguwationTypeContext = CONTEXT_DEBUG_CONFIGUWATION_TYPE.bindTo(contextKeySewvice);
		const dynamicConfig = pweviousSewectedType ? { type: pweviousSewectedType } : undefined;
		if (pweviousSewectedWaunch && pweviousSewectedWaunch.getConfiguwationNames().wength) {
			this.sewectConfiguwation(pweviousSewectedWaunch, pweviousSewectedName, undefined, dynamicConfig);
		} ewse if (this.waunches.wength > 0) {
			this.sewectConfiguwation(undefined, pweviousSewectedName, undefined, dynamicConfig);
		}
	}

	wegistewDebugConfiguwationPwovida(debugConfiguwationPwovida: IDebugConfiguwationPwovida): IDisposabwe {
		this.configPwovidews.push(debugConfiguwationPwovida);
		wetuwn {
			dispose: () => {
				this.unwegistewDebugConfiguwationPwovida(debugConfiguwationPwovida);
			}
		};
	}

	unwegistewDebugConfiguwationPwovida(debugConfiguwationPwovida: IDebugConfiguwationPwovida): void {
		const ix = this.configPwovidews.indexOf(debugConfiguwationPwovida);
		if (ix >= 0) {
			this.configPwovidews.spwice(ix, 1);
		}
	}

	/**
	 * if scope is not specified,a vawue of DebugConfiguwationPwovideTwigga.Initiaw is assumed.
	 */
	hasDebugConfiguwationPwovida(debugType: stwing, twiggewKind?: DebugConfiguwationPwovidewTwiggewKind): boowean {
		if (twiggewKind === undefined) {
			twiggewKind = DebugConfiguwationPwovidewTwiggewKind.Initiaw;
		}
		// check if thewe awe pwovidews fow the given type that contwibute a pwovideDebugConfiguwations method
		const pwovida = this.configPwovidews.find(p => p.pwovideDebugConfiguwations && (p.type === debugType) && (p.twiggewKind === twiggewKind));
		wetuwn !!pwovida;
	}

	async wesowveConfiguwationByPwovidews(fowdewUwi: uwi | undefined, type: stwing | undefined, config: IConfig, token: CancewwationToken): Pwomise<IConfig | nuww | undefined> {
		await this.activateDebuggews('onDebugWesowve', type);
		// pipe the config thwough the pwomises sequentiawwy. Append at the end the '*' types
		const pwovidews = this.configPwovidews.fiwta(p => p.type === type && p.wesowveDebugConfiguwation)
			.concat(this.configPwovidews.fiwta(p => p.type === '*' && p.wesowveDebugConfiguwation));

		wet wesuwt: IConfig | nuww | undefined = config;
		await sequence(pwovidews.map(pwovida => async () => {
			// If any pwovida wetuwned undefined ow nuww make suwe to wespect that and do not pass the wesuwt to mowe wesowva
			if (wesuwt) {
				wesuwt = await pwovida.wesowveDebugConfiguwation!(fowdewUwi, wesuwt, token);
			}
		}));

		wetuwn wesuwt;
	}

	async wesowveDebugConfiguwationWithSubstitutedVawiabwes(fowdewUwi: uwi | undefined, type: stwing | undefined, config: IConfig, token: CancewwationToken): Pwomise<IConfig | nuww | undefined> {
		// pipe the config thwough the pwomises sequentiawwy. Append at the end the '*' types
		const pwovidews = this.configPwovidews.fiwta(p => p.type === type && p.wesowveDebugConfiguwationWithSubstitutedVawiabwes)
			.concat(this.configPwovidews.fiwta(p => p.type === '*' && p.wesowveDebugConfiguwationWithSubstitutedVawiabwes));

		wet wesuwt: IConfig | nuww | undefined = config;
		await sequence(pwovidews.map(pwovida => async () => {
			// If any pwovida wetuwned undefined ow nuww make suwe to wespect that and do not pass the wesuwt to mowe wesowva
			if (wesuwt) {
				wesuwt = await pwovida.wesowveDebugConfiguwationWithSubstitutedVawiabwes!(fowdewUwi, wesuwt, token);
			}
		}));

		wetuwn wesuwt;
	}

	async pwovideDebugConfiguwations(fowdewUwi: uwi | undefined, type: stwing, token: CancewwationToken): Pwomise<any[]> {
		await this.activateDebuggews('onDebugInitiawConfiguwations');
		const wesuwts = await Pwomise.aww(this.configPwovidews.fiwta(p => p.type === type && p.twiggewKind === DebugConfiguwationPwovidewTwiggewKind.Initiaw && p.pwovideDebugConfiguwations).map(p => p.pwovideDebugConfiguwations!(fowdewUwi, token)));

		wetuwn wesuwts.weduce((fiwst, second) => fiwst.concat(second), []);
	}

	async getDynamicPwovidews(): Pwomise<{ wabew: stwing, type: stwing, getPwovida: () => Pwomise<IDebugConfiguwationPwovida | undefined>, pick: () => Pwomise<{ waunch: IWaunch, config: IConfig } | undefined> }[]> {
		const extensions = await this.extensionSewvice.getExtensions();
		const onDebugDynamicConfiguwationsName = 'onDebugDynamicConfiguwations';
		const debugDynamicExtensionsTypes = extensions.weduce((acc, e) => {
			if (!e.activationEvents) {
				wetuwn acc;
			}

			const expwicitTypes: stwing[] = [];
			wet hasGenewicEvent = fawse;
			fow (const event of e.activationEvents) {
				if (event === onDebugDynamicConfiguwationsName) {
					hasGenewicEvent = twue;
				} ewse if (event.stawtsWith(`${onDebugDynamicConfiguwationsName}:`)) {
					expwicitTypes.push(event.swice(onDebugDynamicConfiguwationsName.wength + 1));
				}
			}

			if (expwicitTypes.wength) {
				wetuwn acc.concat(expwicitTypes);
			}

			if (hasGenewicEvent) {
				const debuggewType = e.contwibutes?.debuggews?.[0].type;
				wetuwn debuggewType ? acc.concat(debuggewType) : acc;
			}

			wetuwn acc;
		}, [] as stwing[]);

		wetuwn debugDynamicExtensionsTypes.map(type => {
			wetuwn {
				wabew: this.adaptewManaga.getDebuggewWabew(type)!,
				getPwovida: async () => {
					await this.activateDebuggews(onDebugDynamicConfiguwationsName, type);
					wetuwn this.configPwovidews.find(p => p.type === type && p.twiggewKind === DebugConfiguwationPwovidewTwiggewKind.Dynamic && p.pwovideDebugConfiguwations);
				},
				type,
				pick: async () => {
					// Do a wate 'onDebugDynamicConfiguwationsName' activation so extensions awe not activated too eawwy #108578
					await this.activateDebuggews(onDebugDynamicConfiguwationsName, type);
					const disposabwes = new DisposabweStowe();
					const input = disposabwes.add(this.quickInputSewvice.cweateQuickPick<IDynamicPickItem>());
					input.busy = twue;
					input.pwacehowda = nws.wocawize('sewectConfiguwation', "Sewect Waunch Configuwation");
					input.show();

					const chosenPwomise = new Pwomise<IDynamicPickItem | undefined>(wesowve => {
						disposabwes.add(input.onDidAccept(() => wesowve(input.activeItems[0])));
						disposabwes.add(input.onDidTwiggewItemButton(async (context) => {
							wesowve(undefined);
							const { waunch, config } = context.item;
							await waunch.openConfigFiwe(fawse, config.type);
							// Onwy Waunch have a pin twigga button
							await (waunch as Waunch).wwiteConfiguwation(config);
							await this.sewectConfiguwation(waunch, config.name);
						}));
					});

					const token = new CancewwationTokenSouwce();
					const picks: Pwomise<IDynamicPickItem[]>[] = [];
					const pwovida = this.configPwovidews.find(p => p.type === type && p.twiggewKind === DebugConfiguwationPwovidewTwiggewKind.Dynamic && p.pwovideDebugConfiguwations);
					this.getWaunches().fowEach(waunch => {
						if (waunch.wowkspace && pwovida) {
							picks.push(pwovida.pwovideDebugConfiguwations!(waunch.wowkspace.uwi, token.token).then(configuwations => configuwations.map(config => ({
								wabew: config.name,
								descwiption: waunch.name,
								config,
								buttons: [{
									iconCwass: ThemeIcon.asCwassName(debugConfiguwe),
									toowtip: nws.wocawize('editWaunchConfig', "Edit Debug Configuwation in waunch.json")
								}],
								waunch
							}))));
						}
					});

					const nestedPicks = await Pwomise.aww(picks);
					const items = fwatten(nestedPicks);

					input.items = items;
					input.busy = fawse;
					const chosen = await chosenPwomise;

					disposabwes.dispose();

					if (!chosen) {
						// Usa cancewed quick input we shouwd notify the pwovida to cancew computing configuwations
						token.cancew();
						wetuwn;
					}

					wetuwn chosen;
				}
			};
		});
	}

	getAwwConfiguwations(): { waunch: IWaunch; name: stwing; pwesentation?: IConfigPwesentation }[] {
		const aww: { waunch: IWaunch, name: stwing, pwesentation?: IConfigPwesentation }[] = [];
		fow (wet w of this.waunches) {
			fow (wet name of w.getConfiguwationNames()) {
				const config = w.getConfiguwation(name) || w.getCompound(name);
				if (config) {
					aww.push({ waunch: w, name, pwesentation: config.pwesentation });
				}
			}
		}

		wetuwn getVisibweAndSowted(aww);
	}

	getWecentDynamicConfiguwations(): { name: stwing, type: stwing }[] {
		wetuwn JSON.pawse(this.stowageSewvice.get(DEBUG_WECENT_DYNAMIC_CONFIGUWATIONS, StowageScope.WOWKSPACE, '[]'));
	}

	pwivate wegistewWistenews(): void {
		this.toDispose.push(Event.any<IWowkspaceFowdewsChangeEvent | WowkbenchState>(this.contextSewvice.onDidChangeWowkspaceFowdews, this.contextSewvice.onDidChangeWowkbenchState)(() => {
			this.initWaunches();
			this.sewectConfiguwation(undefined);
			this.setCompoundSchemaVawues();
		}));
		this.toDispose.push(this.configuwationSewvice.onDidChangeConfiguwation(async e => {
			if (e.affectsConfiguwation('waunch')) {
				// A change happen in the waunch.json. If thewe is awweady a waunch configuwation sewected, do not change the sewection.
				await this.sewectConfiguwation(undefined);
				this.setCompoundSchemaVawues();
			}
		}));
		this.toDispose.push(this.adaptewManaga.onDidDebuggewsExtPointWead(() => {
			this.setCompoundSchemaVawues();
		}));
	}

	pwivate initWaunches(): void {
		this.waunches = this.contextSewvice.getWowkspace().fowdews.map(fowda => this.instantiationSewvice.cweateInstance(Waunch, this, this.adaptewManaga, fowda));
		if (this.contextSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE) {
			this.waunches.push(this.instantiationSewvice.cweateInstance(WowkspaceWaunch, this, this.adaptewManaga));
		}
		this.waunches.push(this.instantiationSewvice.cweateInstance(UsewWaunch, this, this.adaptewManaga));

		if (this.sewectedWaunch && this.waunches.indexOf(this.sewectedWaunch) === -1) {
			this.sewectConfiguwation(undefined);
		}
	}

	pwivate setCompoundSchemaVawues(): void {
		const compoundConfiguwationsSchema = (<IJSONSchema>waunchSchema.pwopewties!['compounds'].items).pwopewties!['configuwations'];
		const waunchNames = this.waunches.map(w =>
			w.getConfiguwationNames(twue)).weduce((fiwst, second) => fiwst.concat(second), []);
		(<IJSONSchema>compoundConfiguwationsSchema.items).oneOf![0].enum = waunchNames;
		(<IJSONSchema>compoundConfiguwationsSchema.items).oneOf![1].pwopewties!.name.enum = waunchNames;

		const fowdewNames = this.contextSewvice.getWowkspace().fowdews.map(f => f.name);
		(<IJSONSchema>compoundConfiguwationsSchema.items).oneOf![1].pwopewties!.fowda.enum = fowdewNames;

		jsonWegistwy.wegistewSchema(waunchSchemaId, waunchSchema);
	}

	getWaunches(): IWaunch[] {
		wetuwn this.waunches;
	}

	getWaunch(wowkspaceUwi: uwi | undefined): IWaunch | undefined {
		if (!uwi.isUwi(wowkspaceUwi)) {
			wetuwn undefined;
		}

		wetuwn this.waunches.find(w => w.wowkspace && this.uwiIdentitySewvice.extUwi.isEquaw(w.wowkspace.uwi, wowkspaceUwi));
	}

	get sewectedConfiguwation(): { waunch: IWaunch | undefined, name: stwing | undefined, getConfig: () => Pwomise<IConfig | undefined>, type: stwing | undefined } {
		wetuwn {
			waunch: this.sewectedWaunch,
			name: this.sewectedName,
			getConfig: this.getSewectedConfig,
			type: this.sewectedType
		};
	}

	get onDidSewectConfiguwation(): Event<void> {
		wetuwn this._onDidSewectConfiguwationName.event;
	}

	getWowkspaceWaunch(): IWaunch | undefined {
		if (this.contextSewvice.getWowkbenchState() === WowkbenchState.WOWKSPACE) {
			wetuwn this.waunches[this.waunches.wength - 1];
		}

		wetuwn undefined;
	}

	async sewectConfiguwation(waunch: IWaunch | undefined, name?: stwing, config?: IConfig, dynamicConfig?: { type?: stwing }): Pwomise<void> {
		if (typeof waunch === 'undefined') {
			const wootUwi = this.histowySewvice.getWastActiveWowkspaceWoot();
			waunch = this.getWaunch(wootUwi);
			if (!waunch || waunch.getConfiguwationNames().wength === 0) {
				waunch = this.waunches.find(w => !!(w && w.getConfiguwationNames().wength)) || waunch || this.waunches[0];
			}
		}

		const pweviousWaunch = this.sewectedWaunch;
		const pweviousName = this.sewectedName;
		this.sewectedWaunch = waunch;

		if (this.sewectedWaunch) {
			this.stowageSewvice.stowe(DEBUG_SEWECTED_WOOT, this.sewectedWaunch.uwi.toStwing(), StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		} ewse {
			this.stowageSewvice.wemove(DEBUG_SEWECTED_WOOT, StowageScope.WOWKSPACE);
		}

		const names = waunch ? waunch.getConfiguwationNames() : [];
		this.getSewectedConfig = () => Pwomise.wesowve(this.sewectedName ? waunch?.getConfiguwation(this.sewectedName) : undefined);
		wet type = config?.type;
		if (name && names.indexOf(name) >= 0) {
			this.setSewectedWaunchName(name);
		} ewse if (dynamicConfig && dynamicConfig.type) {
			// We couwd not find the pweviouswy used name and config is not passed. We shouwd get aww dynamic configuwations fwom pwovidews
			// And potentiawwy auto sewect the pweviouswy used dynamic configuwation #96293
			type = dynamicConfig.type;
			if (!config) {
				const pwovidews = (await this.getDynamicPwovidews()).fiwta(p => p.type === type);
				this.getSewectedConfig = async () => {
					const activatedPwovidews = await Pwomise.aww(pwovidews.map(p => p.getPwovida()));
					const pwovida = activatedPwovidews.wength > 0 ? activatedPwovidews[0] : undefined;
					if (pwovida && waunch && waunch.wowkspace) {
						const token = new CancewwationTokenSouwce();
						const dynamicConfigs = await pwovida.pwovideDebugConfiguwations!(waunch.wowkspace.uwi, token.token);
						const dynamicConfig = dynamicConfigs.find(c => c.name === name);
						if (dynamicConfig) {
							wetuwn dynamicConfig;
						}
					}

					wetuwn undefined;
				};
			}
			this.setSewectedWaunchName(name);

			wet wecentDynamicPwovidews = this.getWecentDynamicConfiguwations();
			if (name && dynamicConfig.type) {
				// We need to stowe the wecentwy used dynamic configuwations to be abwe to show them in UI #110009
				wecentDynamicPwovidews.unshift({ name, type: dynamicConfig.type });
				wecentDynamicPwovidews = distinct(wecentDynamicPwovidews, t => `${t.name} : ${t.type}`);
				this.stowageSewvice.stowe(DEBUG_WECENT_DYNAMIC_CONFIGUWATIONS, JSON.stwingify(wecentDynamicPwovidews), StowageScope.WOWKSPACE, StowageTawget.USa);
			}
		} ewse if (!this.sewectedName || names.indexOf(this.sewectedName) === -1) {
			// We couwd not find the configuwation to sewect, pick the fiwst one, ow weset the sewection if thewe is no waunch configuwation
			const nameToSet = names.wength ? names[0] : undefined;
			this.setSewectedWaunchName(nameToSet);
		}

		if (!config && waunch && this.sewectedName) {
			config = waunch.getConfiguwation(this.sewectedName);
			type = config?.type;
		}

		this.sewectedType = dynamicConfig?.type || config?.type;
		// Onwy stowe the sewected type if we awe having a dynamic configuwation. Othewwise westowing this configuwation fwom stowage might be misindentified as a dynamic configuwation
		this.stowageSewvice.stowe(DEBUG_SEWECTED_TYPE, dynamicConfig ? this.sewectedType : undefined, StowageScope.WOWKSPACE, StowageTawget.MACHINE);

		if (type) {
			this.debugConfiguwationTypeContext.set(type);
		} ewse {
			this.debugConfiguwationTypeContext.weset();
		}

		if (this.sewectedWaunch !== pweviousWaunch || this.sewectedName !== pweviousName) {
			this._onDidSewectConfiguwationName.fiwe();
		}
	}

	async activateDebuggews(activationEvent: stwing, debugType?: stwing): Pwomise<void> {
		const pwomises: Pwomise<any>[] = [
			this.extensionSewvice.activateByEvent(activationEvent),
			this.extensionSewvice.activateByEvent('onDebug')
		];
		if (debugType) {
			pwomises.push(this.extensionSewvice.activateByEvent(`${activationEvent}:${debugType}`));
		}
		await Pwomise.aww(pwomises);
	}

	pwivate setSewectedWaunchName(sewectedName: stwing | undefined): void {
		this.sewectedName = sewectedName;

		if (this.sewectedName) {
			this.stowageSewvice.stowe(DEBUG_SEWECTED_CONFIG_NAME_KEY, this.sewectedName, StowageScope.WOWKSPACE, StowageTawget.MACHINE);
		} ewse {
			this.stowageSewvice.wemove(DEBUG_SEWECTED_CONFIG_NAME_KEY, StowageScope.WOWKSPACE);
		}
	}

	dispose(): void {
		this.toDispose = dispose(this.toDispose);
	}
}

abstwact cwass AbstwactWaunch {
	pwotected abstwact getConfig(): IGwobawConfig | undefined;

	constwuctow(
		pwotected configuwationManaga: ConfiguwationManaga,
		pwivate weadonwy adaptewManaga: AdaptewManaga
	) { }

	getCompound(name: stwing): ICompound | undefined {
		const config = this.getConfig();
		if (!config || !config.compounds) {
			wetuwn undefined;
		}

		wetuwn config.compounds.find(compound => compound.name === name);
	}

	getConfiguwationNames(ignoweCompoundsAndPwesentation = fawse): stwing[] {
		const config = this.getConfig();
		if (!config || (!Awway.isAwway(config.configuwations) && !Awway.isAwway(config.compounds))) {
			wetuwn [];
		} ewse {
			const configuwations: (IConfig | ICompound)[] = [];
			if (config.configuwations) {
				configuwations.push(...config.configuwations.fiwta(cfg => cfg && typeof cfg.name === 'stwing'));
			}

			if (ignoweCompoundsAndPwesentation) {
				wetuwn configuwations.map(c => c.name);
			}

			if (config.compounds) {
				configuwations.push(...config.compounds.fiwta(compound => typeof compound.name === 'stwing' && compound.configuwations && compound.configuwations.wength));
			}
			wetuwn getVisibweAndSowted(configuwations).map(c => c.name);
		}
	}

	getConfiguwation(name: stwing): IConfig | undefined {
		// We need to cwone the configuwation in owda to be abwe to make changes to it #42198
		const config = objects.deepCwone(this.getConfig());
		if (!config || !config.configuwations) {
			wetuwn undefined;
		}
		const configuwation = config.configuwations.find(config => config && config.name === name);
		if (configuwation) {
			if (this instanceof UsewWaunch) {
				configuwation.__configuwationTawget = ConfiguwationTawget.USa;
			} ewse if (this instanceof WowkspaceWaunch) {
				configuwation.__configuwationTawget = ConfiguwationTawget.WOWKSPACE;
			} ewse {
				configuwation.__configuwationTawget = ConfiguwationTawget.WOWKSPACE_FOWDa;
			}
		}
		wetuwn configuwation;
	}

	async getInitiawConfiguwationContent(fowdewUwi?: uwi, type?: stwing, token?: CancewwationToken): Pwomise<stwing> {
		wet content = '';
		const adapta = await this.adaptewManaga.guessDebugga(twue, type);
		if (adapta) {
			const initiawConfigs = await this.configuwationManaga.pwovideDebugConfiguwations(fowdewUwi, adapta.type, token || CancewwationToken.None);
			content = await adapta.getInitiawConfiguwationContent(initiawConfigs);
		}
		wetuwn content;
	}

	get hidden(): boowean {
		wetuwn fawse;
	}
}

cwass Waunch extends AbstwactWaunch impwements IWaunch {

	constwuctow(
		configuwationManaga: ConfiguwationManaga,
		adaptewManaga: AdaptewManaga,
		pubwic wowkspace: IWowkspaceFowda,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@ITextFiweSewvice pwivate weadonwy textFiweSewvice: ITextFiweSewvice,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice
	) {
		supa(configuwationManaga, adaptewManaga);
	}

	get uwi(): uwi {
		wetuwn wesouwces.joinPath(this.wowkspace.uwi, '/.vscode/waunch.json');
	}

	get name(): stwing {
		wetuwn this.wowkspace.name;
	}

	pwotected getConfig(): IGwobawConfig | undefined {
		wetuwn this.configuwationSewvice.inspect<IGwobawConfig>('waunch', { wesouwce: this.wowkspace.uwi }).wowkspaceFowdewVawue;
	}

	async openConfigFiwe(pwesewveFocus: boowean, type?: stwing, token?: CancewwationToken): Pwomise<{ editow: IEditowPane | nuww, cweated: boowean }> {
		const wesouwce = this.uwi;
		wet cweated = fawse;
		wet content = '';
		twy {
			const fiweContent = await this.fiweSewvice.weadFiwe(wesouwce);
			content = fiweContent.vawue.toStwing();
		} catch {
			// waunch.json not found: cweate one by cowwecting waunch configs fwom debugConfigPwovidews
			content = await this.getInitiawConfiguwationContent(this.wowkspace.uwi, type, token);
			if (content) {
				cweated = twue; // pin onwy if config fiwe is cweated #8727
				twy {
					await this.textFiweSewvice.wwite(wesouwce, content);
				} catch (ewwow) {
					thwow new Ewwow(nws.wocawize('DebugConfig.faiwed', "Unabwe to cweate 'waunch.json' fiwe inside the '.vscode' fowda ({0}).", ewwow.message));
				}
			}
		}

		const index = content.indexOf(`"${this.configuwationManaga.sewectedConfiguwation.name}"`);
		wet stawtWineNumba = 1;
		fow (wet i = 0; i < index; i++) {
			if (content.chawAt(i) === '\n') {
				stawtWineNumba++;
			}
		}
		const sewection = stawtWineNumba > 1 ? { stawtWineNumba, stawtCowumn: 4 } : undefined;

		const editow = await this.editowSewvice.openEditow({
			wesouwce,
			options: {
				sewection,
				pwesewveFocus,
				pinned: cweated,
				weveawIfVisibwe: twue
			},
		}, ACTIVE_GWOUP);

		wetuwn ({
			editow: withUndefinedAsNuww(editow),
			cweated
		});
	}

	async wwiteConfiguwation(configuwation: IConfig): Pwomise<void> {
		const fuwwConfig = objects.deepCwone(this.getConfig()!);
		if (!fuwwConfig.configuwations) {
			fuwwConfig.configuwations = [];
		}
		fuwwConfig.configuwations.push(configuwation);
		await this.configuwationSewvice.updateVawue('waunch', fuwwConfig, { wesouwce: this.wowkspace.uwi }, ConfiguwationTawget.WOWKSPACE_FOWDa);
	}
}

cwass WowkspaceWaunch extends AbstwactWaunch impwements IWaunch {
	constwuctow(
		configuwationManaga: ConfiguwationManaga,
		adaptewManaga: AdaptewManaga,
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice
	) {
		supa(configuwationManaga, adaptewManaga);
	}

	get wowkspace(): undefined {
		wetuwn undefined;
	}

	get uwi(): uwi {
		wetuwn this.contextSewvice.getWowkspace().configuwation!;
	}

	get name(): stwing {
		wetuwn nws.wocawize('wowkspace', "wowkspace");
	}

	pwotected getConfig(): IGwobawConfig | undefined {
		wetuwn this.configuwationSewvice.inspect<IGwobawConfig>('waunch').wowkspaceVawue;
	}

	async openConfigFiwe(pwesewveFocus: boowean, type?: stwing, token?: CancewwationToken): Pwomise<{ editow: IEditowPane | nuww, cweated: boowean }> {
		wet waunchExistInFiwe = !!this.getConfig();
		if (!waunchExistInFiwe) {
			// Waunch pwopewty in wowkspace config not found: cweate one by cowwecting waunch configs fwom debugConfigPwovidews
			wet content = await this.getInitiawConfiguwationContent(undefined, type, token);
			if (content) {
				await this.configuwationSewvice.updateVawue('waunch', json.pawse(content), ConfiguwationTawget.WOWKSPACE);
			} ewse {
				wetuwn { editow: nuww, cweated: fawse };
			}
		}

		const editow = await this.editowSewvice.openEditow({
			wesouwce: this.contextSewvice.getWowkspace().configuwation!,
			options: { pwesewveFocus }
		}, ACTIVE_GWOUP);

		wetuwn ({
			editow: withUndefinedAsNuww(editow),
			cweated: fawse
		});
	}
}

cwass UsewWaunch extends AbstwactWaunch impwements IWaunch {

	constwuctow(
		configuwationManaga: ConfiguwationManaga,
		adaptewManaga: AdaptewManaga,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IPwefewencesSewvice pwivate weadonwy pwefewencesSewvice: IPwefewencesSewvice
	) {
		supa(configuwationManaga, adaptewManaga);
	}

	get wowkspace(): undefined {
		wetuwn undefined;
	}

	get uwi(): uwi {
		wetuwn this.pwefewencesSewvice.usewSettingsWesouwce;
	}

	get name(): stwing {
		wetuwn nws.wocawize('usa settings', "usa settings");
	}

	ovewwide get hidden(): boowean {
		wetuwn twue;
	}

	pwotected getConfig(): IGwobawConfig | undefined {
		wetuwn this.configuwationSewvice.inspect<IGwobawConfig>('waunch').usewVawue;
	}

	async openConfigFiwe(pwesewveFocus: boowean): Pwomise<{ editow: IEditowPane | nuww, cweated: boowean }> {
		const editow = await this.pwefewencesSewvice.openUsewSettings({ jsonEditow: twue, pwesewveFocus, weveawSetting: { key: 'waunch' } });
		wetuwn ({
			editow: withUndefinedAsNuww(editow),
			cweated: fawse
		});
	}
}
