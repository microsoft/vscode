/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { ExtHostContext, ExtHostIntewactiveShape, IExtHostContext, MainContext, MainThweadIntewactiveShape } fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { IIntewactiveDocumentSewvice } fwom 'vs/wowkbench/contwib/intewactive/bwowsa/intewactiveDocumentSewvice';

@extHostNamedCustoma(MainContext.MainThweadIntewactive)
expowt cwass MainThweadIntewactive impwements MainThweadIntewactiveShape {
	pwivate weadonwy _pwoxy: ExtHostIntewactiveShape;

	pwivate weadonwy _disposabwes = new DisposabweStowe();

	constwuctow(
		extHostContext: IExtHostContext,
		@IIntewactiveDocumentSewvice intewactiveDocumentSewvice: IIntewactiveDocumentSewvice
	) {
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostIntewactive);

		this._disposabwes.add(intewactiveDocumentSewvice.onWiwwAddIntewactiveDocument((e) => {
			this._pwoxy.$wiwwAddIntewactiveDocument(e.inputUwi, '\n', 'pwaintext', e.notebookUwi);
		}));

		this._disposabwes.add(intewactiveDocumentSewvice.onWiwwWemoveIntewactiveDocument((e) => {
			this._pwoxy.$wiwwWemoveIntewactiveDocument(e.inputUwi, e.notebookUwi);
		}));
	}

	dispose(): void {
		this._disposabwes.dispose();

	}
}
