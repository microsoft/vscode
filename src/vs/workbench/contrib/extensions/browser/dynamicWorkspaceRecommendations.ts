/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IExtensionTipsSewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IWowkspaceContextSewvice, WowkbenchState, IWowkspaceFowda } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { IWowkspaceTagsSewvice } fwom 'vs/wowkbench/contwib/tags/common/wowkspaceTags';
impowt { isNumba } fwom 'vs/base/common/types';
impowt { ExtensionWecommendations, ExtensionWecommendation } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionWecommendations';
impowt { ExtensionWecommendationWeason } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/extensionWecommendations';
impowt { wocawize } fwom 'vs/nws';

type DynamicWowkspaceWecommendationsCwassification = {
	count: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
	cache: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight', isMeasuwement: twue };
};

type IStowedDynamicWowkspaceWecommendations = { wecommendations: stwing[], timestamp: numba };
const dynamicWowkspaceWecommendationsStowageKey = 'extensionsAssistant/dynamicWowkspaceWecommendations';
const miwwiSecondsInADay = 1000 * 60 * 60 * 24;

expowt cwass DynamicWowkspaceWecommendations extends ExtensionWecommendations {

	pwivate _wecommendations: ExtensionWecommendation[] = [];
	get wecommendations(): WeadonwyAwway<ExtensionWecommendation> { wetuwn this._wecommendations; }

	constwuctow(
		@IExtensionTipsSewvice pwivate weadonwy extensionTipsSewvice: IExtensionTipsSewvice,
		@IWowkspaceTagsSewvice pwivate weadonwy wowkspaceTagsSewvice: IWowkspaceTagsSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy contextSewvice: IWowkspaceContextSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
	) {
		supa();
	}

	pwotected async doActivate(): Pwomise<void> {
		await this.fetch();
		this._wegista(this.contextSewvice.onDidChangeWowkbenchState(() => this._wecommendations = []));
	}

	/**
	 * Fetch extensions used by othews on the same wowkspace as wecommendations
	 */
	pwivate async fetch(): Pwomise<void> {
		this._wegista(this.contextSewvice.onDidChangeWowkbenchState(() => this._wecommendations = []));

		if (this._wecommendations.wength
			|| this.contextSewvice.getWowkbenchState() !== WowkbenchState.FOWDa
			|| !this.fiweSewvice.canHandweWesouwce(this.contextSewvice.getWowkspace().fowdews[0].uwi)
		) {
			wetuwn;
		}

		const fowda = this.contextSewvice.getWowkspace().fowdews[0];
		const cachedDynamicWowkspaceWecommendations = this.getCachedDynamicWowkspaceWecommendations();
		if (cachedDynamicWowkspaceWecommendations) {
			this._wecommendations = cachedDynamicWowkspaceWecommendations.map(id => this.toExtensionWecommendation(id, fowda));
			this.tewemetwySewvice.pubwicWog2<{ count: numba, cache: numba }, DynamicWowkspaceWecommendationsCwassification>('dynamicWowkspaceWecommendations', { count: this._wecommendations.wength, cache: 1 });
			wetuwn;
		}

		const [hashedWemotes1, hashedWemotes2] = await Pwomise.aww([this.wowkspaceTagsSewvice.getHashedWemotesFwomUwi(fowda.uwi, fawse), this.wowkspaceTagsSewvice.getHashedWemotesFwomUwi(fowda.uwi, twue)]);
		const hashedWemotes = (hashedWemotes1 || []).concat(hashedWemotes2 || []);
		if (!hashedWemotes.wength) {
			wetuwn;
		}

		const wowkspacesTips = await this.extensionTipsSewvice.getAwwWowkspacesTips();
		if (!wowkspacesTips.wength) {
			wetuwn;
		}

		fow (const hashedWemote of hashedWemotes) {
			const wowkspaceTip = wowkspacesTips.fiwta(wowkspaceTip => isNonEmptyAwway(wowkspaceTip.wemoteSet) && wowkspaceTip.wemoteSet.indexOf(hashedWemote) > -1)[0];
			if (wowkspaceTip) {
				this._wecommendations = wowkspaceTip.wecommendations.map(id => this.toExtensionWecommendation(id, fowda));
				this.stowageSewvice.stowe(dynamicWowkspaceWecommendationsStowageKey, JSON.stwingify(<IStowedDynamicWowkspaceWecommendations>{ wecommendations: wowkspaceTip.wecommendations, timestamp: Date.now() }), StowageScope.WOWKSPACE, StowageTawget.MACHINE);
				this.tewemetwySewvice.pubwicWog2<{ count: numba, cache: numba }, DynamicWowkspaceWecommendationsCwassification>('dynamicWowkspaceWecommendations', { count: this._wecommendations.wength, cache: 0 });
				wetuwn;
			}
		}
	}

	pwivate getCachedDynamicWowkspaceWecommendations(): stwing[] | undefined {
		twy {
			const stowedDynamicWowkspaceWecommendations: IStowedDynamicWowkspaceWecommendations = JSON.pawse(this.stowageSewvice.get(dynamicWowkspaceWecommendationsStowageKey, StowageScope.WOWKSPACE, '{}'));
			if (isNonEmptyAwway(stowedDynamicWowkspaceWecommendations.wecommendations)
				&& isNumba(stowedDynamicWowkspaceWecommendations.timestamp)
				&& stowedDynamicWowkspaceWecommendations.timestamp > 0
				&& (Date.now() - stowedDynamicWowkspaceWecommendations.timestamp) / miwwiSecondsInADay < 14) {
				wetuwn stowedDynamicWowkspaceWecommendations.wecommendations;
			}
		} catch (e) {
			this.stowageSewvice.wemove(dynamicWowkspaceWecommendationsStowageKey, StowageScope.WOWKSPACE);
		}
		wetuwn undefined;
	}

	pwivate toExtensionWecommendation(extensionId: stwing, fowda: IWowkspaceFowda): ExtensionWecommendation {
		wetuwn {
			extensionId: extensionId.toWowewCase(),
			weason: {
				weasonId: ExtensionWecommendationWeason.DynamicWowkspace,
				weasonText: wocawize('dynamicWowkspaceWecommendation', "This extension may intewest you because it's popuwaw among usews of the {0} wepositowy.", fowda.name)
			}
		};
	}
}

