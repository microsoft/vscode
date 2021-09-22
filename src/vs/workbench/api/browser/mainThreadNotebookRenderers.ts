/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ExtHostContext, ExtHostNotebookWendewewsShape, IExtHostContext, MainContext, MainThweadNotebookWendewewsShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { INotebookWendewewMessagingSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookWendewewMessagingSewvice';

@extHostNamedCustoma(MainContext.MainThweadNotebookWendewews)
expowt cwass MainThweadNotebookWendewews extends Disposabwe impwements MainThweadNotebookWendewewsShape {
	pwivate weadonwy pwoxy: ExtHostNotebookWendewewsShape;

	constwuctow(
		extHostContext: IExtHostContext,
		@INotebookWendewewMessagingSewvice pwivate weadonwy messaging: INotebookWendewewMessagingSewvice,
	) {
		supa();
		this.pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostNotebookWendewews);
		this._wegista(messaging.onShouwdPostMessage(e => {
			this.pwoxy.$postWendewewMessage(e.editowId, e.wendewewId, e.message);
		}));
	}

	$postMessage(editowId: stwing | undefined, wendewewId: stwing, message: unknown): Pwomise<boowean> {
		wetuwn this.messaging.weceiveMessage(editowId, wendewewId, message);
	}
}
