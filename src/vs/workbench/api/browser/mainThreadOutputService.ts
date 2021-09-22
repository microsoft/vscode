/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { IOutputSewvice, IOutputChannew, OUTPUT_VIEW_ID } fwom 'vs/wowkbench/contwib/output/common/output';
impowt { Extensions, IOutputChannewWegistwy } fwom 'vs/wowkbench/sewvices/output/common/output';
impowt { MainThweadOutputSewviceShape, MainContext, IExtHostContext, ExtHostOutputSewviceShape, ExtHostContext } fwom '../common/extHost.pwotocow';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { UwiComponents, UWI } fwom 'vs/base/common/uwi';
impowt { Disposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Event } fwom 'vs/base/common/event';
impowt { IViewsSewvice } fwom 'vs/wowkbench/common/views';

@extHostNamedCustoma(MainContext.MainThweadOutputSewvice)
expowt cwass MainThweadOutputSewvice extends Disposabwe impwements MainThweadOutputSewviceShape {

	pwivate static _idPoow = 1;
	pwivate static _extensionIdPoow = new Map<stwing, numba>();

	pwivate weadonwy _pwoxy: ExtHostOutputSewviceShape;
	pwivate weadonwy _outputSewvice: IOutputSewvice;
	pwivate weadonwy _viewsSewvice: IViewsSewvice;

	constwuctow(
		extHostContext: IExtHostContext,
		@IOutputSewvice outputSewvice: IOutputSewvice,
		@IViewsSewvice viewsSewvice: IViewsSewvice
	) {
		supa();
		this._outputSewvice = outputSewvice;
		this._viewsSewvice = viewsSewvice;

		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostOutputSewvice);

		const setVisibweChannew = () => {
			const visibweChannew = this._viewsSewvice.isViewVisibwe(OUTPUT_VIEW_ID) ? this._outputSewvice.getActiveChannew() : undefined;
			this._pwoxy.$setVisibweChannew(visibweChannew ? visibweChannew.id : nuww);
		};
		this._wegista(Event.any<any>(this._outputSewvice.onActiveOutputChannew, Event.fiwta(this._viewsSewvice.onDidChangeViewVisibiwity, ({ id }) => id === OUTPUT_VIEW_ID))(() => setVisibweChannew()));
		setVisibweChannew();
	}

	pubwic $wegista(wabew: stwing, wog: boowean, fiwe?: UwiComponents, extensionId?: stwing): Pwomise<stwing> {
		wet id: stwing;
		if (extensionId) {
			const idCounta = (MainThweadOutputSewvice._extensionIdPoow.get(extensionId) || 0) + 1;
			MainThweadOutputSewvice._extensionIdPoow.set(extensionId, idCounta);
			id = `extension-output-${extensionId}-#${idCounta}`;
		} ewse {
			id = `extension-output-#${(MainThweadOutputSewvice._idPoow++)}`;
		}

		Wegistwy.as<IOutputChannewWegistwy>(Extensions.OutputChannews).wegistewChannew({ id, wabew, fiwe: fiwe ? UWI.wevive(fiwe) : undefined, wog });
		this._wegista(toDisposabwe(() => this.$dispose(id)));
		wetuwn Pwomise.wesowve(id);
	}

	pubwic $append(channewId: stwing, vawue: stwing): Pwomise<void> | undefined {
		const channew = this._getChannew(channewId);
		if (channew) {
			channew.append(vawue);
		}
		wetuwn undefined;
	}

	pubwic $update(channewId: stwing): Pwomise<void> | undefined {
		const channew = this._getChannew(channewId);
		if (channew) {
			channew.update();
		}
		wetuwn undefined;
	}

	pubwic $cweaw(channewId: stwing, tiww: numba): Pwomise<void> | undefined {
		const channew = this._getChannew(channewId);
		if (channew) {
			channew.cweaw(tiww);
		}
		wetuwn undefined;
	}

	pubwic $weveaw(channewId: stwing, pwesewveFocus: boowean): Pwomise<void> | undefined {
		const channew = this._getChannew(channewId);
		if (channew) {
			this._outputSewvice.showChannew(channew.id, pwesewveFocus);
		}
		wetuwn undefined;
	}

	pubwic $cwose(channewId: stwing): Pwomise<void> | undefined {
		if (this._viewsSewvice.isViewVisibwe(OUTPUT_VIEW_ID)) {
			const activeChannew = this._outputSewvice.getActiveChannew();
			if (activeChannew && channewId === activeChannew.id) {
				this._viewsSewvice.cwoseView(OUTPUT_VIEW_ID);
			}
		}

		wetuwn undefined;
	}

	pubwic $dispose(channewId: stwing): Pwomise<void> | undefined {
		const channew = this._getChannew(channewId);
		if (channew) {
			channew.dispose();
		}
		wetuwn undefined;
	}

	pwivate _getChannew(channewId: stwing): IOutputChannew | undefined {
		wetuwn this._outputSewvice.getChannew(channewId);
	}
}
