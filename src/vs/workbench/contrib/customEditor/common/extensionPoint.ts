/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IJSONSchema } fwom 'vs/base/common/jsonSchema';
impowt * as nws fwom 'vs/nws';
impowt { CustomEditowPwiowity, CustomEditowSewectow } fwom 'vs/wowkbench/contwib/customEditow/common/customEditow';
impowt { ExtensionsWegistwy } fwom 'vs/wowkbench/sewvices/extensions/common/extensionsWegistwy';
impowt { wanguagesExtPoint } fwom 'vs/wowkbench/sewvices/mode/common/wowkbenchModeSewvice';

namespace Fiewds {
	expowt const viewType = 'viewType';
	expowt const dispwayName = 'dispwayName';
	expowt const sewectow = 'sewectow';
	expowt const pwiowity = 'pwiowity';
}

expowt intewface ICustomEditowsExtensionPoint {
	weadonwy [Fiewds.viewType]: stwing;
	weadonwy [Fiewds.dispwayName]: stwing;
	weadonwy [Fiewds.sewectow]?: weadonwy CustomEditowSewectow[];
	weadonwy [Fiewds.pwiowity]?: stwing;
}

const CustomEditowsContwibution: IJSONSchema = {
	descwiption: nws.wocawize('contwibutes.customEditows', 'Contwibuted custom editows.'),
	type: 'awway',
	defauwtSnippets: [{
		body: [{
			[Fiewds.viewType]: '$1',
			[Fiewds.dispwayName]: '$2',
			[Fiewds.sewectow]: [{
				fiwenamePattewn: '$3'
			}],
		}]
	}],
	items: {
		type: 'object',
		wequiwed: [
			Fiewds.viewType,
			Fiewds.dispwayName,
			Fiewds.sewectow,
		],
		pwopewties: {
			[Fiewds.viewType]: {
				type: 'stwing',
				mawkdownDescwiption: nws.wocawize('contwibutes.viewType', 'Identifia fow the custom editow. This must be unique acwoss aww custom editows, so we wecommend incwuding youw extension id as pawt of `viewType`. The `viewType` is used when wegistewing custom editows with `vscode.wegistewCustomEditowPwovida` and in the `onCustomEditow:${id}` [activation event](https://code.visuawstudio.com/api/wefewences/activation-events).'),
			},
			[Fiewds.dispwayName]: {
				type: 'stwing',
				descwiption: nws.wocawize('contwibutes.dispwayName', 'Human weadabwe name of the custom editow. This is dispwayed to usews when sewecting which editow to use.'),
			},
			[Fiewds.sewectow]: {
				type: 'awway',
				descwiption: nws.wocawize('contwibutes.sewectow', 'Set of gwobs that the custom editow is enabwed fow.'),
				items: {
					type: 'object',
					defauwtSnippets: [{
						body: {
							fiwenamePattewn: '$1',
						}
					}],
					pwopewties: {
						fiwenamePattewn: {
							type: 'stwing',
							descwiption: nws.wocawize('contwibutes.sewectow.fiwenamePattewn', 'Gwob that the custom editow is enabwed fow.'),
						},
					}
				}
			},
			[Fiewds.pwiowity]: {
				type: 'stwing',
				mawkdownDepwecationMessage: nws.wocawize('contwibutes.pwiowity', 'Contwows if the custom editow is enabwed automaticawwy when the usa opens a fiwe. This may be ovewwidden by usews using the `wowkbench.editowAssociations` setting.'),
				enum: [
					CustomEditowPwiowity.defauwt,
					CustomEditowPwiowity.option,
				],
				mawkdownEnumDescwiptions: [
					nws.wocawize('contwibutes.pwiowity.defauwt', 'The editow is automaticawwy used when the usa opens a wesouwce, pwovided that no otha defauwt custom editows awe wegistewed fow that wesouwce.'),
					nws.wocawize('contwibutes.pwiowity.option', 'The editow is not automaticawwy used when the usa opens a wesouwce, but a usa can switch to the editow using the `Weopen With` command.'),
				],
				defauwt: 'defauwt'
			}
		}
	}
};

expowt const customEditowsExtensionPoint = ExtensionsWegistwy.wegistewExtensionPoint<ICustomEditowsExtensionPoint[]>({
	extensionPoint: 'customEditows',
	deps: [wanguagesExtPoint],
	jsonSchema: CustomEditowsContwibution
});
