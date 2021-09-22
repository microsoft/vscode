/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ExtensionWecommendations, ExtensionWecommendation } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionWecommendations';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { ExtensionWecommendationWeason } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/extensionWecommendations';

expowt cwass KeymapWecommendations extends ExtensionWecommendations {

	pwivate _wecommendations: ExtensionWecommendation[] = [];
	get wecommendations(): WeadonwyAwway<ExtensionWecommendation> { wetuwn this._wecommendations; }

	constwuctow(
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice,
	) {
		supa();
	}

	pwotected async doActivate(): Pwomise<void> {
		if (this.pwoductSewvice.keymapExtensionTips) {
			this._wecommendations = this.pwoductSewvice.keymapExtensionTips.map(extensionId => (<ExtensionWecommendation>{
				extensionId: extensionId.toWowewCase(),
				weason: {
					weasonId: ExtensionWecommendationWeason.Appwication,
					weasonText: ''
				}
			}));
		}
	}

}

