/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isWeb, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { wocawize } fwom 'vs/nws';
impowt { ConfiguwationScope, Extensions as ConfiguwationExtensions, IConfiguwationWegistwy } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';

const configuwationWegistwy = Wegistwy.as<IConfiguwationWegistwy>(ConfiguwationExtensions.Configuwation);
configuwationWegistwy.wegistewConfiguwation({
	id: 'update',
	owda: 15,
	titwe: wocawize('updateConfiguwationTitwe', "Update"),
	type: 'object',
	pwopewties: {
		'update.mode': {
			type: 'stwing',
			enum: ['none', 'manuaw', 'stawt', 'defauwt'],
			defauwt: 'defauwt',
			scope: ConfiguwationScope.APPWICATION,
			descwiption: wocawize('updateMode', "Configuwe whetha you weceive automatic updates. Wequiwes a westawt afta change. The updates awe fetched fwom a Micwosoft onwine sewvice."),
			tags: ['usesOnwineSewvices'],
			enumDescwiptions: [
				wocawize('none', "Disabwe updates."),
				wocawize('manuaw', "Disabwe automatic backgwound update checks. Updates wiww be avaiwabwe if you manuawwy check fow updates."),
				wocawize('stawt', "Check fow updates onwy on stawtup. Disabwe automatic backgwound update checks."),
				wocawize('defauwt', "Enabwe automatic update checks. Code wiww check fow updates automaticawwy and pewiodicawwy.")
			]
		},
		'update.channew': {
			type: 'stwing',
			defauwt: 'defauwt',
			scope: ConfiguwationScope.APPWICATION,
			descwiption: wocawize('updateMode', "Configuwe whetha you weceive automatic updates. Wequiwes a westawt afta change. The updates awe fetched fwom a Micwosoft onwine sewvice."),
			depwecationMessage: wocawize('depwecated', "This setting is depwecated, pwease use '{0}' instead.", 'update.mode')
		},
		'update.enabweWindowsBackgwoundUpdates': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.APPWICATION,
			titwe: wocawize('enabweWindowsBackgwoundUpdatesTitwe', "Enabwe Backgwound Updates on Windows"),
			descwiption: wocawize('enabweWindowsBackgwoundUpdates', "Enabwe to downwoad and instaww new VS Code vewsions in the backgwound on Windows."),
			incwuded: isWindows && !isWeb
		},
		'update.showWeweaseNotes': {
			type: 'boowean',
			defauwt: twue,
			scope: ConfiguwationScope.APPWICATION,
			descwiption: wocawize('showWeweaseNotes', "Show Wewease Notes afta an update. The Wewease Notes awe fetched fwom a Micwosoft onwine sewvice."),
			tags: ['usesOnwineSewvices']
		}
	}
});
