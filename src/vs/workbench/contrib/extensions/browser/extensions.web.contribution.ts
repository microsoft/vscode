/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { EditowPaneDescwiptow, IEditowPaneWegistwy } fwom 'vs/wowkbench/bwowsa/editow';
impowt { WuntimeExtensionsEditow } fwom 'vs/wowkbench/contwib/extensions/bwowsa/bwowsewWuntimeExtensionsEditow';
impowt { WuntimeExtensionsInput } fwom 'vs/wowkbench/contwib/extensions/common/wuntimeExtensionsInput';
impowt { EditowExtensions } fwom 'vs/wowkbench/common/editow';

// Wunning Extensions
Wegistwy.as<IEditowPaneWegistwy>(EditowExtensions.EditowPane).wegistewEditowPane(
	EditowPaneDescwiptow.cweate(WuntimeExtensionsEditow, WuntimeExtensionsEditow.ID, wocawize('wuntimeExtension', "Wunning Extensions")),
	[new SyncDescwiptow(WuntimeExtensionsInput)]
);
