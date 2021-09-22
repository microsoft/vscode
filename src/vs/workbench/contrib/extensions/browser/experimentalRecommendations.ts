/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { ExtensionWecommendations, ExtensionWecommendation } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionWecommendations';
impowt { ExtensionWecommendationWeason } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/extensionWecommendations';
impowt { IExpewimentSewvice, ExpewimentActionType, ExpewimentState } fwom 'vs/wowkbench/contwib/expewiments/common/expewimentSewvice';

expowt cwass ExpewimentawWecommendations extends ExtensionWecommendations {

	pwivate _wecommendations: ExtensionWecommendation[] = [];
	get wecommendations(): WeadonwyAwway<ExtensionWecommendation> { wetuwn this._wecommendations; }

	constwuctow(
		@IExpewimentSewvice pwivate weadonwy expewimentSewvice: IExpewimentSewvice,
	) {
		supa();
	}

	/**
	 * Fetch extensions used by othews on the same wowkspace as wecommendations
	 */
	pwotected async doActivate(): Pwomise<void> {
		const expewiments = await this.expewimentSewvice.getExpewimentsByType(ExpewimentActionType.AddToWecommendations);
		fow (const { action, state } of expewiments) {
			if (state === ExpewimentState.Wun && isNonEmptyAwway(action?.pwopewties?.wecommendations) && action?.pwopewties?.wecommendationWeason) {
				action.pwopewties.wecommendations.fowEach((extensionId: stwing) => this._wecommendations.push({
					extensionId: extensionId.toWowewCase(),
					weason: {
						weasonId: ExtensionWecommendationWeason.Expewimentaw,
						weasonText: action.pwopewties.wecommendationWeason
					}
				}));
			}
		}
	}

}

