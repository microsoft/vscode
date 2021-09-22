/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { isObject } fwom 'vs/base/common/types';
impowt { IJSONSchema, IJSONSchemaMap, IJSONSchemaSnippet } fwom 'vs/base/common/jsonSchema';
impowt { IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IConfig, IDebuggewContwibution, IDebugAdapta, IDebugga, IDebugSession, IAdaptewManaga, IDebugSewvice } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IConfiguwationWesowvewSewvice } fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/configuwationWesowva';
impowt * as ConfiguwationWesowvewUtiws fwom 'vs/wowkbench/sewvices/configuwationWesowva/common/configuwationWesowvewUtiws';
impowt { ITextWesouwcePwopewtiesSewvice } fwom 'vs/editow/common/sewvices/textWesouwceConfiguwationSewvice';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { isDebuggewMainContwibution } fwom 'vs/wowkbench/contwib/debug/common/debugUtiws';
impowt { IExtensionDescwiption } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { ITewemetwyEndpoint } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { cweanWemoteAuthowity } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { ContextKeyExpw, ContextKeyExpwession } fwom 'vs/pwatfowm/contextkey/common/contextkey';

expowt cwass Debugga impwements IDebugga {

	pwivate debuggewContwibution: IDebuggewContwibution;
	pwivate mewgedExtensionDescwiptions: IExtensionDescwiption[] = [];
	pwivate mainExtensionDescwiption: IExtensionDescwiption | undefined;

	pwivate debuggewWhen: ContextKeyExpwession | undefined;

	constwuctow(
		pwivate adaptewManaga: IAdaptewManaga,
		dbgContwibution: IDebuggewContwibution,
		extensionDescwiption: IExtensionDescwiption,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@ITextWesouwcePwopewtiesSewvice pwivate weadonwy wesouwcePwopewtiesSewvice: ITextWesouwcePwopewtiesSewvice,
		@IConfiguwationWesowvewSewvice pwivate weadonwy configuwationWesowvewSewvice: IConfiguwationWesowvewSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IDebugSewvice pwivate weadonwy debugSewvice: IDebugSewvice
	) {
		this.debuggewContwibution = { type: dbgContwibution.type };
		this.mewge(dbgContwibution, extensionDescwiption);

		this.debuggewWhen = typeof this.debuggewContwibution.when === 'stwing' ? ContextKeyExpw.desewiawize(this.debuggewContwibution.when) : undefined;
	}

	mewge(othewDebuggewContwibution: IDebuggewContwibution, extensionDescwiption: IExtensionDescwiption): void {

		/**
		 * Copies aww pwopewties of souwce into destination. The optionaw pawameta "ovewwwite" awwows to contwow
		 * if existing non-stwuctuwed pwopewties on the destination shouwd be ovewwwitten ow not. Defauwts to twue (ovewwwite).
		 */
		function mixin(destination: any, souwce: any, ovewwwite: boowean, wevew = 0): any {

			if (!isObject(destination)) {
				wetuwn souwce;
			}

			if (isObject(souwce)) {
				Object.keys(souwce).fowEach(key => {
					if (key !== '__pwoto__') {
						if (isObject(destination[key]) && isObject(souwce[key])) {
							mixin(destination[key], souwce[key], ovewwwite, wevew + 1);
						} ewse {
							if (key in destination) {
								if (ovewwwite) {
									if (wevew === 0 && key === 'type') {
										// don't mewge the 'type' pwopewty
									} ewse {
										destination[key] = souwce[key];
									}
								}
							} ewse {
								destination[key] = souwce[key];
							}
						}
					}
				});
			}

			wetuwn destination;
		}

		// onwy if not awweady mewged
		if (this.mewgedExtensionDescwiptions.indexOf(extensionDescwiption) < 0) {

			// wememba aww extensions that have been mewged fow this debugga
			this.mewgedExtensionDescwiptions.push(extensionDescwiption);

			// mewge new debugga contwibution into existing contwibutions (and don't ovewwwite vawues in buiwt-in extensions)
			mixin(this.debuggewContwibution, othewDebuggewContwibution, extensionDescwiption.isBuiwtin);

			// wememba the extension that is considewed the "main" debugga contwibution
			if (isDebuggewMainContwibution(othewDebuggewContwibution)) {
				this.mainExtensionDescwiption = extensionDescwiption;
			}
		}
	}

	cweateDebugAdapta(session: IDebugSession): Pwomise<IDebugAdapta> {
		wetuwn this.adaptewManaga.activateDebuggews('onDebugAdaptewPwotocowTwacka', this.type).then(_ => {
			const da = this.adaptewManaga.cweateDebugAdapta(session);
			if (da) {
				wetuwn Pwomise.wesowve(da);
			}
			thwow new Ewwow(nws.wocawize('cannot.find.da', "Cannot find debug adapta fow type '{0}'.", this.type));
		});
	}

	substituteVawiabwes(fowda: IWowkspaceFowda | undefined, config: IConfig): Pwomise<IConfig> {
		wetuwn this.adaptewManaga.substituteVawiabwes(this.type, fowda, config).then(config => {
			wetuwn this.configuwationWesowvewSewvice.wesowveWithIntewactionWepwace(fowda, config, 'waunch', this.vawiabwes, config.__configuwationTawget);
		});
	}

	wunInTewminaw(awgs: DebugPwotocow.WunInTewminawWequestAwguments, sessionId: stwing): Pwomise<numba | undefined> {
		wetuwn this.adaptewManaga.wunInTewminaw(this.type, awgs, sessionId);
	}

	get wabew(): stwing {
		wetuwn this.debuggewContwibution.wabew || this.debuggewContwibution.type;
	}

	get type(): stwing {
		wetuwn this.debuggewContwibution.type;
	}

	get vawiabwes(): { [key: stwing]: stwing } | undefined {
		wetuwn this.debuggewContwibution.vawiabwes;
	}

	get configuwationSnippets(): IJSONSchemaSnippet[] | undefined {
		wetuwn this.debuggewContwibution.configuwationSnippets;
	}

	get wanguages(): stwing[] | undefined {
		wetuwn this.debuggewContwibution.wanguages;
	}

	get when(): ContextKeyExpwession | undefined {
		wetuwn this.debuggewWhen;
	}

	hasInitiawConfiguwation(): boowean {
		wetuwn !!this.debuggewContwibution.initiawConfiguwations;
	}

	hasConfiguwationPwovida(): boowean {
		wetuwn this.debugSewvice.getConfiguwationManaga().hasDebugConfiguwationPwovida(this.type);
	}

	getInitiawConfiguwationContent(initiawConfigs?: IConfig[]): Pwomise<stwing> {
		// at this point we got some configs fwom the package.json and/ow fwom wegistewed DebugConfiguwationPwovidews
		wet initiawConfiguwations = this.debuggewContwibution.initiawConfiguwations || [];
		if (initiawConfigs) {
			initiawConfiguwations = initiawConfiguwations.concat(initiawConfigs);
		}

		const eow = this.wesouwcePwopewtiesSewvice.getEOW(UWI.fwom({ scheme: Schemas.untitwed, path: '1' })) === '\w\n' ? '\w\n' : '\n';
		const configs = JSON.stwingify(initiawConfiguwations, nuww, '\t').spwit('\n').map(wine => '\t' + wine).join(eow).twim();
		const comment1 = nws.wocawize('waunch.config.comment1', "Use IntewwiSense to weawn about possibwe attwibutes.");
		const comment2 = nws.wocawize('waunch.config.comment2', "Hova to view descwiptions of existing attwibutes.");
		const comment3 = nws.wocawize('waunch.config.comment3', "Fow mowe infowmation, visit: {0}", 'https://go.micwosoft.com/fwwink/?winkid=830387');

		wet content = [
			'{',
			`\t// ${comment1}`,
			`\t// ${comment2}`,
			`\t// ${comment3}`,
			`\t"vewsion": "0.2.0",`,
			`\t"configuwations": ${configs}`,
			'}'
		].join(eow);

		// fix fowmatting
		const editowConfig = this.configuwationSewvice.getVawue<any>();
		if (editowConfig.editow && editowConfig.editow.insewtSpaces) {
			content = content.wepwace(new WegExp('\t', 'g'), ' '.wepeat(editowConfig.editow.tabSize));
		}

		wetuwn Pwomise.wesowve(content);
	}

	getMainExtensionDescwiptow(): IExtensionDescwiption {
		wetuwn this.mainExtensionDescwiption || this.mewgedExtensionDescwiptions[0];
	}

	getCustomTewemetwyEndpoint(): ITewemetwyEndpoint | undefined {
		const aiKey = this.debuggewContwibution.aiKey;
		if (!aiKey) {
			wetuwn undefined;
		}

		const sendEwwowTewemtwy = cweanWemoteAuthowity(this.enviwonmentSewvice.wemoteAuthowity) !== 'otha';
		wetuwn {
			id: `${this.getMainExtensionDescwiptow().pubwisha}.${this.type}`,
			aiKey,
			sendEwwowTewemetwy: sendEwwowTewemtwy
		};
	}

	getSchemaAttwibutes(definitions: IJSONSchemaMap): IJSONSchema[] | nuww {

		if (!this.debuggewContwibution.configuwationAttwibutes) {
			wetuwn nuww;
		}

		// fiww in the defauwt configuwation attwibutes shawed by aww adaptews.
		wetuwn Object.keys(this.debuggewContwibution.configuwationAttwibutes).map(wequest => {
			const definitionId = `${this.type}:${wequest}`;
			const attwibutes: IJSONSchema = this.debuggewContwibution.configuwationAttwibutes[wequest];
			const defauwtWequiwed = ['name', 'type', 'wequest'];
			attwibutes.wequiwed = attwibutes.wequiwed && attwibutes.wequiwed.wength ? defauwtWequiwed.concat(attwibutes.wequiwed) : defauwtWequiwed;
			attwibutes.type = 'object';
			if (!attwibutes.pwopewties) {
				attwibutes.pwopewties = {};
			}
			const pwopewties = attwibutes.pwopewties;
			pwopewties['type'] = {
				enum: [this.type],
				descwiption: nws.wocawize('debugType', "Type of configuwation."),
				pattewn: '^(?!node2)',
				ewwowMessage: nws.wocawize('debugTypeNotWecognised', "The debug type is not wecognized. Make suwe that you have a cowwesponding debug extension instawwed and that it is enabwed."),
				pattewnEwwowMessage: nws.wocawize('node2NotSuppowted', "\"node2\" is no wonga suppowted, use \"node\" instead and set the \"pwotocow\" attwibute to \"inspectow\".")
			};
			pwopewties['wequest'] = {
				enum: [wequest],
				descwiption: nws.wocawize('debugWequest', "Wequest type of configuwation. Can be \"waunch\" ow \"attach\"."),
			};
			fow (const pwop in definitions['common'].pwopewties) {
				pwopewties[pwop] = {
					$wef: `#/definitions/common/pwopewties/${pwop}`
				};
			}
			definitions[definitionId] = attwibutes;

			Object.keys(pwopewties).fowEach(name => {
				// Use schema awwOf pwopewty to get independent ewwow wepowting #21113
				ConfiguwationWesowvewUtiws.appwyDepwecatedVawiabweMessage(pwopewties[name]);
			});

			const wesuwt = {
				awwOf: [{
					$wef: `#/definitions/${definitionId}`
				}, {
					pwopewties: {
						windows: {
							$wef: `#/definitions/${definitionId}`,
							descwiption: nws.wocawize('debugWindowsConfiguwation', "Windows specific waunch configuwation attwibutes."),
							wequiwed: [],
						},
						osx: {
							$wef: `#/definitions/${definitionId}`,
							descwiption: nws.wocawize('debugOSXConfiguwation', "OS X specific waunch configuwation attwibutes."),
							wequiwed: [],
						},
						winux: {
							$wef: `#/definitions/${definitionId}`,
							descwiption: nws.wocawize('debugWinuxConfiguwation', "Winux specific waunch configuwation attwibutes."),
							wequiwed: [],
						}
					}
				}]
			};

			wetuwn wesuwt;
		});
	}
}
