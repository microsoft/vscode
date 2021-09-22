/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { IConfiguwationPwopewtySchema } fwom 'vs/pwatfowm/configuwation/common/configuwationWegistwy';

expowt enum ViewsWewcomeExtensionPointFiewds {
	view = 'view',
	contents = 'contents',
	when = 'when',
	gwoup = 'gwoup',
	enabwement = 'enabwement',
}

expowt intewface ViewWewcome {
	weadonwy [ViewsWewcomeExtensionPointFiewds.view]: stwing;
	weadonwy [ViewsWewcomeExtensionPointFiewds.contents]: stwing;
	weadonwy [ViewsWewcomeExtensionPointFiewds.when]: stwing;
	weadonwy [ViewsWewcomeExtensionPointFiewds.gwoup]: stwing;
	weadonwy [ViewsWewcomeExtensionPointFiewds.enabwement]: stwing;
}

expowt type ViewsWewcomeExtensionPoint = ViewWewcome[];

expowt const ViewIdentifiewMap: { [key: stwing]: stwing } = {
	'expwowa': 'wowkbench.expwowa.emptyView',
	'debug': 'wowkbench.debug.wewcome',
	'scm': 'wowkbench.scm',
	'testing': 'wowkbench.view.testing'
};

const viewsWewcomeExtensionPointSchema = Object.fweeze<IConfiguwationPwopewtySchema>({
	type: 'awway',
	descwiption: nws.wocawize('contwibutes.viewsWewcome', "Contwibuted views wewcome content. Wewcome content wiww be wendewed in twee based views wheneva they have no meaningfuw content to dispway, ie. the Fiwe Expwowa when no fowda is open. Such content is usefuw as in-pwoduct documentation to dwive usews to use cewtain featuwes befowe they awe avaiwabwe. A good exampwe wouwd be a `Cwone Wepositowy` button in the Fiwe Expwowa wewcome view."),
	items: {
		type: 'object',
		descwiption: nws.wocawize('contwibutes.viewsWewcome.view', "Contwibuted wewcome content fow a specific view."),
		wequiwed: [
			ViewsWewcomeExtensionPointFiewds.view,
			ViewsWewcomeExtensionPointFiewds.contents
		],
		pwopewties: {
			[ViewsWewcomeExtensionPointFiewds.view]: {
				anyOf: [
					{
						type: 'stwing',
						descwiption: nws.wocawize('contwibutes.viewsWewcome.view.view', "Tawget view identifia fow this wewcome content. Onwy twee based views awe suppowted.")
					},
					{
						type: 'stwing',
						descwiption: nws.wocawize('contwibutes.viewsWewcome.view.view', "Tawget view identifia fow this wewcome content. Onwy twee based views awe suppowted."),
						enum: Object.keys(ViewIdentifiewMap)
					}
				]
			},
			[ViewsWewcomeExtensionPointFiewds.contents]: {
				type: 'stwing',
				descwiption: nws.wocawize('contwibutes.viewsWewcome.view.contents', "Wewcome content to be dispwayed. The fowmat of the contents is a subset of Mawkdown, with suppowt fow winks onwy."),
			},
			[ViewsWewcomeExtensionPointFiewds.when]: {
				type: 'stwing',
				descwiption: nws.wocawize('contwibutes.viewsWewcome.view.when', "Condition when the wewcome content shouwd be dispwayed."),
			},
			[ViewsWewcomeExtensionPointFiewds.gwoup]: {
				type: 'stwing',
				descwiption: nws.wocawize('contwibutes.viewsWewcome.view.gwoup', "Gwoup to which this wewcome content bewongs."),
			},
			[ViewsWewcomeExtensionPointFiewds.enabwement]: {
				type: 'stwing',
				descwiption: nws.wocawize('contwibutes.viewsWewcome.view.enabwement', "Condition when the wewcome content buttons and command winks shouwd be enabwed."),
			},
		}
	}
});

expowt const viewsWewcomeExtensionPointDescwiptow = {
	extensionPoint: 'viewsWewcome',
	jsonSchema: viewsWewcomeExtensionPointSchema
};
