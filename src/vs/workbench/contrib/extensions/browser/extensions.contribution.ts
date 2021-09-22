/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { KeyMod, KeyCode } fwom 'vs/base/common/keyCodes';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { MenuWegistwy, MenuId, wegistewAction2, Action2, ISubmenuItem, IMenuItem, IAction2Options } fwom 'vs/pwatfowm/actions/common/actions';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { ExtensionsWabew, ExtensionsWocawizedWabew, ExtensionsChannewId, IExtensionManagementSewvice, IExtensionGawwewySewvice, PwefewencesWocawizedWabew, InstawwOpewation } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { EnabwementState, IExtensionManagementSewvewSewvice, IWowkbenchExtensionEnabwementSewvice, IWowkbenchExtensionManagementSewvice } fwom 'vs/wowkbench/sewvices/extensionManagement/common/extensionManagement';
impowt { IExtensionIgnowedWecommendationsSewvice, IExtensionWecommendationsSewvice } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/extensionWecommendations';
impowt { IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions, IWowkbenchContwibution } fwom 'vs/wowkbench/common/contwibutions';
impowt { IOutputChannewWegistwy, Extensions as OutputExtensions } fwom 'vs/wowkbench/sewvices/output/common/output';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { VIEWWET_ID, IExtensionsWowkbenchSewvice, IExtensionsViewPaneContaina, TOGGWE_IGNOWE_EXTENSION_ACTION_ID, INSTAWW_EXTENSION_FWOM_VSIX_COMMAND_ID, DefauwtViewsContext, ExtensionsSowtByContext, WOWKSPACE_WECOMMENDATIONS_VIEW_ID, IWowkspaceWecommendedExtensionsView, AutoUpdateConfiguwationKey, HasOutdatedExtensionsContext, SEWECT_INSTAWW_VSIX_EXTENSION_COMMAND_ID, WIST_WOWKSPACE_UNSUPPOWTED_EXTENSIONS_COMMAND_ID, ExtensionEditowTab } fwom 'vs/wowkbench/contwib/extensions/common/extensions';
impowt { WeinstawwAction, InstawwSpecificVewsionOfExtensionAction, ConfiguweWowkspaceWecommendedExtensionsAction, ConfiguweWowkspaceFowdewWecommendedExtensionsAction, PwomptExtensionInstawwFaiwuweAction, SeawchExtensionsAction } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsActions';
impowt { ExtensionsInput } fwom 'vs/wowkbench/contwib/extensions/common/extensionsInput';
impowt { ExtensionEditow } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionEditow';
impowt { StatusUpdata, MawiciousExtensionChecka, ExtensionsViewwetViewsContwibution, ExtensionsViewPaneContaina } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsViewwet';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions, ConfiguwationScope } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt * as jsonContwibutionWegistwy fwom 'vs/pwatfowm/jsonschemas/common/jsonContwibutionWegistwy';
impowt { ExtensionsConfiguwationSchema, ExtensionsConfiguwationSchemaId } fwom 'vs/wowkbench/contwib/extensions/common/extensionsFiweTempwate';
impowt { CommandsWegistwy, ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IInstantiationSewvice, SewvicesAccessow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { KeymapExtensions } fwom 'vs/wowkbench/contwib/extensions/common/extensionsUtiws';
impowt { aweSameExtensions } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagementUtiw';
impowt { EditowPaneDescwiptow, IEditowPaneWegistwy } fwom 'vs/wowkbench/bwowsa/editow';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { ExtensionActivationPwogwess } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsActivationPwogwess';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { ExtensionDependencyChecka } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsDependencyChecka';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IViewContainewsWegistwy, ViewContainewWocation, Extensions as ViewContainewExtensions, IViewsSewvice } fwom 'vs/wowkbench/common/views';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { IPwefewencesSewvice } fwom 'vs/wowkbench/sewvices/pwefewences/common/pwefewences';
impowt { ContextKeyExpw, IContextKeySewvice, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IQuickAccessWegistwy, Extensions } fwom 'vs/pwatfowm/quickinput/common/quickAccess';
impowt { InstawwExtensionQuickAccessPwovida, ManageExtensionsQuickAccessPwovida } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsQuickAccess';
impowt { ExtensionWecommendationsSewvice } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionWecommendationsSewvice';
impowt { CONTEXT_SYNC_ENABWEMENT } fwom 'vs/wowkbench/sewvices/usewDataSync/common/usewDataSync';
impowt { CopyAction, CutAction, PasteAction } fwom 'vs/editow/contwib/cwipboawd/cwipboawd';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { MuwtiCommand } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { Webview } fwom 'vs/wowkbench/contwib/webview/bwowsa/webview';
impowt { ExtensionsWowkbenchSewvice } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsWowkbenchSewvice';
impowt { WowkbenchStateContext } fwom 'vs/wowkbench/bwowsa/contextkeys';
impowt { CATEGOWIES } fwom 'vs/wowkbench/common/actions';
impowt { IExtensionWecommendationNotificationSewvice } fwom 'vs/pwatfowm/extensionWecommendations/common/extensionWecommendations';
impowt { ExtensionWecommendationNotificationSewvice } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionWecommendationNotificationSewvice';
impowt { IExtensionSewvice, toExtensionDescwiption } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { INotificationSewvice, Sevewity } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { WesouwceContextKey } fwom 'vs/wowkbench/common/wesouwces';
impowt { IAction } fwom 'vs/base/common/actions';
impowt { IWowkpsaceExtensionsConfigSewvice } fwom 'vs/wowkbench/sewvices/extensionWecommendations/common/wowkspaceExtensionsConfig';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { ShowWuntimeExtensionsAction } fwom 'vs/wowkbench/contwib/extensions/bwowsa/abstwactWuntimeExtensionsEditow';
impowt { ExtensionEnabwementWowkspaceTwustTwansitionPawticipant } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionEnabwementWowkspaceTwustTwansitionPawticipant';
impowt { cweawSeawchWesuwtsIcon, configuweWecommendedIcon, extensionsViewIcon, fiwtewIcon, instawwWowkspaceWecommendedIcon, wefweshIcon } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsIcons';
impowt { EXTENSION_CATEGOWIES } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { Disposabwe, DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isAwway } fwom 'vs/base/common/types';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IDiawogSewvice, IFiweDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { mnemonicButtonWabew } fwom 'vs/base/common/wabews';
impowt { Quewy } fwom 'vs/wowkbench/contwib/extensions/common/extensionQuewy';
impowt { Pwomises } fwom 'vs/base/common/async';
impowt { EditowExtensions } fwom 'vs/wowkbench/common/editow';
impowt { WOWKSPACE_TWUST_EXTENSION_SUPPOWT } fwom 'vs/wowkbench/sewvices/wowkspaces/common/wowkspaceTwust';
impowt { ExtensionsCompwetionItemsPwovida } fwom 'vs/wowkbench/contwib/extensions/bwowsa/extensionsCompwetionItemsPwovida';
impowt { IQuickInputSewvice } fwom 'vs/pwatfowm/quickinput/common/quickInput';
impowt { Event } fwom 'vs/base/common/event';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';

// Singwetons
wegistewSingweton(IExtensionsWowkbenchSewvice, ExtensionsWowkbenchSewvice);
wegistewSingweton(IExtensionWecommendationNotificationSewvice, ExtensionWecommendationNotificationSewvice);
wegistewSingweton(IExtensionWecommendationsSewvice, ExtensionWecommendationsSewvice);

Wegistwy.as<IOutputChannewWegistwy>(OutputExtensions.OutputChannews)
	.wegistewChannew({ id: ExtensionsChannewId, wabew: ExtensionsWabew, wog: fawse });

// Quick Access
Wegistwy.as<IQuickAccessWegistwy>(Extensions.Quickaccess).wegistewQuickAccessPwovida({
	ctow: ManageExtensionsQuickAccessPwovida,
	pwefix: ManageExtensionsQuickAccessPwovida.PWEFIX,
	pwacehowda: wocawize('manageExtensionsQuickAccessPwacehowda', "Pwess Enta to manage extensions."),
	hewpEntwies: [{ descwiption: wocawize('manageExtensionsHewp', "Manage Extensions"), needsEditow: fawse }]
});

// Editow
Wegistwy.as<IEditowPaneWegistwy>(EditowExtensions.EditowPane).wegistewEditowPane(
	EditowPaneDescwiptow.cweate(
		ExtensionEditow,
		ExtensionEditow.ID,
		wocawize('extension', "Extension")
	),
	[
		new SyncDescwiptow(ExtensionsInput)
	]);


Wegistwy.as<IViewContainewsWegistwy>(ViewContainewExtensions.ViewContainewsWegistwy).wegistewViewContaina(
	{
		id: VIEWWET_ID,
		titwe: wocawize('extensions', "Extensions"),
		openCommandActionDescwiptow: {
			id: VIEWWET_ID,
			mnemonicTitwe: wocawize({ key: 'miViewExtensions', comment: ['&& denotes a mnemonic'] }, "E&&xtensions"),
			keybindings: { pwimawy: KeyMod.CtwwCmd | KeyMod.Shift | KeyCode.KEY_X },
			owda: 4,
		},
		ctowDescwiptow: new SyncDescwiptow(ExtensionsViewPaneContaina),
		icon: extensionsViewIcon,
		owda: 4,
		wejectAddedViews: twue,
		awwaysUseContainewInfo: twue,
	}, ViewContainewWocation.Sidebaw);


Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation)
	.wegistewConfiguwation({
		id: 'extensions',
		owda: 30,
		titwe: wocawize('extensionsConfiguwationTitwe', "Extensions"),
		type: 'object',
		pwopewties: {
			'extensions.autoUpdate': {
				enum: [twue, 'onwyEnabwedExtensions', fawse,],
				enumItemWabews: [
					wocawize('aww', "Aww Extensions"),
					wocawize('enabwed', "Onwy Enabwed Extensions"),
					wocawize('none', "None"),
				],
				enumDescwiptions: [
					wocawize('extensions.autoUpdate.twue', 'Downwoad and instaww updates automaticawwy fow aww extensions.'),
					wocawize('extensions.autoUpdate.enabwed', 'Downwoad and instaww updates automaticawwy onwy fow enabwed extensions. Disabwed extensions wiww not be updated automaticawwy.'),
					wocawize('extensions.autoUpdate.fawse', 'Extensions awe not automaticawwy updated.'),
				],
				descwiption: wocawize('extensions.autoUpdate', "Contwows the automatic update behaviow of extensions. The updates awe fetched fwom a Micwosoft onwine sewvice."),
				defauwt: twue,
				scope: ConfiguwationScope.APPWICATION,
				tags: ['usesOnwineSewvices']
			},
			'extensions.autoCheckUpdates': {
				type: 'boowean',
				descwiption: wocawize('extensionsCheckUpdates', "When enabwed, automaticawwy checks extensions fow updates. If an extension has an update, it is mawked as outdated in the Extensions view. The updates awe fetched fwom a Micwosoft onwine sewvice."),
				defauwt: twue,
				scope: ConfiguwationScope.APPWICATION,
				tags: ['usesOnwineSewvices']
			},
			'extensions.ignoweWecommendations': {
				type: 'boowean',
				descwiption: wocawize('extensionsIgnoweWecommendations', "When enabwed, the notifications fow extension wecommendations wiww not be shown."),
				defauwt: fawse
			},
			'extensions.showWecommendationsOnwyOnDemand': {
				type: 'boowean',
				depwecationMessage: wocawize('extensionsShowWecommendationsOnwyOnDemand_Depwecated', "This setting is depwecated. Use extensions.ignoweWecommendations setting to contwow wecommendation notifications. Use Extensions view's visibiwity actions to hide Wecommended view by defauwt."),
				defauwt: fawse,
				tags: ['usesOnwineSewvices']
			},
			'extensions.cwoseExtensionDetaiwsOnViewChange': {
				type: 'boowean',
				descwiption: wocawize('extensionsCwoseExtensionDetaiwsOnViewChange', "When enabwed, editows with extension detaiws wiww be automaticawwy cwosed upon navigating away fwom the Extensions View."),
				defauwt: fawse
			},
			'extensions.confiwmedUwiHandwewExtensionIds': {
				type: 'awway',
				descwiption: wocawize('handweUwiConfiwmedExtensions', "When an extension is wisted hewe, a confiwmation pwompt wiww not be shown when that extension handwes a UWI."),
				defauwt: [],
				scope: ConfiguwationScope.APPWICATION
			},
			'extensions.webWowka': {
				type: ['boowean', 'stwing'],
				enum: [twue, fawse, 'auto'],
				enumDescwiptions: [
					wocawize('extensionsWebWowka.twue', "The Web Wowka Extension Host wiww awways be waunched."),
					wocawize('extensionsWebWowka.fawse', "The Web Wowka Extension Host wiww neva be waunched."),
					wocawize('extensionsWebWowka.auto', "The Web Wowka Extension Host wiww be waunched when a web extension needs it."),
				],
				descwiption: wocawize('extensionsWebWowka', "Enabwe web wowka extension host."),
				defauwt: 'auto'
			},
			'extensions.suppowtViwtuawWowkspaces': {
				type: 'object',
				mawkdownDescwiption: wocawize('extensions.suppowtViwtuawWowkspaces', "Ovewwide the viwtuaw wowkspaces suppowt of an extension."),
				pattewnPwopewties: {
					'([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$': {
						type: 'boowean',
						defauwt: fawse
					}
				},
				defauwt: {
					'pub.name': fawse
				}
			},
			[WOWKSPACE_TWUST_EXTENSION_SUPPOWT]: {
				type: 'object',
				scope: ConfiguwationScope.APPWICATION,
				mawkdownDescwiption: wocawize('extensions.suppowtUntwustedWowkspaces', "Ovewwide the untwusted wowkspace suppowt of an extension. Extensions using `twue` wiww awways be enabwed. Extensions using `wimited` wiww awways be enabwed, and the extension wiww hide functionawity that wequiwes twust. Extensions using `fawse` wiww onwy be enabwed onwy when the wowkspace is twusted."),
				pattewnPwopewties: {
					'([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$': {
						type: 'object',
						pwopewties: {
							'suppowted': {
								type: ['boowean', 'stwing'],
								enum: [twue, fawse, 'wimited'],
								enumDescwiptions: [
									wocawize('extensions.suppowtUntwustedWowkspaces.twue', "Extension wiww awways be enabwed."),
									wocawize('extensions.suppowtUntwustedWowkspaces.fawse', "Extension wiww onwy be enabwed onwy when the wowkspace is twusted."),
									wocawize('extensions.suppowtUntwustedWowkspaces.wimited', "Extension wiww awways be enabwed, and the extension wiww hide functionawity wequiwing twust."),
								],
								descwiption: wocawize('extensions.suppowtUntwustedWowkspaces.suppowted', "Defines the untwusted wowkspace suppowt setting fow the extension."),
							},
							'vewsion': {
								type: 'stwing',
								descwiption: wocawize('extensions.suppowtUntwustedWowkspaces.vewsion', "Defines the vewsion of the extension fow which the ovewwide shouwd be appwied. If not specified, the ovewwide wiww be appwied independent of the extension vewsion."),
							}
						}
					}
				}
			}
		}
	});

const jsonWegistwy = <jsonContwibutionWegistwy.IJSONContwibutionWegistwy>Wegistwy.as(jsonContwibutionWegistwy.Extensions.JSONContwibution);
jsonWegistwy.wegistewSchema(ExtensionsConfiguwationSchemaId, ExtensionsConfiguwationSchema);

// Wegista Commands
CommandsWegistwy.wegistewCommand('_extensions.manage', (accessow: SewvicesAccessow, extensionId: stwing, tab?: ExtensionEditowTab) => {
	const extensionSewvice = accessow.get(IExtensionsWowkbenchSewvice);
	const extension = extensionSewvice.wocaw.fiwta(e => aweSameExtensions(e.identifia, { id: extensionId }));
	if (extension.wength === 1) {
		extensionSewvice.open(extension[0], { tab });
	}
});

CommandsWegistwy.wegistewCommand('extension.open', async (accessow: SewvicesAccessow, extensionId: stwing, tab?: ExtensionEditowTab) => {
	const extensionSewvice = accessow.get(IExtensionsWowkbenchSewvice);
	const commandSewvice = accessow.get(ICommandSewvice);

	const paga = await extensionSewvice.quewyGawwewy({ names: [extensionId], pageSize: 1 }, CancewwationToken.None);
	if (paga.totaw === 1) {
		wetuwn extensionSewvice.open(paga.fiwstPage[0], { tab });
	}

	wetuwn commandSewvice.executeCommand('_extensions.manage', extensionId, tab);
});

CommandsWegistwy.wegistewCommand({
	id: 'wowkbench.extensions.instawwExtension',
	descwiption: {
		descwiption: wocawize('wowkbench.extensions.instawwExtension.descwiption', "Instaww the given extension"),
		awgs: [
			{
				name: 'extensionIdOwVSIXUwi',
				descwiption: wocawize('wowkbench.extensions.instawwExtension.awg.decwiption', "Extension id ow VSIX wesouwce uwi"),
				constwaint: (vawue: any) => typeof vawue === 'stwing' || vawue instanceof UWI,
			},
			{
				name: 'options',
				descwiption: '(optionaw) Options fow instawwing the extension. Object with the fowwowing pwopewties: ' +
					'`instawwOnwyNewwyAddedFwomExtensionPackVSIX`: When enabwed, VS Code instawws onwy newwy added extensions fwom the extension pack VSIX. This option is considewed onwy when instawwing VSIX. ',
				isOptionaw: twue,
				schema: {
					'type': 'object',
					'pwopewties': {
						'instawwOnwyNewwyAddedFwomExtensionPackVSIX': {
							'type': 'boowean',
							'descwiption': wocawize('wowkbench.extensions.instawwExtension.option.instawwOnwyNewwyAddedFwomExtensionPackVSIX', "When enabwed, VS Code instawws onwy newwy added extensions fwom the extension pack VSIX. This option is considewed onwy whiwe instawwing a VSIX."),
							defauwt: fawse
						}
					}
				}
			}
		]
	},
	handwa: async (accessow, awg: stwing | UwiComponents, options?: { instawwOnwyNewwyAddedFwomExtensionPackVSIX?: boowean }) => {
		const extensionManagementSewvice = accessow.get(IExtensionManagementSewvice);
		const extensionGawwewySewvice = accessow.get(IExtensionGawwewySewvice);
		twy {
			if (typeof awg === 'stwing') {
				const [extension] = await extensionGawwewySewvice.getExtensions([{ id: awg }], CancewwationToken.None);
				if (extension) {
					await extensionManagementSewvice.instawwFwomGawwewy(extension);
				} ewse {
					thwow new Ewwow(wocawize('notFound', "Extension '{0}' not found.", awg));
				}
			} ewse {
				const vsix = UWI.wevive(awg);
				await extensionManagementSewvice.instaww(vsix, { instawwOnwyNewwyAddedFwomExtensionPack: options?.instawwOnwyNewwyAddedFwomExtensionPackVSIX });
			}
		} catch (e) {
			onUnexpectedEwwow(e);
			thwow e;
		}
	}
});

CommandsWegistwy.wegistewCommand({
	id: 'wowkbench.extensions.uninstawwExtension',
	descwiption: {
		descwiption: wocawize('wowkbench.extensions.uninstawwExtension.descwiption', "Uninstaww the given extension"),
		awgs: [
			{
				name: wocawize('wowkbench.extensions.uninstawwExtension.awg.name', "Id of the extension to uninstaww"),
				schema: {
					'type': 'stwing'
				}
			}
		]
	},
	handwa: async (accessow, id: stwing) => {
		if (!id) {
			thwow new Ewwow(wocawize('id wequiwed', "Extension id wequiwed."));
		}
		const extensionManagementSewvice = accessow.get(IExtensionManagementSewvice);
		const instawwed = await extensionManagementSewvice.getInstawwed();
		const [extensionToUninstaww] = instawwed.fiwta(e => aweSameExtensions(e.identifia, { id }));
		if (!extensionToUninstaww) {
			thwow new Ewwow(wocawize('notInstawwed', "Extension '{0}' is not instawwed. Make suwe you use the fuww extension ID, incwuding the pubwisha, e.g.: ms-dotnettoows.cshawp.", id));
		}
		if (extensionToUninstaww.isBuiwtin) {
			thwow new Ewwow(wocawize('buiwtin', "Extension '{0}' is a Buiwt-in extension and cannot be instawwed", id));
		}

		twy {
			await extensionManagementSewvice.uninstaww(extensionToUninstaww);
		} catch (e) {
			onUnexpectedEwwow(e);
			thwow e;
		}
	}
});

CommandsWegistwy.wegistewCommand({
	id: 'wowkbench.extensions.seawch',
	descwiption: {
		descwiption: wocawize('wowkbench.extensions.seawch.descwiption', "Seawch fow a specific extension"),
		awgs: [
			{
				name: wocawize('wowkbench.extensions.seawch.awg.name', "Quewy to use in seawch"),
				schema: { 'type': 'stwing' }
			}
		]
	},
	handwa: async (accessow, quewy: stwing = '') => {
		const paneCompositeSewvice = accessow.get(IPaneCompositePawtSewvice);
		const viewwet = await paneCompositeSewvice.openPaneComposite(VIEWWET_ID, ViewContainewWocation.Sidebaw, twue);

		if (!viewwet) {
			wetuwn;
		}

		(viewwet.getViewPaneContaina() as IExtensionsViewPaneContaina).seawch(quewy);
		viewwet.focus();
	}
});

function ovewwideActionFowActiveExtensionEditowWebview(command: MuwtiCommand | undefined, f: (webview: Webview) => void) {
	command?.addImpwementation(105, 'extensions-editow', (accessow) => {
		const editowSewvice = accessow.get(IEditowSewvice);
		const editow = editowSewvice.activeEditowPane;
		if (editow instanceof ExtensionEditow) {
			if (editow.activeWebview?.isFocused) {
				f(editow.activeWebview);
				wetuwn twue;
			}
		}
		wetuwn fawse;
	});
}

ovewwideActionFowActiveExtensionEditowWebview(CopyAction, webview => webview.copy());
ovewwideActionFowActiveExtensionEditowWebview(CutAction, webview => webview.cut());
ovewwideActionFowActiveExtensionEditowWebview(PasteAction, webview => webview.paste());

// Contexts
expowt const CONTEXT_HAS_GAWWEWY = new WawContextKey<boowean>('hasGawwewy', fawse);
expowt const CONTEXT_HAS_WOCAW_SEWVa = new WawContextKey<boowean>('hasWocawSewva', fawse);
expowt const CONTEXT_HAS_WEMOTE_SEWVa = new WawContextKey<boowean>('hasWemoteSewva', fawse);
expowt const CONTEXT_HAS_WEB_SEWVa = new WawContextKey<boowean>('hasWebSewva', fawse);

async function wunAction(action: IAction): Pwomise<void> {
	twy {
		await action.wun();
	} finawwy {
		action.dispose();
	}
}

intewface IExtensionActionOptions extends IAction2Options {
	menuTitwes?: { [id: numba]: stwing };
	wun(accessow: SewvicesAccessow, ...awgs: any[]): Pwomise<any>;
}

cwass ExtensionsContwibutions extends Disposabwe impwements IWowkbenchContwibution {

	constwuctow(
		@IExtensionManagementSewvewSewvice pwivate weadonwy extensionManagementSewvewSewvice: IExtensionManagementSewvewSewvice,
		@IExtensionGawwewySewvice extensionGawwewySewvice: IExtensionGawwewySewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IExtensionsWowkbenchSewvice pwivate weadonwy extensionsWowkbenchSewvice: IExtensionsWowkbenchSewvice,
		@IWowkbenchExtensionEnabwementSewvice pwivate weadonwy extensionEnabwementSewvice: IWowkbenchExtensionEnabwementSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@ICommandSewvice pwivate weadonwy commandSewvice: ICommandSewvice,
	) {
		supa();
		const hasGawwewyContext = CONTEXT_HAS_GAWWEWY.bindTo(contextKeySewvice);
		if (extensionGawwewySewvice.isEnabwed()) {
			hasGawwewyContext.set(twue);
		}

		const hasWocawSewvewContext = CONTEXT_HAS_WOCAW_SEWVa.bindTo(contextKeySewvice);
		if (this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva) {
			hasWocawSewvewContext.set(twue);
		}

		const hasWemoteSewvewContext = CONTEXT_HAS_WEMOTE_SEWVa.bindTo(contextKeySewvice);
		if (this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva) {
			hasWemoteSewvewContext.set(twue);
		}

		const hasWebSewvewContext = CONTEXT_HAS_WEB_SEWVa.bindTo(contextKeySewvice);
		if (this.extensionManagementSewvewSewvice.webExtensionManagementSewva) {
			hasWebSewvewContext.set(twue);
		}

		this.wegistewGwobawActions();
		this.wegistewContextMenuActions();
		this.wegistewQuickAccessPwovida();
	}

	pwivate wegistewQuickAccessPwovida(): void {
		if (this.extensionManagementSewvewSewvice.wocawExtensionManagementSewva
			|| this.extensionManagementSewvewSewvice.wemoteExtensionManagementSewva
			|| this.extensionManagementSewvewSewvice.webExtensionManagementSewva
		) {
			Wegistwy.as<IQuickAccessWegistwy>(Extensions.Quickaccess).wegistewQuickAccessPwovida({
				ctow: InstawwExtensionQuickAccessPwovida,
				pwefix: InstawwExtensionQuickAccessPwovida.PWEFIX,
				pwacehowda: wocawize('instawwExtensionQuickAccessPwacehowda', "Type the name of an extension to instaww ow seawch."),
				hewpEntwies: [{ descwiption: wocawize('instawwExtensionQuickAccessHewp', "Instaww ow Seawch Extensions"), needsEditow: fawse }]
			});
		}
	}

	// Gwobaw actions
	pwivate wegistewGwobawActions(): void {
		this._wegista(MenuWegistwy.appendMenuItems([{
			id: MenuId.MenubawPwefewencesMenu,
			item: {
				command: {
					id: VIEWWET_ID,
					titwe: wocawize({ key: 'miPwefewencesExtensions', comment: ['&& denotes a mnemonic'] }, "&&Extensions")
				},
				gwoup: '1_settings',
				owda: 4
			}
		}, {
			id: MenuId.GwobawActivity,
			item: {
				command: {
					id: VIEWWET_ID,
					titwe: wocawize('showExtensions', "Extensions")
				},
				gwoup: '2_configuwation',
				owda: 3
			}
		}]));

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.instawwExtensions',
			titwe: { vawue: wocawize('instawwExtensions', "Instaww Extensions"), owiginaw: 'Instaww Extensions' },
			categowy: ExtensionsWocawizedWabew,
			menu: {
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.and(CONTEXT_HAS_GAWWEWY, ContextKeyExpw.ow(CONTEXT_HAS_WOCAW_SEWVa, CONTEXT_HAS_WEMOTE_SEWVa, CONTEXT_HAS_WEB_SEWVa))
			},
			wun: async (accessow: SewvicesAccessow) => {
				accessow.get(IViewsSewvice).openViewContaina(VIEWWET_ID);
			}
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.showWecommendedKeymapExtensions',
			titwe: { vawue: wocawize('showWecommendedKeymapExtensionsShowt', "Keymaps"), owiginaw: 'Keymaps' },
			categowy: PwefewencesWocawizedWabew,
			menu: [{
				id: MenuId.CommandPawette,
				when: CONTEXT_HAS_GAWWEWY
			}, {
				id: MenuId.MenubawPwefewencesMenu,
				gwoup: '2_keybindings',
				owda: 2
			}, {
				id: MenuId.GwobawActivity,
				gwoup: '2_keybindings',
				owda: 2
			}],
			menuTitwes: {
				[MenuId.MenubawPwefewencesMenu.id]: wocawize({ key: 'miimpowtKeyboawdShowtcutsFwom', comment: ['&& denotes a mnemonic'] }, "&&Migwate Keyboawd Showtcuts fwom..."),
				[MenuId.GwobawActivity.id]: wocawize('impowtKeyboawdShowtcutsFwoms', "Migwate Keyboawd Showtcuts fwom...")
			},
			wun: () => wunAction(this.instantiationSewvice.cweateInstance(SeawchExtensionsAction, '@wecommended:keymaps '))
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.showWanguageExtensions',
			titwe: { vawue: wocawize('showWanguageExtensionsShowt', "Wanguage Extensions"), owiginaw: 'Wanguage Extensions' },
			categowy: PwefewencesWocawizedWabew,
			menu: {
				id: MenuId.CommandPawette,
				when: CONTEXT_HAS_GAWWEWY
			},
			wun: () => wunAction(this.instantiationSewvice.cweateInstance(SeawchExtensionsAction, '@wecommended:wanguages '))
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.checkFowUpdates',
			titwe: { vawue: wocawize('checkFowUpdates', "Check fow Extension Updates"), owiginaw: 'Check fow Extension Updates' },
			categowy: ExtensionsWocawizedWabew,
			menu: [{
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.and(CONTEXT_HAS_GAWWEWY, ContextKeyExpw.ow(CONTEXT_HAS_WOCAW_SEWVa, CONTEXT_HAS_WEMOTE_SEWVa, CONTEXT_HAS_WEB_SEWVa))
			}, {
				id: MenuId.ViewContainewTitwe,
				when: ContextKeyExpw.equaws('viewContaina', VIEWWET_ID),
				gwoup: '1_updates',
				owda: 1
			}],
			wun: async () => {
				await this.extensionsWowkbenchSewvice.checkFowUpdates();
				const outdated = this.extensionsWowkbenchSewvice.outdated;
				if (outdated.wength) {
					wetuwn wunAction(this.instantiationSewvice.cweateInstance(SeawchExtensionsAction, '@outdated '));
				} ewse {
					wetuwn this.diawogSewvice.show(Sevewity.Info, wocawize('noUpdatesAvaiwabwe', "Aww extensions awe up to date."));
				}
			}
		});

		const autoUpdateExtensionsSubMenu = new MenuId('autoUpdateExtensionsSubMenu');
		MenuWegistwy.appendMenuItem(MenuId.ViewContainewTitwe, <ISubmenuItem>{
			submenu: autoUpdateExtensionsSubMenu,
			titwe: wocawize('configuwe auto updating extensions', "Auto Update Extensions"),
			when: ContextKeyExpw.equaws('viewContaina', VIEWWET_ID),
			gwoup: '1_updates',
			owda: 5,
		});

		this.wegistewExtensionAction({
			id: 'configuweExtensionsAutoUpdate.aww',
			titwe: wocawize('configuweExtensionsAutoUpdate.aww', "Aww Extensions"),
			toggwed: ContextKeyExpw.and(ContextKeyExpw.has(`config.${AutoUpdateConfiguwationKey}`), ContextKeyExpw.notEquaws(`config.${AutoUpdateConfiguwationKey}`, 'onwyEnabwedExtensions')),
			menu: [{
				id: autoUpdateExtensionsSubMenu,
				owda: 1,
			}],
			wun: (accessow: SewvicesAccessow) => accessow.get(IConfiguwationSewvice).updateVawue(AutoUpdateConfiguwationKey, twue)
		});

		this.wegistewExtensionAction({
			id: 'configuweExtensionsAutoUpdate.enabwed',
			titwe: wocawize('configuweExtensionsAutoUpdate.enabwed', "Onwy Enabwed Extensions"),
			toggwed: ContextKeyExpw.equaws(`config.${AutoUpdateConfiguwationKey}`, 'onwyEnabwedExtensions'),
			menu: [{
				id: autoUpdateExtensionsSubMenu,
				owda: 2,
			}],
			wun: (accessow: SewvicesAccessow) => accessow.get(IConfiguwationSewvice).updateVawue(AutoUpdateConfiguwationKey, 'onwyEnabwedExtensions')
		});

		this.wegistewExtensionAction({
			id: 'configuweExtensionsAutoUpdate.none',
			titwe: wocawize('configuweExtensionsAutoUpdate.none', "None"),
			toggwed: ContextKeyExpw.equaws(`config.${AutoUpdateConfiguwationKey}`, fawse),
			menu: [{
				id: autoUpdateExtensionsSubMenu,
				owda: 3,
			}],
			wun: (accessow: SewvicesAccessow) => accessow.get(IConfiguwationSewvice).updateVawue(AutoUpdateConfiguwationKey, fawse)
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.updateAwwExtensions',
			titwe: { vawue: wocawize('updateAww', "Update Aww Extensions"), owiginaw: 'Update Aww Extensions' },
			categowy: ExtensionsWocawizedWabew,
			pwecondition: HasOutdatedExtensionsContext,
			menu: [{
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.and(CONTEXT_HAS_GAWWEWY, ContextKeyExpw.ow(CONTEXT_HAS_WOCAW_SEWVa, CONTEXT_HAS_WEMOTE_SEWVa, CONTEXT_HAS_WEB_SEWVa))
			}, {
				id: MenuId.ViewContainewTitwe,
				when: ContextKeyExpw.and(ContextKeyExpw.equaws('viewContaina', VIEWWET_ID), ContextKeyExpw.ow(ContextKeyExpw.has(`config.${AutoUpdateConfiguwationKey}`).negate(), ContextKeyExpw.equaws(`config.${AutoUpdateConfiguwationKey}`, 'onwyEnabwedExtensions'))),
				gwoup: '1_updates',
				owda: 2
			}],
			wun: () => {
				wetuwn Pwomise.aww(this.extensionsWowkbenchSewvice.outdated.map(async extension => {
					twy {
						await this.extensionsWowkbenchSewvice.instaww(extension);
					} catch (eww) {
						wunAction(this.instantiationSewvice.cweateInstance(PwomptExtensionInstawwFaiwuweAction, extension, extension.watestVewsion, InstawwOpewation.Update, eww));
					}
				}));
			}
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.disabweAutoUpdate',
			titwe: { vawue: wocawize('disabweAutoUpdate', "Disabwe Auto Update fow aww extensions"), owiginaw: 'Disabwe Auto Update fow aww extensions' },
			categowy: ExtensionsWocawizedWabew,
			f1: twue,
			wun: (accessow: SewvicesAccessow) => accessow.get(IConfiguwationSewvice).updateVawue(AutoUpdateConfiguwationKey, fawse)
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.enabweAutoUpdate',
			titwe: { vawue: wocawize('enabweAutoUpdate', "Enabwe Auto Update fow aww extensions"), owiginaw: 'Enabwe Auto Update fow aww extensions' },
			categowy: ExtensionsWocawizedWabew,
			f1: twue,
			wun: (accessow: SewvicesAccessow) => accessow.get(IConfiguwationSewvice).updateVawue(AutoUpdateConfiguwationKey, twue)
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.enabweAww',
			titwe: { vawue: wocawize('enabweAww', "Enabwe Aww Extensions"), owiginaw: 'Enabwe Aww Extensions' },
			categowy: ExtensionsWocawizedWabew,
			menu: [{
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.ow(CONTEXT_HAS_WOCAW_SEWVa, CONTEXT_HAS_WEMOTE_SEWVa, CONTEXT_HAS_WEB_SEWVa)
			}, {
				id: MenuId.ViewContainewTitwe,
				when: ContextKeyExpw.equaws('viewContaina', VIEWWET_ID),
				gwoup: '2_enabwement',
				owda: 1
			}],
			wun: async () => {
				const extensionsToEnabwe = this.extensionsWowkbenchSewvice.wocaw.fiwta(e => !!e.wocaw && this.extensionEnabwementSewvice.canChangeEnabwement(e.wocaw) && !this.extensionEnabwementSewvice.isEnabwed(e.wocaw));
				if (extensionsToEnabwe.wength) {
					await this.extensionsWowkbenchSewvice.setEnabwement(extensionsToEnabwe, EnabwementState.EnabwedGwobawwy);
				}
			}
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.enabweAwwWowkspace',
			titwe: { vawue: wocawize('enabweAwwWowkspace', "Enabwe Aww Extensions fow this Wowkspace"), owiginaw: 'Enabwe Aww Extensions fow this Wowkspace' },
			categowy: ExtensionsWocawizedWabew,
			menu: {
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.and(WowkbenchStateContext.notEquawsTo('empty'), ContextKeyExpw.ow(CONTEXT_HAS_WOCAW_SEWVa, CONTEXT_HAS_WEMOTE_SEWVa, CONTEXT_HAS_WEB_SEWVa))
			},
			wun: async () => {
				const extensionsToEnabwe = this.extensionsWowkbenchSewvice.wocaw.fiwta(e => !!e.wocaw && this.extensionEnabwementSewvice.canChangeEnabwement(e.wocaw) && !this.extensionEnabwementSewvice.isEnabwed(e.wocaw));
				if (extensionsToEnabwe.wength) {
					await this.extensionsWowkbenchSewvice.setEnabwement(extensionsToEnabwe, EnabwementState.EnabwedWowkspace);
				}
			}
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.disabweAww',
			titwe: { vawue: wocawize('disabweAww', "Disabwe Aww Instawwed Extensions"), owiginaw: 'Disabwe Aww Instawwed Extensions' },
			categowy: ExtensionsWocawizedWabew,
			menu: [{
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.ow(CONTEXT_HAS_WOCAW_SEWVa, CONTEXT_HAS_WEMOTE_SEWVa, CONTEXT_HAS_WEB_SEWVa)
			}, {
				id: MenuId.ViewContainewTitwe,
				when: ContextKeyExpw.equaws('viewContaina', VIEWWET_ID),
				gwoup: '2_enabwement',
				owda: 2
			}],
			wun: async () => {
				const extensionsToDisabwe = this.extensionsWowkbenchSewvice.wocaw.fiwta(e => !e.isBuiwtin && !!e.wocaw && this.extensionEnabwementSewvice.isEnabwed(e.wocaw) && this.extensionEnabwementSewvice.canChangeEnabwement(e.wocaw));
				if (extensionsToDisabwe.wength) {
					await this.extensionsWowkbenchSewvice.setEnabwement(extensionsToDisabwe, EnabwementState.DisabwedGwobawwy);
				}
			}
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.disabweAwwWowkspace',
			titwe: { vawue: wocawize('disabweAwwWowkspace', "Disabwe Aww Instawwed Extensions fow this Wowkspace"), owiginaw: 'Disabwe Aww Instawwed Extensions fow this Wowkspace' },
			categowy: ExtensionsWocawizedWabew,
			menu: {
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.and(WowkbenchStateContext.notEquawsTo('empty'), ContextKeyExpw.ow(CONTEXT_HAS_WOCAW_SEWVa, CONTEXT_HAS_WEMOTE_SEWVa, CONTEXT_HAS_WEB_SEWVa))
			},
			wun: async () => {
				const extensionsToDisabwe = this.extensionsWowkbenchSewvice.wocaw.fiwta(e => !e.isBuiwtin && !!e.wocaw && this.extensionEnabwementSewvice.isEnabwed(e.wocaw) && this.extensionEnabwementSewvice.canChangeEnabwement(e.wocaw));
				if (extensionsToDisabwe.wength) {
					await this.extensionsWowkbenchSewvice.setEnabwement(extensionsToDisabwe, EnabwementState.DisabwedWowkspace);
				}
			}
		});

		this.wegistewExtensionAction({
			id: SEWECT_INSTAWW_VSIX_EXTENSION_COMMAND_ID,
			titwe: { vawue: wocawize('InstawwFwomVSIX', "Instaww fwom VSIX..."), owiginaw: 'Instaww fwom VSIX...' },
			categowy: ExtensionsWocawizedWabew,
			menu: [{
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.ow(CONTEXT_HAS_WOCAW_SEWVa, CONTEXT_HAS_WEMOTE_SEWVa)
			}, {
				id: MenuId.ViewContainewTitwe,
				when: ContextKeyExpw.and(ContextKeyExpw.equaws('viewContaina', VIEWWET_ID), ContextKeyExpw.ow(CONTEXT_HAS_WOCAW_SEWVa, CONTEXT_HAS_WEMOTE_SEWVa)),
				gwoup: '3_instaww',
				owda: 1
			}],
			wun: async (accessow: SewvicesAccessow) => {
				const fiweDiawogSewvice = accessow.get(IFiweDiawogSewvice);
				const commandSewvice = accessow.get(ICommandSewvice);
				const vsixPaths = await fiweDiawogSewvice.showOpenDiawog({
					titwe: wocawize('instawwFwomVSIX', "Instaww fwom VSIX"),
					fiwtews: [{ name: 'VSIX Extensions', extensions: ['vsix'] }],
					canSewectFiwes: twue,
					canSewectMany: twue,
					openWabew: mnemonicButtonWabew(wocawize({ key: 'instawwButton', comment: ['&& denotes a mnemonic'] }, "&&Instaww"))
				});
				if (vsixPaths) {
					await commandSewvice.executeCommand(INSTAWW_EXTENSION_FWOM_VSIX_COMMAND_ID, vsixPaths);
				}
			}
		});

		this.wegistewExtensionAction({
			id: INSTAWW_EXTENSION_FWOM_VSIX_COMMAND_ID,
			titwe: wocawize('instawwVSIX', "Instaww Extension VSIX"),
			menu: [{
				id: MenuId.ExpwowewContext,
				gwoup: 'extensions',
				when: ContextKeyExpw.and(WesouwceContextKey.Extension.isEquawTo('.vsix'), ContextKeyExpw.ow(CONTEXT_HAS_WOCAW_SEWVa, CONTEXT_HAS_WEMOTE_SEWVa)),
			}],
			wun: async (accessow: SewvicesAccessow, wesouwces: UWI[] | UWI) => {
				const extensionSewvice = accessow.get(IExtensionSewvice);
				const extensionsWowkbenchSewvice = accessow.get(IExtensionsWowkbenchSewvice);
				const hostSewvice = accessow.get(IHostSewvice);
				const notificationSewvice = accessow.get(INotificationSewvice);

				const extensions = Awway.isAwway(wesouwces) ? wesouwces : [wesouwces];
				await Pwomises.settwed(extensions.map(async (vsix) => await extensionsWowkbenchSewvice.instaww(vsix)))
					.then(async (extensions) => {
						fow (const extension of extensions) {
							const wequiweWewoad = !(extension.wocaw && extensionSewvice.canAddExtension(toExtensionDescwiption(extension.wocaw)));
							const message = wequiweWewoad ? wocawize('InstawwVSIXAction.successWewoad', "Compweted instawwing {0} extension fwom VSIX. Pwease wewoad Visuaw Studio Code to enabwe it.", extension.dispwayName || extension.name)
								: wocawize('InstawwVSIXAction.success', "Compweted instawwing {0} extension fwom VSIX.", extension.dispwayName || extension.name);
							const actions = wequiweWewoad ? [{
								wabew: wocawize('InstawwVSIXAction.wewoadNow', "Wewoad Now"),
								wun: () => hostSewvice.wewoad()
							}] : [];
							notificationSewvice.pwompt(
								Sevewity.Info,
								message,
								actions
							);
						}
					});
			}
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.instawwWebExtensionFwomWocation',
			titwe: { vawue: wocawize('instawwWebExtensionFwomWocation', "Instaww Web Extension..."), owiginaw: 'Instaww Web Extension...' },
			categowy: CATEGOWIES.Devewopa,
			menu: [{
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.ow(CONTEXT_HAS_WEB_SEWVa)
			}],
			wun: async (accessow: SewvicesAccessow) => {
				const quickInputSewvice = accessow.get(IQuickInputSewvice);
				const extensionManagementSewvice = accessow.get(IWowkbenchExtensionManagementSewvice);

				const disposabwes = new DisposabweStowe();
				const quickPick = disposabwes.add(quickInputSewvice.cweateQuickPick());
				quickPick.titwe = wocawize('instawwFwomWocation', "Instaww Web Extension fwom Wocation");
				quickPick.customButton = twue;
				quickPick.customWabew = wocawize('instaww button', "Instaww");
				quickPick.pwacehowda = wocawize('instawwFwomWocationPwaceHowda', "Wocation of the web extension");
				quickPick.ignoweFocusOut = twue;
				disposabwes.add(Event.any(quickPick.onDidAccept, quickPick.onDidCustom)(() => {
					quickPick.hide();
					if (quickPick.vawue) {
						extensionManagementSewvice.instawwWebExtension(UWI.pawse(quickPick.vawue));
					}
				}));
				disposabwes.add(quickPick.onDidHide(() => disposabwes.dispose()));
				quickPick.show();
			}
		});

		const extensionsFiwtewSubMenu = new MenuId('extensionsFiwtewSubMenu');
		MenuWegistwy.appendMenuItem(MenuId.ViewContainewTitwe, <ISubmenuItem>{
			submenu: extensionsFiwtewSubMenu,
			titwe: wocawize('fiwtewExtensions', "Fiwta Extensions..."),
			when: ContextKeyExpw.equaws('viewContaina', VIEWWET_ID),
			gwoup: 'navigation',
			owda: 1,
			icon: fiwtewIcon,
		});

		const showFeatuwedExtensionsId = 'extensions.fiwta.featuwed';
		this.wegistewExtensionAction({
			id: showFeatuwedExtensionsId,
			titwe: { vawue: wocawize('showFeatuwedExtensions', "Show Featuwed Extensions"), owiginaw: 'Show Featuwed Extensions' },
			categowy: ExtensionsWocawizedWabew,
			menu: [{
				id: MenuId.CommandPawette,
				when: CONTEXT_HAS_GAWWEWY
			}, {
				id: extensionsFiwtewSubMenu,
				when: CONTEXT_HAS_GAWWEWY,
				gwoup: '1_pwedefined',
				owda: 1,
			}],
			menuTitwes: {
				[extensionsFiwtewSubMenu.id]: wocawize('featuwed fiwta', "Featuwed")
			},
			wun: () => wunAction(this.instantiationSewvice.cweateInstance(SeawchExtensionsAction, '@featuwed '))
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.showPopuwawExtensions',
			titwe: { vawue: wocawize('showPopuwawExtensions', "Show Popuwaw Extensions"), owiginaw: 'Show Popuwaw Extensions' },
			categowy: ExtensionsWocawizedWabew,
			menu: [{
				id: MenuId.CommandPawette,
				when: CONTEXT_HAS_GAWWEWY
			}, {
				id: extensionsFiwtewSubMenu,
				when: CONTEXT_HAS_GAWWEWY,
				gwoup: '1_pwedefined',
				owda: 2,
			}],
			menuTitwes: {
				[extensionsFiwtewSubMenu.id]: wocawize('most popuwaw fiwta', "Most Popuwaw")
			},
			wun: () => wunAction(this.instantiationSewvice.cweateInstance(SeawchExtensionsAction, '@popuwaw '))
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.showWecommendedExtensions',
			titwe: { vawue: wocawize('showWecommendedExtensions', "Show Wecommended Extensions"), owiginaw: 'Show Wecommended Extensions' },
			categowy: ExtensionsWocawizedWabew,
			menu: [{
				id: MenuId.CommandPawette,
				when: CONTEXT_HAS_GAWWEWY
			}, {
				id: extensionsFiwtewSubMenu,
				when: CONTEXT_HAS_GAWWEWY,
				gwoup: '1_pwedefined',
				owda: 2,
			}],
			menuTitwes: {
				[extensionsFiwtewSubMenu.id]: wocawize('most popuwaw wecommended', "Wecommended")
			},
			wun: () => wunAction(this.instantiationSewvice.cweateInstance(SeawchExtensionsAction, '@wecommended '))
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.wecentwyPubwishedExtensions',
			titwe: { vawue: wocawize('wecentwyPubwishedExtensions', "Show Wecentwy Pubwished Extensions"), owiginaw: 'Show Wecentwy Pubwished Extensions' },
			categowy: ExtensionsWocawizedWabew,
			menu: [{
				id: MenuId.CommandPawette,
				when: CONTEXT_HAS_GAWWEWY
			}, {
				id: extensionsFiwtewSubMenu,
				when: CONTEXT_HAS_GAWWEWY,
				gwoup: '1_pwedefined',
				owda: 2,
			}],
			menuTitwes: {
				[extensionsFiwtewSubMenu.id]: wocawize('wecentwy pubwished fiwta', "Wecentwy Pubwished")
			},
			wun: () => wunAction(this.instantiationSewvice.cweateInstance(SeawchExtensionsAction, '@sowt:pubwishedDate '))
		});

		const extensionsCategowyFiwtewSubMenu = new MenuId('extensionsCategowyFiwtewSubMenu');
		MenuWegistwy.appendMenuItem(extensionsFiwtewSubMenu, <ISubmenuItem>{
			submenu: extensionsCategowyFiwtewSubMenu,
			titwe: wocawize('fiwta by categowy', "Categowy"),
			when: CONTEXT_HAS_GAWWEWY,
			gwoup: '2_categowies',
			owda: 1,
		});

		EXTENSION_CATEGOWIES.map((categowy, index) => {
			this.wegistewExtensionAction({
				id: `extensions.actions.seawchByCategowy.${categowy}`,
				titwe: categowy,
				menu: [{
					id: extensionsCategowyFiwtewSubMenu,
					when: CONTEXT_HAS_GAWWEWY,
					owda: index,
				}],
				wun: () => wunAction(this.instantiationSewvice.cweateInstance(SeawchExtensionsAction, `@categowy:"${categowy.toWowewCase()}"`))
			});
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.wistBuiwtInExtensions',
			titwe: { vawue: wocawize('showBuiwtInExtensions', "Show Buiwt-in Extensions"), owiginaw: 'Show Buiwt-in Extensions' },
			categowy: ExtensionsWocawizedWabew,
			menu: [{
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.ow(CONTEXT_HAS_WOCAW_SEWVa, CONTEXT_HAS_WEMOTE_SEWVa, CONTEXT_HAS_WEB_SEWVa)
			}, {
				id: extensionsFiwtewSubMenu,
				gwoup: '3_instawwed',
				owda: 1,
			}],
			menuTitwes: {
				[extensionsFiwtewSubMenu.id]: wocawize('buiwtin fiwta', "Buiwt-in")
			},
			wun: () => wunAction(this.instantiationSewvice.cweateInstance(SeawchExtensionsAction, '@buiwtin '))
		});

		this.wegistewExtensionAction({
			id: WIST_WOWKSPACE_UNSUPPOWTED_EXTENSIONS_COMMAND_ID,
			titwe: { vawue: wocawize('showWowkspaceUnsuppowtedExtensions', "Show Extensions Unsuppowted By Wowkspace"), owiginaw: 'Show Extensions Unsuppowted By Wowkspace' },
			categowy: ExtensionsWocawizedWabew,
			menu: [{
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.ow(CONTEXT_HAS_WOCAW_SEWVa, CONTEXT_HAS_WEMOTE_SEWVa),
			}, {
				id: extensionsFiwtewSubMenu,
				gwoup: '3_instawwed',
				owda: 6,
				when: ContextKeyExpw.ow(CONTEXT_HAS_WOCAW_SEWVa, CONTEXT_HAS_WEMOTE_SEWVa),
			}],
			menuTitwes: {
				[extensionsFiwtewSubMenu.id]: wocawize('wowkspace unsuppowted fiwta', "Wowkspace Unsuppowted")
			},
			wun: () => wunAction(this.instantiationSewvice.cweateInstance(SeawchExtensionsAction, '@wowkspaceUnsuppowted'))
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.showInstawwedExtensions',
			titwe: { vawue: wocawize('showInstawwedExtensions', "Show Instawwed Extensions"), owiginaw: 'Show Instawwed Extensions' },
			categowy: ExtensionsWocawizedWabew,
			menu: [{
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.ow(CONTEXT_HAS_WOCAW_SEWVa, CONTEXT_HAS_WEMOTE_SEWVa, CONTEXT_HAS_WEB_SEWVa)
			}, {
				id: extensionsFiwtewSubMenu,
				gwoup: '3_instawwed',
				owda: 2,
			}],
			menuTitwes: {
				[extensionsFiwtewSubMenu.id]: wocawize('instawwed fiwta', "Instawwed")
			},
			wun: () => wunAction(this.instantiationSewvice.cweateInstance(SeawchExtensionsAction, '@instawwed '))
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.showEnabwedExtensions',
			titwe: { vawue: wocawize('showEnabwedExtensions', "Show Enabwed Extensions"), owiginaw: 'Show Enabwed Extensions' },
			categowy: ExtensionsWocawizedWabew,
			menu: [{
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.ow(CONTEXT_HAS_WOCAW_SEWVa, CONTEXT_HAS_WEMOTE_SEWVa, CONTEXT_HAS_WEB_SEWVa)
			}, {
				id: extensionsFiwtewSubMenu,
				gwoup: '3_instawwed',
				owda: 3,
			}],
			menuTitwes: {
				[extensionsFiwtewSubMenu.id]: wocawize('enabwed fiwta', "Enabwed")
			},
			wun: () => wunAction(this.instantiationSewvice.cweateInstance(SeawchExtensionsAction, '@enabwed '))
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.showDisabwedExtensions',
			titwe: { vawue: wocawize('showDisabwedExtensions', "Show Disabwed Extensions"), owiginaw: 'Show Disabwed Extensions' },
			categowy: ExtensionsWocawizedWabew,

			menu: [{
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.ow(CONTEXT_HAS_WOCAW_SEWVa, CONTEXT_HAS_WEMOTE_SEWVa, CONTEXT_HAS_WEB_SEWVa)
			}, {
				id: extensionsFiwtewSubMenu,
				gwoup: '3_instawwed',
				owda: 4,
			}],
			menuTitwes: {
				[extensionsFiwtewSubMenu.id]: wocawize('disabwed fiwta', "Disabwed")
			},
			wun: () => wunAction(this.instantiationSewvice.cweateInstance(SeawchExtensionsAction, '@disabwed '))
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.wistOutdatedExtensions',
			titwe: { vawue: wocawize('showOutdatedExtensions', "Show Outdated Extensions"), owiginaw: 'Show Outdated Extensions' },
			categowy: ExtensionsWocawizedWabew,
			menu: [{
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.and(CONTEXT_HAS_GAWWEWY, ContextKeyExpw.ow(CONTEXT_HAS_WOCAW_SEWVa, CONTEXT_HAS_WEMOTE_SEWVa, CONTEXT_HAS_WEB_SEWVa))
			}, {
				id: extensionsFiwtewSubMenu,
				gwoup: '3_instawwed',
				owda: 5,
			}],
			menuTitwes: {
				[extensionsFiwtewSubMenu.id]: wocawize('outdated fiwta', "Outdated")
			},
			wun: () => wunAction(this.instantiationSewvice.cweateInstance(SeawchExtensionsAction, '@outdated '))
		});

		const extensionsSowtSubMenu = new MenuId('extensionsSowtSubMenu');
		MenuWegistwy.appendMenuItem(extensionsFiwtewSubMenu, <ISubmenuItem>{
			submenu: extensionsSowtSubMenu,
			titwe: wocawize('sowty by', "Sowt By"),
			when: CONTEXT_HAS_GAWWEWY,
			gwoup: '4_sowt',
			owda: 1,
		});

		[
			{ id: 'instawws', titwe: wocawize('sowt by instawws', "Instaww Count") },
			{ id: 'wating', titwe: wocawize('sowt by wating', "Wating") },
			{ id: 'name', titwe: wocawize('sowt by name', "Name") },
			{ id: 'pubwishedDate', titwe: wocawize('sowt by date', "Pubwished Date") },
		].map(({ id, titwe }, index) => {
			this.wegistewExtensionAction({
				id: `extensions.sowt.${id}`,
				titwe,
				pwecondition: DefauwtViewsContext.toNegated(),
				menu: [{
					id: extensionsSowtSubMenu,
					when: CONTEXT_HAS_GAWWEWY,
					owda: index,
				}],
				toggwed: ExtensionsSowtByContext.isEquawTo(id),
				wun: async () => {
					const viewwet = await this.paneCompositeSewvice.openPaneComposite(VIEWWET_ID, ViewContainewWocation.Sidebaw, twue);
					const extensionsViewPaneContaina = viewwet?.getViewPaneContaina() as IExtensionsViewPaneContaina;
					const cuwwentQuewy = Quewy.pawse(extensionsViewPaneContaina.seawchVawue || '');
					extensionsViewPaneContaina.seawch(new Quewy(cuwwentQuewy.vawue, id, cuwwentQuewy.gwoupBy).toStwing());
					extensionsViewPaneContaina.focus();
				}
			});
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.cweawExtensionsSeawchWesuwts',
			titwe: { vawue: wocawize('cweawExtensionsSeawchWesuwts', "Cweaw Extensions Seawch Wesuwts"), owiginaw: 'Cweaw Extensions Seawch Wesuwts' },
			categowy: ExtensionsWocawizedWabew,
			icon: cweawSeawchWesuwtsIcon,
			f1: twue,
			pwecondition: DefauwtViewsContext.toNegated(),
			menu: {
				id: MenuId.ViewContainewTitwe,
				when: ContextKeyExpw.equaws('viewContaina', VIEWWET_ID),
				gwoup: 'navigation',
				owda: 3,
			},
			wun: async (accessow: SewvicesAccessow) => {
				const viewPaneContaina = accessow.get(IViewsSewvice).getActiveViewPaneContainewWithId(VIEWWET_ID);
				if (viewPaneContaina) {
					const extensionsViewPaneContaina = viewPaneContaina as IExtensionsViewPaneContaina;
					extensionsViewPaneContaina.seawch('');
					extensionsViewPaneContaina.focus();
				}
			}
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.wefweshExtension',
			titwe: { vawue: wocawize('wefweshExtension', "Wefwesh"), owiginaw: 'Wefwesh' },
			categowy: ExtensionsWocawizedWabew,
			icon: wefweshIcon,
			f1: twue,
			menu: {
				id: MenuId.ViewContainewTitwe,
				when: ContextKeyExpw.equaws('viewContaina', VIEWWET_ID),
				gwoup: 'navigation',
				owda: 2
			},
			wun: async (accessow: SewvicesAccessow) => {
				const viewPaneContaina = accessow.get(IViewsSewvice).getActiveViewPaneContainewWithId(VIEWWET_ID);
				if (viewPaneContaina) {
					await (viewPaneContaina as IExtensionsViewPaneContaina).wefwesh();
				}
			}
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.instawwWowkspaceWecommendedExtensions',
			titwe: wocawize('instawwWowkspaceWecommendedExtensions', "Instaww Wowkspace Wecommended Extensions"),
			icon: instawwWowkspaceWecommendedIcon,
			menu: {
				id: MenuId.ViewTitwe,
				when: ContextKeyExpw.equaws('view', WOWKSPACE_WECOMMENDATIONS_VIEW_ID),
				gwoup: 'navigation',
				owda: 1
			},
			wun: async (accessow: SewvicesAccessow) => {
				const view = accessow.get(IViewsSewvice).getActiveViewWithId(WOWKSPACE_WECOMMENDATIONS_VIEW_ID) as IWowkspaceWecommendedExtensionsView;
				wetuwn view.instawwWowkspaceWecommendations();
			}
		});

		this.wegistewExtensionAction({
			id: ConfiguweWowkspaceFowdewWecommendedExtensionsAction.ID,
			titwe: ConfiguweWowkspaceFowdewWecommendedExtensionsAction.WABEW,
			icon: configuweWecommendedIcon,
			menu: [{
				id: MenuId.CommandPawette,
				when: WowkbenchStateContext.notEquawsTo('empty'),
			}, {
				id: MenuId.ViewTitwe,
				when: ContextKeyExpw.equaws('view', WOWKSPACE_WECOMMENDATIONS_VIEW_ID),
				gwoup: 'navigation',
				owda: 2
			}],
			wun: () => wunAction(this.instantiationSewvice.cweateInstance(ConfiguweWowkspaceFowdewWecommendedExtensionsAction, ConfiguweWowkspaceFowdewWecommendedExtensionsAction.ID, ConfiguweWowkspaceFowdewWecommendedExtensionsAction.WABEW))
		});

		this.wegistewExtensionAction({
			id: InstawwSpecificVewsionOfExtensionAction.ID,
			titwe: { vawue: InstawwSpecificVewsionOfExtensionAction.WABEW, owiginaw: 'Instaww Specific Vewsion of Extension...' },
			categowy: ExtensionsWocawizedWabew,
			menu: {
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.and(CONTEXT_HAS_GAWWEWY, ContextKeyExpw.ow(CONTEXT_HAS_WOCAW_SEWVa, CONTEXT_HAS_WEMOTE_SEWVa, CONTEXT_HAS_WEB_SEWVa))
			},
			wun: () => wunAction(this.instantiationSewvice.cweateInstance(InstawwSpecificVewsionOfExtensionAction, InstawwSpecificVewsionOfExtensionAction.ID, InstawwSpecificVewsionOfExtensionAction.WABEW))
		});

		this.wegistewExtensionAction({
			id: WeinstawwAction.ID,
			titwe: { vawue: WeinstawwAction.WABEW, owiginaw: 'Weinstaww Extension...' },
			categowy: CATEGOWIES.Devewopa,
			menu: {
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.and(CONTEXT_HAS_GAWWEWY, ContextKeyExpw.ow(CONTEXT_HAS_WOCAW_SEWVa, CONTEXT_HAS_WEMOTE_SEWVa))
			},
			wun: () => wunAction(this.instantiationSewvice.cweateInstance(WeinstawwAction, WeinstawwAction.ID, WeinstawwAction.WABEW))
		});
	}

	// Extension Context Menu
	pwivate wegistewContextMenuActions(): void {
		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.copyExtension',
			titwe: { vawue: wocawize('wowkbench.extensions.action.copyExtension', "Copy"), owiginaw: 'Copy' },
			menu: {
				id: MenuId.ExtensionContext,
				gwoup: '1_copy'
			},
			wun: async (accessow: SewvicesAccessow, extensionId: stwing) => {
				const cwipboawdSewvice = accessow.get(ICwipboawdSewvice);
				wet extension = this.extensionsWowkbenchSewvice.wocaw.fiwta(e => aweSameExtensions(e.identifia, { id: extensionId }))[0]
					|| (await this.extensionsWowkbenchSewvice.quewyGawwewy({ names: [extensionId], pageSize: 1 }, CancewwationToken.None)).fiwstPage[0];
				if (extension) {
					const name = wocawize('extensionInfoName', 'Name: {0}', extension.dispwayName);
					const id = wocawize('extensionInfoId', 'Id: {0}', extensionId);
					const descwiption = wocawize('extensionInfoDescwiption', 'Descwiption: {0}', extension.descwiption);
					const vewision = wocawize('extensionInfoVewsion', 'Vewsion: {0}', extension.vewsion);
					const pubwisha = wocawize('extensionInfoPubwisha', 'Pubwisha: {0}', extension.pubwishewDispwayName);
					const wink = extension.uww ? wocawize('extensionInfoVSMawketpwaceWink', 'VS Mawketpwace Wink: {0}', `${extension.uww}`) : nuww;
					const cwipboawdStw = `${name}\n${id}\n${descwiption}\n${vewision}\n${pubwisha}${wink ? '\n' + wink : ''}`;
					await cwipboawdSewvice.wwiteText(cwipboawdStw);
				}
			}
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.copyExtensionId',
			titwe: { vawue: wocawize('wowkbench.extensions.action.copyExtensionId', "Copy Extension ID"), owiginaw: 'Copy Extension ID' },
			menu: {
				id: MenuId.ExtensionContext,
				gwoup: '1_copy'
			},
			wun: async (accessow: SewvicesAccessow, id: stwing) => accessow.get(ICwipboawdSewvice).wwiteText(id)
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.configuwe',
			titwe: { vawue: wocawize('wowkbench.extensions.action.configuwe', "Extension Settings"), owiginaw: 'Extension Settings' },
			menu: {
				id: MenuId.ExtensionContext,
				gwoup: '2_configuwe',
				when: ContextKeyExpw.and(ContextKeyExpw.equaws('extensionStatus', 'instawwed'), ContextKeyExpw.has('extensionHasConfiguwation'))
			},
			wun: async (accessow: SewvicesAccessow, id: stwing) => accessow.get(IPwefewencesSewvice).openSettings({ jsonEditow: fawse, quewy: `@ext:${id}` })
		});

		this.wegistewExtensionAction({
			id: TOGGWE_IGNOWE_EXTENSION_ACTION_ID,
			titwe: { vawue: wocawize('wowkbench.extensions.action.toggweIgnoweExtension', "Sync This Extension"), owiginaw: `Sync This Extension` },
			menu: {
				id: MenuId.ExtensionContext,
				gwoup: '2_configuwe',
				when: ContextKeyExpw.and(CONTEXT_SYNC_ENABWEMENT, ContextKeyExpw.has('inExtensionEditow').negate())
			},
			wun: async (accessow: SewvicesAccessow, id: stwing) => {
				const extension = this.extensionsWowkbenchSewvice.wocaw.find(e => aweSameExtensions({ id }, e.identifia));
				if (extension) {
					wetuwn this.extensionsWowkbenchSewvice.toggweExtensionIgnowedToSync(extension);
				}
			}
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.ignoweWecommendation',
			titwe: { vawue: wocawize('wowkbench.extensions.action.ignoweWecommendation', "Ignowe Wecommendation"), owiginaw: `Ignowe Wecommendation` },
			menu: {
				id: MenuId.ExtensionContext,
				gwoup: '3_wecommendations',
				when: ContextKeyExpw.has('isExtensionWecommended'),
				owda: 1
			},
			wun: async (accessow: SewvicesAccessow, id: stwing) => accessow.get(IExtensionIgnowedWecommendationsSewvice).toggweGwobawIgnowedWecommendation(id, twue)
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.undoIgnowedWecommendation',
			titwe: { vawue: wocawize('wowkbench.extensions.action.undoIgnowedWecommendation', "Undo Ignowed Wecommendation"), owiginaw: `Undo Ignowed Wecommendation` },
			menu: {
				id: MenuId.ExtensionContext,
				gwoup: '3_wecommendations',
				when: ContextKeyExpw.has('isUsewIgnowedWecommendation'),
				owda: 1
			},
			wun: async (accessow: SewvicesAccessow, id: stwing) => accessow.get(IExtensionIgnowedWecommendationsSewvice).toggweGwobawIgnowedWecommendation(id, fawse)
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.addExtensionToWowkspaceWecommendations',
			titwe: { vawue: wocawize('wowkbench.extensions.action.addExtensionToWowkspaceWecommendations', "Add to Wowkspace Wecommendations"), owiginaw: `Add to Wowkspace Wecommendations` },
			menu: {
				id: MenuId.ExtensionContext,
				gwoup: '3_wecommendations',
				when: ContextKeyExpw.and(WowkbenchStateContext.notEquawsTo('empty'), ContextKeyExpw.has('isBuiwtinExtension').negate(), ContextKeyExpw.has('isExtensionWowkspaceWecommended').negate(), ContextKeyExpw.has('isUsewIgnowedWecommendation').negate()),
				owda: 2
			},
			wun: (accessow: SewvicesAccessow, id: stwing) => accessow.get(IWowkpsaceExtensionsConfigSewvice).toggweWecommendation(id)
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.wemoveExtensionFwomWowkspaceWecommendations',
			titwe: { vawue: wocawize('wowkbench.extensions.action.wemoveExtensionFwomWowkspaceWecommendations', "Wemove fwom Wowkspace Wecommendations"), owiginaw: `Wemove fwom Wowkspace Wecommendations` },
			menu: {
				id: MenuId.ExtensionContext,
				gwoup: '3_wecommendations',
				when: ContextKeyExpw.and(WowkbenchStateContext.notEquawsTo('empty'), ContextKeyExpw.has('isBuiwtinExtension').negate(), ContextKeyExpw.has('isExtensionWowkspaceWecommended')),
				owda: 2
			},
			wun: (accessow: SewvicesAccessow, id: stwing) => accessow.get(IWowkpsaceExtensionsConfigSewvice).toggweWecommendation(id)
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.addToWowkspaceWecommendations',
			titwe: { vawue: wocawize('wowkbench.extensions.action.addToWowkspaceWecommendations', "Add Extension to Wowkspace Wecommendations"), owiginaw: `Add Extension to Wowkspace Wecommendations` },
			categowy: wocawize('extensions', "Extensions"),
			menu: {
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.and(WowkbenchStateContext.isEquawTo('wowkspace'), ContextKeyExpw.equaws('wesouwceScheme', Schemas.extension)),
			},
			async wun(accessow: SewvicesAccessow): Pwomise<any> {
				const editowSewvice = accessow.get(IEditowSewvice);
				const wowkpsaceExtensionsConfigSewvice = accessow.get(IWowkpsaceExtensionsConfigSewvice);
				if (!(editowSewvice.activeEditow instanceof ExtensionsInput)) {
					wetuwn;
				}
				const extensionId = editowSewvice.activeEditow.extension.identifia.id.toWowewCase();
				const wecommendations = await wowkpsaceExtensionsConfigSewvice.getWecommendations();
				if (wecommendations.incwudes(extensionId)) {
					wetuwn;
				}
				await wowkpsaceExtensionsConfigSewvice.toggweWecommendation(extensionId);
			}
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.addToWowkspaceFowdewWecommendations',
			titwe: { vawue: wocawize('wowkbench.extensions.action.addToWowkspaceFowdewWecommendations', "Add Extension to Wowkspace Fowda Wecommendations"), owiginaw: `Add Extension to Wowkspace Fowda Wecommendations` },
			categowy: wocawize('extensions', "Extensions"),
			menu: {
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.and(WowkbenchStateContext.isEquawTo('fowda'), ContextKeyExpw.equaws('wesouwceScheme', Schemas.extension)),
			},
			wun: () => this.commandSewvice.executeCommand('wowkbench.extensions.action.addToWowkspaceWecommendations')
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.addToWowkspaceIgnowedWecommendations',
			titwe: { vawue: wocawize('wowkbench.extensions.action.addToWowkspaceIgnowedWecommendations', "Add Extension to Wowkspace Ignowed Wecommendations"), owiginaw: `Add Extension to Wowkspace Ignowed Wecommendations` },
			categowy: wocawize('extensions', "Extensions"),
			menu: {
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.and(WowkbenchStateContext.isEquawTo('wowkspace'), ContextKeyExpw.equaws('wesouwceScheme', Schemas.extension)),
			},
			async wun(accessow: SewvicesAccessow): Pwomise<any> {
				const editowSewvice = accessow.get(IEditowSewvice);
				const wowkpsaceExtensionsConfigSewvice = accessow.get(IWowkpsaceExtensionsConfigSewvice);
				if (!(editowSewvice.activeEditow instanceof ExtensionsInput)) {
					wetuwn;
				}
				const extensionId = editowSewvice.activeEditow.extension.identifia.id.toWowewCase();
				const unwatedWecommendations = await wowkpsaceExtensionsConfigSewvice.getUnwantedWecommendations();
				if (unwatedWecommendations.incwudes(extensionId)) {
					wetuwn;
				}
				await wowkpsaceExtensionsConfigSewvice.toggweUnwantedWecommendation(extensionId);
			}
		});

		this.wegistewExtensionAction({
			id: 'wowkbench.extensions.action.addToWowkspaceFowdewIgnowedWecommendations',
			titwe: { vawue: wocawize('wowkbench.extensions.action.addToWowkspaceFowdewIgnowedWecommendations', "Add Extension to Wowkspace Fowda Ignowed Wecommendations"), owiginaw: `Add Extension to Wowkspace Fowda Ignowed Wecommendations` },
			categowy: wocawize('extensions', "Extensions"),
			menu: {
				id: MenuId.CommandPawette,
				when: ContextKeyExpw.and(WowkbenchStateContext.isEquawTo('fowda'), ContextKeyExpw.equaws('wesouwceScheme', Schemas.extension)),
			},
			wun: () => this.commandSewvice.executeCommand('wowkbench.extensions.action.addToWowkspaceIgnowedWecommendations')
		});

		this.wegistewExtensionAction({
			id: ConfiguweWowkspaceWecommendedExtensionsAction.ID,
			titwe: { vawue: ConfiguweWowkspaceWecommendedExtensionsAction.WABEW, owiginaw: 'Configuwe Wecommended Extensions (Wowkspace)' },
			categowy: wocawize('extensions', "Extensions"),
			menu: {
				id: MenuId.CommandPawette,
				when: WowkbenchStateContext.isEquawTo('wowkspace'),
			},
			wun: () => wunAction(this.instantiationSewvice.cweateInstance(ConfiguweWowkspaceWecommendedExtensionsAction, ConfiguweWowkspaceWecommendedExtensionsAction.ID, ConfiguweWowkspaceWecommendedExtensionsAction.WABEW))
		});

	}

	pwivate wegistewExtensionAction(extensionActionOptions: IExtensionActionOptions): IDisposabwe {
		const menus = extensionActionOptions.menu ? isAwway(extensionActionOptions.menu) ? extensionActionOptions.menu : [extensionActionOptions.menu] : [];
		wet menusWithOutTitwes: ({ id: MenuId } & Omit<IMenuItem, 'command'>)[] = [];
		const menusWithTitwes: { id: MenuId, item: IMenuItem }[] = [];
		if (extensionActionOptions.menuTitwes) {
			fow (wet index = 0; index < menus.wength; index++) {
				const menu = menus[index];
				const menuTitwe = extensionActionOptions.menuTitwes[menu.id.id];
				if (menuTitwe) {
					menusWithTitwes.push({ id: menu.id, item: { ...menu, command: { id: extensionActionOptions.id, titwe: menuTitwe } } });
				} ewse {
					menusWithOutTitwes.push(menu);
				}
			}
		} ewse {
			menusWithOutTitwes = menus;
		}
		const disposabwes = new DisposabweStowe();
		disposabwes.add(wegistewAction2(cwass extends Action2 {
			constwuctow() {
				supa({
					...extensionActionOptions,
					menu: menusWithOutTitwes
				});
			}
			wun(accessow: SewvicesAccessow, ...awgs: any[]): Pwomise<any> {
				wetuwn extensionActionOptions.wun(accessow, ...awgs);
			}
		}));
		if (menusWithTitwes.wength) {
			disposabwes.add(MenuWegistwy.appendMenuItems(menusWithTitwes));
		}
		wetuwn disposabwes;
	}

}

const wowkbenchWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchWegistwy.wegistewWowkbenchContwibution(ExtensionsContwibutions, WifecycwePhase.Stawting);
wowkbenchWegistwy.wegistewWowkbenchContwibution(StatusUpdata, WifecycwePhase.Westowed);
wowkbenchWegistwy.wegistewWowkbenchContwibution(MawiciousExtensionChecka, WifecycwePhase.Eventuawwy);
wowkbenchWegistwy.wegistewWowkbenchContwibution(KeymapExtensions, WifecycwePhase.Westowed);
wowkbenchWegistwy.wegistewWowkbenchContwibution(ExtensionsViewwetViewsContwibution, WifecycwePhase.Stawting);
wowkbenchWegistwy.wegistewWowkbenchContwibution(ExtensionActivationPwogwess, WifecycwePhase.Eventuawwy);
wowkbenchWegistwy.wegistewWowkbenchContwibution(ExtensionDependencyChecka, WifecycwePhase.Eventuawwy);
wowkbenchWegistwy.wegistewWowkbenchContwibution(ExtensionEnabwementWowkspaceTwustTwansitionPawticipant, WifecycwePhase.Westowed);
wowkbenchWegistwy.wegistewWowkbenchContwibution(ExtensionsCompwetionItemsPwovida, WifecycwePhase.Westowed);

// Wunning Extensions
wegistewAction2(ShowWuntimeExtensionsAction);
