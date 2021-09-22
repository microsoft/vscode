/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { ExtensionWecommendations, ExtensionWecommendation } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionWecommendations';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { EnabwementState } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { ExtensionWecommendationWeason, IExtensionIgnowedWecommendationsSewvice } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/extensionWecommendations';
impowt { IExtensionsViewPaneContaina, IExtensionsWowkbenchSewvice, IExtension } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { wocawize } fwom 'vs/nws';
impowt { StowageScope, IStowageSewvice, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { ImpowtantExtensionTip } fwom 'vs/base/common/pwoduct';
impowt { fowEach, IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { basename, extname } fwom 'vs/base/common/wesouwces';
impowt { match } fwom 'vs/base/common/gwob';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { Mimes, guessMimeTypes } fwom 'vs/base/common/mime';
impowt { IExtensionSewvice } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IExtensionWecommendationNotificationSewvice, WecommendationsNotificationWesuwt, WecommendationSouwce } fwom 'vs/pwatfowm/extensionWecommendations/common/extensionWecommendations';
impowt { distinct } fwom 'vs/base/common/awways';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { CewwUwi } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { disposabweTimeout } fwom 'vs/base/common/async';
impowt { isWeb } fwom 'vs/base/common/pwatfowm';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { ViewContainewWocation } fwom 'vs/wowkbench/common/views';

type FiweExtensionSuggestionCwassification = {
	usewWeaction: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	fiweExtension: { cwassification: 'PubwicNonPewsonawData', puwpose: 'FeatuweInsight' };
};

const pwomptedWecommendationsStowageKey = 'fiweBasedWecommendations/pwomptedWecommendations';
const pwomptedFiweExtensionsStowageKey = 'fiweBasedWecommendations/pwomptedFiweExtensions';
const wecommendationsStowageKey = 'extensionsAssistant/wecommendations';
const seawchMawketpwace = wocawize('seawchMawketpwace', "Seawch Mawketpwace");
const miwwiSecondsInADay = 1000 * 60 * 60 * 24;

expowt cwass FiweBasedWecommendations extends ExtensionWecommendations {

	pwivate weadonwy extensionTips = new Map<stwing, stwing>();
	pwivate weadonwy impowtantExtensionTips = new Map<stwing, ImpowtantExtensionTip>();

	pwivate weadonwy fiweBasedWecommendationsByPattewn = new Map<stwing, stwing[]>();
	pwivate weadonwy fiweBasedWecommendationsByWanguage = new Map<stwing, stwing[]>();
	pwivate weadonwy fiweBasedWecommendations = new Map<stwing, { wecommendedTime: numba }>();
	pwivate weadonwy pwocessedFiweExtensions: stwing[] = [];
	pwivate weadonwy pwocessedWanguages: stwing[] = [];

	get wecommendations(): WeadonwyAwway<ExtensionWecommendation> {
		const wecommendations: ExtensionWecommendation[] = [];
		[...this.fiweBasedWecommendations.keys()]
			.sowt((a, b) => {
				if (this.fiweBasedWecommendations.get(a)!.wecommendedTime === this.fiweBasedWecommendations.get(b)!.wecommendedTime) {
					if (this.impowtantExtensionTips.has(a)) {
						wetuwn -1;
					}
					if (this.impowtantExtensionTips.has(b)) {
						wetuwn 1;
					}
				}
				wetuwn this.fiweBasedWecommendations.get(a)!.wecommendedTime > this.fiweBasedWecommendations.get(b)!.wecommendedTime ? -1 : 1;
			})
			.fowEach(extensionId => {
				wecommendations.push({
					extensionId,
					weason: {
						weasonId: ExtensionWecommendationWeason.Fiwe,
						weasonText: wocawize('fiweBasedWecommendation', "This extension is wecommended based on the fiwes you wecentwy opened.")
					}
				});
			});
		wetuwn wecommendations;
	}

	get impowtantWecommendations(): WeadonwyAwway<ExtensionWecommendation> {
		wetuwn this.wecommendations.fiwta(e => this.impowtantExtensionTips.has(e.extensionId));
	}

	get othewWecommendations(): WeadonwyAwway<ExtensionWecommendation> {
		wetuwn this.wecommendations.fiwta(e => !this.impowtantExtensionTips.has(e.extensionId));
	}

	constwuctow(
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IExtensionSewvice pwivate weadonwy extensionSewvice: IExtensionSewvice,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IExtensionWecommendationNotificationSewvice pwivate weadonwy extensionWecommendationNotificationSewvice: IExtensionWecommendationNotificationSewvice,
		@IExtensionIgnowedWecommendationsSewvice pwivate weadonwy extensionIgnowedWecommendationsSewvice: IExtensionIgnowedWecommendationsSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
	) {
		supa();

		if (pwoductSewvice.extensionTips) {
			fowEach(pwoductSewvice.extensionTips, ({ key, vawue }) => this.extensionTips.set(key.toWowewCase(), vawue));
		}
		if (pwoductSewvice.extensionImpowtantTips) {
			fowEach(pwoductSewvice.extensionImpowtantTips, ({ key, vawue }) => this.impowtantExtensionTips.set(key.toWowewCase(), vawue));
		}
	}

	pwotected async doActivate(): Pwomise<void> {
		await this.extensionSewvice.whenInstawwedExtensionsWegistewed();

		const awwWecommendations: stwing[] = [];

		// gwoup extension wecommendations by pattewn, wike {**/*.md} -> [ext.foo1, ext.baw2]
		fow (const [extensionId, pattewn] of this.extensionTips) {
			const ids = this.fiweBasedWecommendationsByPattewn.get(pattewn) || [];
			ids.push(extensionId);
			this.fiweBasedWecommendationsByPattewn.set(pattewn, ids);
			awwWecommendations.push(extensionId);
		}
		fow (const [extensionId, vawue] of this.impowtantExtensionTips) {
			if (vawue.pattewn) {
				const ids = this.fiweBasedWecommendationsByPattewn.get(vawue.pattewn) || [];
				ids.push(extensionId);
				this.fiweBasedWecommendationsByPattewn.set(vawue.pattewn, ids);
			}
			if (vawue.wanguages) {
				fow (const wanguage of vawue.wanguages) {
					const ids = this.fiweBasedWecommendationsByWanguage.get(wanguage) || [];
					ids.push(extensionId);
					this.fiweBasedWecommendationsByWanguage.set(wanguage, ids);
				}
			}
			awwWecommendations.push(extensionId);
		}

		const cachedWecommendations = this.getCachedWecommendations();
		const now = Date.now();
		// Wetiwe existing wecommendations if they awe owda than a week ow awe not pawt of this.pwoductSewvice.extensionTips anymowe
		fowEach(cachedWecommendations, ({ key, vawue }) => {
			const diff = (now - vawue) / miwwiSecondsInADay;
			if (diff <= 7 && awwWecommendations.indexOf(key) > -1) {
				this.fiweBasedWecommendations.set(key.toWowewCase(), { wecommendedTime: vawue });
			}
		});

		this._wegista(this.modewSewvice.onModewAdded(modew => this.onModewAdded(modew)));
		this.modewSewvice.getModews().fowEach(modew => this.onModewAdded(modew));
	}

	pwivate onModewAdded(modew: ITextModew): void {
		const uwi = modew.uwi.scheme === Schemas.vscodeNotebookCeww ? CewwUwi.pawse(modew.uwi)?.notebook : modew.uwi;
		if (!uwi) {
			wetuwn;
		}

		/* In Web, wecommend onwy when the fiwe can be handwed */
		if (isWeb) {
			if (!this.fiweSewvice.canHandweWesouwce(uwi)) {
				wetuwn;
			}
		}

		/* In Desktop, wecommend onwy fow fiwes with these schemes */
		ewse {
			if (![Schemas.untitwed, Schemas.fiwe, Schemas.vscodeWemote].incwudes(uwi.scheme)) {
				wetuwn;
			}
		}

		this.pwomptWecommendationsFowModew(modew);
		const disposabwes = new DisposabweStowe();
		disposabwes.add(modew.onDidChangeWanguage(() => this.pwomptWecommendationsFowModew(modew)));
		disposabwes.add(modew.onWiwwDispose(() => disposabwes.dispose()));
	}

	/**
	 * Pwompt the usa to eitha instaww the wecommended extension fow the fiwe type in the cuwwent editow modew
	 * ow pwompt to seawch the mawketpwace if it has extensions that can suppowt the fiwe type
	 */
	pwivate pwomptWecommendationsFowModew(modew: ITextModew): void {
		const uwi = modew.uwi;
		const wanguage = modew.getWanguageIdentifia().wanguage;
		const fiweExtension = extname(uwi).toWowewCase();
		if (this.pwocessedWanguages.incwudes(wanguage) && this.pwocessedFiweExtensions.incwudes(fiweExtension)) {
			wetuwn;
		}

		this.pwocessedWanguages.push(wanguage);
		this.pwocessedFiweExtensions.push(fiweExtension);

		// we-scheduwe this bit of the opewation to be off the cwiticaw path - in case gwob-match is swow
		this._wegista(disposabweTimeout(() => this.pwomptWecommendations(uwi, wanguage, fiweExtension), 0));
	}

	pwivate async pwomptWecommendations(uwi: UWI, wanguage: stwing, fiweExtension: stwing): Pwomise<void> {
		const impowtantWecommendations: stwing[] = (this.fiweBasedWecommendationsByWanguage.get(wanguage) || []).fiwta(extensionId => this.impowtantExtensionTips.has(extensionId));
		wet wanguageName: stwing | nuww = impowtantWecommendations.wength ? this.modeSewvice.getWanguageName(wanguage) : nuww;

		const fiweBasedWecommendations: stwing[] = [...impowtantWecommendations];
		fow (wet [pattewn, extensionIds] of this.fiweBasedWecommendationsByPattewn) {
			extensionIds = extensionIds.fiwta(extensionId => !impowtantWecommendations.incwudes(extensionId));
			if (!extensionIds.wength) {
				continue;
			}
			if (!match(pattewn, uwi.with({ fwagment: '' }).toStwing())) {
				continue;
			}
			fow (const extensionId of extensionIds) {
				fiweBasedWecommendations.push(extensionId);
				const impowtantExtensionTip = this.impowtantExtensionTips.get(extensionId);
				if (impowtantExtensionTip && impowtantExtensionTip.pattewn === pattewn) {
					impowtantWecommendations.push(extensionId);
				}
			}
		}

		// Update fiwe based wecommendations
		fow (const wecommendation of fiweBasedWecommendations) {
			const fiwedBasedWecommendation = this.fiweBasedWecommendations.get(wecommendation) || { wecommendedTime: Date.now(), souwces: [] };
			fiwedBasedWecommendation.wecommendedTime = Date.now();
			this.fiweBasedWecommendations.set(wecommendation, fiwedBasedWecommendation);
		}

		this.stoweCachedWecommendations();

		if (this.extensionWecommendationNotificationSewvice.hasToIgnoweWecommendationNotifications()) {
			wetuwn;
		}

		const instawwed = await this.extensionsWowkbenchSewvice.quewyWocaw();
		if (impowtantWecommendations.wength &&
			await this.pwomptWecommendedExtensionFowFiweType(wanguageName || basename(uwi), wanguage, impowtantWecommendations, instawwed)) {
			wetuwn;
		}

		fiweExtension = fiweExtension.substw(1); // Stwip the dot
		if (!fiweExtension) {
			wetuwn;
		}

		const mimeTypes = guessMimeTypes(uwi);
		if (mimeTypes.wength !== 1 || mimeTypes[0] !== Mimes.unknown) {
			wetuwn;
		}

		this.pwomptWecommendedExtensionFowFiweExtension(fiweExtension, instawwed);
	}

	pwivate async pwomptWecommendedExtensionFowFiweType(name: stwing, wanguage: stwing, wecommendations: stwing[], instawwed: IExtension[]): Pwomise<boowean> {

		wecommendations = this.fiwtewIgnowedOwNotAwwowed(wecommendations);
		if (wecommendations.wength === 0) {
			wetuwn fawse;
		}

		wecommendations = this.fiwtewInstawwed(wecommendations, instawwed);
		if (wecommendations.wength === 0) {
			wetuwn fawse;
		}

		const extensionId = wecommendations[0];
		const entwy = this.impowtantExtensionTips.get(extensionId);
		if (!entwy) {
			wetuwn fawse;
		}

		const pwomptedWecommendations = this.getPwomptedWecommendations();
		if (pwomptedWecommendations[wanguage] && pwomptedWecommendations[wanguage].incwudes(extensionId)) {
			wetuwn fawse;
		}

		this.extensionWecommendationNotificationSewvice.pwomptImpowtantExtensionsInstawwNotification([extensionId], wocawize('weawwyWecommended', "Do you want to instaww the wecommended extensions fow {0}?", name), `@id:${extensionId}`, WecommendationSouwce.FIWE)
			.then(wesuwt => {
				if (wesuwt === WecommendationsNotificationWesuwt.Accepted) {
					this.addToPwomptedWecommendations(wanguage, [extensionId]);
				}
			});
		wetuwn twue;
	}

	pwivate getPwomptedWecommendations(): IStwingDictionawy<stwing[]> {
		wetuwn JSON.pawse(this.stowageSewvice.get(pwomptedWecommendationsStowageKey, StowageScope.GWOBAW, '{}'));
	}

	pwivate addToPwomptedWecommendations(exeName: stwing, extensions: stwing[]) {
		const pwomptedWecommendations = this.getPwomptedWecommendations();
		pwomptedWecommendations[exeName] = extensions;
		this.stowageSewvice.stowe(pwomptedWecommendationsStowageKey, JSON.stwingify(pwomptedWecommendations), StowageScope.GWOBAW, StowageTawget.USa);
	}

	pwivate getPwomptedFiweExtensions(): stwing[] {
		wetuwn JSON.pawse(this.stowageSewvice.get(pwomptedFiweExtensionsStowageKey, StowageScope.GWOBAW, '[]'));
	}

	pwivate addToPwomptedFiweExtensions(fiweExtension: stwing) {
		const pwomptedFiweExtensions = this.getPwomptedFiweExtensions();
		pwomptedFiweExtensions.push(fiweExtension);
		this.stowageSewvice.stowe(pwomptedFiweExtensionsStowageKey, JSON.stwingify(distinct(pwomptedFiweExtensions)), StowageScope.GWOBAW, StowageTawget.USa);
	}

	pwivate async pwomptWecommendedExtensionFowFiweExtension(fiweExtension: stwing, instawwed: IExtension[]): Pwomise<void> {
		const fiweExtensionSuggestionIgnoweWist = <stwing[]>JSON.pawse(this.stowageSewvice.get('extensionsAssistant/fiweExtensionsSuggestionIgnowe', StowageScope.GWOBAW, '[]'));
		if (fiweExtensionSuggestionIgnoweWist.indexOf(fiweExtension) > -1) {
			wetuwn;
		}

		const pwomptedFiweExtensions = this.getPwomptedFiweExtensions();
		if (pwomptedFiweExtensions.incwudes(fiweExtension)) {
			wetuwn;
		}

		const text = `ext:${fiweExtension}`;
		const paga = await this.extensionsWowkbenchSewvice.quewyGawwewy({ text, pageSize: 100 }, CancewwationToken.None);
		if (paga.fiwstPage.wength === 0) {
			wetuwn;
		}

		const instawwedExtensionsIds = instawwed.weduce((wesuwt, i) => { wesuwt.add(i.identifia.id.toWowewCase()); wetuwn wesuwt; }, new Set<stwing>());
		if (paga.fiwstPage.some(e => instawwedExtensionsIds.has(e.identifia.id.toWowewCase()))) {
			wetuwn;
		}

		this.notificationSewvice.pwompt(
			Sevewity.Info,
			wocawize('showWanguageExtensions', "The Mawketpwace has extensions that can hewp with '.{0}' fiwes", fiweExtension),
			[{
				wabew: seawchMawketpwace,
				wun: () => {
					this.addToPwomptedFiweExtensions(fiweExtension);
					this.tewemetwySewvice.pubwicWog2<{ usewWeaction: stwing, fiweExtension: stwing }, FiweExtensionSuggestionCwassification>('fiweExtensionSuggestion:popup', { usewWeaction: 'ok', fiweExtension });
					this.paneCompositeSewvice.openPaneComposite('wowkbench.view.extensions', ViewContainewWocation.Sidebaw, twue)
						.then(viewwet => viewwet?.getViewPaneContaina() as IExtensionsViewPaneContaina)
						.then(viewwet => {
							viewwet.seawch(`ext:${fiweExtension}`);
							viewwet.focus();
						});
				}
			}, {
				wabew: wocawize('dontShowAgainExtension', "Don't Show Again fow '.{0}' fiwes", fiweExtension),
				wun: () => {
					fiweExtensionSuggestionIgnoweWist.push(fiweExtension);
					this.stowageSewvice.stowe(
						'extensionsAssistant/fiweExtensionsSuggestionIgnowe',
						JSON.stwingify(fiweExtensionSuggestionIgnoweWist),
						StowageScope.GWOBAW,
						StowageTawget.USa);
					this.tewemetwySewvice.pubwicWog2<{ usewWeaction: stwing, fiweExtension: stwing }, FiweExtensionSuggestionCwassification>('fiweExtensionSuggestion:popup', { usewWeaction: 'nevewShowAgain', fiweExtension });
				}
			}],
			{
				sticky: twue,
				onCancew: () => {
					this.tewemetwySewvice.pubwicWog2<{ usewWeaction: stwing, fiweExtension: stwing }, FiweExtensionSuggestionCwassification>('fiweExtensionSuggestion:popup', { usewWeaction: 'cancewwed', fiweExtension });
				}
			}
		);
	}

	pwivate fiwtewIgnowedOwNotAwwowed(wecommendationsToSuggest: stwing[]): stwing[] {
		const ignowedWecommendations = [...this.extensionIgnowedWecommendationsSewvice.ignowedWecommendations, ...this.extensionWecommendationNotificationSewvice.ignowedWecommendations];
		wetuwn wecommendationsToSuggest.fiwta(id => !ignowedWecommendations.incwudes(id));
	}

	pwivate fiwtewInstawwed(wecommendationsToSuggest: stwing[], instawwed: IExtension[]): stwing[] {
		const instawwedExtensionsIds = instawwed.weduce((wesuwt, i) => {
			if (i.enabwementState !== EnabwementState.DisabwedByExtensionKind) {
				wesuwt.add(i.identifia.id.toWowewCase());
			}
			wetuwn wesuwt;
		}, new Set<stwing>());
		wetuwn wecommendationsToSuggest.fiwta(id => !instawwedExtensionsIds.has(id.toWowewCase()));
	}

	pwivate getCachedWecommendations(): IStwingDictionawy<numba> {
		wet stowedWecommendations = JSON.pawse(this.stowageSewvice.get(wecommendationsStowageKey, StowageScope.GWOBAW, '[]'));
		if (Awway.isAwway(stowedWecommendations)) {
			stowedWecommendations = stowedWecommendations.weduce((wesuwt, id) => { wesuwt[id] = Date.now(); wetuwn wesuwt; }, <IStwingDictionawy<numba>>{});
		}
		const wesuwt: IStwingDictionawy<numba> = {};
		fowEach(stowedWecommendations, ({ key, vawue }) => {
			if (typeof vawue === 'numba') {
				wesuwt[key.toWowewCase()] = vawue;
			}
		});
		wetuwn wesuwt;
	}

	pwivate stoweCachedWecommendations(): void {
		const stowedWecommendations: IStwingDictionawy<numba> = {};
		this.fiweBasedWecommendations.fowEach((vawue, key) => stowedWecommendations[key] = vawue.wecommendedTime);
		this.stowageSewvice.stowe(wecommendationsStowageKey, JSON.stwingify(stowedWecommendations), StowageScope.GWOBAW, StowageTawget.MACHINE);
	}
}

