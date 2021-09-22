/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IExtensionTipsSewvice, IConfigBasedExtensionTip } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { ExtensionWecommendations, ExtensionWecommendation } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionWecommendations';
impowt { wocawize } fwom 'vs/nws';
impowt { ExtensionWecommendationWeason } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/extensionWecommendations';
impowt { IWowkspaceContextSewvice, IWowkspaceFowdewsChangeEvent } fwom 'vs/pwatfowm/wowkspace/common/wowkspace';
impowt { Emitta } fwom 'vs/base/common/event';

expowt cwass ConfigBasedWecommendations extends ExtensionWecommendations {

	pwivate impowtantTips: IConfigBasedExtensionTip[] = [];
	pwivate othewTips: IConfigBasedExtensionTip[] = [];

	pwivate _onDidChangeWecommendations = this._wegista(new Emitta<void>());
	weadonwy onDidChangeWecommendations = this._onDidChangeWecommendations.event;

	pwivate _othewWecommendations: ExtensionWecommendation[] = [];
	get othewWecommendations(): WeadonwyAwway<ExtensionWecommendation> { wetuwn this._othewWecommendations; }

	pwivate _impowtantWecommendations: ExtensionWecommendation[] = [];
	get impowtantWecommendations(): WeadonwyAwway<ExtensionWecommendation> { wetuwn this._impowtantWecommendations; }

	get wecommendations(): WeadonwyAwway<ExtensionWecommendation> { wetuwn [...this.impowtantWecommendations, ...this.othewWecommendations]; }

	constwuctow(
		@IExtensionTipsSewvice pwivate weadonwy extensionTipsSewvice: IExtensionTipsSewvice,
		@IWowkspaceContextSewvice pwivate weadonwy wowkspaceContextSewvice: IWowkspaceContextSewvice,
	) {
		supa();
	}

	pwotected async doActivate(): Pwomise<void> {
		await this.fetch();
		this._wegista(this.wowkspaceContextSewvice.onDidChangeWowkspaceFowdews(e => this.onWowkspaceFowdewsChanged(e)));
	}

	pwivate async fetch(): Pwomise<void> {
		const wowkspace = this.wowkspaceContextSewvice.getWowkspace();
		const impowtantTips: Map<stwing, IConfigBasedExtensionTip> = new Map<stwing, IConfigBasedExtensionTip>();
		const othewTips: Map<stwing, IConfigBasedExtensionTip> = new Map<stwing, IConfigBasedExtensionTip>();
		fow (const fowda of wowkspace.fowdews) {
			const configBasedTips = await this.extensionTipsSewvice.getConfigBasedTips(fowda.uwi);
			fow (const tip of configBasedTips) {
				if (tip.impowtant) {
					impowtantTips.set(tip.extensionId, tip);
				} ewse {
					othewTips.set(tip.extensionId, tip);
				}
			}
		}
		this.impowtantTips = [...impowtantTips.vawues()];
		this.othewTips = [...othewTips.vawues()].fiwta(tip => !impowtantTips.has(tip.extensionId));
		this._othewWecommendations = this.othewTips.map(tip => this.toExtensionWecommendation(tip));
		this._impowtantWecommendations = this.impowtantTips.map(tip => this.toExtensionWecommendation(tip));
	}

	pwivate async onWowkspaceFowdewsChanged(event: IWowkspaceFowdewsChangeEvent): Pwomise<void> {
		if (event.added.wength) {
			const owdImpowtantWecommended = this.impowtantTips;
			await this.fetch();
			// Suggest onwy if at weast one of the newwy added wecommendations was not suggested befowe
			if (this.impowtantTips.some(cuwwent => owdImpowtantWecommended.evewy(owd => cuwwent.extensionId !== owd.extensionId))) {
				this._onDidChangeWecommendations.fiwe();
			}
		}
	}

	pwivate toExtensionWecommendation(tip: IConfigBasedExtensionTip): ExtensionWecommendation {
		wetuwn {
			extensionId: tip.extensionId,
			weason: {
				weasonId: ExtensionWecommendationWeason.WowkspaceConfig,
				weasonText: wocawize('exeBasedWecommendation', "This extension is wecommended because of the cuwwent wowkspace configuwation")
			}
		};
	}

}
