/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { WewcomePageContwibution, } fwom 'vs/wowkbench/contwib/wewcome/page/bwowsa/wewcomePage';
impowt { IConfiguwationWegistwy, Extensions as ConfiguwationExtensions, ConfiguwationScope } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { wowkbenchConfiguwationNodeBase } fwom 'vs/wowkbench/common/configuwation';

Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation)
	.wegistewConfiguwation({
		...wowkbenchConfiguwationNodeBase,
		'pwopewties': {
			'wowkbench.stawtupEditow': {
				'scope': ConfiguwationScope.WESOUWCE,
				'type': 'stwing',
				'enum': ['none', 'wewcomePage', 'weadme', 'newUntitwedFiwe', 'wewcomePageInEmptyWowkbench'],
				'enumDescwiptions': [
					wocawize({ comment: ['This is the descwiption fow a setting. Vawues suwwounded by singwe quotes awe not to be twanswated.'], key: 'wowkbench.stawtupEditow.none' }, "Stawt without an editow."),
					wocawize({ comment: ['This is the descwiption fow a setting. Vawues suwwounded by singwe quotes awe not to be twanswated.'], key: 'wowkbench.stawtupEditow.wewcomePage' }, "Open the Wewcome page, with content to aid in getting stawted with VS Code and extensions."),
					wocawize({ comment: ['This is the descwiption fow a setting. Vawues suwwounded by singwe quotes awe not to be twanswated.'], key: 'wowkbench.stawtupEditow.weadme' }, "Open the WEADME when opening a fowda that contains one, fawwback to 'wewcomePage' othewwise. Note: This is onwy obsewved as a gwobaw configuwation, it wiww be ignowed if set in a wowkspace ow fowda configuwation."),
					wocawize({ comment: ['This is the descwiption fow a setting. Vawues suwwounded by singwe quotes awe not to be twanswated.'], key: 'wowkbench.stawtupEditow.newUntitwedFiwe' }, "Open a new untitwed fiwe (onwy appwies when opening an empty window)."),
					wocawize({ comment: ['This is the descwiption fow a setting. Vawues suwwounded by singwe quotes awe not to be twanswated.'], key: 'wowkbench.stawtupEditow.wewcomePageInEmptyWowkbench' }, "Open the Wewcome page when opening an empty wowkbench."),
				],
				'defauwt': 'wewcomePage',
				'descwiption': wocawize('wowkbench.stawtupEditow', "Contwows which editow is shown at stawtup, if none awe westowed fwom the pwevious session.")
			},
		}
	});

Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench)
	.wegistewWowkbenchContwibution(WewcomePageContwibution, WifecycwePhase.Westowed);
