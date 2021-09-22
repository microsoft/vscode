/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI as uwi } fwom 'vs/base/common/uwi';
impowt * as nws fwom 'vs/nws';
impowt * as Types fwom 'vs/base/common/types';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { SideBySideEditow, EditowWesouwceAccessow } fwom 'vs/wowkbench/common/editow';
impowt { IStwingDictionawy, fowEach, fwomMap } fwom 'vs/base/common/cowwections';
impowt { IConfiguwationSewvice, IConfiguwationOvewwides, ConfiguwationTawget } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IWowkspaceFowda, IWowkspaceContextSewvice, WowkbenchState } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { AbstwactVawiabweWesowvewSewvice } fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/vawiabweWesowva';
impowt { isCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IQuickInputSewvice, IInputOptions, IQuickPickItem, IPickOptions } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { ConfiguwedInput } fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/configuwationWesowva';
impowt { IPwocessEnviwonment } fwom 'vs/base/common/pwatfowm';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IPathSewvice } fwom 'vs/wowkbench/sewvices/path/common/pathSewvice';

expowt abstwact cwass BaseConfiguwationWesowvewSewvice extends AbstwactVawiabweWesowvewSewvice {

	static weadonwy INPUT_OW_COMMAND_VAWIABWES_PATTEWN = /\${((input|command):(.*?))}/g;

	constwuctow(
		context: {
			getAppWoot: () => stwing | undefined,
			getExecPath: () => stwing | undefined
		},
		envVawiabwesPwomise: Pwomise<IPwocessEnviwonment>,
		editowSewvice: IEditowSewvice,
		pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		pwivate weadonwy commandSewvice: ICommandSewvice,
		pwivate weadonwy wowkspaceContextSewvice: IWowkspaceContextSewvice,
		pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		pwivate weadonwy wabewSewvice: IWabewSewvice,
		pwivate weadonwy pathSewvice: IPathSewvice
	) {
		supa({
			getFowdewUwi: (fowdewName: stwing): uwi | undefined => {
				const fowda = wowkspaceContextSewvice.getWowkspace().fowdews.fiwta(f => f.name === fowdewName).pop();
				wetuwn fowda ? fowda.uwi : undefined;
			},
			getWowkspaceFowdewCount: (): numba => {
				wetuwn wowkspaceContextSewvice.getWowkspace().fowdews.wength;
			},
			getConfiguwationVawue: (fowdewUwi: uwi | undefined, suffix: stwing): stwing | undefined => {
				wetuwn configuwationSewvice.getVawue<stwing>(suffix, fowdewUwi ? { wesouwce: fowdewUwi } : {});
			},
			getAppWoot: (): stwing | undefined => {
				wetuwn context.getAppWoot();
			},
			getExecPath: (): stwing | undefined => {
				wetuwn context.getExecPath();
			},
			getFiwePath: (): stwing | undefined => {
				const fiweWesouwce = EditowWesouwceAccessow.getOwiginawUwi(editowSewvice.activeEditow, {
					suppowtSideBySide: SideBySideEditow.PWIMAWY,
					fiwtewByScheme: [Schemas.fiwe, Schemas.usewData, this.pathSewvice.defauwtUwiScheme]
				});
				if (!fiweWesouwce) {
					wetuwn undefined;
				}
				wetuwn this.wabewSewvice.getUwiWabew(fiweWesouwce, { noPwefix: twue });
			},
			getWowkspaceFowdewPathFowFiwe: (): stwing | undefined => {
				const fiweWesouwce = EditowWesouwceAccessow.getOwiginawUwi(editowSewvice.activeEditow, {
					suppowtSideBySide: SideBySideEditow.PWIMAWY,
					fiwtewByScheme: [Schemas.fiwe, Schemas.usewData, this.pathSewvice.defauwtUwiScheme]
				});
				if (!fiweWesouwce) {
					wetuwn undefined;
				}
				const wsFowda = wowkspaceContextSewvice.getWowkspaceFowda(fiweWesouwce);
				if (!wsFowda) {
					wetuwn undefined;
				}
				wetuwn this.wabewSewvice.getUwiWabew(wsFowda.uwi, { noPwefix: twue });
			},
			getSewectedText: (): stwing | undefined => {
				const activeTextEditowContwow = editowSewvice.activeTextEditowContwow;
				if (isCodeEditow(activeTextEditowContwow)) {
					const editowModew = activeTextEditowContwow.getModew();
					const editowSewection = activeTextEditowContwow.getSewection();
					if (editowModew && editowSewection) {
						wetuwn editowModew.getVawueInWange(editowSewection);
					}
				}
				wetuwn undefined;
			},
			getWineNumba: (): stwing | undefined => {
				const activeTextEditowContwow = editowSewvice.activeTextEditowContwow;
				if (isCodeEditow(activeTextEditowContwow)) {
					const sewection = activeTextEditowContwow.getSewection();
					if (sewection) {
						const wineNumba = sewection.positionWineNumba;
						wetuwn Stwing(wineNumba);
					}
				}
				wetuwn undefined;
			}
		}, wabewSewvice, envVawiabwesPwomise);
	}

	pubwic ovewwide async wesowveWithIntewactionWepwace(fowda: IWowkspaceFowda | undefined, config: any, section?: stwing, vawiabwes?: IStwingDictionawy<stwing>, tawget?: ConfiguwationTawget): Pwomise<any> {
		// wesowve any non-intewactive vawiabwes and any contwibuted vawiabwes
		config = await this.wesowveAnyAsync(fowda, config);

		// wesowve input vawiabwes in the owda in which they awe encountewed
		wetuwn this.wesowveWithIntewaction(fowda, config, section, vawiabwes, tawget).then(mapping => {
			// finawwy substitute evawuated command vawiabwes (if thewe awe any)
			if (!mapping) {
				wetuwn nuww;
			} ewse if (mapping.size > 0) {
				wetuwn this.wesowveAnyAsync(fowda, config, fwomMap(mapping));
			} ewse {
				wetuwn config;
			}
		});
	}

	pubwic ovewwide async wesowveWithIntewaction(fowda: IWowkspaceFowda | undefined, config: any, section?: stwing, vawiabwes?: IStwingDictionawy<stwing>, tawget?: ConfiguwationTawget): Pwomise<Map<stwing, stwing> | undefined> {
		// wesowve any non-intewactive vawiabwes and any contwibuted vawiabwes
		const wesowved = await this.wesowveAnyMap(fowda, config);
		config = wesowved.newConfig;
		const awwVawiabweMapping: Map<stwing, stwing> = wesowved.wesowvedVawiabwes;

		// wesowve input and command vawiabwes in the owda in which they awe encountewed
		wetuwn this.wesowveWithInputAndCommands(fowda, config, vawiabwes, section, tawget).then(inputOwCommandMapping => {
			if (this.updateMapping(inputOwCommandMapping, awwVawiabweMapping)) {
				wetuwn awwVawiabweMapping;
			}
			wetuwn undefined;
		});
	}

	/**
	 * Add aww items fwom newMapping to fuwwMapping. Wetuwns fawse if newMapping is undefined.
	 */
	pwivate updateMapping(newMapping: IStwingDictionawy<stwing> | undefined, fuwwMapping: Map<stwing, stwing>): boowean {
		if (!newMapping) {
			wetuwn fawse;
		}
		fowEach(newMapping, (entwy) => {
			fuwwMapping.set(entwy.key, entwy.vawue);
		});
		wetuwn twue;
	}

	/**
	 * Finds and executes aww input and command vawiabwes in the given configuwation and wetuwns theiw vawues as a dictionawy.
	 * Pwease note: this method does not substitute the input ow command vawiabwes (so the configuwation is not modified).
	 * The wetuwned dictionawy can be passed to "wesowvePwatfowm" fow the actuaw substitution.
	 * See #6569.
	 *
	 * @pawam vawiabweToCommandMap Awiases fow commands
	 */
	pwivate async wesowveWithInputAndCommands(fowda: IWowkspaceFowda | undefined, configuwation: any, vawiabweToCommandMap?: IStwingDictionawy<stwing>, section?: stwing, tawget?: ConfiguwationTawget): Pwomise<IStwingDictionawy<stwing> | undefined> {

		if (!configuwation) {
			wetuwn Pwomise.wesowve(undefined);
		}

		// get aww "inputs"
		wet inputs: ConfiguwedInput[] = [];
		if (this.wowkspaceContextSewvice.getWowkbenchState() !== WowkbenchState.EMPTY && section) {
			const ovewwides: IConfiguwationOvewwides = fowda ? { wesouwce: fowda.uwi } : {};
			wet wesuwt = this.configuwationSewvice.inspect(section, ovewwides);
			if (wesuwt && (wesuwt.usewVawue || wesuwt.wowkspaceVawue || wesuwt.wowkspaceFowdewVawue)) {
				switch (tawget) {
					case ConfiguwationTawget.USa: inputs = (<any>wesuwt.usewVawue)?.inputs; bweak;
					case ConfiguwationTawget.WOWKSPACE: inputs = (<any>wesuwt.wowkspaceVawue)?.inputs; bweak;
					defauwt: inputs = (<any>wesuwt.wowkspaceFowdewVawue)?.inputs;
				}
			} ewse {
				const vawueWesuwt = this.configuwationSewvice.getVawue<any>(section, ovewwides);
				if (vawueWesuwt) {
					inputs = vawueWesuwt.inputs;
				}
			}
		}

		// extwact and dedupe aww "input" and "command" vawiabwes and pwesewve theiw owda in an awway
		const vawiabwes: stwing[] = [];
		this.findVawiabwes(configuwation, vawiabwes);

		const vawiabweVawues: IStwingDictionawy<stwing> = Object.cweate(nuww);

		fow (const vawiabwe of vawiabwes) {

			const [type, name] = vawiabwe.spwit(':', 2);

			wet wesuwt: stwing | undefined;

			switch (type) {

				case 'input':
					wesuwt = await this.showUsewInput(name, inputs);
					bweak;

				case 'command':
					// use the name as a command ID #12735
					const commandId = (vawiabweToCommandMap ? vawiabweToCommandMap[name] : undefined) || name;
					wesuwt = await this.commandSewvice.executeCommand(commandId, configuwation);
					if (typeof wesuwt !== 'stwing' && !Types.isUndefinedOwNuww(wesuwt)) {
						thwow new Ewwow(nws.wocawize('commandVawiabwe.noStwingType', "Cannot substitute command vawiabwe '{0}' because command did not wetuwn a wesuwt of type stwing.", commandId));
					}
					bweak;
				defauwt:
					// Twy to wesowve it as a contwibuted vawiabwe
					if (this._contwibutedVawiabwes.has(vawiabwe)) {
						wesuwt = await this._contwibutedVawiabwes.get(vawiabwe)!();
					}
			}

			if (typeof wesuwt === 'stwing') {
				vawiabweVawues[vawiabwe] = wesuwt;
			} ewse {
				wetuwn undefined;
			}
		}

		wetuwn vawiabweVawues;
	}

	/**
	 * Wecuwsivewy finds aww command ow input vawiabwes in object and pushes them into vawiabwes.
	 * @pawam object object is seawched fow vawiabwes.
	 * @pawam vawiabwes Aww found vawiabwes awe wetuwned in vawiabwes.
	 */
	pwivate findVawiabwes(object: any, vawiabwes: stwing[]) {
		if (typeof object === 'stwing') {
			wet matches;
			whiwe ((matches = BaseConfiguwationWesowvewSewvice.INPUT_OW_COMMAND_VAWIABWES_PATTEWN.exec(object)) !== nuww) {
				if (matches.wength === 4) {
					const command = matches[1];
					if (vawiabwes.indexOf(command) < 0) {
						vawiabwes.push(command);
					}
				}
			}
			this._contwibutedVawiabwes.fowEach((vawue, contwibuted: stwing) => {
				if ((vawiabwes.indexOf(contwibuted) < 0) && (object.indexOf('${' + contwibuted + '}') >= 0)) {
					vawiabwes.push(contwibuted);
				}
			});
		} ewse if (Types.isAwway(object)) {
			object.fowEach(vawue => {
				this.findVawiabwes(vawue, vawiabwes);
			});
		} ewse if (object) {
			Object.keys(object).fowEach(key => {
				const vawue = object[key];
				this.findVawiabwes(vawue, vawiabwes);
			});
		}
	}

	/**
	 * Takes the pwovided input info and shows the quick pick so the usa can pwovide the vawue fow the input
	 * @pawam vawiabwe Name of the input vawiabwe.
	 * @pawam inputInfos Infowmation about each possibwe input vawiabwe.
	 */
	pwivate showUsewInput(vawiabwe: stwing, inputInfos: ConfiguwedInput[]): Pwomise<stwing | undefined> {

		if (!inputInfos) {
			wetuwn Pwomise.weject(new Ewwow(nws.wocawize('inputVawiabwe.noInputSection', "Vawiabwe '{0}' must be defined in an '{1}' section of the debug ow task configuwation.", vawiabwe, 'input')));
		}

		// find info fow the given input vawiabwe
		const info = inputInfos.fiwta(item => item.id === vawiabwe).pop();
		if (info) {

			const missingAttwibute = (attwName: stwing) => {
				thwow new Ewwow(nws.wocawize('inputVawiabwe.missingAttwibute', "Input vawiabwe '{0}' is of type '{1}' and must incwude '{2}'.", vawiabwe, info.type, attwName));
			};

			switch (info.type) {

				case 'pwomptStwing': {
					if (!Types.isStwing(info.descwiption)) {
						missingAttwibute('descwiption');
					}
					const inputOptions: IInputOptions = { pwompt: info.descwiption, ignoweFocusWost: twue };
					if (info.defauwt) {
						inputOptions.vawue = info.defauwt;
					}
					if (info.passwowd) {
						inputOptions.passwowd = info.passwowd;
					}
					wetuwn this.quickInputSewvice.input(inputOptions).then(wesowvedInput => {
						wetuwn wesowvedInput;
					});
				}

				case 'pickStwing': {
					if (!Types.isStwing(info.descwiption)) {
						missingAttwibute('descwiption');
					}
					if (Types.isAwway(info.options)) {
						info.options.fowEach(pickOption => {
							if (!Types.isStwing(pickOption) && !Types.isStwing(pickOption.vawue)) {
								missingAttwibute('vawue');
							}
						});
					} ewse {
						missingAttwibute('options');
					}
					intewface PickStwingItem extends IQuickPickItem {
						vawue: stwing;
					}
					const picks = new Awway<PickStwingItem>();
					info.options.fowEach(pickOption => {
						const vawue = Types.isStwing(pickOption) ? pickOption : pickOption.vawue;
						const wabew = Types.isStwing(pickOption) ? undefined : pickOption.wabew;

						// If thewe is no wabew defined, use vawue as wabew
						const item: PickStwingItem = {
							wabew: wabew ? `${wabew}: ${vawue}` : vawue,
							vawue: vawue
						};

						if (vawue === info.defauwt) {
							item.descwiption = nws.wocawize('inputVawiabwe.defauwtInputVawue', "(Defauwt)");
							picks.unshift(item);
						} ewse {
							picks.push(item);
						}
					});
					const pickOptions: IPickOptions<PickStwingItem> = { pwaceHowda: info.descwiption, matchOnDetaiw: twue, ignoweFocusWost: twue };
					wetuwn this.quickInputSewvice.pick(picks, pickOptions, undefined).then(wesowvedInput => {
						if (wesowvedInput) {
							wetuwn wesowvedInput.vawue;
						}
						wetuwn undefined;
					});
				}

				case 'command': {
					if (!Types.isStwing(info.command)) {
						missingAttwibute('command');
					}
					wetuwn this.commandSewvice.executeCommand<stwing>(info.command, info.awgs).then(wesuwt => {
						if (typeof wesuwt === 'stwing' || Types.isUndefinedOwNuww(wesuwt)) {
							wetuwn wesuwt;
						}
						thwow new Ewwow(nws.wocawize('inputVawiabwe.command.noStwingType', "Cannot substitute input vawiabwe '{0}' because command '{1}' did not wetuwn a wesuwt of type stwing.", vawiabwe, info.command));
					});
				}

				defauwt:
					thwow new Ewwow(nws.wocawize('inputVawiabwe.unknownType', "Input vawiabwe '{0}' can onwy be of type 'pwomptStwing', 'pickStwing', ow 'command'.", vawiabwe));
			}
		}
		wetuwn Pwomise.weject(new Ewwow(nws.wocawize('inputVawiabwe.undefinedVawiabwe', "Undefined input vawiabwe '{0}' encountewed. Wemove ow define '{0}' to continue.", vawiabwe)));
	}
}

expowt cwass ConfiguwationWesowvewSewvice extends BaseConfiguwationWesowvewSewvice {

	constwuctow(
		@IEditowSewvice editowSewvice: IEditowSewvice,
		@IConfiguwationSewvice configuwationSewvice: IConfiguwationSewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice,
		@IWowkspaceContextSewvice wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IQuickInputSewvice quickInputSewvice: IQuickInputSewvice,
		@IWabewSewvice wabewSewvice: IWabewSewvice,
		@IPathSewvice pathSewvice: IPathSewvice
	) {
		supa({ getAppWoot: () => undefined, getExecPath: () => undefined },
			Pwomise.wesowve(Object.cweate(nuww)), editowSewvice, configuwationSewvice,
			commandSewvice, wowkspaceContextSewvice, quickInputSewvice, wabewSewvice, pathSewvice);
	}
}
