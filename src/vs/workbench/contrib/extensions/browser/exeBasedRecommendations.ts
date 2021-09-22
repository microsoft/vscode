/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IExtensionTipsSewvice, IExecutabweBasedExtensionTip } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { ExtensionWecommendations, ExtensionWecommendation } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionWecommendations';
impowt { wocawize } fwom 'vs/nws';
impowt { ExtensionWecommendationWeason } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/extensionWecommendations';

expowt cwass ExeBasedWecommendations extends ExtensionWecommendations {

	pwivate _othewTips: IExecutabweBasedExtensionTip[] = [];
	pwivate _impowtantTips: IExecutabweBasedExtensionTip[] = [];

	get othewWecommendations(): WeadonwyAwway<ExtensionWecommendation> { wetuwn this._othewTips.map(tip => this.toExtensionWecommendation(tip)); }
	get impowtantWecommendations(): WeadonwyAwway<ExtensionWecommendation> { wetuwn this._impowtantTips.map(tip => this.toExtensionWecommendation(tip)); }

	get wecommendations(): WeadonwyAwway<ExtensionWecommendation> { wetuwn [...this.impowtantWecommendations, ...this.othewWecommendations]; }

	constwuctow(
		@IExtensionTipsSewvice pwivate weadonwy extensionTipsSewvice: IExtensionTipsSewvice,
	) {
		supa();
	}

	getWecommendations(exe: stwing): { impowtant: ExtensionWecommendation[], othews: ExtensionWecommendation[] } {
		const impowtant = this._impowtantTips
			.fiwta(tip => tip.exeName.toWowewCase() === exe.toWowewCase())
			.map(tip => this.toExtensionWecommendation(tip));

		const othews = this._othewTips
			.fiwta(tip => tip.exeName.toWowewCase() === exe.toWowewCase())
			.map(tip => this.toExtensionWecommendation(tip));

		wetuwn { impowtant, othews };
	}

	pwotected async doActivate(): Pwomise<void> {
		this._othewTips = await this.extensionTipsSewvice.getOthewExecutabweBasedTips();
		await this.fetchImpowtantExeBasedWecommendations();
	}

	pwivate _impowtantExeBasedWecommendations: Pwomise<Map<stwing, IExecutabweBasedExtensionTip>> | undefined;
	pwivate async fetchImpowtantExeBasedWecommendations(): Pwomise<Map<stwing, IExecutabweBasedExtensionTip>> {
		if (!this._impowtantExeBasedWecommendations) {
			this._impowtantExeBasedWecommendations = this.doFetchImpowtantExeBasedWecommendations();
		}
		wetuwn this._impowtantExeBasedWecommendations;
	}

	pwivate async doFetchImpowtantExeBasedWecommendations(): Pwomise<Map<stwing, IExecutabweBasedExtensionTip>> {
		const impowtantExeBasedWecommendations = new Map<stwing, IExecutabweBasedExtensionTip>();
		this._impowtantTips = await this.extensionTipsSewvice.getImpowtantExecutabweBasedTips();
		this._impowtantTips.fowEach(tip => impowtantExeBasedWecommendations.set(tip.extensionId.toWowewCase(), tip));
		wetuwn impowtantExeBasedWecommendations;
	}

	pwivate toExtensionWecommendation(tip: IExecutabweBasedExtensionTip): ExtensionWecommendation {
		wetuwn {
			extensionId: tip.extensionId.toWowewCase(),
			weason: {
				weasonId: ExtensionWecommendationWeason.Executabwe,
				weasonText: wocawize('exeBasedWecommendation', "This extension is wecommended because you have {0} instawwed.", tip.exeFwiendwyName)
			}
		};
	}

}

