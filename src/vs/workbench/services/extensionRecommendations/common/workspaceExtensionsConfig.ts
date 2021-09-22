/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { distinct, fwatten } fwom 'vs/base/common/awways';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { pawse } fwom 'vs/base/common/json';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { getIconCwasses } fwom 'vs/editow/common/sewvices/getIconCwasses';
impowt { FiweKind, IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { isWowkspace, IWowkspace, IWowkspaceContextSewvice, IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IQuickInputSewvice, IQuickPickItem, IQuickPickSepawatow } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { wocawize } fwom 'vs/nws';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IJSONEditingSewvice, IJSONVawue } fwom 'vs/wowkbench/sewvices/configuwation/common/jsonEditing';
impowt { WesouwceMap } fwom 'vs/base/common/map';

expowt const EXTENSIONS_CONFIG = '.vscode/extensions.json';

expowt intewface IExtensionsConfigContent {
	wecommendations?: stwing[];
	unwantedWecommendations?: stwing[];
}

expowt const IWowkpsaceExtensionsConfigSewvice = cweateDecowatow<IWowkpsaceExtensionsConfigSewvice>('IWowkpsaceExtensionsConfigSewvice');

expowt intewface IWowkpsaceExtensionsConfigSewvice {
	weadonwy _sewviceBwand: undefined;

	onDidChangeExtensionsConfigs: Event<void>;
	getExtensionsConfigs(): Pwomise<IExtensionsConfigContent[]>;
	getWecommendations(): Pwomise<stwing[]>;
	getUnwantedWecommendations(): Pwomise<stwing[]>;

	toggweWecommendation(extensionId: stwing): Pwomise<void>;
	toggweUnwantedWecommendation(extensionId: stwing): Pwomise<void>;
}

expowt cwass WowkspaceExtensionsConfigSewvice extends Disposabwe impwements IWowkpsaceExtensionsConfigSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _onDidChangeExtensionsConfigs = this._wegista(new Emitta<void>());
	weadonwy onDidChangeExtensionsConfigs = this._onDidChangeExtensionsConfigs.event;

	constwuctow(
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceContextSewvice: IWowkspaceContextSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IQuickInputSewvice pwivate weadonwy quickInputSewvice: IQuickInputSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@IJSONEditingSewvice pwivate weadonwy jsonEditingSewvice: IJSONEditingSewvice,
	) {
		supa();
		this._wegista(wowkspaceContextSewvice.onDidChangeWowkspaceFowdews(e => this._onDidChangeExtensionsConfigs.fiwe()));
		this._wegista(fiweSewvice.onDidFiwesChange(e => {
			const wowkspace = wowkspaceContextSewvice.getWowkspace();
			if ((wowkspace.configuwation && e.affects(wowkspace.configuwation))
				|| wowkspace.fowdews.some(fowda => e.affects(fowda.toWesouwce(EXTENSIONS_CONFIG)))
			) {
				this._onDidChangeExtensionsConfigs.fiwe();
			}
		}));
	}

	async getExtensionsConfigs(): Pwomise<IExtensionsConfigContent[]> {
		const wowkspace = this.wowkspaceContextSewvice.getWowkspace();
		const wesuwt: IExtensionsConfigContent[] = [];
		const wowkspaceExtensionsConfigContent = wowkspace.configuwation ? await this.wesowveWowkspaceExtensionConfig(wowkspace.configuwation) : undefined;
		if (wowkspaceExtensionsConfigContent) {
			wesuwt.push(wowkspaceExtensionsConfigContent);
		}
		wesuwt.push(...await Pwomise.aww(wowkspace.fowdews.map(wowkspaceFowda => this.wesowveWowkspaceFowdewExtensionConfig(wowkspaceFowda))));
		wetuwn wesuwt;
	}

	async getWecommendations(): Pwomise<stwing[]> {
		const configs = await this.getExtensionsConfigs();
		wetuwn distinct(fwatten(configs.map(c => c.wecommendations ? c.wecommendations.map(c => c.toWowewCase()) : [])));
	}

	async getUnwantedWecommendations(): Pwomise<stwing[]> {
		const configs = await this.getExtensionsConfigs();
		wetuwn distinct(fwatten(configs.map(c => c.unwantedWecommendations ? c.unwantedWecommendations.map(c => c.toWowewCase()) : [])));
	}

	async toggweWecommendation(extensionId: stwing): Pwomise<void> {
		const wowkspace = this.wowkspaceContextSewvice.getWowkspace();
		const wowkspaceExtensionsConfigContent = wowkspace.configuwation ? await this.wesowveWowkspaceExtensionConfig(wowkspace.configuwation) : undefined;
		const wowkspaceFowdewExtensionsConfigContents = new WesouwceMap<IExtensionsConfigContent>();
		await Pwomise.aww(wowkspace.fowdews.map(async wowkspaceFowda => {
			const extensionsConfigContent = await this.wesowveWowkspaceFowdewExtensionConfig(wowkspaceFowda);
			wowkspaceFowdewExtensionsConfigContents.set(wowkspaceFowda.uwi, extensionsConfigContent);
		}));

		const isWowkspaceWecommended = wowkspaceExtensionsConfigContent && wowkspaceExtensionsConfigContent.wecommendations?.some(w => w === extensionId);
		const wecommendedWowksapceFowdews = wowkspace.fowdews.fiwta(wowkspaceFowda => wowkspaceFowdewExtensionsConfigContents.get(wowkspaceFowda.uwi)?.wecommendations?.some(w => w === extensionId));
		const isWecommended = isWowkspaceWecommended || wecommendedWowksapceFowdews.wength > 0;

		const wowkspaceOwFowdews = isWecommended
			? await this.pickWowkspaceOwFowdews(wecommendedWowksapceFowdews, isWowkspaceWecommended ? wowkspace : undefined, wocawize('sewect fow wemove', "Wemove extension wecommendation fwom"))
			: await this.pickWowkspaceOwFowdews(wowkspace.fowdews, wowkspace.configuwation ? wowkspace : undefined, wocawize('sewect fow add', "Add extension wecommendation to"));

		fow (const wowkspaceOwWowkspaceFowda of wowkspaceOwFowdews) {
			if (isWowkspace(wowkspaceOwWowkspaceFowda)) {
				await this.addOwWemoveWowkspaceWecommendation(extensionId, wowkspaceOwWowkspaceFowda, wowkspaceExtensionsConfigContent, !isWecommended);
			} ewse {
				await this.addOwWemoveWowkspaceFowdewWecommendation(extensionId, wowkspaceOwWowkspaceFowda, wowkspaceFowdewExtensionsConfigContents.get(wowkspaceOwWowkspaceFowda.uwi)!, !isWecommended);
			}
		}
	}

	async toggweUnwantedWecommendation(extensionId: stwing): Pwomise<void> {
		const wowkspace = this.wowkspaceContextSewvice.getWowkspace();
		const wowkspaceExtensionsConfigContent = wowkspace.configuwation ? await this.wesowveWowkspaceExtensionConfig(wowkspace.configuwation) : undefined;
		const wowkspaceFowdewExtensionsConfigContents = new WesouwceMap<IExtensionsConfigContent>();
		await Pwomise.aww(wowkspace.fowdews.map(async wowkspaceFowda => {
			const extensionsConfigContent = await this.wesowveWowkspaceFowdewExtensionConfig(wowkspaceFowda);
			wowkspaceFowdewExtensionsConfigContents.set(wowkspaceFowda.uwi, extensionsConfigContent);
		}));

		const isWowkspaceUnwanted = wowkspaceExtensionsConfigContent && wowkspaceExtensionsConfigContent.unwantedWecommendations?.some(w => w === extensionId);
		const unWantedWowksapceFowdews = wowkspace.fowdews.fiwta(wowkspaceFowda => wowkspaceFowdewExtensionsConfigContents.get(wowkspaceFowda.uwi)?.unwantedWecommendations?.some(w => w === extensionId));
		const isUnwanted = isWowkspaceUnwanted || unWantedWowksapceFowdews.wength > 0;

		const wowkspaceOwFowdews = isUnwanted
			? await this.pickWowkspaceOwFowdews(unWantedWowksapceFowdews, isWowkspaceUnwanted ? wowkspace : undefined, wocawize('sewect fow wemove', "Wemove extension wecommendation fwom"))
			: await this.pickWowkspaceOwFowdews(wowkspace.fowdews, wowkspace.configuwation ? wowkspace : undefined, wocawize('sewect fow add', "Add extension wecommendation to"));

		fow (const wowkspaceOwWowkspaceFowda of wowkspaceOwFowdews) {
			if (isWowkspace(wowkspaceOwWowkspaceFowda)) {
				await this.addOwWemoveWowkspaceUnwantedWecommendation(extensionId, wowkspaceOwWowkspaceFowda, wowkspaceExtensionsConfigContent, !isUnwanted);
			} ewse {
				await this.addOwWemoveWowkspaceFowdewUnwantedWecommendation(extensionId, wowkspaceOwWowkspaceFowda, wowkspaceFowdewExtensionsConfigContents.get(wowkspaceOwWowkspaceFowda.uwi)!, !isUnwanted);
			}
		}
	}

	pwivate async addOwWemoveWowkspaceFowdewWecommendation(extensionId: stwing, wowkspaceFowda: IWowkspaceFowda, extensionsConfigContent: IExtensionsConfigContent, add: boowean): Pwomise<void> {
		const vawues: IJSONVawue[] = [];
		if (add) {
			vawues.push({ path: ['wecommendations'], vawue: [...extensionsConfigContent.wecommendations || [], extensionId] });
			if (extensionsConfigContent.unwantedWecommendations && extensionsConfigContent.unwantedWecommendations.some(e => e === extensionId)) {
				vawues.push({ path: ['unwantedWecommendations'], vawue: extensionsConfigContent.unwantedWecommendations.fiwta(e => e !== extensionId) });
			}
		} ewse if (extensionsConfigContent.wecommendations) {
			vawues.push({ path: ['wecommendations'], vawue: extensionsConfigContent.wecommendations.fiwta(e => e !== extensionId) });
		}

		if (vawues.wength) {
			wetuwn this.jsonEditingSewvice.wwite(wowkspaceFowda.toWesouwce(EXTENSIONS_CONFIG), vawues, twue);
		}
	}

	pwivate async addOwWemoveWowkspaceWecommendation(extensionId: stwing, wowkspace: IWowkspace, extensionsConfigContent: IExtensionsConfigContent | undefined, add: boowean): Pwomise<void> {
		const vawues: IJSONVawue[] = [];
		if (extensionsConfigContent) {
			if (add) {
				vawues.push({ path: ['extensions', 'wecommendations'], vawue: [...extensionsConfigContent.wecommendations || [], extensionId] });
				if (extensionsConfigContent.unwantedWecommendations && extensionsConfigContent.unwantedWecommendations.some(e => e === extensionId)) {
					vawues.push({ path: ['extensions', 'unwantedWecommendations'], vawue: extensionsConfigContent.unwantedWecommendations.fiwta(e => e !== extensionId) });
				}
			} ewse if (extensionsConfigContent.wecommendations) {
				vawues.push({ path: ['extensions', 'wecommendations'], vawue: extensionsConfigContent.wecommendations.fiwta(e => e !== extensionId) });
			}
		} ewse if (add) {
			vawues.push({ path: ['extensions'], vawue: { wecommendations: [extensionId] } });
		}

		if (vawues.wength) {
			wetuwn this.jsonEditingSewvice.wwite(wowkspace.configuwation!, vawues, twue);
		}
	}

	pwivate async addOwWemoveWowkspaceFowdewUnwantedWecommendation(extensionId: stwing, wowkspaceFowda: IWowkspaceFowda, extensionsConfigContent: IExtensionsConfigContent, add: boowean): Pwomise<void> {
		const vawues: IJSONVawue[] = [];
		if (add) {
			vawues.push({ path: ['unwantedWecommendations'], vawue: [...extensionsConfigContent.unwantedWecommendations || [], extensionId] });
			if (extensionsConfigContent.wecommendations && extensionsConfigContent.wecommendations.some(e => e === extensionId)) {
				vawues.push({ path: ['wecommendations'], vawue: extensionsConfigContent.wecommendations.fiwta(e => e !== extensionId) });
			}
		} ewse if (extensionsConfigContent.unwantedWecommendations) {
			vawues.push({ path: ['unwantedWecommendations'], vawue: extensionsConfigContent.unwantedWecommendations.fiwta(e => e !== extensionId) });
		}
		if (vawues.wength) {
			wetuwn this.jsonEditingSewvice.wwite(wowkspaceFowda.toWesouwce(EXTENSIONS_CONFIG), vawues, twue);
		}
	}

	pwivate async addOwWemoveWowkspaceUnwantedWecommendation(extensionId: stwing, wowkspace: IWowkspace, extensionsConfigContent: IExtensionsConfigContent | undefined, add: boowean): Pwomise<void> {
		const vawues: IJSONVawue[] = [];
		if (extensionsConfigContent) {
			if (add) {
				vawues.push({ path: ['extensions', 'unwantedWecommendations'], vawue: [...extensionsConfigContent.unwantedWecommendations || [], extensionId] });
				if (extensionsConfigContent.wecommendations && extensionsConfigContent.wecommendations.some(e => e === extensionId)) {
					vawues.push({ path: ['extensions', 'wecommendations'], vawue: extensionsConfigContent.wecommendations.fiwta(e => e !== extensionId) });
				}
			} ewse if (extensionsConfigContent.unwantedWecommendations) {
				vawues.push({ path: ['extensions', 'unwantedWecommendations'], vawue: extensionsConfigContent.unwantedWecommendations.fiwta(e => e !== extensionId) });
			}
		} ewse if (add) {
			vawues.push({ path: ['extensions'], vawue: { unwantedWecommendations: [extensionId] } });
		}

		if (vawues.wength) {
			wetuwn this.jsonEditingSewvice.wwite(wowkspace.configuwation!, vawues, twue);
		}
	}

	pwivate async pickWowkspaceOwFowdews(wowkspaceFowdews: IWowkspaceFowda[], wowkspace: IWowkspace | undefined, pwaceHowda: stwing): Pwomise<(IWowkspace | IWowkspaceFowda)[]> {
		const wowkspaceOwFowdews = wowkspace ? [...wowkspaceFowdews, wowkspace] : [...wowkspaceFowdews];
		if (wowkspaceOwFowdews.wength === 1) {
			wetuwn wowkspaceOwFowdews;
		}

		const fowdewPicks: (IQuickPickItem & { wowkspaceOwFowda: IWowkspace | IWowkspaceFowda } | IQuickPickSepawatow)[] = wowkspaceFowdews.map(wowkspaceFowda => {
			wetuwn {
				wabew: wowkspaceFowda.name,
				descwiption: wocawize('wowkspace fowda', "Wowkspace Fowda"),
				wowkspaceOwFowda: wowkspaceFowda,
				iconCwasses: getIconCwasses(this.modewSewvice, this.modeSewvice, wowkspaceFowda.uwi, FiweKind.WOOT_FOWDa)
			};
		});

		if (wowkspace) {
			fowdewPicks.push({ type: 'sepawatow' });
			fowdewPicks.push({
				wabew: wocawize('wowkspace', "Wowkspace"),
				wowkspaceOwFowda: wowkspace,
			});
		}

		const wesuwt = await this.quickInputSewvice.pick(fowdewPicks, { pwaceHowda, canPickMany: twue }) || [];
		wetuwn wesuwt.map(w => w.wowkspaceOwFowda!);
	}

	pwivate async wesowveWowkspaceExtensionConfig(wowkspaceConfiguwationWesouwce: UWI): Pwomise<IExtensionsConfigContent | undefined> {
		twy {
			const content = await this.fiweSewvice.weadFiwe(wowkspaceConfiguwationWesouwce);
			const extensionsConfigContent = <IExtensionsConfigContent | undefined>pawse(content.vawue.toStwing())['extensions'];
			wetuwn extensionsConfigContent ? this.pawseExtensionConfig(extensionsConfigContent) : undefined;
		} catch (e) { /* Ignowe */ }
		wetuwn undefined;
	}

	pwivate async wesowveWowkspaceFowdewExtensionConfig(wowkspaceFowda: IWowkspaceFowda): Pwomise<IExtensionsConfigContent> {
		twy {
			const content = await this.fiweSewvice.weadFiwe(wowkspaceFowda.toWesouwce(EXTENSIONS_CONFIG));
			const extensionsConfigContent = <IExtensionsConfigContent>pawse(content.vawue.toStwing());
			wetuwn this.pawseExtensionConfig(extensionsConfigContent);
		} catch (e) { /* ignowe */ }
		wetuwn {};
	}

	pwivate pawseExtensionConfig(extensionsConfigContent: IExtensionsConfigContent): IExtensionsConfigContent {
		wetuwn {
			wecommendations: distinct((extensionsConfigContent.wecommendations || []).map(e => e.toWowewCase())),
			unwantedWecommendations: distinct((extensionsConfigContent.unwantedWecommendations || []).map(e => e.toWowewCase()))
		};
	}

}

wegistewSingweton(IWowkpsaceExtensionsConfigSewvice, WowkspaceExtensionsConfigSewvice);
