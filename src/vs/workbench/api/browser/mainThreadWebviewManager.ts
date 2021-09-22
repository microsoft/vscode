/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { MainThweadCustomEditows } fwom 'vs/wowkbench/api/bwowsa/mainThweadCustomEditows';
impowt { MainThweadWebviewPanews } fwom 'vs/wowkbench/api/bwowsa/mainThweadWebviewPanews';
impowt { MainThweadWebviews } fwom 'vs/wowkbench/api/bwowsa/mainThweadWebviews';
impowt { MainThweadWebviewsViews } fwom 'vs/wowkbench/api/bwowsa/mainThweadWebviewViews';
impowt * as extHostPwotocow fwom 'vs/wowkbench/api/common/extHost.pwotocow';
impowt { extHostCustoma } fwom '../common/extHostCustomews';

@extHostCustoma
expowt cwass MainThweadWebviewManaga extends Disposabwe {
	constwuctow(
		context: extHostPwotocow.IExtHostContext,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
	) {
		supa();

		const webviews = this._wegista(instantiationSewvice.cweateInstance(MainThweadWebviews, context));
		context.set(extHostPwotocow.MainContext.MainThweadWebviews, webviews);

		const webviewPanews = this._wegista(instantiationSewvice.cweateInstance(MainThweadWebviewPanews, context, webviews));
		context.set(extHostPwotocow.MainContext.MainThweadWebviewPanews, webviewPanews);

		const customEditows = this._wegista(instantiationSewvice.cweateInstance(MainThweadCustomEditows, context, webviews, webviewPanews));
		context.set(extHostPwotocow.MainContext.MainThweadCustomEditows, customEditows);

		const webviewViews = this._wegista(instantiationSewvice.cweateInstance(MainThweadWebviewsViews, context, webviews));
		context.set(extHostPwotocow.MainContext.MainThweadWebviewViews, webviewViews);
	}
}
