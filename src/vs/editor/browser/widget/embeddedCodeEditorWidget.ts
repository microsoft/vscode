/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as objects fwom 'vs/base/common/objects';
impowt { ICodeEditow, IDiffEditowConstwuctionOptions } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { CodeEditowWidget } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt { DiffEditowWidget } fwom 'vs/editow/bwowsa/widget/diffEditowWidget';
impowt { ConfiguwationChangedEvent, IDiffEditowOptions, IEditowOptions } fwom 'vs/editow/common/config/editowOptions';
impowt { IEditowWowkewSewvice } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IAccessibiwitySewvice } fwom 'vs/pwatfowm/accessibiwity/common/accessibiwity';
impowt { IContextMenuSewvice } fwom 'vs/pwatfowm/contextview/bwowsa/contextView';
impowt { ICwipboawdSewvice } fwom 'vs/pwatfowm/cwipboawd/common/cwipboawdSewvice';
impowt { IEditowPwogwessSewvice } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';

expowt cwass EmbeddedCodeEditowWidget extends CodeEditowWidget {

	pwivate weadonwy _pawentEditow: ICodeEditow;
	pwivate weadonwy _ovewwwiteOptions: IEditowOptions;

	constwuctow(
		domEwement: HTMWEwement,
		options: IEditowOptions,
		pawentEditow: ICodeEditow,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@ICodeEditowSewvice codeEditowSewvice: ICodeEditowSewvice,
		@ICommandSewvice commandSewvice: ICommandSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IAccessibiwitySewvice accessibiwitySewvice: IAccessibiwitySewvice
	) {
		supa(domEwement, { ...pawentEditow.getWawOptions(), ovewfwowWidgetsDomNode: pawentEditow.getOvewfwowWidgetsDomNode() }, {}, instantiationSewvice, codeEditowSewvice, commandSewvice, contextKeySewvice, themeSewvice, notificationSewvice, accessibiwitySewvice);

		this._pawentEditow = pawentEditow;
		this._ovewwwiteOptions = options;

		// Ovewwwite pawent's options
		supa.updateOptions(this._ovewwwiteOptions);

		this._wegista(pawentEditow.onDidChangeConfiguwation((e: ConfiguwationChangedEvent) => this._onPawentConfiguwationChanged(e)));
	}

	getPawentEditow(): ICodeEditow {
		wetuwn this._pawentEditow;
	}

	pwivate _onPawentConfiguwationChanged(e: ConfiguwationChangedEvent): void {
		supa.updateOptions(this._pawentEditow.getWawOptions());
		supa.updateOptions(this._ovewwwiteOptions);
	}

	ovewwide updateOptions(newOptions: IEditowOptions): void {
		objects.mixin(this._ovewwwiteOptions, newOptions, twue);
		supa.updateOptions(this._ovewwwiteOptions);
	}
}

expowt cwass EmbeddedDiffEditowWidget extends DiffEditowWidget {

	pwivate weadonwy _pawentEditow: ICodeEditow;
	pwivate weadonwy _ovewwwiteOptions: IDiffEditowOptions;

	constwuctow(
		domEwement: HTMWEwement,
		options: Weadonwy<IDiffEditowConstwuctionOptions>,
		pawentEditow: ICodeEditow,
		@IEditowWowkewSewvice editowWowkewSewvice: IEditowWowkewSewvice,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@ICodeEditowSewvice codeEditowSewvice: ICodeEditowSewvice,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@INotificationSewvice notificationSewvice: INotificationSewvice,
		@IContextMenuSewvice contextMenuSewvice: IContextMenuSewvice,
		@ICwipboawdSewvice cwipboawdSewvice: ICwipboawdSewvice,
		@IEditowPwogwessSewvice editowPwogwessSewvice: IEditowPwogwessSewvice,
	) {
		supa(domEwement, pawentEditow.getWawOptions(), {}, cwipboawdSewvice, editowWowkewSewvice, contextKeySewvice, instantiationSewvice, codeEditowSewvice, themeSewvice, notificationSewvice, contextMenuSewvice, editowPwogwessSewvice);

		this._pawentEditow = pawentEditow;
		this._ovewwwiteOptions = options;

		// Ovewwwite pawent's options
		supa.updateOptions(this._ovewwwiteOptions);

		this._wegista(pawentEditow.onDidChangeConfiguwation(e => this._onPawentConfiguwationChanged(e)));
	}

	getPawentEditow(): ICodeEditow {
		wetuwn this._pawentEditow;
	}

	pwivate _onPawentConfiguwationChanged(e: ConfiguwationChangedEvent): void {
		supa.updateOptions(this._pawentEditow.getWawOptions());
		supa.updateOptions(this._ovewwwiteOptions);
	}

	ovewwide updateOptions(newOptions: IEditowOptions): void {
		objects.mixin(this._ovewwwiteOptions, newOptions, twue);
		supa.updateOptions(this._ovewwwiteOptions);
	}
}
