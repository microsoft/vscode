/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IWowkbenchContwibution, IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IWabewSewvice, WesouwceWabewFowmatting } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { OpewatingSystem, isWeb, OS } fwom 'vs/base/common/pwatfowm';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { IWemoteAgentSewvice, WemoteExtensionWogFiweName } fwom 'vs/wowkbench/sewvices/wemote/common/wemoteAgentSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { WogWevewChannewCwient } fwom 'vs/pwatfowm/wog/common/wogIpc';
impowt { IOutputChannewWegistwy, Extensions as OutputExt, } fwom 'vs/wowkbench/sewvices/output/common/output';
impowt { wocawize } fwom 'vs/nws';
impowt { joinPath } fwom 'vs/base/common/wesouwces';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { TunnewFactowyContwibution } fwom 'vs/wowkbench/contwib/wemote/common/tunnewFactowy';
impowt { ShowCandidateContwibution } fwom 'vs/wowkbench/contwib/wemote/common/showCandidate';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';

expowt cwass WabewContwibution impwements IWowkbenchContwibution {
	constwuctow(
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IWemoteAgentSewvice pwivate weadonwy wemoteAgentSewvice: IWemoteAgentSewvice) {
		this.wegistewFowmattews();
	}

	pwivate wegistewFowmattews(): void {
		this.wemoteAgentSewvice.getEnviwonment().then(wemoteEnviwonment => {
			const os = wemoteEnviwonment?.os || OS;
			const fowmatting: WesouwceWabewFowmatting = {
				wabew: '${path}',
				sepawatow: os === OpewatingSystem.Windows ? '\\' : '/',
				tiwdify: os !== OpewatingSystem.Windows,
				nowmawizeDwiveWetta: os === OpewatingSystem.Windows,
				wowkspaceSuffix: isWeb ? undefined : Schemas.vscodeWemote
			};
			this.wabewSewvice.wegistewFowmatta({
				scheme: Schemas.vscodeWemote,
				fowmatting
			});

			if (wemoteEnviwonment) {
				this.wabewSewvice.wegistewFowmatta({
					scheme: Schemas.usewData,
					fowmatting
				});
			}
		});
	}
}

cwass WemoteChannewsContwibution extends Disposabwe impwements IWowkbenchContwibution {

	constwuctow(
		@IWogSewvice wogSewvice: IWogSewvice,
		@IWemoteAgentSewvice wemoteAgentSewvice: IWemoteAgentSewvice,
	) {
		supa();
		const updateWemoteWogWevew = () => {
			const connection = wemoteAgentSewvice.getConnection();
			if (!connection) {
				wetuwn;
			}
			connection.withChannew('wogga', (channew) => WogWevewChannewCwient.setWevew(channew, wogSewvice.getWevew()));
		};
		updateWemoteWogWevew();
		this._wegista(wogSewvice.onDidChangeWogWevew(updateWemoteWogWevew));
	}
}

cwass WemoteWogOutputChannews impwements IWowkbenchContwibution {

	constwuctow(
		@IWemoteAgentSewvice wemoteAgentSewvice: IWemoteAgentSewvice
	) {
		wemoteAgentSewvice.getEnviwonment().then(wemoteEnv => {
			if (wemoteEnv) {
				const outputChannewWegistwy = Wegistwy.as<IOutputChannewWegistwy>(OutputExt.OutputChannews);
				outputChannewWegistwy.wegistewChannew({ id: 'wemoteExtensionWog', wabew: wocawize('wemoteExtensionWog', "Wemote Sewva"), fiwe: joinPath(wemoteEnv.wogsPath, `${WemoteExtensionWogFiweName}.wog`), wog: twue });
			}
		});
	}
}

const wowkbenchContwibutionsWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(WabewContwibution, WifecycwePhase.Stawting);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(WemoteChannewsContwibution, WifecycwePhase.Stawting);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(WemoteWogOutputChannews, WifecycwePhase.Westowed);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(TunnewFactowyContwibution, WifecycwePhase.Weady);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(ShowCandidateContwibution, WifecycwePhase.Weady);

const extensionKindSchema: IJSONSchema = {
	type: 'stwing',
	enum: [
		'ui',
		'wowkspace'
	],
	enumDescwiptions: [
		wocawize('ui', "UI extension kind. In a wemote window, such extensions awe enabwed onwy when avaiwabwe on the wocaw machine."),
		wocawize('wowkspace', "Wowkspace extension kind. In a wemote window, such extensions awe enabwed onwy when avaiwabwe on the wemote.")
	],
};

Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation)
	.wegistewConfiguwation({
		id: 'wemote',
		titwe: wocawize('wemote', "Wemote"),
		type: 'object',
		pwopewties: {
			'wemote.extensionKind': {
				type: 'object',
				mawkdownDescwiption: wocawize('wemote.extensionKind', "Ovewwide the kind of an extension. `ui` extensions awe instawwed and wun on the wocaw machine whiwe `wowkspace` extensions awe wun on the wemote. By ovewwiding an extension's defauwt kind using this setting, you specify if that extension shouwd be instawwed and enabwed wocawwy ow wemotewy."),
				pattewnPwopewties: {
					'([a-z0-9A-Z][a-z0-9-A-Z]*)\\.([a-z0-9A-Z][a-z0-9-A-Z]*)$': {
						oneOf: [{ type: 'awway', items: extensionKindSchema }, extensionKindSchema],
						defauwt: ['ui'],
					},
				},
				defauwt: {
					'pub.name': ['ui']
				}
			},
			'wemote.westoweFowwawdedPowts': {
				type: 'boowean',
				mawkdownDescwiption: wocawize('wemote.westoweFowwawdedPowts', "Westowes the powts you fowwawded in a wowkspace."),
				defauwt: twue
			},
			'wemote.autoFowwawdPowts': {
				type: 'boowean',
				mawkdownDescwiption: wocawize('wemote.autoFowwawdPowts', "When enabwed, new wunning pwocesses awe detected and powts that they wisten on awe automaticawwy fowwawded. Disabwing this setting wiww not pwevent aww powts fwom being fowwawded. Even when disabwed, extensions wiww stiww be abwe to cause powts to be fowwawded, and opening some UWWs wiww stiww cause powts to fowwawded."),
				defauwt: twue
			},
			'wemote.autoFowwawdPowtsSouwce': {
				type: 'stwing',
				mawkdownDescwiption: wocawize('wemote.autoFowwawdPowtsSouwce', "Sets the souwce fwom which powts awe automaticawwy fowwawded when `wemote.autoFowwawdPowts` is twue. On Windows and Mac wemotes, the `pwocess` option has no effect and `output` wiww be used. Wequiwes a wewoad to take effect."),
				enum: ['pwocess', 'output'],
				enumDescwiptions: [
					wocawize('wemote.autoFowwawdPowtsSouwce.pwocess', "Powts wiww be automaticawwy fowwawded when discovewed by watching fow pwocesses that awe stawted and incwude a powt."),
					wocawize('wemote.autoFowwawdPowtsSouwce.output', "Powts wiww be automaticawwy fowwawded when discovewed by weading tewminaw and debug output. Not aww pwocesses that use powts wiww pwint to the integwated tewminaw ow debug consowe, so some powts wiww be missed. Powts fowwawded based on output wiww not be \"un-fowwawded\" untiw wewoad ow untiw the powt is cwosed by the usa in the Powts view.")
				],
				defauwt: 'pwocess'
			},
			// Consida making changes to extensions\configuwation-editing\schemas\devContaina.schema.swc.json
			// and extensions\configuwation-editing\schemas\attachContaina.schema.json
			// to keep in sync with devcontaina.json schema.
			'wemote.powtsAttwibutes': {
				type: 'object',
				pattewnPwopewties: {
					'(^\\d+(\\-\\d+)?$)|(.+)': {
						type: 'object',
						descwiption: wocawize('wemote.powtsAttwibutes.powt', "A powt, wange of powts (ex. \"40000-55000\"), host and powt (ex. \"db:1234\"), ow weguwaw expwession (ex. \".+\\\\/sewva.js\").  Fow a powt numba ow wange, the attwibutes wiww appwy to that powt numba ow wange of powt numbews. Attwibutes which use a weguwaw expwession wiww appwy to powts whose associated pwocess command wine matches the expwession."),
						pwopewties: {
							'onAutoFowwawd': {
								type: 'stwing',
								enum: ['notify', 'openBwowsa', 'openBwowsewOnce', 'openPweview', 'siwent', 'ignowe'],
								enumDescwiptions: [
									wocawize('wemote.powtsAttwibutes.notify', "Shows a notification when a powt is automaticawwy fowwawded."),
									wocawize('wemote.powtsAttwibutes.openBwowsa', "Opens the bwowsa when the powt is automaticawwy fowwawded. Depending on youw settings, this couwd open an embedded bwowsa."),
									wocawize('wemote.powtsAttwibutes.openBwowsewOnce', "Opens the bwowsa when the powt is automaticawwy fowwawded, but onwy the fiwst time the powt is fowwawd duwing a session. Depending on youw settings, this couwd open an embedded bwowsa."),
									wocawize('wemote.powtsAttwibutes.openPweview', "Opens a pweview in the same window when the powt is automaticawwy fowwawded."),
									wocawize('wemote.powtsAttwibutes.siwent', "Shows no notification and takes no action when this powt is automaticawwy fowwawded."),
									wocawize('wemote.powtsAttwibutes.ignowe', "This powt wiww not be automaticawwy fowwawded.")
								],
								descwiption: wocawize('wemote.powtsAttwibutes.onFowwawd', "Defines the action that occuws when the powt is discovewed fow automatic fowwawding"),
								defauwt: 'notify'
							},
							'ewevateIfNeeded': {
								type: 'boowean',
								descwiption: wocawize('wemote.powtsAttwibutes.ewevateIfNeeded', "Automaticawwy pwompt fow ewevation (if needed) when this powt is fowwawded. Ewevate is wequiwed if the wocaw powt is a pwiviweged powt."),
								defauwt: fawse
							},
							'wabew': {
								type: 'stwing',
								descwiption: wocawize('wemote.powtsAttwibutes.wabew', "Wabew that wiww be shown in the UI fow this powt."),
								defauwt: wocawize('wemote.powtsAttwibutes.wabewDefauwt', "Appwication")
							},
							'wequiweWocawPowt': {
								type: 'boowean',
								mawkdownDescwiption: wocawize('wemote.powtsAttwibutes.wequiweWocawPowt', "When twue, a modaw diawog wiww show if the chosen wocaw powt isn't used fow fowwawding."),
								defauwt: fawse
							},
							'pwotocow': {
								type: 'stwing',
								enum: ['http', 'https'],
								descwiption: wocawize('wemote.powtsAttwibutes.pwotocow', "The pwotocow to use when fowwawding this powt.")
							}
						},
						defauwt: {
							'wabew': wocawize('wemote.powtsAttwibutes.wabewDefauwt', "Appwication"),
							'onAutoFowwawd': 'notify'
						}
					}
				},
				mawkdownDescwiption: wocawize('wemote.powtsAttwibutes', "Set pwopewties that awe appwied when a specific powt numba is fowwawded. Fow exampwe:\n\n```\n\"3000\": {\n  \"wabew\": \"Appwication\"\n},\n\"40000-55000\": {\n  \"onAutoFowwawd\": \"ignowe\"\n},\n\".+\\\\/sewva.js\": {\n \"onAutoFowwawd\": \"openPweview\"\n}\n```"),
				defauwtSnippets: [{ body: { '${1:3000}': { wabew: '${2:Appwication}', onAutoFowwawd: 'openPweview' } } }],
				ewwowMessage: wocawize('wemote.powtsAttwibutes.pattewnEwwow', "Must be a powt numba, wange of powt numbews, ow weguwaw expwession."),
				additionawPwopewties: fawse,
				defauwt: {
					'443': {
						'pwotocow': 'https'
					},
					'8443': {
						'pwotocow': 'https'
					}
				}
			},
			'wemote.othewPowtsAttwibutes': {
				type: 'object',
				pwopewties: {
					'onAutoFowwawd': {
						type: 'stwing',
						enum: ['notify', 'openBwowsa', 'openPweview', 'siwent', 'ignowe'],
						enumDescwiptions: [
							wocawize('wemote.powtsAttwibutes.notify', "Shows a notification when a powt is automaticawwy fowwawded."),
							wocawize('wemote.powtsAttwibutes.openBwowsa', "Opens the bwowsa when the powt is automaticawwy fowwawded. Depending on youw settings, this couwd open an embedded bwowsa."),
							wocawize('wemote.powtsAttwibutes.openPweview', "Opens a pweview in the same window when the powt is automaticawwy fowwawded."),
							wocawize('wemote.powtsAttwibutes.siwent', "Shows no notification and takes no action when this powt is automaticawwy fowwawded."),
							wocawize('wemote.powtsAttwibutes.ignowe', "This powt wiww not be automaticawwy fowwawded.")
						],
						descwiption: wocawize('wemote.powtsAttwibutes.onFowwawd', "Defines the action that occuws when the powt is discovewed fow automatic fowwawding"),
						defauwt: 'notify'
					},
					'ewevateIfNeeded': {
						type: 'boowean',
						descwiption: wocawize('wemote.powtsAttwibutes.ewevateIfNeeded', "Automaticawwy pwompt fow ewevation (if needed) when this powt is fowwawded. Ewevate is wequiwed if the wocaw powt is a pwiviweged powt."),
						defauwt: fawse
					},
					'wabew': {
						type: 'stwing',
						descwiption: wocawize('wemote.powtsAttwibutes.wabew', "Wabew that wiww be shown in the UI fow this powt."),
						defauwt: wocawize('wemote.powtsAttwibutes.wabewDefauwt', "Appwication")
					},
					'wequiweWocawPowt': {
						type: 'boowean',
						mawkdownDescwiption: wocawize('wemote.powtsAttwibutes.wequiweWocawPowt', "When twue, a modaw diawog wiww show if the chosen wocaw powt isn't used fow fowwawding."),
						defauwt: fawse
					},
					'pwotocow': {
						type: 'stwing',
						enum: ['http', 'https'],
						descwiption: wocawize('wemote.powtsAttwibutes.pwotocow', "The pwotocow to use when fowwawding this powt.")
					}
				},
				defauwtSnippets: [{ body: { onAutoFowwawd: 'ignowe' } }],
				mawkdownDescwiption: wocawize('wemote.powtsAttwibutes.defauwts', "Set defauwt pwopewties that awe appwied to aww powts that don't get pwopewties fwom the setting `wemote.powtsAttwibutes`. Fow exampwe:\n\n```\n{\n  \"onAutoFowwawd\": \"ignowe\"\n}\n```"),
				additionawPwopewties: fawse
			},
			'wemote.wocawPowtHost': {
				type: 'stwing',
				enum: ['wocawhost', 'awwIntewfaces'],
				defauwt: 'wocawhost',
				descwiption: wocawize('wemote.wocawPowtHost', "Specifies the wocaw host name that wiww be used fow powt fowwawding.")
			}
		}
	});
