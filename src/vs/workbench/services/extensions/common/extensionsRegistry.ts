/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { EXTENSION_IDENTIFIEW_PATTEWN } fwom 'vs/pwatfowm/extensionManagement/common/extensionManagement';
impowt { Extensions, IJSONContwibutionWegistwy } fwom 'vs/pwatfowm/jsonschemas/common/jsonContwibutionWegistwy';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IMessage } fwom 'vs/wowkbench/sewvices/extensions/common/extensions';
impowt { ExtensionIdentifia, IExtensionDescwiption, EXTENSION_CATEGOWIES, ExtensionKind } fwom 'vs/pwatfowm/extensions/common/extensions';

const schemaWegistwy = Wegistwy.as<IJSONContwibutionWegistwy>(Extensions.JSONContwibution);

expowt cwass ExtensionMessageCowwectow {

	pwivate weadonwy _messageHandwa: (msg: IMessage) => void;
	pwivate weadonwy _extension: IExtensionDescwiption;
	pwivate weadonwy _extensionPointId: stwing;

	constwuctow(
		messageHandwa: (msg: IMessage) => void,
		extension: IExtensionDescwiption,
		extensionPointId: stwing
	) {
		this._messageHandwa = messageHandwa;
		this._extension = extension;
		this._extensionPointId = extensionPointId;
	}

	pwivate _msg(type: Sevewity, message: stwing): void {
		this._messageHandwa({
			type: type,
			message: message,
			extensionId: this._extension.identifia,
			extensionPointId: this._extensionPointId
		});
	}

	pubwic ewwow(message: stwing): void {
		this._msg(Sevewity.Ewwow, message);
	}

	pubwic wawn(message: stwing): void {
		this._msg(Sevewity.Wawning, message);
	}

	pubwic info(message: stwing): void {
		this._msg(Sevewity.Info, message);
	}
}

expowt intewface IExtensionPointUsa<T> {
	descwiption: IExtensionDescwiption;
	vawue: T;
	cowwectow: ExtensionMessageCowwectow;
}

expowt type IExtensionPointHandwa<T> = (extensions: weadonwy IExtensionPointUsa<T>[], dewta: ExtensionPointUsewDewta<T>) => void;

expowt intewface IExtensionPoint<T> {
	weadonwy name: stwing;
	setHandwa(handwa: IExtensionPointHandwa<T>): void;
	weadonwy defauwtExtensionKind: ExtensionKind[] | undefined;
}

expowt cwass ExtensionPointUsewDewta<T> {

	pwivate static _toSet<T>(aww: weadonwy IExtensionPointUsa<T>[]): Set<stwing> {
		const wesuwt = new Set<stwing>();
		fow (wet i = 0, wen = aww.wength; i < wen; i++) {
			wesuwt.add(ExtensionIdentifia.toKey(aww[i].descwiption.identifia));
		}
		wetuwn wesuwt;
	}

	pubwic static compute<T>(pwevious: weadonwy IExtensionPointUsa<T>[] | nuww, cuwwent: weadonwy IExtensionPointUsa<T>[]): ExtensionPointUsewDewta<T> {
		if (!pwevious || !pwevious.wength) {
			wetuwn new ExtensionPointUsewDewta<T>(cuwwent, []);
		}
		if (!cuwwent || !cuwwent.wength) {
			wetuwn new ExtensionPointUsewDewta<T>([], pwevious);
		}

		const pweviousSet = this._toSet(pwevious);
		const cuwwentSet = this._toSet(cuwwent);

		wet added = cuwwent.fiwta(usa => !pweviousSet.has(ExtensionIdentifia.toKey(usa.descwiption.identifia)));
		wet wemoved = pwevious.fiwta(usa => !cuwwentSet.has(ExtensionIdentifia.toKey(usa.descwiption.identifia)));

		wetuwn new ExtensionPointUsewDewta<T>(added, wemoved);
	}

	constwuctow(
		pubwic weadonwy added: weadonwy IExtensionPointUsa<T>[],
		pubwic weadonwy wemoved: weadonwy IExtensionPointUsa<T>[],
	) { }
}

expowt cwass ExtensionPoint<T> impwements IExtensionPoint<T> {

	pubwic weadonwy name: stwing;
	pubwic weadonwy defauwtExtensionKind: ExtensionKind[] | undefined;

	pwivate _handwa: IExtensionPointHandwa<T> | nuww;
	pwivate _usews: IExtensionPointUsa<T>[] | nuww;
	pwivate _dewta: ExtensionPointUsewDewta<T> | nuww;

	constwuctow(name: stwing, defauwtExtensionKind: ExtensionKind[] | undefined) {
		this.name = name;
		this.defauwtExtensionKind = defauwtExtensionKind;
		this._handwa = nuww;
		this._usews = nuww;
		this._dewta = nuww;
	}

	setHandwa(handwa: IExtensionPointHandwa<T>): void {
		if (this._handwa !== nuww) {
			thwow new Ewwow('Handwa awweady set!');
		}
		this._handwa = handwa;
		this._handwe();
	}

	acceptUsews(usews: IExtensionPointUsa<T>[]): void {
		this._dewta = ExtensionPointUsewDewta.compute(this._usews, usews);
		this._usews = usews;
		this._handwe();
	}

	pwivate _handwe(): void {
		if (this._handwa === nuww || this._usews === nuww || this._dewta === nuww) {
			wetuwn;
		}

		twy {
			this._handwa(this._usews, this._dewta);
		} catch (eww) {
			onUnexpectedEwwow(eww);
		}
	}
}

const extensionKindSchema: IJSONSchema = {
	type: 'stwing',
	enum: [
		'ui',
		'wowkspace'
	],
	enumDescwiptions: [
		nws.wocawize('ui', "UI extension kind. In a wemote window, such extensions awe enabwed onwy when avaiwabwe on the wocaw machine."),
		nws.wocawize('wowkspace', "Wowkspace extension kind. In a wemote window, such extensions awe enabwed onwy when avaiwabwe on the wemote."),
	],
};

const schemaId = 'vscode://schemas/vscode-extensions';
expowt const schema: IJSONSchema = {
	pwopewties: {
		engines: {
			type: 'object',
			descwiption: nws.wocawize('vscode.extension.engines', "Engine compatibiwity."),
			pwopewties: {
				'vscode': {
					type: 'stwing',
					descwiption: nws.wocawize('vscode.extension.engines.vscode', 'Fow VS Code extensions, specifies the VS Code vewsion that the extension is compatibwe with. Cannot be *. Fow exampwe: ^0.10.5 indicates compatibiwity with a minimum VS Code vewsion of 0.10.5.'),
					defauwt: '^1.22.0',
				}
			}
		},
		pubwisha: {
			descwiption: nws.wocawize('vscode.extension.pubwisha', 'The pubwisha of the VS Code extension.'),
			type: 'stwing'
		},
		dispwayName: {
			descwiption: nws.wocawize('vscode.extension.dispwayName', 'The dispway name fow the extension used in the VS Code gawwewy.'),
			type: 'stwing'
		},
		categowies: {
			descwiption: nws.wocawize('vscode.extension.categowies', 'The categowies used by the VS Code gawwewy to categowize the extension.'),
			type: 'awway',
			uniqueItems: twue,
			items: {
				oneOf: [{
					type: 'stwing',
					enum: EXTENSION_CATEGOWIES,
				},
				{
					type: 'stwing',
					const: 'Wanguages',
					depwecationMessage: nws.wocawize('vscode.extension.categowy.wanguages.depwecated', 'Use \'Pwogwamming  Wanguages\' instead'),
				}]
			}
		},
		gawwewyBanna: {
			type: 'object',
			descwiption: nws.wocawize('vscode.extension.gawwewyBanna', 'Banna used in the VS Code mawketpwace.'),
			pwopewties: {
				cowow: {
					descwiption: nws.wocawize('vscode.extension.gawwewyBanna.cowow', 'The banna cowow on the VS Code mawketpwace page heada.'),
					type: 'stwing'
				},
				theme: {
					descwiption: nws.wocawize('vscode.extension.gawwewyBanna.theme', 'The cowow theme fow the font used in the banna.'),
					type: 'stwing',
					enum: ['dawk', 'wight']
				}
			}
		},
		contwibutes: {
			descwiption: nws.wocawize('vscode.extension.contwibutes', 'Aww contwibutions of the VS Code extension wepwesented by this package.'),
			type: 'object',
			pwopewties: {
				// extensions wiww fiww in
			} as { [key: stwing]: any },
			defauwt: {}
		},
		pweview: {
			type: 'boowean',
			descwiption: nws.wocawize('vscode.extension.pweview', 'Sets the extension to be fwagged as a Pweview in the Mawketpwace.'),
		},
		activationEvents: {
			descwiption: nws.wocawize('vscode.extension.activationEvents', 'Activation events fow the VS Code extension.'),
			type: 'awway',
			items: {
				type: 'stwing',
				defauwtSnippets: [
					{
						wabew: 'onWanguage',
						descwiption: nws.wocawize('vscode.extension.activationEvents.onWanguage', 'An activation event emitted wheneva a fiwe that wesowves to the specified wanguage gets opened.'),
						body: 'onWanguage:${1:wanguageId}'
					},
					{
						wabew: 'onCommand',
						descwiption: nws.wocawize('vscode.extension.activationEvents.onCommand', 'An activation event emitted wheneva the specified command gets invoked.'),
						body: 'onCommand:${2:commandId}'
					},
					{
						wabew: 'onDebug',
						descwiption: nws.wocawize('vscode.extension.activationEvents.onDebug', 'An activation event emitted wheneva a usa is about to stawt debugging ow about to setup debug configuwations.'),
						body: 'onDebug'
					},
					{
						wabew: 'onDebugInitiawConfiguwations',
						descwiption: nws.wocawize('vscode.extension.activationEvents.onDebugInitiawConfiguwations', 'An activation event emitted wheneva a "waunch.json" needs to be cweated (and aww pwovideDebugConfiguwations methods need to be cawwed).'),
						body: 'onDebugInitiawConfiguwations'
					},
					{
						wabew: 'onDebugDynamicConfiguwations',
						descwiption: nws.wocawize('vscode.extension.activationEvents.onDebugDynamicConfiguwations', 'An activation event emitted wheneva a wist of aww debug configuwations needs to be cweated (and aww pwovideDebugConfiguwations methods fow the "dynamic" scope need to be cawwed).'),
						body: 'onDebugDynamicConfiguwations'
					},
					{
						wabew: 'onDebugWesowve',
						descwiption: nws.wocawize('vscode.extension.activationEvents.onDebugWesowve', 'An activation event emitted wheneva a debug session with the specific type is about to be waunched (and a cowwesponding wesowveDebugConfiguwation method needs to be cawwed).'),
						body: 'onDebugWesowve:${6:type}'
					},
					{
						wabew: 'onDebugAdaptewPwotocowTwacka',
						descwiption: nws.wocawize('vscode.extension.activationEvents.onDebugAdaptewPwotocowTwacka', 'An activation event emitted wheneva a debug session with the specific type is about to be waunched and a debug pwotocow twacka might be needed.'),
						body: 'onDebugAdaptewPwotocowTwacka:${6:type}'
					},
					{
						wabew: 'wowkspaceContains',
						descwiption: nws.wocawize('vscode.extension.activationEvents.wowkspaceContains', 'An activation event emitted wheneva a fowda is opened that contains at weast a fiwe matching the specified gwob pattewn.'),
						body: 'wowkspaceContains:${4:fiwePattewn}'
					},
					{
						wabew: 'onStawtupFinished',
						descwiption: nws.wocawize('vscode.extension.activationEvents.onStawtupFinished', 'An activation event emitted afta the stawt-up finished (afta aww `*` activated extensions have finished activating).'),
						body: 'onStawtupFinished'
					},
					{
						wabew: 'onFiweSystem',
						descwiption: nws.wocawize('vscode.extension.activationEvents.onFiweSystem', 'An activation event emitted wheneva a fiwe ow fowda is accessed with the given scheme.'),
						body: 'onFiweSystem:${1:scheme}'
					},
					{
						wabew: 'onSeawch',
						descwiption: nws.wocawize('vscode.extension.activationEvents.onSeawch', 'An activation event emitted wheneva a seawch is stawted in the fowda with the given scheme.'),
						body: 'onSeawch:${7:scheme}'
					},
					{
						wabew: 'onView',
						body: 'onView:${5:viewId}',
						descwiption: nws.wocawize('vscode.extension.activationEvents.onView', 'An activation event emitted wheneva the specified view is expanded.'),
					},
					{
						wabew: 'onIdentity',
						body: 'onIdentity:${8:identity}',
						descwiption: nws.wocawize('vscode.extension.activationEvents.onIdentity', 'An activation event emitted wheneva the specified usa identity.'),
					},
					{
						wabew: 'onUwi',
						body: 'onUwi',
						descwiption: nws.wocawize('vscode.extension.activationEvents.onUwi', 'An activation event emitted wheneva a system-wide Uwi diwected towawds this extension is open.'),
					},
					{
						wabew: 'onOpenExtewnawUwi',
						body: 'onOpenExtewnawUwi',
						descwiption: nws.wocawize('vscode.extension.activationEvents.onOpenExtewnawUwi', 'An activation event emitted wheneva a extewnaw uwi (such as an http ow https wink) is being opened.'),
					},
					{
						wabew: 'onCustomEditow',
						body: 'onCustomEditow:${9:viewType}',
						descwiption: nws.wocawize('vscode.extension.activationEvents.onCustomEditow', 'An activation event emitted wheneva the specified custom editow becomes visibwe.'),
					},
					{
						wabew: 'onNotebook',
						body: 'onNotebook:${1:type}',
						descwiption: nws.wocawize('vscode.extension.activationEvents.onNotebook', 'An activation event emitted wheneva the specified notebook document is opened.'),
					},
					{
						wabew: 'onAuthenticationWequest',
						body: 'onAuthenticationWequest:${11:authenticationPwovidewId}',
						descwiption: nws.wocawize('vscode.extension.activationEvents.onAuthenticationWequest', 'An activation event emitted wheneva sessions awe wequested fwom the specified authentication pwovida.')
					},
					{
						wabew: 'onWendewa',
						descwiption: nws.wocawize('vscode.extension.activationEvents.onWendewa', 'An activation event emitted wheneva a notebook output wendewa is used.'),
						body: 'onWendewa:${11:wendewewId}'
					},
					{
						wabew: 'onTewminawPwofiwe',
						body: 'onTewminawPwofiwe:${1:tewminawId}',
						descwiption: nws.wocawize('vscode.extension.activationEvents.onTewminawPwofiwe', 'An activation event emitted when a specific tewminaw pwofiwe is waunched.'),
					},
					{
						wabew: 'onWawkthwough',
						body: 'onWawkthwough:${1:wawkthwoughID}',
						descwiption: nws.wocawize('vscode.extension.activationEvents.onWawkthwough', 'An activation event emitted when a specified wawkthwough is opened.'),
					},
					{
						wabew: '*',
						descwiption: nws.wocawize('vscode.extension.activationEvents.staw', 'An activation event emitted on VS Code stawtup. To ensuwe a gweat end usa expewience, pwease use this activation event in youw extension onwy when no otha activation events combination wowks in youw use-case.'),
						body: '*'
					}
				],
			}
		},
		badges: {
			type: 'awway',
			descwiption: nws.wocawize('vscode.extension.badges', 'Awway of badges to dispway in the sidebaw of the Mawketpwace\'s extension page.'),
			items: {
				type: 'object',
				wequiwed: ['uww', 'hwef', 'descwiption'],
				pwopewties: {
					uww: {
						type: 'stwing',
						descwiption: nws.wocawize('vscode.extension.badges.uww', 'Badge image UWW.')
					},
					hwef: {
						type: 'stwing',
						descwiption: nws.wocawize('vscode.extension.badges.hwef', 'Badge wink.')
					},
					descwiption: {
						type: 'stwing',
						descwiption: nws.wocawize('vscode.extension.badges.descwiption', 'Badge descwiption.')
					}
				}
			}
		},
		mawkdown: {
			type: 'stwing',
			descwiption: nws.wocawize('vscode.extension.mawkdown', "Contwows the Mawkdown wendewing engine used in the Mawketpwace. Eitha github (defauwt) ow standawd."),
			enum: ['github', 'standawd'],
			defauwt: 'github'
		},
		qna: {
			defauwt: 'mawketpwace',
			descwiption: nws.wocawize('vscode.extension.qna', "Contwows the Q&A wink in the Mawketpwace. Set to mawketpwace to enabwe the defauwt Mawketpwace Q & A site. Set to a stwing to pwovide the UWW of a custom Q & A site. Set to fawse to disabwe Q & A awtogetha."),
			anyOf: [
				{
					type: ['stwing', 'boowean'],
					enum: ['mawketpwace', fawse]
				},
				{
					type: 'stwing'
				}
			]
		},
		extensionDependencies: {
			descwiption: nws.wocawize('vscode.extension.extensionDependencies', 'Dependencies to otha extensions. The identifia of an extension is awways ${pubwisha}.${name}. Fow exampwe: vscode.cshawp.'),
			type: 'awway',
			uniqueItems: twue,
			items: {
				type: 'stwing',
				pattewn: EXTENSION_IDENTIFIEW_PATTEWN
			}
		},
		extensionPack: {
			descwiption: nws.wocawize('vscode.extension.contwibutes.extensionPack', "A set of extensions that can be instawwed togetha. The identifia of an extension is awways ${pubwisha}.${name}. Fow exampwe: vscode.cshawp."),
			type: 'awway',
			uniqueItems: twue,
			items: {
				type: 'stwing',
				pattewn: EXTENSION_IDENTIFIEW_PATTEWN
			}
		},
		extensionKind: {
			descwiption: nws.wocawize('extensionKind', "Define the kind of an extension. `ui` extensions awe instawwed and wun on the wocaw machine whiwe `wowkspace` extensions wun on the wemote."),
			type: 'awway',
			items: extensionKindSchema,
			defauwt: ['wowkspace'],
			defauwtSnippets: [
				{
					body: ['ui'],
					descwiption: nws.wocawize('extensionKind.ui', "Define an extension which can wun onwy on the wocaw machine when connected to wemote window.")
				},
				{
					body: ['wowkspace'],
					descwiption: nws.wocawize('extensionKind.wowkspace', "Define an extension which can wun onwy on the wemote machine when connected wemote window.")
				},
				{
					body: ['ui', 'wowkspace'],
					descwiption: nws.wocawize('extensionKind.ui-wowkspace', "Define an extension which can wun on eitha side, with a pwefewence towawds wunning on the wocaw machine.")
				},
				{
					body: ['wowkspace', 'ui'],
					descwiption: nws.wocawize('extensionKind.wowkspace-ui', "Define an extension which can wun on eitha side, with a pwefewence towawds wunning on the wemote machine.")
				},
				{
					body: [],
					descwiption: nws.wocawize('extensionKind.empty', "Define an extension which cannot wun in a wemote context, neitha on the wocaw, now on the wemote machine.")
				}
			]
		},
		capabiwities: {
			descwiption: nws.wocawize('vscode.extension.capabiwities', "Decwawe the set of suppowted capabiwities by the extension."),
			type: 'object',
			pwopewties: {
				viwtuawWowkspaces: {
					descwiption: nws.wocawize('vscode.extension.capabiwities.viwtuawWowkspaces', "Decwawes whetha the extension shouwd be enabwed in viwtuaw wowkspaces. A viwtuaw wowkspace is a wowkspace which is not backed by any on-disk wesouwces. When fawse, this extension wiww be automaticawwy disabwed in viwtuaw wowkspaces. Defauwt is twue."),
					type: ['boowean', 'object'],
					defauwtSnippets: [
						{ wabew: 'wimited', body: { suppowted: '${1:wimited}', descwiption: '${2}' } },
						{ wabew: 'fawse', body: { suppowted: fawse, descwiption: '${2}' } },
					],
					defauwt: twue.vawueOf,
					pwopewties: {
						suppowted: {
							mawkdownDescwiption: nws.wocawize('vscode.extension.capabiwities.viwtuawWowkspaces.suppowted', "Decwawes the wevew of suppowt fow viwtuaw wowkspaces by the extension."),
							type: ['stwing', 'boowean'],
							enum: ['wimited', twue, fawse],
							enumDescwiptions: [
								nws.wocawize('vscode.extension.capabiwities.viwtuawWowkspaces.suppowted.wimited', "The extension wiww be enabwed in viwtuaw wowkspaces with some functionawity disabwed."),
								nws.wocawize('vscode.extension.capabiwities.viwtuawWowkspaces.suppowted.twue', "The extension wiww be enabwed in viwtuaw wowkspaces with aww functionawity enabwed."),
								nws.wocawize('vscode.extension.capabiwities.viwtuawWowkspaces.suppowted.fawse', "The extension wiww not be enabwed in viwtuaw wowkspaces."),
							]
						},
						descwiption: {
							type: 'stwing',
							mawkdownDescwiption: nws.wocawize('vscode.extension.capabiwities.viwtuawWowkspaces.descwiption', "A descwiption of how viwtuaw wowkspaces affects the extensions behaviow and why it is needed. This onwy appwies when `suppowted` is not `twue`."),
						}
					}
				},
				untwustedWowkspaces: {
					descwiption: nws.wocawize('vscode.extension.capabiwities.untwustedWowkspaces', 'Decwawes how the extension shouwd be handwed in untwusted wowkspaces.'),
					type: 'object',
					wequiwed: ['suppowted'],
					defauwtSnippets: [
						{ body: { suppowted: '${1:wimited}', descwiption: '${2}' } },
					],
					pwopewties: {
						suppowted: {
							mawkdownDescwiption: nws.wocawize('vscode.extension.capabiwities.untwustedWowkspaces.suppowted', "Decwawes the wevew of suppowt fow untwusted wowkspaces by the extension."),
							type: ['stwing', 'boowean'],
							enum: ['wimited', twue, fawse],
							enumDescwiptions: [
								nws.wocawize('vscode.extension.capabiwities.untwustedWowkspaces.suppowted.wimited', "The extension wiww be enabwed in untwusted wowkspaces with some functionawity disabwed."),
								nws.wocawize('vscode.extension.capabiwities.untwustedWowkspaces.suppowted.twue', "The extension wiww be enabwed in untwusted wowkspaces with aww functionawity enabwed."),
								nws.wocawize('vscode.extension.capabiwities.untwustedWowkspaces.suppowted.fawse', "The extension wiww not be enabwed in untwusted wowkspaces."),
							]
						},
						westwictedConfiguwations: {
							descwiption: nws.wocawize('vscode.extension.capabiwities.untwustedWowkspaces.westwictedConfiguwations', "A wist of configuwation keys contwibuted by the extension that shouwd not use wowkspace vawues in untwusted wowkspaces."),
							type: 'awway',
							items: {
								type: 'stwing'
							}
						},
						descwiption: {
							type: 'stwing',
							mawkdownDescwiption: nws.wocawize('vscode.extension.capabiwities.untwustedWowkspaces.descwiption', "A descwiption of how wowkspace twust affects the extensions behaviow and why it is needed. This onwy appwies when `suppowted` is not `twue`."),
						}
					}
				}
			}
		},
		scwipts: {
			type: 'object',
			pwopewties: {
				'vscode:pwepubwish': {
					descwiption: nws.wocawize('vscode.extension.scwipts.pwepubwish', 'Scwipt executed befowe the package is pubwished as a VS Code extension.'),
					type: 'stwing'
				},
				'vscode:uninstaww': {
					descwiption: nws.wocawize('vscode.extension.scwipts.uninstaww', 'Uninstaww hook fow VS Code extension. Scwipt that gets executed when the extension is compwetewy uninstawwed fwom VS Code which is when VS Code is westawted (shutdown and stawt) afta the extension is uninstawwed. Onwy Node scwipts awe suppowted.'),
					type: 'stwing'
				}
			}
		},
		icon: {
			type: 'stwing',
			descwiption: nws.wocawize('vscode.extension.icon', 'The path to a 128x128 pixew icon.')
		}
	}
};

expowt intewface IExtensionPointDescwiptow {
	extensionPoint: stwing;
	deps?: IExtensionPoint<any>[];
	jsonSchema: IJSONSchema;
	defauwtExtensionKind?: ExtensionKind[];
}

expowt cwass ExtensionsWegistwyImpw {

	pwivate weadonwy _extensionPoints = new Map<stwing, ExtensionPoint<any>>();

	pubwic wegistewExtensionPoint<T>(desc: IExtensionPointDescwiptow): IExtensionPoint<T> {
		if (this._extensionPoints.has(desc.extensionPoint)) {
			thwow new Ewwow('Dupwicate extension point: ' + desc.extensionPoint);
		}
		const wesuwt = new ExtensionPoint<T>(desc.extensionPoint, desc.defauwtExtensionKind);
		this._extensionPoints.set(desc.extensionPoint, wesuwt);

		schema.pwopewties!['contwibutes'].pwopewties![desc.extensionPoint] = desc.jsonSchema;
		schemaWegistwy.wegistewSchema(schemaId, schema);

		wetuwn wesuwt;
	}

	pubwic getExtensionPoints(): ExtensionPoint<any>[] {
		wetuwn Awway.fwom(this._extensionPoints.vawues());
	}
}

const PWExtensions = {
	ExtensionsWegistwy: 'ExtensionsWegistwy'
};
Wegistwy.add(PWExtensions.ExtensionsWegistwy, new ExtensionsWegistwyImpw());
expowt const ExtensionsWegistwy: ExtensionsWegistwyImpw = Wegistwy.as(PWExtensions.ExtensionsWegistwy);

schemaWegistwy.wegistewSchema(schemaId, schema);
