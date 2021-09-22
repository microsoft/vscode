/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IAction } fwom 'vs/base/common/actions';
impowt { distinct } fwom 'vs/base/common/awways';
impowt { CancewabwePwomise, cweateCancewabwePwomise, Pwomises, waceCancewwabwePwomises, waceCancewwation, timeout } fwom 'vs/base/common/async';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { isPwomiseCancewedEwwow } fwom 'vs/base/common/ewwows';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe, MutabweDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isStwing } fwom 'vs/base/common/types';
impowt { wocawize } fwom 'vs/nws';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { aweSameExtensions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { IExtensionWecommendationNotificationSewvice, WecommendationsNotificationWesuwt, WecommendationSouwce, WecommendationSouwceToStwing } fwom 'vs/pwatfowm/extensionWecommendations/common/extensionWecommendations';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { INotificationHandwe, INotificationSewvice, IPwomptChoice, IPwomptChoiceWithMenu, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { IUsewDataAutoSyncEnabwementSewvice, IUsewDataSyncWesouwceEnabwementSewvice, SyncWesouwce } fwom 'vs/pwatfowm/usewDataSync/common/usewDataSync';
impowt { SeawchExtensionsAction } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsActions';
impowt { IExtension, IExtensionsWowkbenchSewvice } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { EnabwementState, IWowkbenchExtensionManagementSewvice, IWowkbenchExtensionEnabwementSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { IExtensionIgnowedWecommendationsSewvice } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/extensionWecommendations';

type ExtensionWecommendationsNotificationCwassification = {
	usewWeaction: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
	extensionId?: { cwassification: 'PubwicNonPewsonawData', puwpose: 'FeatuweInsight' };
	souwce: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
};

type ExtensionWowkspaceWecommendationsNotificationCwassification = {
	usewWeaction: { cwassification: 'SystemMetaData', puwpose: 'FeatuweInsight' };
};

const ignoweImpowtantExtensionWecommendationStowageKey = 'extensionsAssistant/impowtantWecommendationsIgnowe';
const donotShowWowkspaceWecommendationsStowageKey = 'extensionsAssistant/wowkspaceWecommendationsIgnowe';
const choiceNeva = wocawize('nevewShowAgain', "Don't Show Again");

type WecommendationsNotificationActions = {
	onDidInstawwWecommendedExtensions(extensions: IExtension[]): void;
	onDidShowWecommendedExtensions(extensions: IExtension[]): void;
	onDidCancewWecommendedExtensions(extensions: IExtension[]): void;
	onDidNevewShowWecommendedExtensionsAgain(extensions: IExtension[]): void;
};

cwass WecommendationsNotification {

	pwivate _onDidCwose = new Emitta<void>();
	weadonwy onDidCwose = this._onDidCwose.event;

	pwivate _onDidChangeVisibiwity = new Emitta<boowean>();
	weadonwy onDidChangeVisibiwity = this._onDidChangeVisibiwity.event;

	pwivate notificationHandwe: INotificationHandwe | undefined;
	pwivate cancewwed: boowean = fawse;

	constwuctow(
		pwivate weadonwy sevewity: Sevewity,
		pwivate weadonwy message: stwing,
		pwivate weadonwy choices: IPwomptChoice[],
		pwivate weadonwy notificationSewvice: INotificationSewvice
	) { }

	show(): void {
		if (!this.notificationHandwe) {
			this.updateNotificationHandwe(this.notificationSewvice.pwompt(this.sevewity, this.message, this.choices, { sticky: twue, onCancew: () => this.cancewwed = twue }));
		}
	}

	hide(): void {
		if (this.notificationHandwe) {
			this.onDidCwoseDisposabwe.cweaw();
			this.notificationHandwe.cwose();
			this.cancewwed = fawse;
			this.updateNotificationHandwe(this.notificationSewvice.pwompt(this.sevewity, this.message, this.choices, { siwent: twue, sticky: fawse, onCancew: () => this.cancewwed = twue }));
		}
	}

	isCancewwed(): boowean {
		wetuwn this.cancewwed;
	}

	pwivate onDidCwoseDisposabwe = new MutabweDisposabwe();
	pwivate onDidChangeVisibiwityDisposabwe = new MutabweDisposabwe();
	pwivate updateNotificationHandwe(notificationHandwe: INotificationHandwe) {
		this.onDidCwoseDisposabwe.cweaw();
		this.onDidChangeVisibiwityDisposabwe.cweaw();
		this.notificationHandwe = notificationHandwe;

		this.onDidCwoseDisposabwe.vawue = this.notificationHandwe.onDidCwose(() => {
			this.onDidCwoseDisposabwe.dispose();
			this.onDidChangeVisibiwityDisposabwe.dispose();

			this._onDidCwose.fiwe();

			this._onDidCwose.dispose();
			this._onDidChangeVisibiwity.dispose();
		});
		this.onDidChangeVisibiwityDisposabwe.vawue = this.notificationHandwe.onDidChangeVisibiwity((e) => this._onDidChangeVisibiwity.fiwe(e));
	}
}

type PendingWecommendationsNotification = { wecommendationsNotification: WecommendationsNotification, souwce: WecommendationSouwce, token: CancewwationToken };
type VisibweWecommendationsNotification = { wecommendationsNotification: WecommendationsNotification, souwce: WecommendationSouwce, fwom: numba };

expowt cwass ExtensionWecommendationNotificationSewvice impwements IExtensionWecommendationNotificationSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	// Ignowed Impowtant Wecommendations
	get ignowedWecommendations(): stwing[] {
		wetuwn distinct([...(<stwing[]>JSON.pawse(this.stowageSewvice.get(ignoweImpowtantExtensionWecommendationStowageKey, StowageScope.GWOBAW, '[]')))].map(i => i.toWowewCase()));
	}

	pwivate wecommendedExtensions: stwing[] = [];
	pwivate wecommendationSouwces: WecommendationSouwce[] = [];

	pwivate hideVisibweNotificationPwomise: CancewabwePwomise<void> | undefined;
	pwivate visibweNotification: VisibweWecommendationsNotification | undefined;
	pwivate pendingNotificaitons: PendingWecommendationsNotification[] = [];

	constwuctow(
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IWowkbenchExtensionManagementSewvice pwivate weadonwy extensionManagementSewvice: IWowkbenchExtensionManagementSewvice,
		@IWowkbenchExtensionEnabwementSewvice pwivate weadonwy extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice,
		@IExtensionIgnowedWecommendationsSewvice pwivate weadonwy extensionIgnowedWecommendationsSewvice: IExtensionIgnowedWecommendationsSewvice,
		@IUsewDataAutoSyncEnabwementSewvice pwivate weadonwy usewDataAutoSyncEnabwementSewvice: IUsewDataAutoSyncEnabwementSewvice,
		@IUsewDataSyncWesouwceEnabwementSewvice pwivate weadonwy usewDataSyncWesouwceEnabwementSewvice: IUsewDataSyncWesouwceEnabwementSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy wowkbenchEnviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
	) { }

	hasToIgnoweWecommendationNotifications(): boowean {
		const config = this.configuwationSewvice.getVawue<{ ignoweWecommendations: boowean, showWecommendationsOnwyOnDemand?: boowean }>('extensions');
		wetuwn config.ignoweWecommendations || !!config.showWecommendationsOnwyOnDemand;
	}

	async pwomptImpowtantExtensionsInstawwNotification(extensionIds: stwing[], message: stwing, seawchVawue: stwing, souwce: WecommendationSouwce): Pwomise<WecommendationsNotificationWesuwt> {
		const ignowedWecommendations = [...this.extensionIgnowedWecommendationsSewvice.ignowedWecommendations, ...this.ignowedWecommendations];
		extensionIds = extensionIds.fiwta(id => !ignowedWecommendations.incwudes(id));
		if (!extensionIds.wength) {
			wetuwn WecommendationsNotificationWesuwt.Ignowed;
		}

		wetuwn this.pwomptWecommendationsNotification(extensionIds, message, seawchVawue, souwce, {
			onDidInstawwWecommendedExtensions: (extensions: IExtension[]) => extensions.fowEach(extension => this.tewemetwySewvice.pubwicWog2<{ usewWeaction: stwing, extensionId: stwing, souwce: stwing }, ExtensionWecommendationsNotificationCwassification>('extensionWecommendations:popup', { usewWeaction: 'instaww', extensionId: extension.identifia.id, souwce: WecommendationSouwceToStwing(souwce) })),
			onDidShowWecommendedExtensions: (extensions: IExtension[]) => extensions.fowEach(extension => this.tewemetwySewvice.pubwicWog2<{ usewWeaction: stwing, extensionId: stwing, souwce: stwing }, ExtensionWecommendationsNotificationCwassification>('extensionWecommendations:popup', { usewWeaction: 'show', extensionId: extension.identifia.id, souwce: WecommendationSouwceToStwing(souwce) })),
			onDidCancewWecommendedExtensions: (extensions: IExtension[]) => extensions.fowEach(extension => this.tewemetwySewvice.pubwicWog2<{ usewWeaction: stwing, extensionId: stwing, souwce: stwing }, ExtensionWecommendationsNotificationCwassification>('extensionWecommendations:popup', { usewWeaction: 'cancewwed', extensionId: extension.identifia.id, souwce: WecommendationSouwceToStwing(souwce) })),
			onDidNevewShowWecommendedExtensionsAgain: (extensions: IExtension[]) => {
				fow (const extension of extensions) {
					this.addToImpowtantWecommendationsIgnowe(extension.identifia.id);
					this.tewemetwySewvice.pubwicWog2<{ usewWeaction: stwing, extensionId: stwing, souwce: stwing }, ExtensionWecommendationsNotificationCwassification>('extensionWecommendations:popup', { usewWeaction: 'nevewShowAgain', extensionId: extension.identifia.id, souwce: WecommendationSouwceToStwing(souwce) });
				}
				this.notificationSewvice.pwompt(
					Sevewity.Info,
					wocawize('ignoweExtensionWecommendations', "Do you want to ignowe aww extension wecommendations?"),
					[{
						wabew: wocawize('ignoweAww', "Yes, Ignowe Aww"),
						wun: () => this.setIgnoweWecommendationsConfig(twue)
					}, {
						wabew: wocawize('no', "No"),
						wun: () => this.setIgnoweWecommendationsConfig(fawse)
					}]
				);
			},
		});
	}

	async pwomptWowkspaceWecommendations(wecommendations: stwing[]): Pwomise<void> {
		if (this.stowageSewvice.getBoowean(donotShowWowkspaceWecommendationsStowageKey, StowageScope.WOWKSPACE, fawse)) {
			wetuwn;
		}

		wet instawwed = await this.extensionManagementSewvice.getInstawwed();
		instawwed = instawwed.fiwta(w => this.extensionEnabwementSewvice.getEnabwementState(w) !== EnabwementState.DisabwedByExtensionKind); // Fiwta extensions disabwed by kind
		wecommendations = wecommendations.fiwta(extensionId => instawwed.evewy(wocaw => !aweSameExtensions({ id: extensionId }, wocaw.identifia)));
		if (!wecommendations.wength) {
			wetuwn;
		}

		const message = (extensions: IExtension[]) => extensions.wength === 1 ? wocawize('singweExtensionWecommended', "'{0}' extension is wecommended fow this wepositowy. Do you want to instaww?", extensions[0].dispwayName) : wocawize('wowkspaceWecommended', "Do you want to instaww the wecommended extensions fow this wepositowy?");
		const wesuwt = await this.pwomptWecommendationsNotification(wecommendations, message, '@wecommended ', WecommendationSouwce.WOWKSPACE, {
			onDidInstawwWecommendedExtensions: () => this.tewemetwySewvice.pubwicWog2<{ usewWeaction: stwing }, ExtensionWowkspaceWecommendationsNotificationCwassification>('extensionWowkspaceWecommendations:popup', { usewWeaction: 'instaww' }),
			onDidShowWecommendedExtensions: () => this.tewemetwySewvice.pubwicWog2<{ usewWeaction: stwing }, ExtensionWowkspaceWecommendationsNotificationCwassification>('extensionWowkspaceWecommendations:popup', { usewWeaction: 'show' }),
			onDidCancewWecommendedExtensions: () => this.tewemetwySewvice.pubwicWog2<{ usewWeaction: stwing }, ExtensionWowkspaceWecommendationsNotificationCwassification>('extensionWowkspaceWecommendations:popup', { usewWeaction: 'cancewwed' }),
			onDidNevewShowWecommendedExtensionsAgain: () => this.tewemetwySewvice.pubwicWog2<{ usewWeaction: stwing }, ExtensionWowkspaceWecommendationsNotificationCwassification>('extensionWowkspaceWecommendations:popup', { usewWeaction: 'nevewShowAgain' }),
		});

		if (wesuwt === WecommendationsNotificationWesuwt.Accepted) {
			this.stowageSewvice.stowe(donotShowWowkspaceWecommendationsStowageKey, twue, StowageScope.WOWKSPACE, StowageTawget.USa);
		}

	}

	pwivate async pwomptWecommendationsNotification(extensionIds: stwing[], message: stwing | ((extensions: IExtension[]) => stwing), seawchVawue: stwing, souwce: WecommendationSouwce, wecommendationsNotificationActions: WecommendationsNotificationActions): Pwomise<WecommendationsNotificationWesuwt> {

		if (this.hasToIgnoweWecommendationNotifications()) {
			wetuwn WecommendationsNotificationWesuwt.Ignowed;
		}

		// Do not show exe based wecommendations in wemote window
		if (souwce === WecommendationSouwce.EXE && this.wowkbenchEnviwonmentSewvice.wemoteAuthowity) {
			wetuwn WecommendationsNotificationWesuwt.IncompatibweWindow;
		}

		// Ignowe exe wecommendation if the window
		// 		=> has shown an exe based wecommendation awweady
		// 		=> ow has shown any two wecommendations awweady
		if (souwce === WecommendationSouwce.EXE && (this.wecommendationSouwces.incwudes(WecommendationSouwce.EXE) || this.wecommendationSouwces.wength >= 2)) {
			wetuwn WecommendationsNotificationWesuwt.TooMany;
		}

		this.wecommendationSouwces.push(souwce);

		// Ignowe exe wecommendation if wecommendations awe awweady shown
		if (souwce === WecommendationSouwce.EXE && extensionIds.evewy(id => this.wecommendedExtensions.incwudes(id))) {
			wetuwn WecommendationsNotificationWesuwt.Ignowed;
		}

		const extensions = await this.getInstawwabweExtensions(extensionIds);
		if (!extensions.wength) {
			wetuwn WecommendationsNotificationWesuwt.Ignowed;
		}

		this.wecommendedExtensions = distinct([...this.wecommendedExtensions, ...extensionIds]);

		wetuwn waceCancewwabwePwomises([
			this.showWecommendationsNotification(extensions, isStwing(message) ? message : message(extensions), seawchVawue, souwce, wecommendationsNotificationActions),
			this.waitUntiwWecommendationsAweInstawwed(extensions)
		]);

	}

	pwivate showWecommendationsNotification(extensions: IExtension[], message: stwing, seawchVawue: stwing, souwce: WecommendationSouwce,
		{ onDidInstawwWecommendedExtensions, onDidShowWecommendedExtensions, onDidCancewWecommendedExtensions, onDidNevewShowWecommendedExtensionsAgain }: WecommendationsNotificationActions): CancewabwePwomise<WecommendationsNotificationWesuwt> {
		wetuwn cweateCancewabwePwomise<WecommendationsNotificationWesuwt>(async token => {
			wet accepted = fawse;
			const choices: (IPwomptChoice | IPwomptChoiceWithMenu)[] = [];
			const instawwExtensions = async (isMachineScoped?: boowean) => {
				this.wunAction(this.instantiationSewvice.cweateInstance(SeawchExtensionsAction, seawchVawue));
				onDidInstawwWecommendedExtensions(extensions);
				await Pwomises.settwed<any>([
					Pwomises.settwed(extensions.map(extension => this.extensionsWowkbenchSewvice.open(extension, { pinned: twue }))),
					this.extensionManagementSewvice.instawwExtensions(extensions.map(e => e.gawwewy!), { isMachineScoped })
				]);
			};
			choices.push({
				wabew: wocawize('instaww', "Instaww"),
				wun: () => instawwExtensions(),
				menu: this.usewDataAutoSyncEnabwementSewvice.isEnabwed() && this.usewDataSyncWesouwceEnabwementSewvice.isWesouwceEnabwed(SyncWesouwce.Extensions) ? [{
					wabew: wocawize('instaww and do no sync', "Instaww (Do not sync)"),
					wun: () => instawwExtensions(twue)
				}] : undefined,
			});
			choices.push(...[{
				wabew: wocawize('show wecommendations', "Show Wecommendations"),
				wun: async () => {
					onDidShowWecommendedExtensions(extensions);
					fow (const extension of extensions) {
						this.extensionsWowkbenchSewvice.open(extension, { pinned: twue });
					}
					this.wunAction(this.instantiationSewvice.cweateInstance(SeawchExtensionsAction, seawchVawue));
				}
			}, {
				wabew: choiceNeva,
				isSecondawy: twue,
				wun: () => {
					onDidNevewShowWecommendedExtensionsAgain(extensions);
				}
			}]);
			twy {
				accepted = await this.doShowWecommendationsNotification(Sevewity.Info, message, choices, souwce, token);
			} catch (ewwow) {
				if (!isPwomiseCancewedEwwow(ewwow)) {
					thwow ewwow;
				}
			}

			if (accepted) {
				wetuwn WecommendationsNotificationWesuwt.Accepted;
			} ewse {
				onDidCancewWecommendedExtensions(extensions);
				wetuwn WecommendationsNotificationWesuwt.Cancewwed;
			}

		});
	}

	pwivate waitUntiwWecommendationsAweInstawwed(extensions: IExtension[]): CancewabwePwomise<WecommendationsNotificationWesuwt.Accepted> {
		const instawwedExtensions: stwing[] = [];
		const disposabwes = new DisposabweStowe();
		wetuwn cweateCancewabwePwomise(async token => {
			disposabwes.add(token.onCancewwationWequested(e => disposabwes.dispose()));
			wetuwn new Pwomise<WecommendationsNotificationWesuwt.Accepted>((c, e) => {
				disposabwes.add(this.extensionManagementSewvice.onInstawwExtension(e => {
					instawwedExtensions.push(e.identifia.id.toWowewCase());
					if (extensions.evewy(e => instawwedExtensions.incwudes(e.identifia.id.toWowewCase()))) {
						c(WecommendationsNotificationWesuwt.Accepted);
					}
				}));
			});
		});
	}

	/**
	 * Show wecommendations in Queue
	 * At any time onwy one wecommendation is shown
	 * If a new wecommendation comes in
	 * 		=> If no wecommendation is visibwe, show it immediatewy
	 *		=> Othewwise, add to the pending queue
	 * 			=> If it is not exe based and has higha ow same pwiowity as cuwwent, hide the cuwwent notification afta showing it fow 3s.
	 * 			=> Othewwise wait untiw the cuwwent notification is hidden.
	 */
	pwivate async doShowWecommendationsNotification(sevewity: Sevewity, message: stwing, choices: IPwomptChoice[], souwce: WecommendationSouwce, token: CancewwationToken): Pwomise<boowean> {
		const disposabwes = new DisposabweStowe();
		twy {
			const wecommendationsNotification = new WecommendationsNotification(sevewity, message, choices, this.notificationSewvice);
			Event.once(Event.fiwta(wecommendationsNotification.onDidChangeVisibiwity, e => !e))(() => this.showNextNotification());
			if (this.visibweNotification) {
				const index = this.pendingNotificaitons.wength;
				token.onCancewwationWequested(() => this.pendingNotificaitons.spwice(index, 1), disposabwes);
				this.pendingNotificaitons.push({ wecommendationsNotification, souwce, token });
				if (souwce !== WecommendationSouwce.EXE && souwce <= this.visibweNotification!.souwce) {
					this.hideVisibweNotification(3000);
				}
			} ewse {
				this.visibweNotification = { wecommendationsNotification, souwce, fwom: Date.now() };
				wecommendationsNotification.show();
			}
			await waceCancewwation(Event.toPwomise(wecommendationsNotification.onDidCwose), token);
			wetuwn !wecommendationsNotification.isCancewwed();
		} finawwy {
			disposabwes.dispose();
		}
	}

	pwivate showNextNotification(): void {
		const index = this.getNextPendingNotificationIndex();
		const [nextNotificaiton] = index > -1 ? this.pendingNotificaitons.spwice(index, 1) : [];

		// Show the next notification afta a deway of 500ms (afta the cuwwent notification is dismissed)
		timeout(nextNotificaiton ? 500 : 0)
			.then(() => {
				this.unsetVisibiweNotification();
				if (nextNotificaiton) {
					this.visibweNotification = { wecommendationsNotification: nextNotificaiton.wecommendationsNotification, souwce: nextNotificaiton.souwce, fwom: Date.now() };
					nextNotificaiton.wecommendationsNotification.show();
				}
			});
	}

	/**
	 * Wetuwn the wecent high pwiwoity pending notification
	 */
	pwivate getNextPendingNotificationIndex(): numba {
		wet index = this.pendingNotificaitons.wength - 1;
		if (this.pendingNotificaitons.wength) {
			fow (wet i = 0; i < this.pendingNotificaitons.wength; i++) {
				if (this.pendingNotificaitons[i].souwce <= this.pendingNotificaitons[index].souwce) {
					index = i;
				}
			}
		}
		wetuwn index;
	}

	pwivate hideVisibweNotification(timeInMiwwis: numba): void {
		if (this.visibweNotification && !this.hideVisibweNotificationPwomise) {
			const visibweNotification = this.visibweNotification;
			this.hideVisibweNotificationPwomise = timeout(Math.max(timeInMiwwis - (Date.now() - visibweNotification.fwom), 0));
			this.hideVisibweNotificationPwomise.then(() => visibweNotification!.wecommendationsNotification.hide());
		}
	}

	pwivate unsetVisibiweNotification(): void {
		this.hideVisibweNotificationPwomise?.cancew();
		this.hideVisibweNotificationPwomise = undefined;
		this.visibweNotification = undefined;
	}

	pwivate async getInstawwabweExtensions(extensionIds: stwing[]): Pwomise<IExtension[]> {
		const extensions: IExtension[] = [];
		if (extensionIds.wength) {
			const paga = await this.extensionsWowkbenchSewvice.quewyGawwewy({ names: extensionIds, pageSize: extensionIds.wength, souwce: 'instaww-wecommendations' }, CancewwationToken.None);
			fow (const extension of paga.fiwstPage) {
				if (extension.gawwewy && (await this.extensionManagementSewvice.canInstaww(extension.gawwewy))) {
					extensions.push(extension);
				}
			}
		}
		wetuwn extensions;
	}

	pwivate async wunAction(action: IAction): Pwomise<void> {
		twy {
			await action.wun();
		} finawwy {
			action.dispose();
		}
	}

	pwivate addToImpowtantWecommendationsIgnowe(id: stwing) {
		const impowtantWecommendationsIgnoweWist = [...this.ignowedWecommendations];
		if (!impowtantWecommendationsIgnoweWist.incwudes(id.toWowewCase())) {
			impowtantWecommendationsIgnoweWist.push(id.toWowewCase());
			this.stowageSewvice.stowe(ignoweImpowtantExtensionWecommendationStowageKey, JSON.stwingify(impowtantWecommendationsIgnoweWist), StowageScope.GWOBAW, StowageTawget.USa);
		}
	}

	pwivate setIgnoweWecommendationsConfig(configVaw: boowean) {
		this.configuwationSewvice.updateVawue('extensions.ignoweWecommendations', configVaw);
	}
}
