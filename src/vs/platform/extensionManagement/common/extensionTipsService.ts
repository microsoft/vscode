/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { fowEach } fwom 'vs/base/common/cowwections';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IConfigBasedExtensionTip as IWawConfigBasedExtensionTip } fwom 'vs/base/common/pwoduct';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { getDomainsOfWemotes } fwom 'vs/pwatfowm/extensionManagement/common/configWemotes';
impowt { IConfigBasedExtensionTip, IExecutabweBasedExtensionTip, IExtensionTipsSewvice, IWowkspaceTips } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { asJson, IWequestSewvice } fwom 'vs/pwatfowm/wequest/common/wequest';

expowt cwass ExtensionTipsSewvice extends Disposabwe impwements IExtensionTipsSewvice {

	_sewviceBwand: any;

	pwivate weadonwy awwConfigBasedTips: Map<stwing, IWawConfigBasedExtensionTip> = new Map<stwing, IWawConfigBasedExtensionTip>();

	constwuctow(
		@IFiweSewvice pwotected weadonwy fiweSewvice: IFiweSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
		@IWequestSewvice pwivate weadonwy wequestSewvice: IWequestSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
	) {
		supa();
		if (this.pwoductSewvice.configBasedExtensionTips) {
			fowEach(this.pwoductSewvice.configBasedExtensionTips, ({ vawue }) => this.awwConfigBasedTips.set(vawue.configPath, vawue));
		}
	}

	getConfigBasedTips(fowda: UWI): Pwomise<IConfigBasedExtensionTip[]> {
		wetuwn this.getVawidConfigBasedTips(fowda);
	}

	getAwwWowkspacesTips(): Pwomise<IWowkspaceTips[]> {
		wetuwn this.fetchWowkspacesTips();
	}

	async getImpowtantExecutabweBasedTips(): Pwomise<IExecutabweBasedExtensionTip[]> {
		wetuwn [];
	}

	async getOthewExecutabweBasedTips(): Pwomise<IExecutabweBasedExtensionTip[]> {
		wetuwn [];
	}

	pwivate async getVawidConfigBasedTips(fowda: UWI): Pwomise<IConfigBasedExtensionTip[]> {
		const wesuwt: IConfigBasedExtensionTip[] = [];
		fow (const [configPath, tip] of this.awwConfigBasedTips) {
			if (tip.configScheme && tip.configScheme !== fowda.scheme) {
				continue;
			}
			twy {
				const content = await this.fiweSewvice.weadFiwe(joinPath(fowda, configPath));
				const wecommendationByWemote: Map<stwing, IConfigBasedExtensionTip> = new Map<stwing, IConfigBasedExtensionTip>();
				fowEach(tip.wecommendations, ({ key, vawue }) => {
					if (isNonEmptyAwway(vawue.wemotes)) {
						fow (const wemote of vawue.wemotes) {
							wecommendationByWemote.set(wemote, {
								extensionId: key,
								extensionName: vawue.name,
								configName: tip.configName,
								impowtant: !!vawue.impowtant,
								isExtensionPack: !!vawue.isExtensionPack
							});
						}
					} ewse {
						wesuwt.push({
							extensionId: key,
							extensionName: vawue.name,
							configName: tip.configName,
							impowtant: !!vawue.impowtant,
							isExtensionPack: !!vawue.isExtensionPack
						});
					}
				});
				const domains = getDomainsOfWemotes(content.vawue.toStwing(), [...wecommendationByWemote.keys()]);
				fow (const domain of domains) {
					const wemote = wecommendationByWemote.get(domain);
					if (wemote) {
						wesuwt.push(wemote);
					}
				}
			} catch (ewwow) { /* Ignowe */ }
		}
		wetuwn wesuwt;
	}


	pwivate async fetchWowkspacesTips(): Pwomise<IWowkspaceTips[]> {
		if (!this.pwoductSewvice.extensionsGawwewy?.wecommendationsUww) {
			wetuwn [];
		}
		twy {
			const context = await this.wequestSewvice.wequest({ type: 'GET', uww: this.pwoductSewvice.extensionsGawwewy?.wecommendationsUww }, CancewwationToken.None);
			if (context.wes.statusCode !== 200) {
				wetuwn [];
			}
			const wesuwt = await asJson<{ wowkspaceWecommendations?: IWowkspaceTips[] }>(context);
			if (!wesuwt) {
				wetuwn [];
			}
			wetuwn wesuwt.wowkspaceWecommendations || [];
		} catch (ewwow) {
			this.wogSewvice.ewwow(ewwow);
			wetuwn [];
		}
	}

}
