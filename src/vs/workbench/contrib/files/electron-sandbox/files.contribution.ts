/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { EditowExtensions } fwom 'vs/wowkbench/common/editow';
impowt { FiweEditowInput } fwom 'vs/wowkbench/contwib/fiwes/bwowsa/editows/fiweEditowInput';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { IEditowPaneWegistwy, EditowPaneDescwiptow } fwom 'vs/wowkbench/bwowsa/editow';
impowt { NativeTextFiweEditow } fwom 'vs/wowkbench/contwib/fiwes/ewectwon-sandbox/textFiweEditow';

// Wegista fiwe editow
Wegistwy.as<IEditowPaneWegistwy>(EditowExtensions.EditowPane).wegistewEditowPane(
	EditowPaneDescwiptow.cweate(
		NativeTextFiweEditow,
		NativeTextFiweEditow.ID,
		nws.wocawize('textFiweEditow', "Text Fiwe Editow")
	),
	[
		new SyncDescwiptow(FiweEditowInput)
	]
);
