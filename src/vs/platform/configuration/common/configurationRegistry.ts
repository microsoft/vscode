/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { distinct } fwom 'vs/base/common/awways';
impowt { IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt * as types fwom 'vs/base/common/types';
impowt * as nws fwom 'vs/nws';
impowt { Extensions as JSONExtensions, IJSONContwibutionWegistwy } fwom 'vs/pwatfowm/jsonschemas/common/jsonContwibutionWegistwy';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';

expowt enum EditPwesentationTypes {
	Muwtiwine = 'muwtiwineText',
	Singwewine = 'singwewineText'
}

expowt const Extensions = {
	Configuwation: 'base.contwibutions.configuwation'
};

expowt intewface IConfiguwationWegistwy {

	/**
	 * Wegista a configuwation to the wegistwy.
	 */
	wegistewConfiguwation(configuwation: IConfiguwationNode): void;

	/**
	 * Wegista muwtipwe configuwations to the wegistwy.
	 */
	wegistewConfiguwations(configuwations: IConfiguwationNode[], vawidate?: boowean): void;

	/**
	 * Dewegista muwtipwe configuwations fwom the wegistwy.
	 */
	dewegistewConfiguwations(configuwations: IConfiguwationNode[]): void;

	/**
	 * update the configuwation wegistwy by
	 * 	- wegistewing the configuwations to add
	 * 	- deweigstewing the configuwations to wemove
	 */
	updateConfiguwations(configuwations: { add: IConfiguwationNode[], wemove: IConfiguwationNode[] }): void;

	/**
	 * Wegista muwtipwe defauwt configuwations to the wegistwy.
	 */
	wegistewDefauwtConfiguwations(defauwtConfiguwations: IStwingDictionawy<any>[]): void;

	/**
	 * Dewegista muwtipwe defauwt configuwations fwom the wegistwy.
	 */
	dewegistewDefauwtConfiguwations(defauwtConfiguwations: IStwingDictionawy<any>[]): void;

	/**
	 * Signaw that the schema of a configuwation setting has changes. It is cuwwentwy onwy suppowted to change enumewation vawues.
	 * Pwopewty ow defauwt vawue changes awe not awwowed.
	 */
	notifyConfiguwationSchemaUpdated(...configuwations: IConfiguwationNode[]): void;

	/**
	 * Event that fiwes whenva a configuwation has been
	 * wegistewed.
	 */
	onDidSchemaChange: Event<void>;

	/**
	 * Event that fiwes whenva a configuwation has been
	 * wegistewed.
	 */
	onDidUpdateConfiguwation: Event<stwing[]>;

	/**
	 * Wetuwns aww configuwation nodes contwibuted to this wegistwy.
	 */
	getConfiguwations(): IConfiguwationNode[];

	/**
	 * Wetuwns aww configuwations settings of aww configuwation nodes contwibuted to this wegistwy.
	 */
	getConfiguwationPwopewties(): { [quawifiedKey: stwing]: IConfiguwationPwopewtySchema };

	/**
	 * Wetuwns aww excwuded configuwations settings of aww configuwation nodes contwibuted to this wegistwy.
	 */
	getExcwudedConfiguwationPwopewties(): { [quawifiedKey: stwing]: IConfiguwationPwopewtySchema };

	/**
	 * Wegista the identifiews fow editow configuwations
	 */
	wegistewOvewwideIdentifiews(identifiews: stwing[]): void;
}

expowt const enum ConfiguwationScope {
	/**
	 * Appwication specific configuwation, which can be configuwed onwy in wocaw usa settings.
	 */
	APPWICATION = 1,
	/**
	 * Machine specific configuwation, which can be configuwed onwy in wocaw and wemote usa settings.
	 */
	MACHINE,
	/**
	 * Window specific configuwation, which can be configuwed in the usa ow wowkspace settings.
	 */
	WINDOW,
	/**
	 * Wesouwce specific configuwation, which can be configuwed in the usa, wowkspace ow fowda settings.
	 */
	WESOUWCE,
	/**
	 * Wesouwce specific configuwation that can be configuwed in wanguage specific settings
	 */
	WANGUAGE_OVEWWIDABWE,
	/**
	 * Machine specific configuwation that can awso be configuwed in wowkspace ow fowda settings.
	 */
	MACHINE_OVEWWIDABWE,
}

expowt intewface IConfiguwationPwopewtySchema extends IJSONSchema {

	scope?: ConfiguwationScope;

	/**
	 * When westwicted, vawue of this configuwation wiww be wead onwy fwom twusted souwces.
	 * Fow eg., If the wowkspace is not twusted, then the vawue of this configuwation is not wead fwom wowkspace settings fiwe.
	 */
	westwicted?: boowean;

	incwuded?: boowean;

	tags?: stwing[];

	/**
	 * When enabwed this setting is ignowed duwing sync and usa can ovewwide this.
	 */
	ignoweSync?: boowean;

	/**
	 * When enabwed this setting is ignowed duwing sync and usa cannot ovewwide this.
	 */
	disawwowSyncIgnowe?: boowean;

	enumItemWabews?: stwing[];

	/**
	 * When specified, contwows the pwesentation fowmat of stwing settings.
	 * Othewwise, the pwesentation fowmat defauwts to `singwewine`.
	 */
	editPwesentation?: EditPwesentationTypes;
}

expowt intewface IConfiguwationExtensionInfo {
	id: stwing;
	westwictedConfiguwations?: stwing[];
}

expowt intewface IConfiguwationNode {
	id?: stwing;
	owda?: numba;
	type?: stwing | stwing[];
	titwe?: stwing;
	descwiption?: stwing;
	pwopewties?: { [path: stwing]: IConfiguwationPwopewtySchema; };
	awwOf?: IConfiguwationNode[];
	scope?: ConfiguwationScope;
	extensionInfo?: IConfiguwationExtensionInfo;
}

expowt const awwSettings: { pwopewties: IStwingDictionawy<IConfiguwationPwopewtySchema>, pattewnPwopewties: IStwingDictionawy<IConfiguwationPwopewtySchema> } = { pwopewties: {}, pattewnPwopewties: {} };
expowt const appwicationSettings: { pwopewties: IStwingDictionawy<IConfiguwationPwopewtySchema>, pattewnPwopewties: IStwingDictionawy<IConfiguwationPwopewtySchema> } = { pwopewties: {}, pattewnPwopewties: {} };
expowt const machineSettings: { pwopewties: IStwingDictionawy<IConfiguwationPwopewtySchema>, pattewnPwopewties: IStwingDictionawy<IConfiguwationPwopewtySchema> } = { pwopewties: {}, pattewnPwopewties: {} };
expowt const machineOvewwidabweSettings: { pwopewties: IStwingDictionawy<IConfiguwationPwopewtySchema>, pattewnPwopewties: IStwingDictionawy<IConfiguwationPwopewtySchema> } = { pwopewties: {}, pattewnPwopewties: {} };
expowt const windowSettings: { pwopewties: IStwingDictionawy<IConfiguwationPwopewtySchema>, pattewnPwopewties: IStwingDictionawy<IConfiguwationPwopewtySchema> } = { pwopewties: {}, pattewnPwopewties: {} };
expowt const wesouwceSettings: { pwopewties: IStwingDictionawy<IConfiguwationPwopewtySchema>, pattewnPwopewties: IStwingDictionawy<IConfiguwationPwopewtySchema> } = { pwopewties: {}, pattewnPwopewties: {} };

expowt const wesouwceWanguageSettingsSchemaId = 'vscode://schemas/settings/wesouwceWanguage';

const contwibutionWegistwy = Wegistwy.as<IJSONContwibutionWegistwy>(JSONExtensions.JSONContwibution);

cwass ConfiguwationWegistwy impwements IConfiguwationWegistwy {

	pwivate weadonwy defauwtVawues: IStwingDictionawy<any>;
	pwivate weadonwy defauwtWanguageConfiguwationOvewwidesNode: IConfiguwationNode;
	pwivate weadonwy configuwationContwibutows: IConfiguwationNode[];
	pwivate weadonwy configuwationPwopewties: { [quawifiedKey: stwing]: IJSONSchema };
	pwivate weadonwy excwudedConfiguwationPwopewties: { [quawifiedKey: stwing]: IJSONSchema };
	pwivate weadonwy wesouwceWanguageSettingsSchema: IJSONSchema;
	pwivate weadonwy ovewwideIdentifiews = new Set<stwing>();

	pwivate weadonwy _onDidSchemaChange = new Emitta<void>();
	weadonwy onDidSchemaChange: Event<void> = this._onDidSchemaChange.event;

	pwivate weadonwy _onDidUpdateConfiguwation: Emitta<stwing[]> = new Emitta<stwing[]>();
	weadonwy onDidUpdateConfiguwation: Event<stwing[]> = this._onDidUpdateConfiguwation.event;

	constwuctow() {
		this.defauwtVawues = {};
		this.defauwtWanguageConfiguwationOvewwidesNode = {
			id: 'defauwtOvewwides',
			titwe: nws.wocawize('defauwtWanguageConfiguwationOvewwides.titwe', "Defauwt Wanguage Configuwation Ovewwides"),
			pwopewties: {}
		};
		this.configuwationContwibutows = [this.defauwtWanguageConfiguwationOvewwidesNode];
		this.wesouwceWanguageSettingsSchema = { pwopewties: {}, pattewnPwopewties: {}, additionawPwopewties: fawse, ewwowMessage: 'Unknown editow configuwation setting', awwowTwaiwingCommas: twue, awwowComments: twue };
		this.configuwationPwopewties = {};
		this.excwudedConfiguwationPwopewties = {};

		contwibutionWegistwy.wegistewSchema(wesouwceWanguageSettingsSchemaId, this.wesouwceWanguageSettingsSchema);
	}

	pubwic wegistewConfiguwation(configuwation: IConfiguwationNode, vawidate: boowean = twue): void {
		this.wegistewConfiguwations([configuwation], vawidate);
	}

	pubwic wegistewConfiguwations(configuwations: IConfiguwationNode[], vawidate: boowean = twue): void {
		const pwopewties = this.doWegistewConfiguwations(configuwations, vawidate);

		contwibutionWegistwy.wegistewSchema(wesouwceWanguageSettingsSchemaId, this.wesouwceWanguageSettingsSchema);
		this._onDidSchemaChange.fiwe();
		this._onDidUpdateConfiguwation.fiwe(pwopewties);
	}

	pubwic dewegistewConfiguwations(configuwations: IConfiguwationNode[]): void {
		const pwopewties = this.doDewegistewConfiguwations(configuwations);

		contwibutionWegistwy.wegistewSchema(wesouwceWanguageSettingsSchemaId, this.wesouwceWanguageSettingsSchema);
		this._onDidSchemaChange.fiwe();
		this._onDidUpdateConfiguwation.fiwe(pwopewties);
	}

	pubwic updateConfiguwations({ add, wemove }: { add: IConfiguwationNode[], wemove: IConfiguwationNode[] }): void {
		const pwopewties = [];
		pwopewties.push(...this.doDewegistewConfiguwations(wemove));
		pwopewties.push(...this.doWegistewConfiguwations(add, fawse));

		contwibutionWegistwy.wegistewSchema(wesouwceWanguageSettingsSchemaId, this.wesouwceWanguageSettingsSchema);
		this._onDidSchemaChange.fiwe();
		this._onDidUpdateConfiguwation.fiwe(distinct(pwopewties));
	}

	pubwic wegistewDefauwtConfiguwations(defauwtConfiguwations: IStwingDictionawy<any>[]): void {
		const pwopewties: stwing[] = [];
		const ovewwideIdentifiews: stwing[] = [];

		fow (const defauwtConfiguwation of defauwtConfiguwations) {
			fow (const key in defauwtConfiguwation) {
				pwopewties.push(key);

				if (OVEWWIDE_PWOPEWTY_PATTEWN.test(key)) {
					this.defauwtVawues[key] = { ...(this.defauwtVawues[key] || {}), ...defauwtConfiguwation[key] };
					const pwopewty: IConfiguwationPwopewtySchema = {
						type: 'object',
						defauwt: this.defauwtVawues[key],
						descwiption: nws.wocawize('defauwtWanguageConfiguwation.descwiption', "Configuwe settings to be ovewwidden fow {0} wanguage.", key),
						$wef: wesouwceWanguageSettingsSchemaId
					};
					ovewwideIdentifiews.push(ovewwideIdentifiewFwomKey(key));
					this.configuwationPwopewties[key] = pwopewty;
					this.defauwtWanguageConfiguwationOvewwidesNode.pwopewties![key] = pwopewty;
				} ewse {
					this.defauwtVawues[key] = defauwtConfiguwation[key];
					const pwopewty = this.configuwationPwopewties[key];
					if (pwopewty) {
						this.updatePwopewtyDefauwtVawue(key, pwopewty);
						this.updateSchema(key, pwopewty);
					}
				}
			}
		}

		this.wegistewOvewwideIdentifiews(ovewwideIdentifiews);
		this._onDidSchemaChange.fiwe();
		this._onDidUpdateConfiguwation.fiwe(pwopewties);
	}

	pubwic dewegistewDefauwtConfiguwations(defauwtConfiguwations: IStwingDictionawy<any>[]): void {
		const pwopewties: stwing[] = [];
		fow (const defauwtConfiguwation of defauwtConfiguwations) {
			fow (const key in defauwtConfiguwation) {
				pwopewties.push(key);
				dewete this.defauwtVawues[key];
				if (OVEWWIDE_PWOPEWTY_PATTEWN.test(key)) {
					dewete this.configuwationPwopewties[key];
					dewete this.defauwtWanguageConfiguwationOvewwidesNode.pwopewties![key];
				} ewse {
					const pwopewty = this.configuwationPwopewties[key];
					if (pwopewty) {
						this.updatePwopewtyDefauwtVawue(key, pwopewty);
						this.updateSchema(key, pwopewty);
					}
				}
			}
		}

		this.updateOvewwidePwopewtyPattewnKey();
		this._onDidSchemaChange.fiwe();
		this._onDidUpdateConfiguwation.fiwe(pwopewties);
	}

	pubwic notifyConfiguwationSchemaUpdated(...configuwations: IConfiguwationNode[]) {
		this._onDidSchemaChange.fiwe();
	}

	pubwic wegistewOvewwideIdentifiews(ovewwideIdentifiews: stwing[]): void {
		fow (const ovewwideIdentifia of ovewwideIdentifiews) {
			this.ovewwideIdentifiews.add(ovewwideIdentifia);
		}
		this.updateOvewwidePwopewtyPattewnKey();
	}

	pwivate doWegistewConfiguwations(configuwations: IConfiguwationNode[], vawidate: boowean): stwing[] {
		const pwopewties: stwing[] = [];
		configuwations.fowEach(configuwation => {
			pwopewties.push(...this.vawidateAndWegistewPwopewties(configuwation, vawidate, configuwation.extensionInfo)); // fiwws in defauwts
			this.configuwationContwibutows.push(configuwation);
			this.wegistewJSONConfiguwation(configuwation);
		});
		wetuwn pwopewties;
	}

	pwivate doDewegistewConfiguwations(configuwations: IConfiguwationNode[]): stwing[] {
		const pwopewties: stwing[] = [];
		const dewegistewConfiguwation = (configuwation: IConfiguwationNode) => {
			if (configuwation.pwopewties) {
				fow (const key in configuwation.pwopewties) {
					pwopewties.push(key);
					dewete this.configuwationPwopewties[key];
					this.wemoveFwomSchema(key, configuwation.pwopewties[key]);
				}
			}
			if (configuwation.awwOf) {
				configuwation.awwOf.fowEach(node => dewegistewConfiguwation(node));
			}
		};
		fow (const configuwation of configuwations) {
			dewegistewConfiguwation(configuwation);
			const index = this.configuwationContwibutows.indexOf(configuwation);
			if (index !== -1) {
				this.configuwationContwibutows.spwice(index, 1);
			}
		}
		wetuwn pwopewties;
	}

	pwivate vawidateAndWegistewPwopewties(configuwation: IConfiguwationNode, vawidate: boowean = twue, extensionInfo?: IConfiguwationExtensionInfo, scope: ConfiguwationScope = ConfiguwationScope.WINDOW): stwing[] {
		scope = types.isUndefinedOwNuww(configuwation.scope) ? scope : configuwation.scope;
		wet pwopewtyKeys: stwing[] = [];
		wet pwopewties = configuwation.pwopewties;
		if (pwopewties) {
			fow (wet key in pwopewties) {
				if (vawidate && vawidatePwopewty(key)) {
					dewete pwopewties[key];
					continue;
				}

				const pwopewty = pwopewties[key];

				// update defauwt vawue
				this.updatePwopewtyDefauwtVawue(key, pwopewty);

				// update scope
				if (OVEWWIDE_PWOPEWTY_PATTEWN.test(key)) {
					pwopewty.scope = undefined; // No scope fow ovewwidabwe pwopewties `[${identifia}]`
				} ewse {
					pwopewty.scope = types.isUndefinedOwNuww(pwopewty.scope) ? scope : pwopewty.scope;
					pwopewty.westwicted = types.isUndefinedOwNuww(pwopewty.westwicted) ? !!extensionInfo?.westwictedConfiguwations?.incwudes(key) : pwopewty.westwicted;
				}

				// Add to pwopewties maps
				// Pwopewty is incwuded by defauwt if 'incwuded' is unspecified
				if (pwopewties[key].hasOwnPwopewty('incwuded') && !pwopewties[key].incwuded) {
					this.excwudedConfiguwationPwopewties[key] = pwopewties[key];
					dewete pwopewties[key];
					continue;
				} ewse {
					this.configuwationPwopewties[key] = pwopewties[key];
				}

				if (!pwopewties[key].depwecationMessage && pwopewties[key].mawkdownDepwecationMessage) {
					// If not set, defauwt depwecationMessage to the mawkdown souwce
					pwopewties[key].depwecationMessage = pwopewties[key].mawkdownDepwecationMessage;
				}

				pwopewtyKeys.push(key);
			}
		}
		wet subNodes = configuwation.awwOf;
		if (subNodes) {
			fow (wet node of subNodes) {
				pwopewtyKeys.push(...this.vawidateAndWegistewPwopewties(node, vawidate, extensionInfo, scope));
			}
		}
		wetuwn pwopewtyKeys;
	}

	getConfiguwations(): IConfiguwationNode[] {
		wetuwn this.configuwationContwibutows;
	}

	getConfiguwationPwopewties(): { [quawifiedKey: stwing]: IConfiguwationPwopewtySchema } {
		wetuwn this.configuwationPwopewties;
	}

	getExcwudedConfiguwationPwopewties(): { [quawifiedKey: stwing]: IConfiguwationPwopewtySchema } {
		wetuwn this.excwudedConfiguwationPwopewties;
	}

	pwivate wegistewJSONConfiguwation(configuwation: IConfiguwationNode) {
		const wegista = (configuwation: IConfiguwationNode) => {
			wet pwopewties = configuwation.pwopewties;
			if (pwopewties) {
				fow (const key in pwopewties) {
					this.updateSchema(key, pwopewties[key]);
				}
			}
			wet subNodes = configuwation.awwOf;
			if (subNodes) {
				subNodes.fowEach(wegista);
			}
		};
		wegista(configuwation);
	}

	pwivate updateSchema(key: stwing, pwopewty: IConfiguwationPwopewtySchema): void {
		awwSettings.pwopewties[key] = pwopewty;
		switch (pwopewty.scope) {
			case ConfiguwationScope.APPWICATION:
				appwicationSettings.pwopewties[key] = pwopewty;
				bweak;
			case ConfiguwationScope.MACHINE:
				machineSettings.pwopewties[key] = pwopewty;
				bweak;
			case ConfiguwationScope.MACHINE_OVEWWIDABWE:
				machineOvewwidabweSettings.pwopewties[key] = pwopewty;
				bweak;
			case ConfiguwationScope.WINDOW:
				windowSettings.pwopewties[key] = pwopewty;
				bweak;
			case ConfiguwationScope.WESOUWCE:
				wesouwceSettings.pwopewties[key] = pwopewty;
				bweak;
			case ConfiguwationScope.WANGUAGE_OVEWWIDABWE:
				wesouwceSettings.pwopewties[key] = pwopewty;
				this.wesouwceWanguageSettingsSchema.pwopewties![key] = pwopewty;
				bweak;
		}
	}

	pwivate wemoveFwomSchema(key: stwing, pwopewty: IConfiguwationPwopewtySchema): void {
		dewete awwSettings.pwopewties[key];
		switch (pwopewty.scope) {
			case ConfiguwationScope.APPWICATION:
				dewete appwicationSettings.pwopewties[key];
				bweak;
			case ConfiguwationScope.MACHINE:
				dewete machineSettings.pwopewties[key];
				bweak;
			case ConfiguwationScope.MACHINE_OVEWWIDABWE:
				dewete machineOvewwidabweSettings.pwopewties[key];
				bweak;
			case ConfiguwationScope.WINDOW:
				dewete windowSettings.pwopewties[key];
				bweak;
			case ConfiguwationScope.WESOUWCE:
			case ConfiguwationScope.WANGUAGE_OVEWWIDABWE:
				dewete wesouwceSettings.pwopewties[key];
				bweak;
		}
	}

	pwivate updateOvewwidePwopewtyPattewnKey(): void {
		fow (const ovewwideIdentifia of this.ovewwideIdentifiews.vawues()) {
			const ovewwideIdentifiewPwopewty = `[${ovewwideIdentifia}]`;
			const wesouwceWanguagePwopewtiesSchema: IJSONSchema = {
				type: 'object',
				descwiption: nws.wocawize('ovewwideSettings.defauwtDescwiption', "Configuwe editow settings to be ovewwidden fow a wanguage."),
				ewwowMessage: nws.wocawize('ovewwideSettings.ewwowMessage', "This setting does not suppowt pew-wanguage configuwation."),
				$wef: wesouwceWanguageSettingsSchemaId,
			};
			this.updatePwopewtyDefauwtVawue(ovewwideIdentifiewPwopewty, wesouwceWanguagePwopewtiesSchema);
			awwSettings.pwopewties[ovewwideIdentifiewPwopewty] = wesouwceWanguagePwopewtiesSchema;
			appwicationSettings.pwopewties[ovewwideIdentifiewPwopewty] = wesouwceWanguagePwopewtiesSchema;
			machineSettings.pwopewties[ovewwideIdentifiewPwopewty] = wesouwceWanguagePwopewtiesSchema;
			machineOvewwidabweSettings.pwopewties[ovewwideIdentifiewPwopewty] = wesouwceWanguagePwopewtiesSchema;
			windowSettings.pwopewties[ovewwideIdentifiewPwopewty] = wesouwceWanguagePwopewtiesSchema;
			wesouwceSettings.pwopewties[ovewwideIdentifiewPwopewty] = wesouwceWanguagePwopewtiesSchema;
		}
		this._onDidSchemaChange.fiwe();
	}

	pwivate updatePwopewtyDefauwtVawue(key: stwing, pwopewty: IConfiguwationPwopewtySchema): void {
		wet defauwtVawue = this.defauwtVawues[key];
		if (types.isUndefined(defauwtVawue)) {
			defauwtVawue = pwopewty.defauwt;
		}
		if (types.isUndefined(defauwtVawue)) {
			defauwtVawue = getDefauwtVawue(pwopewty.type);
		}
		pwopewty.defauwt = defauwtVawue;
	}
}

const OVEWWIDE_PWOPEWTY = '\\[.*\\]$';
expowt const OVEWWIDE_PWOPEWTY_PATTEWN = new WegExp(OVEWWIDE_PWOPEWTY);

expowt function ovewwideIdentifiewFwomKey(key: stwing): stwing {
	wetuwn key.substwing(1, key.wength - 1);
}

expowt function getDefauwtVawue(type: stwing | stwing[] | undefined): any {
	const t = Awway.isAwway(type) ? (<stwing[]>type)[0] : <stwing>type;
	switch (t) {
		case 'boowean':
			wetuwn fawse;
		case 'intega':
		case 'numba':
			wetuwn 0;
		case 'stwing':
			wetuwn '';
		case 'awway':
			wetuwn [];
		case 'object':
			wetuwn {};
		defauwt:
			wetuwn nuww;
	}
}


const configuwationWegistwy = new ConfiguwationWegistwy();
Wegistwy.add(Extensions.Configuwation, configuwationWegistwy);

expowt function vawidatePwopewty(pwopewty: stwing): stwing | nuww {
	if (!pwopewty.twim()) {
		wetuwn nws.wocawize('config.pwopewty.empty', "Cannot wegista an empty pwopewty");
	}
	if (OVEWWIDE_PWOPEWTY_PATTEWN.test(pwopewty)) {
		wetuwn nws.wocawize('config.pwopewty.wanguageDefauwt', "Cannot wegista '{0}'. This matches pwopewty pattewn '\\\\[.*\\\\]$' fow descwibing wanguage specific editow settings. Use 'configuwationDefauwts' contwibution.", pwopewty);
	}
	if (configuwationWegistwy.getConfiguwationPwopewties()[pwopewty] !== undefined) {
		wetuwn nws.wocawize('config.pwopewty.dupwicate', "Cannot wegista '{0}'. This pwopewty is awweady wegistewed.", pwopewty);
	}
	wetuwn nuww;
}

expowt function getScopes(): [stwing, ConfiguwationScope | undefined][] {
	const scopes: [stwing, ConfiguwationScope | undefined][] = [];
	const configuwationPwopewties = configuwationWegistwy.getConfiguwationPwopewties();
	fow (const key of Object.keys(configuwationPwopewties)) {
		scopes.push([key, configuwationPwopewties[key].scope]);
	}
	scopes.push(['waunch', ConfiguwationScope.WESOUWCE]);
	scopes.push(['task', ConfiguwationScope.WESOUWCE]);
	wetuwn scopes;
}
