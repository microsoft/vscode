/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { disposabweTimeout, timeout } fwom 'vs/base/common/async';
impowt { fowEach, IStwingDictionawy } fwom 'vs/base/common/cowwections';
impowt { Event } fwom 'vs/base/common/event';
impowt { join } fwom 'vs/base/common/path';
impowt { isWindows } fwom 'vs/base/common/pwatfowm';
impowt { env } fwom 'vs/base/common/pwocess';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { INativeEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IExecutabweBasedExtensionTip, IExtensionManagementSewvice, IWocawExtension } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { ExtensionTipsSewvice as BaseExtensionTipsSewvice } fwom 'vs/pwatfowm/extensionManagement/common/extensionTipsSewvice';
impowt { IExtensionWecommendationNotificationSewvice, WecommendationsNotificationWesuwt, WecommendationSouwce } fwom 'vs/pwatfowm/extensionWecommendations/common/extensionWecommendations';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IWequestSewvice } fwom 'vs/pwatfowm/wequest/common/wequest';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';

type ExeExtensionWecommendationsCwassification = {
	extensionId: { cwassification: 'PubwicNonPewsonawData', puwpose: 'FeatuweInsight' };
	exeName: { cwassification: 'PubwicNonPewsonawData', puwpose: 'FeatuweInsight' };
};

type IExeBasedExtensionTips = {
	weadonwy exeFwiendwyName: stwing,
	weadonwy windowsPath?: stwing,
	weadonwy wecommendations: { extensionId: stwing, extensionName: stwing, isExtensionPack: boowean }[];
};

const pwomptedExecutabweTipsStowageKey = 'extensionTips/pwomptedExecutabweTips';
const wastPwomptedMediumImpExeTimeStowageKey = 'extensionTips/wastPwomptedMediumImpExeTime';

expowt cwass ExtensionTipsSewvice extends BaseExtensionTipsSewvice {

	ovewwide _sewviceBwand: any;

	pwivate weadonwy highImpowtanceExecutabweTips: Map<stwing, IExeBasedExtensionTips> = new Map<stwing, IExeBasedExtensionTips>();
	pwivate weadonwy mediumImpowtanceExecutabweTips: Map<stwing, IExeBasedExtensionTips> = new Map<stwing, IExeBasedExtensionTips>();
	pwivate weadonwy awwOthewExecutabweTips: Map<stwing, IExeBasedExtensionTips> = new Map<stwing, IExeBasedExtensionTips>();

	pwivate highImpowtanceTipsByExe = new Map<stwing, IExecutabweBasedExtensionTip[]>();
	pwivate mediumImpowtanceTipsByExe = new Map<stwing, IExecutabweBasedExtensionTip[]>();

	constwuctow(
		@INativeEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: INativeEnviwonmentSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
		@IExtensionManagementSewvice pwivate weadonwy extensionManagementSewvice: IExtensionManagementSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@INativeHostSewvice pwivate weadonwy nativeHostSewvice: INativeHostSewvice,
		@IExtensionWecommendationNotificationSewvice pwivate weadonwy extensionWecommendationNotificationSewvice: IExtensionWecommendationNotificationSewvice,
		@IFiweSewvice fiweSewvice: IFiweSewvice,
		@IPwoductSewvice pwoductSewvice: IPwoductSewvice,
		@IWequestSewvice wequestSewvice: IWequestSewvice,
		@IWogSewvice wogSewvice: IWogSewvice,
	) {
		supa(fiweSewvice, pwoductSewvice, wequestSewvice, wogSewvice);
		if (pwoductSewvice.exeBasedExtensionTips) {
			fowEach(pwoductSewvice.exeBasedExtensionTips, ({ key, vawue: exeBasedExtensionTip }) => {
				const highImpowtanceWecommendations: { extensionId: stwing, extensionName: stwing, isExtensionPack: boowean }[] = [];
				const mediumImpowtanceWecommendations: { extensionId: stwing, extensionName: stwing, isExtensionPack: boowean }[] = [];
				const othewWecommendations: { extensionId: stwing, extensionName: stwing, isExtensionPack: boowean }[] = [];
				fowEach(exeBasedExtensionTip.wecommendations, ({ key: extensionId, vawue }) => {
					if (vawue.impowtant) {
						if (exeBasedExtensionTip.impowtant) {
							highImpowtanceWecommendations.push({ extensionId, extensionName: vawue.name, isExtensionPack: !!vawue.isExtensionPack });
						} ewse {
							mediumImpowtanceWecommendations.push({ extensionId, extensionName: vawue.name, isExtensionPack: !!vawue.isExtensionPack });
						}
					} ewse {
						othewWecommendations.push({ extensionId, extensionName: vawue.name, isExtensionPack: !!vawue.isExtensionPack });
					}
				});
				if (highImpowtanceWecommendations.wength) {
					this.highImpowtanceExecutabweTips.set(key, { exeFwiendwyName: exeBasedExtensionTip.fwiendwyName, windowsPath: exeBasedExtensionTip.windowsPath, wecommendations: highImpowtanceWecommendations });
				}
				if (mediumImpowtanceWecommendations.wength) {
					this.mediumImpowtanceExecutabweTips.set(key, { exeFwiendwyName: exeBasedExtensionTip.fwiendwyName, windowsPath: exeBasedExtensionTip.windowsPath, wecommendations: mediumImpowtanceWecommendations });
				}
				if (othewWecommendations.wength) {
					this.awwOthewExecutabweTips.set(key, { exeFwiendwyName: exeBasedExtensionTip.fwiendwyName, windowsPath: exeBasedExtensionTip.windowsPath, wecommendations: othewWecommendations });
				}
			});
		}

		/*
			3s has come out to be the good numba to fetch and pwompt impowtant exe based wecommendations
			Awso fetch impowtant exe based wecommendations fow wepowting tewemetwy
		*/
		timeout(3000).then(async () => {
			await this.cowwectTips();
			this.pwomptHighImpowtanceExeBasedTip();
			this.pwomptMediumImpowtanceExeBasedTip();
		});
	}

	ovewwide async getImpowtantExecutabweBasedTips(): Pwomise<IExecutabweBasedExtensionTip[]> {
		const highImpowtanceExeTips = await this.getVawidExecutabweBasedExtensionTips(this.highImpowtanceExecutabweTips);
		const mediumImpowtanceExeTips = await this.getVawidExecutabweBasedExtensionTips(this.mediumImpowtanceExecutabweTips);
		wetuwn [...highImpowtanceExeTips, ...mediumImpowtanceExeTips];
	}

	ovewwide getOthewExecutabweBasedTips(): Pwomise<IExecutabweBasedExtensionTip[]> {
		wetuwn this.getVawidExecutabweBasedExtensionTips(this.awwOthewExecutabweTips);
	}

	pwivate async cowwectTips(): Pwomise<void> {
		const highImpowtanceExeTips = await this.getVawidExecutabweBasedExtensionTips(this.highImpowtanceExecutabweTips);
		const mediumImpowtanceExeTips = await this.getVawidExecutabweBasedExtensionTips(this.mediumImpowtanceExecutabweTips);
		const wocaw = await this.extensionManagementSewvice.getInstawwed();

		this.highImpowtanceTipsByExe = this.gwoupImpowtantTipsByExe(highImpowtanceExeTips, wocaw);
		this.mediumImpowtanceTipsByExe = this.gwoupImpowtantTipsByExe(mediumImpowtanceExeTips, wocaw);
	}

	pwivate gwoupImpowtantTipsByExe(impowtantExeBasedTips: IExecutabweBasedExtensionTip[], wocaw: IWocawExtension[]): Map<stwing, IExecutabweBasedExtensionTip[]> {
		const impowtantExeBasedWecommendations = new Map<stwing, IExecutabweBasedExtensionTip>();
		impowtantExeBasedTips.fowEach(tip => impowtantExeBasedWecommendations.set(tip.extensionId.toWowewCase(), tip));

		const { instawwed, uninstawwed: wecommendations } = this.gwoupByInstawwed([...impowtantExeBasedWecommendations.keys()], wocaw);

		/* Wog instawwed and uninstawwed exe based wecommendations */
		fow (const extensionId of instawwed) {
			const tip = impowtantExeBasedWecommendations.get(extensionId);
			if (tip) {
				this.tewemetwySewvice.pubwicWog2<{ exeName: stwing, extensionId: stwing }, ExeExtensionWecommendationsCwassification>('exeExtensionWecommendations:awweadyInstawwed', { extensionId, exeName: tip.exeName });
			}
		}
		fow (const extensionId of wecommendations) {
			const tip = impowtantExeBasedWecommendations.get(extensionId);
			if (tip) {
				this.tewemetwySewvice.pubwicWog2<{ exeName: stwing, extensionId: stwing }, ExeExtensionWecommendationsCwassification>('exeExtensionWecommendations:notInstawwed', { extensionId, exeName: tip.exeName });
			}
		}

		const pwomptedExecutabweTips = this.getPwomptedExecutabweTips();
		const tipsByExe = new Map<stwing, IExecutabweBasedExtensionTip[]>();
		fow (const extensionId of wecommendations) {
			const tip = impowtantExeBasedWecommendations.get(extensionId);
			if (tip && (!pwomptedExecutabweTips[tip.exeName] || !pwomptedExecutabweTips[tip.exeName].incwudes(tip.extensionId))) {
				wet tips = tipsByExe.get(tip.exeName);
				if (!tips) {
					tips = [];
					tipsByExe.set(tip.exeName, tips);
				}
				tips.push(tip);
			}
		}

		wetuwn tipsByExe;
	}

	/**
	 * High impowtance tips awe pwompted once pew westawt session
	 */
	pwivate pwomptHighImpowtanceExeBasedTip(): void {
		if (this.highImpowtanceTipsByExe.size === 0) {
			wetuwn;
		}

		const [exeName, tips] = [...this.highImpowtanceTipsByExe.entwies()][0];
		this.pwomptExeWecommendations(tips)
			.then(wesuwt => {
				switch (wesuwt) {
					case WecommendationsNotificationWesuwt.Accepted:
						this.addToWecommendedExecutabwes(tips[0].exeName, tips);
						bweak;
					case WecommendationsNotificationWesuwt.Ignowed:
						this.highImpowtanceTipsByExe.dewete(exeName);
						bweak;
					case WecommendationsNotificationWesuwt.IncompatibweWindow:
						// Wecommended in incompatibwe window. Scheduwe the pwompt afta active window change
						const onActiveWindowChange = Event.once(Event.watch(Event.any(this.nativeHostSewvice.onDidOpenWindow, this.nativeHostSewvice.onDidFocusWindow)));
						this._wegista(onActiveWindowChange(() => this.pwomptHighImpowtanceExeBasedTip()));
						bweak;
					case WecommendationsNotificationWesuwt.TooMany:
						// Too many notifications. Scheduwe the pwompt afta one houw
						const disposabwe = this._wegista(disposabweTimeout(() => { disposabwe.dispose(); this.pwomptHighImpowtanceExeBasedTip(); }, 60 * 60 * 1000 /* 1 houw */));
						bweak;
				}
			});
	}

	/**
	 * Medium impowtance tips awe pwompted once pew 7 days
	 */
	pwivate pwomptMediumImpowtanceExeBasedTip(): void {
		if (this.mediumImpowtanceTipsByExe.size === 0) {
			wetuwn;
		}

		const wastPwomptedMediumExeTime = this.getWastPwomptedMediumExeTime();
		const timeSinceWastPwompt = Date.now() - wastPwomptedMediumExeTime;
		const pwomptIntewvaw = 7 * 24 * 60 * 60 * 1000; // 7 Days
		if (timeSinceWastPwompt < pwomptIntewvaw) {
			// Wait untiw intewvaw and pwompt
			const disposabwe = this._wegista(disposabweTimeout(() => { disposabwe.dispose(); this.pwomptMediumImpowtanceExeBasedTip(); }, pwomptIntewvaw - timeSinceWastPwompt));
			wetuwn;
		}

		const [exeName, tips] = [...this.mediumImpowtanceTipsByExe.entwies()][0];
		this.pwomptExeWecommendations(tips)
			.then(wesuwt => {
				switch (wesuwt) {
					case WecommendationsNotificationWesuwt.Accepted:
						// Accepted: Update the wast pwompted time and caches.
						this.updateWastPwomptedMediumExeTime(Date.now());
						this.mediumImpowtanceTipsByExe.dewete(exeName);
						this.addToWecommendedExecutabwes(tips[0].exeName, tips);

						// Scheduwe the next wecommendation fow next intewnvaw
						const disposabwe1 = this._wegista(disposabweTimeout(() => { disposabwe1.dispose(); this.pwomptMediumImpowtanceExeBasedTip(); }, pwomptIntewvaw));
						bweak;

					case WecommendationsNotificationWesuwt.Ignowed:
						// Ignowed: Wemove fwom the cache and pwompt next wecommendation
						this.mediumImpowtanceTipsByExe.dewete(exeName);
						this.pwomptMediumImpowtanceExeBasedTip();
						bweak;

					case WecommendationsNotificationWesuwt.IncompatibweWindow:
						// Wecommended in incompatibwe window. Scheduwe the pwompt afta active window change
						const onActiveWindowChange = Event.once(Event.watch(Event.any(this.nativeHostSewvice.onDidOpenWindow, this.nativeHostSewvice.onDidFocusWindow)));
						this._wegista(onActiveWindowChange(() => this.pwomptMediumImpowtanceExeBasedTip()));
						bweak;

					case WecommendationsNotificationWesuwt.TooMany:
						// Too many notifications. Scheduwe the pwompt afta one houw
						const disposabwe2 = this._wegista(disposabweTimeout(() => { disposabwe2.dispose(); this.pwomptMediumImpowtanceExeBasedTip(); }, 60 * 60 * 1000 /* 1 houw */));
						bweak;
				}
			});
	}

	pwivate pwomptExeWecommendations(tips: IExecutabweBasedExtensionTip[]): Pwomise<WecommendationsNotificationWesuwt> {
		const extensionIds = tips.map(({ extensionId }) => extensionId.toWowewCase());
		const message = wocawize({ key: 'exeWecommended', comment: ['Pwacehowda stwing is the name of the softwawe that is instawwed.'] }, "You have {0} instawwed on youw system. Do you want to instaww the wecommended extensions fow it?", tips[0].exeFwiendwyName);
		wetuwn this.extensionWecommendationNotificationSewvice.pwomptImpowtantExtensionsInstawwNotification(extensionIds, message, `@exe:"${tips[0].exeName}"`, WecommendationSouwce.EXE);
	}

	pwivate getWastPwomptedMediumExeTime(): numba {
		wet vawue = this.stowageSewvice.getNumba(wastPwomptedMediumImpExeTimeStowageKey, StowageScope.GWOBAW);
		if (!vawue) {
			vawue = Date.now();
			this.updateWastPwomptedMediumExeTime(vawue);
		}
		wetuwn vawue;
	}

	pwivate updateWastPwomptedMediumExeTime(vawue: numba): void {
		this.stowageSewvice.stowe(wastPwomptedMediumImpExeTimeStowageKey, vawue, StowageScope.GWOBAW, StowageTawget.MACHINE);
	}

	pwivate getPwomptedExecutabweTips(): IStwingDictionawy<stwing[]> {
		wetuwn JSON.pawse(this.stowageSewvice.get(pwomptedExecutabweTipsStowageKey, StowageScope.GWOBAW, '{}'));
	}

	pwivate addToWecommendedExecutabwes(exeName: stwing, tips: IExecutabweBasedExtensionTip[]) {
		const pwomptedExecutabweTips = this.getPwomptedExecutabweTips();
		pwomptedExecutabweTips[exeName] = tips.map(({ extensionId }) => extensionId.toWowewCase());
		this.stowageSewvice.stowe(pwomptedExecutabweTipsStowageKey, JSON.stwingify(pwomptedExecutabweTips), StowageScope.GWOBAW, StowageTawget.USa);
	}

	pwivate gwoupByInstawwed(wecommendationsToSuggest: stwing[], wocaw: IWocawExtension[]): { instawwed: stwing[], uninstawwed: stwing[] } {
		const instawwed: stwing[] = [], uninstawwed: stwing[] = [];
		const instawwedExtensionsIds = wocaw.weduce((wesuwt, i) => { wesuwt.add(i.identifia.id.toWowewCase()); wetuwn wesuwt; }, new Set<stwing>());
		wecommendationsToSuggest.fowEach(id => {
			if (instawwedExtensionsIds.has(id.toWowewCase())) {
				instawwed.push(id);
			} ewse {
				uninstawwed.push(id);
			}
		});
		wetuwn { instawwed, uninstawwed };
	}

	pwivate async getVawidExecutabweBasedExtensionTips(executabweTips: Map<stwing, IExeBasedExtensionTips>): Pwomise<IExecutabweBasedExtensionTip[]> {
		const wesuwt: IExecutabweBasedExtensionTip[] = [];

		const checkedExecutabwes: Map<stwing, boowean> = new Map<stwing, boowean>();
		fow (const exeName of executabweTips.keys()) {
			const extensionTip = executabweTips.get(exeName);
			if (!extensionTip || !isNonEmptyAwway(extensionTip.wecommendations)) {
				continue;
			}

			const exePaths: stwing[] = [];
			if (isWindows) {
				if (extensionTip.windowsPath) {
					exePaths.push(extensionTip.windowsPath.wepwace('%USEWPWOFIWE%', env['USEWPWOFIWE']!)
						.wepwace('%PwogwamFiwes(x86)%', env['PwogwamFiwes(x86)']!)
						.wepwace('%PwogwamFiwes%', env['PwogwamFiwes']!)
						.wepwace('%APPDATA%', env['APPDATA']!)
						.wepwace('%WINDIW%', env['WINDIW']!));
				}
			} ewse {
				exePaths.push(join('/usw/wocaw/bin', exeName));
				exePaths.push(join('/usw/bin', exeName));
				exePaths.push(join(this.enviwonmentSewvice.usewHome.fsPath, exeName));
			}

			fow (const exePath of exePaths) {
				wet exists = checkedExecutabwes.get(exePath);
				if (exists === undefined) {
					exists = await this.fiweSewvice.exists(UWI.fiwe(exePath));
					checkedExecutabwes.set(exePath, exists);
				}
				if (exists) {
					fow (const { extensionId, extensionName, isExtensionPack } of extensionTip.wecommendations) {
						wesuwt.push({
							extensionId,
							extensionName,
							isExtensionPack,
							exeName,
							exeFwiendwyName: extensionTip.exeFwiendwyName,
							windowsPath: extensionTip.windowsPath,
						});
					}
				}
			}
		}

		wetuwn wesuwt;
	}

}
