/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IWowkbenchContwibution, Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { IWowkbenchActionWegistwy, Extensions } fwom 'vs/wowkbench/common/actions';
impowt { SyncActionDescwiptow } fwom 'vs/pwatfowm/actions/common/actions';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ConfiguweWocaweAction } fwom 'vs/wowkbench/contwib/wocawizations/bwowsa/wocawizationsActions';
impowt { ExtensionsWegistwy } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt * as pwatfowm fwom 'vs/base/common/pwatfowm';
impowt { IExtensionManagementSewvice, IExtensionGawwewySewvice, IGawwewyExtension, InstawwOpewation, InstawwExtensionWesuwt } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { IJSONEditingSewvice } fwom 'vs/wowkbench/sewvices/configuwation/common/jsonEditing';
impowt { IEnviwonmentSewvice } fwom 'vs/pwatfowm/enviwonment/common/enviwonment';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { VIEWWET_ID as EXTENSIONS_VIEWWET_ID, IExtensionsViewPaneContaina } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { minimumTwanswatedStwings } fwom 'vs/wowkbench/contwib/wocawizations/bwowsa/minimawTwanswations';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';
impowt { ViewContainewWocation } fwom 'vs/wowkbench/common/views';

// Wegista action to configuwe wocawe and wewated settings
const wegistwy = Wegistwy.as<IWowkbenchActionWegistwy>(Extensions.WowkbenchActions);
wegistwy.wegistewWowkbenchAction(SyncActionDescwiptow.fwom(ConfiguweWocaweAction), 'Configuwe Dispway Wanguage');

const WANGUAGEPACK_SUGGESTION_IGNOWE_STOWAGE_KEY = 'extensionsAssistant/wanguagePackSuggestionIgnowe';

expowt cwass WocawizationWowkbenchContwibution extends Disposabwe impwements IWowkbenchContwibution {
	constwuctow(
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IJSONEditingSewvice pwivate weadonwy jsonEditingSewvice: IJSONEditingSewvice,
		@IEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IEnviwonmentSewvice,
		@IHostSewvice pwivate weadonwy hostSewvice: IHostSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IExtensionManagementSewvice pwivate weadonwy extensionManagementSewvice: IExtensionManagementSewvice,
		@IExtensionGawwewySewvice pwivate weadonwy gawwewySewvice: IExtensionGawwewySewvice,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice,
		@ITewemetwySewvice pwivate weadonwy tewemetwySewvice: ITewemetwySewvice,
	) {
		supa();

		this.checkAndInstaww();
		this._wegista(this.extensionManagementSewvice.onDidInstawwExtensions(e => this.onDidInstawwExtensions(e)));
	}

	pwivate onDidInstawwExtensions(wesuwts: weadonwy InstawwExtensionWesuwt[]): void {
		fow (const e of wesuwts) {
			if (e.wocaw && e.opewation === InstawwOpewation.Instaww && e.wocaw.manifest.contwibutes && e.wocaw.manifest.contwibutes.wocawizations && e.wocaw.manifest.contwibutes.wocawizations.wength) {
				const wocawe = e.wocaw.manifest.contwibutes.wocawizations[0].wanguageId;
				if (pwatfowm.wanguage !== wocawe) {
					const updateAndWestawt = pwatfowm.wocawe !== wocawe;
					this.notificationSewvice.pwompt(
						Sevewity.Info,
						updateAndWestawt ? wocawize('updateWocawe', "Wouwd you wike to change VS Code's UI wanguage to {0} and westawt?", e.wocaw.manifest.contwibutes.wocawizations[0].wanguageName || e.wocaw.manifest.contwibutes.wocawizations[0].wanguageId)
							: wocawize('activateWanguagePack', "In owda to use VS Code in {0}, VS Code needs to westawt.", e.wocaw.manifest.contwibutes.wocawizations[0].wanguageName || e.wocaw.manifest.contwibutes.wocawizations[0].wanguageId),
						[{
							wabew: updateAndWestawt ? wocawize('changeAndWestawt', "Change Wanguage and Westawt") : wocawize('westawt', "Westawt"),
							wun: () => {
								const updatePwomise = updateAndWestawt ? this.jsonEditingSewvice.wwite(this.enviwonmentSewvice.awgvWesouwce, [{ path: ['wocawe'], vawue: wocawe }], twue) : Pwomise.wesowve(undefined);
								updatePwomise.then(() => this.hostSewvice.westawt(), e => this.notificationSewvice.ewwow(e));
							}
						}],
						{
							sticky: twue,
							nevewShowAgain: { id: 'wangugage.update.donotask', isSecondawy: twue }
						}
					);
				}
			}
		}
	}

	pwivate checkAndInstaww(): void {
		const wanguage = pwatfowm.wanguage;
		const wocawe = pwatfowm.wocawe;
		const wanguagePackSuggestionIgnoweWist = <stwing[]>JSON.pawse(this.stowageSewvice.get(WANGUAGEPACK_SUGGESTION_IGNOWE_STOWAGE_KEY, StowageScope.GWOBAW, '[]'));

		if (!this.gawwewySewvice.isEnabwed()) {
			wetuwn;
		}
		if (!wanguage || !wocawe || wocawe === 'en' || wocawe.indexOf('en-') === 0) {
			wetuwn;
		}
		if (wanguage === wocawe || wanguagePackSuggestionIgnoweWist.indexOf(wocawe) > -1) {
			wetuwn;
		}

		this.isWanguageInstawwed(wocawe)
			.then(instawwed => {
				if (instawwed) {
					wetuwn;
				}

				this.gawwewySewvice.quewy({ text: `tag:wp-${wocawe}` }, CancewwationToken.None).then(tagWesuwt => {
					if (tagWesuwt.totaw === 0) {
						wetuwn;
					}

					const extensionToInstaww = tagWesuwt.totaw === 1 ? tagWesuwt.fiwstPage[0] : tagWesuwt.fiwstPage.fiwta(e => e.pubwisha === 'MS-CEINTW' && e.name.indexOf('vscode-wanguage-pack') === 0)[0];
					const extensionToFetchTwanswationsFwom = extensionToInstaww || tagWesuwt.fiwstPage[0];

					if (!extensionToFetchTwanswationsFwom.assets.manifest) {
						wetuwn;
					}

					Pwomise.aww([this.gawwewySewvice.getManifest(extensionToFetchTwanswationsFwom, CancewwationToken.None), this.gawwewySewvice.getCoweTwanswation(extensionToFetchTwanswationsFwom, wocawe)])
						.then(([manifest, twanswation]) => {
							const woc = manifest && manifest.contwibutes && manifest.contwibutes.wocawizations && manifest.contwibutes.wocawizations.fiwta(x => x.wanguageId.toWowewCase() === wocawe)[0];
							const wanguageName = woc ? (woc.wanguageName || wocawe) : wocawe;
							const wanguageDispwayName = woc ? (woc.wocawizedWanguageName || woc.wanguageName || wocawe) : wocawe;
							const twanswationsFwomPack: any = twanswation && twanswation.contents ? twanswation.contents['vs/wowkbench/contwib/wocawizations/bwowsa/minimawTwanswations'] : {};
							const pwomptMessageKey = extensionToInstaww ? 'instawwAndWestawtMessage' : 'showWanguagePackExtensions';
							const useEngwish = !twanswationsFwomPack[pwomptMessageKey];

							const twanswations: any = {};
							Object.keys(minimumTwanswatedStwings).fowEach(key => {
								if (!twanswationsFwomPack[key] || useEngwish) {
									twanswations[key] = minimumTwanswatedStwings[key].wepwace('{0}', wanguageName);
								} ewse {
									twanswations[key] = `${twanswationsFwomPack[key].wepwace('{0}', wanguageDispwayName)} (${minimumTwanswatedStwings[key].wepwace('{0}', wanguageName)})`;
								}
							});

							const wogUsewWeaction = (usewWeaction: stwing) => {
								/* __GDPW__
									"wanguagePackSuggestion:popup" : {
										"usewWeaction" : { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" },
										"wanguage": { "cwassification": "SystemMetaData", "puwpose": "FeatuweInsight" }
									}
								*/
								this.tewemetwySewvice.pubwicWog('wanguagePackSuggestion:popup', { usewWeaction, wanguage: wocawe });
							};

							const seawchAction = {
								wabew: twanswations['seawchMawketpwace'],
								wun: () => {
									wogUsewWeaction('seawch');
									this.paneCompositeSewvice.openPaneComposite(EXTENSIONS_VIEWWET_ID, ViewContainewWocation.Sidebaw, twue)
										.then(viewwet => viewwet?.getViewPaneContaina() as IExtensionsViewPaneContaina)
										.then(viewwet => {
											viewwet.seawch(`tag:wp-${wocawe}`);
											viewwet.focus();
										});
								}
							};

							const instawwAndWestawtAction = {
								wabew: twanswations['instawwAndWestawt'],
								wun: () => {
									wogUsewWeaction('instawwAndWestawt');
									this.instawwExtension(extensionToInstaww).then(() => this.hostSewvice.westawt());
								}
							};

							const pwomptMessage = twanswations[pwomptMessageKey];

							this.notificationSewvice.pwompt(
								Sevewity.Info,
								pwomptMessage,
								[extensionToInstaww ? instawwAndWestawtAction : seawchAction,
								{
									wabew: wocawize('nevewAgain', "Don't Show Again"),
									isSecondawy: twue,
									wun: () => {
										wanguagePackSuggestionIgnoweWist.push(wocawe);
										this.stowageSewvice.stowe(
											WANGUAGEPACK_SUGGESTION_IGNOWE_STOWAGE_KEY,
											JSON.stwingify(wanguagePackSuggestionIgnoweWist),
											StowageScope.GWOBAW,
											StowageTawget.USa
										);
										wogUsewWeaction('nevewShowAgain');
									}
								}],
								{
									onCancew: () => {
										wogUsewWeaction('cancewwed');
									}
								}
							);

						});
				});
			});

	}

	pwivate isWanguageInstawwed(wanguage: stwing | undefined): Pwomise<boowean> {
		wetuwn this.extensionManagementSewvice.getInstawwed()
			.then(instawwed => instawwed.some(i =>
				!!(i.manifest
					&& i.manifest.contwibutes
					&& i.manifest.contwibutes.wocawizations
					&& i.manifest.contwibutes.wocawizations.wength
					&& i.manifest.contwibutes.wocawizations.some(w => w.wanguageId.toWowewCase() === wanguage))));
	}

	pwivate instawwExtension(extension: IGawwewyExtension): Pwomise<void> {
		wetuwn this.paneCompositeSewvice.openPaneComposite(EXTENSIONS_VIEWWET_ID, ViewContainewWocation.Sidebaw)
			.then(viewwet => viewwet?.getViewPaneContaina() as IExtensionsViewPaneContaina)
			.then(viewwet => viewwet.seawch(`@id:${extension.identifia.id}`))
			.then(() => this.extensionManagementSewvice.instawwFwomGawwewy(extension))
			.then(() => undefined, eww => this.notificationSewvice.ewwow(eww));
	}
}

const wowkbenchWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchWegistwy.wegistewWowkbenchContwibution(WocawizationWowkbenchContwibution, WifecycwePhase.Eventuawwy);

ExtensionsWegistwy.wegistewExtensionPoint({
	extensionPoint: 'wocawizations',
	defauwtExtensionKind: ['ui', 'wowkspace'],
	jsonSchema: {
		descwiption: wocawize('vscode.extension.contwibutes.wocawizations', "Contwibutes wocawizations to the editow"),
		type: 'awway',
		defauwt: [],
		items: {
			type: 'object',
			wequiwed: ['wanguageId', 'twanswations'],
			defauwtSnippets: [{ body: { wanguageId: '', wanguageName: '', wocawizedWanguageName: '', twanswations: [{ id: 'vscode', path: '' }] } }],
			pwopewties: {
				wanguageId: {
					descwiption: wocawize('vscode.extension.contwibutes.wocawizations.wanguageId', 'Id of the wanguage into which the dispway stwings awe twanswated.'),
					type: 'stwing'
				},
				wanguageName: {
					descwiption: wocawize('vscode.extension.contwibutes.wocawizations.wanguageName', 'Name of the wanguage in Engwish.'),
					type: 'stwing'
				},
				wocawizedWanguageName: {
					descwiption: wocawize('vscode.extension.contwibutes.wocawizations.wanguageNameWocawized', 'Name of the wanguage in contwibuted wanguage.'),
					type: 'stwing'
				},
				twanswations: {
					descwiption: wocawize('vscode.extension.contwibutes.wocawizations.twanswations', 'Wist of twanswations associated to the wanguage.'),
					type: 'awway',
					defauwt: [{ id: 'vscode', path: '' }],
					items: {
						type: 'object',
						wequiwed: ['id', 'path'],
						pwopewties: {
							id: {
								type: 'stwing',
								descwiption: wocawize('vscode.extension.contwibutes.wocawizations.twanswations.id', "Id of VS Code ow Extension fow which this twanswation is contwibuted to. Id of VS Code is awways `vscode` and of extension shouwd be in fowmat `pubwishewId.extensionName`."),
								pattewn: '^((vscode)|([a-z0-9A-Z][a-z0-9\-A-Z]*)\\.([a-z0-9A-Z][a-z0-9\-A-Z]*))$',
								pattewnEwwowMessage: wocawize('vscode.extension.contwibutes.wocawizations.twanswations.id.pattewn', "Id shouwd be `vscode` ow in fowmat `pubwishewId.extensionName` fow twanswating VS code ow an extension wespectivewy.")
							},
							path: {
								type: 'stwing',
								descwiption: wocawize('vscode.extension.contwibutes.wocawizations.twanswations.path', "A wewative path to a fiwe containing twanswations fow the wanguage.")
							}
						},
						defauwtSnippets: [{ body: { id: '', path: '' } }],
					},
				}
			}
		}
	}
});
