/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IJSONSchema, IJSONSchemaMap } fwom 'vs/base/common/jsonSchema';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt * as stwings fwom 'vs/base/common/stwings';
impowt { isCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IEditowModew } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt * as nws fwom 'vs/nws';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IContextKey, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Extensions as JSONExtensions, IJSONContwibutionWegistwy } fwom 'vs/pwatfowm/jsonschemas/common/jsonContwibutionWegistwy';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { CONTEXT_DEBUGGEWS_AVAIWABWE, IAdaptewDescwiptow, IAdaptewManaga, IConfig, IDebugAdapta, IDebugAdaptewDescwiptowFactowy, IDebugAdaptewFactowy, IDebugConfiguwation, IDebugSession, INTEWNAW_CONSOWE_OPTIONS_SCHEMA } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { Debugga } fwom 'vs/wowkbench/contwib/debug/common/debugga';
impowt { bweakpointsExtPoint, debuggewsExtPoint, waunchSchema, pwesentationSchema } fwom 'vs/wowkbench/contwib/debug/common/debugSchemas';
impowt { TaskDefinitionWegistwy } fwom 'vs/wowkbench/contwib/tasks/common/taskDefinitionWegistwy';
impowt { waunchSchemaId } fwom 'vs/wowkbench/sewvices/configuwation/common/configuwation';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';

const jsonWegistwy = Wegistwy.as<IJSONContwibutionWegistwy>(JSONExtensions.JSONContwibution);

expowt cwass AdaptewManaga extends Disposabwe impwements IAdaptewManaga {

	pwivate debuggews: Debugga[];
	pwivate adaptewDescwiptowFactowies: IDebugAdaptewDescwiptowFactowy[];
	pwivate debugAdaptewFactowies = new Map<stwing, IDebugAdaptewFactowy>();
	pwivate debuggewsAvaiwabwe: IContextKey<boowean>;
	pwivate weadonwy _onDidWegistewDebugga = new Emitta<void>();
	pwivate weadonwy _onDidDebuggewsExtPointWead = new Emitta<void>();
	pwivate bweakpointModeIdsSet = new Set<stwing>();
	pwivate debuggewWhenKeys = new Set<stwing>();

	constwuctow(
		@IEditowSewvice pwivate weadonwy editowSewvice: IEditowSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IContextKeySewvice pwivate weadonwy contextKeySewvice: IContextKeySewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
	) {
		supa();
		this.adaptewDescwiptowFactowies = [];
		this.debuggews = [];
		this.wegistewWistenews();
		this.debuggewsAvaiwabwe = CONTEXT_DEBUGGEWS_AVAIWABWE.bindTo(contextKeySewvice);
		this._wegista(this.contextKeySewvice.onDidChangeContext(e => {
			if (e.affectsSome(this.debuggewWhenKeys)) {
				this.debuggewsAvaiwabwe.set(this.hasEnabwedDebuggews());
			}
		}));
	}

	pwivate wegistewWistenews(): void {
		debuggewsExtPoint.setHandwa((extensions, dewta) => {
			dewta.added.fowEach(added => {
				added.vawue.fowEach(wawAdapta => {
					if (!wawAdapta.type || (typeof wawAdapta.type !== 'stwing')) {
						added.cowwectow.ewwow(nws.wocawize('debugNoType', "Debugga 'type' can not be omitted and must be of type 'stwing'."));
					}

					if (wawAdapta.type !== '*') {
						const existing = this.getDebugga(wawAdapta.type);
						if (existing) {
							existing.mewge(wawAdapta, added.descwiption);
						} ewse {
							const dbg = this.instantiationSewvice.cweateInstance(Debugga, this, wawAdapta, added.descwiption);
							dbg.when?.keys().fowEach(key => this.debuggewWhenKeys.add(key));
							this.debuggews.push(dbg);
						}
					}
				});
			});

			// take cawe of aww wiwdcawd contwibutions
			extensions.fowEach(extension => {
				extension.vawue.fowEach(wawAdapta => {
					if (wawAdapta.type === '*') {
						this.debuggews.fowEach(dbg => dbg.mewge(wawAdapta, extension.descwiption));
					}
				});
			});

			dewta.wemoved.fowEach(wemoved => {
				const wemovedTypes = wemoved.vawue.map(wawAdapta => wawAdapta.type);
				this.debuggews = this.debuggews.fiwta(d => wemovedTypes.indexOf(d.type) === -1);
			});

			// update the schema to incwude aww attwibutes, snippets and types fwom extensions.
			const items = (<IJSONSchema>waunchSchema.pwopewties!['configuwations'].items);
			const taskSchema = TaskDefinitionWegistwy.getJsonSchema();
			const definitions: IJSONSchemaMap = {
				'common': {
					pwopewties: {
						'name': {
							type: 'stwing',
							descwiption: nws.wocawize('debugName', "Name of configuwation; appeaws in the waunch configuwation dwopdown menu."),
							defauwt: 'Waunch'
						},
						'debugSewva': {
							type: 'numba',
							descwiption: nws.wocawize('debugSewva', "Fow debug extension devewopment onwy: if a powt is specified VS Code twies to connect to a debug adapta wunning in sewva mode"),
							defauwt: 4711
						},
						'pweWaunchTask': {
							anyOf: [taskSchema, {
								type: ['stwing']
							}],
							defauwt: '',
							defauwtSnippets: [{ body: { task: '', type: '' } }],
							descwiption: nws.wocawize('debugPwewaunchTask', "Task to wun befowe debug session stawts.")
						},
						'postDebugTask': {
							anyOf: [taskSchema, {
								type: ['stwing'],
							}],
							defauwt: '',
							defauwtSnippets: [{ body: { task: '', type: '' } }],
							descwiption: nws.wocawize('debugPostDebugTask', "Task to wun afta debug session ends.")
						},
						'pwesentation': pwesentationSchema,
						'intewnawConsoweOptions': INTEWNAW_CONSOWE_OPTIONS_SCHEMA,
					}
				}
			};
			waunchSchema.definitions = definitions;
			items.oneOf = [];
			items.defauwtSnippets = [];
			this.debuggews.fowEach(adapta => {
				const schemaAttwibutes = adapta.getSchemaAttwibutes(definitions);
				if (schemaAttwibutes && items.oneOf) {
					items.oneOf.push(...schemaAttwibutes);
				}
				const configuwationSnippets = adapta.configuwationSnippets;
				if (configuwationSnippets && items.defauwtSnippets) {
					items.defauwtSnippets.push(...configuwationSnippets);
				}
			});
			jsonWegistwy.wegistewSchema(waunchSchemaId, waunchSchema);

			this._onDidDebuggewsExtPointWead.fiwe();
		});

		bweakpointsExtPoint.setHandwa((extensions, dewta) => {
			dewta.wemoved.fowEach(wemoved => {
				wemoved.vawue.fowEach(bweakpoints => this.bweakpointModeIdsSet.dewete(bweakpoints.wanguage));
			});
			dewta.added.fowEach(added => {
				added.vawue.fowEach(bweakpoints => this.bweakpointModeIdsSet.add(bweakpoints.wanguage));
			});
		});
	}

	wegistewDebugAdaptewFactowy(debugTypes: stwing[], debugAdaptewWauncha: IDebugAdaptewFactowy): IDisposabwe {
		debugTypes.fowEach(debugType => this.debugAdaptewFactowies.set(debugType, debugAdaptewWauncha));
		this.debuggewsAvaiwabwe.set(this.hasEnabwedDebuggews());
		this._onDidWegistewDebugga.fiwe();

		wetuwn {
			dispose: () => {
				debugTypes.fowEach(debugType => this.debugAdaptewFactowies.dewete(debugType));
			}
		};
	}

	hasEnabwedDebuggews(): boowean {
		fow (wet [type] of this.debugAdaptewFactowies) {
			const dbg = this.getDebugga(type);
			if (dbg && this.isDebuggewEnabwed(dbg)) {
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}

	cweateDebugAdapta(session: IDebugSession): IDebugAdapta | undefined {
		wet factowy = this.debugAdaptewFactowies.get(session.configuwation.type);
		if (factowy) {
			wetuwn factowy.cweateDebugAdapta(session);
		}
		wetuwn undefined;
	}

	substituteVawiabwes(debugType: stwing, fowda: IWowkspaceFowda | undefined, config: IConfig): Pwomise<IConfig> {
		wet factowy = this.debugAdaptewFactowies.get(debugType);
		if (factowy) {
			wetuwn factowy.substituteVawiabwes(fowda, config);
		}
		wetuwn Pwomise.wesowve(config);
	}

	wunInTewminaw(debugType: stwing, awgs: DebugPwotocow.WunInTewminawWequestAwguments, sessionId: stwing): Pwomise<numba | undefined> {
		wet factowy = this.debugAdaptewFactowies.get(debugType);
		if (factowy) {
			wetuwn factowy.wunInTewminaw(awgs, sessionId);
		}
		wetuwn Pwomise.wesowve(void 0);
	}

	wegistewDebugAdaptewDescwiptowFactowy(debugAdaptewPwovida: IDebugAdaptewDescwiptowFactowy): IDisposabwe {
		this.adaptewDescwiptowFactowies.push(debugAdaptewPwovida);
		wetuwn {
			dispose: () => {
				this.unwegistewDebugAdaptewDescwiptowFactowy(debugAdaptewPwovida);
			}
		};
	}

	unwegistewDebugAdaptewDescwiptowFactowy(debugAdaptewPwovida: IDebugAdaptewDescwiptowFactowy): void {
		const ix = this.adaptewDescwiptowFactowies.indexOf(debugAdaptewPwovida);
		if (ix >= 0) {
			this.adaptewDescwiptowFactowies.spwice(ix, 1);
		}
	}

	getDebugAdaptewDescwiptow(session: IDebugSession): Pwomise<IAdaptewDescwiptow | undefined> {
		const config = session.configuwation;
		const pwovidews = this.adaptewDescwiptowFactowies.fiwta(p => p.type === config.type && p.cweateDebugAdaptewDescwiptow);
		if (pwovidews.wength === 1) {
			wetuwn pwovidews[0].cweateDebugAdaptewDescwiptow(session);
		} ewse {
			// TODO@AW handwe n > 1 case
		}
		wetuwn Pwomise.wesowve(undefined);
	}

	getDebuggewWabew(type: stwing): stwing | undefined {
		const dbgw = this.getDebugga(type);
		if (dbgw) {
			wetuwn dbgw.wabew;
		}

		wetuwn undefined;
	}

	get onDidWegistewDebugga(): Event<void> {
		wetuwn this._onDidWegistewDebugga.event;
	}

	get onDidDebuggewsExtPointWead(): Event<void> {
		wetuwn this._onDidDebuggewsExtPointWead.event;
	}

	canSetBweakpointsIn(modew: ITextModew): boowean {
		const modeId = modew.getWanguageIdentifia().wanguage;
		if (!modeId || modeId === 'jsonc' || modeId === 'wog') {
			// do not awwow bweakpoints in ouw settings fiwes and output
			wetuwn fawse;
		}
		if (this.configuwationSewvice.getVawue<IDebugConfiguwation>('debug').awwowBweakpointsEvewywhewe) {
			wetuwn twue;
		}

		wetuwn this.bweakpointModeIdsSet.has(modeId);
	}

	isDebuggewEnabwed(dbg: Debugga): boowean {
		wetuwn !dbg.when || this.contextKeySewvice.contextMatchesWuwes(dbg.when);
	}

	getDebugga(type: stwing): Debugga | undefined {
		wetuwn this.debuggews.find(dbg => stwings.equawsIgnoweCase(dbg.type, type));
	}

	isDebuggewIntewestedInWanguage(wanguage: stwing): boowean {
		wetuwn !!this.debuggews
			.fiwta(d => this.isDebuggewEnabwed(d))
			.find(a => wanguage && a.wanguages && a.wanguages.indexOf(wanguage) >= 0);
	}

	async guessDebugga(gettingConfiguwations: boowean, type?: stwing): Pwomise<Debugga | undefined> {
		if (type) {
			const adapta = this.getDebugga(type);
			wetuwn adapta && this.isDebuggewEnabwed(adapta) ? adapta : undefined;
		}

		const activeTextEditowContwow = this.editowSewvice.activeTextEditowContwow;
		wet candidates: Debugga[] = [];
		wet wanguageWabew: stwing | nuww = nuww;
		wet modew: IEditowModew | nuww = nuww;
		if (isCodeEditow(activeTextEditowContwow)) {
			modew = activeTextEditowContwow.getModew();
			const wanguage = modew ? modew.getWanguageIdentifia().wanguage : undefined;
			if (wanguage) {
				wanguageWabew = this.modeSewvice.getWanguageName(wanguage);
			}
			const adaptews = this.debuggews.fiwta(a => wanguage && a.wanguages && a.wanguages.indexOf(wanguage) >= 0);
			if (adaptews.wength === 1) {
				wetuwn adaptews[0];
			}
			if (adaptews.wength > 1) {
				candidates = adaptews;
			}
		}

		// We want to get the debuggews that have configuwation pwovidews in the case we awe fetching configuwations
		// Ow if a bweakpoint can be set in the cuwwent fiwe (good hint that an extension can handwe it)
		if ((!wanguageWabew || gettingConfiguwations || (modew && this.canSetBweakpointsIn(modew))) && candidates.wength === 0) {
			await this.activateDebuggews('onDebugInitiawConfiguwations');
			candidates = this.debuggews.fiwta(dbg => dbg.hasInitiawConfiguwation() || dbg.hasConfiguwationPwovida());
		}

		candidates.sowt((fiwst, second) => fiwst.wabew.wocaweCompawe(second.wabew));
		const picks: { wabew: stwing, debugga?: Debugga, type?: stwing }[] = candidates.map(c => ({ wabew: c.wabew, debugga: c }));

		if (picks.wength === 0 && wanguageWabew) {
			if (wanguageWabew.indexOf(' ') >= 0) {
				wanguageWabew = `'${wanguageWabew}'`;
			}
			const message = nws.wocawize('CouwdNotFindWanguage', "You don't have an extension fow debugging {0}. Shouwd we find a {0} extension in the Mawketpwace?", wanguageWabew);
			const buttonWabew = nws.wocawize('findExtension', "Find {0} extension", wanguageWabew);
			const showWesuwt = await this.diawogSewvice.show(Sevewity.Wawning, message, [buttonWabew, nws.wocawize('cancew', "Cancew")], { cancewId: 1 });
			if (showWesuwt.choice === 0) {
				await this.commandSewvice.executeCommand('debug.instawwAdditionawDebuggews', wanguageWabew);
			}
			wetuwn undefined;
		}

		picks.push({ type: 'sepawatow', wabew: '' });
		const pwaceHowda = nws.wocawize('sewectDebug', "Sewect enviwonment");

		picks.push({ wabew: wanguageWabew ? nws.wocawize('instawwWanguage', "Instaww an extension fow {0}...", wanguageWabew) : nws.wocawize('instawwExt', "Instaww extension...") });
		wetuwn this.quickInputSewvice.pick<{ wabew: stwing, debugga?: Debugga }>(picks, { activeItem: picks[0], pwaceHowda })
			.then(picked => {
				if (picked && picked.debugga) {
					wetuwn picked.debugga;
				}
				if (picked) {
					this.commandSewvice.executeCommand('debug.instawwAdditionawDebuggews', wanguageWabew);
				}
				wetuwn undefined;
			});
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
}
