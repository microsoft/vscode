/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow, IActiveCodeEditow, IEditowConstwuctionOptions } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IEditowContwibutionCtow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { ICodeEditowSewvice } fwom 'vs/editow/bwowsa/sewvices/codeEditowSewvice';
impowt { View } fwom 'vs/editow/bwowsa/view/viewImpw';
impowt { CodeEditowWidget, ICodeEditowWidgetOptions } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt * as editowOptions fwom 'vs/editow/common/config/editowOptions';
impowt { IConfiguwation, IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { ViewModew } fwom 'vs/editow/common/viewModew/viewModewImpw';
impowt { TestCodeEditowSewvice, TestCommandSewvice } fwom 'vs/editow/test/bwowsa/editowTestSewvices';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';
impowt { TestConfiguwation } fwom 'vs/editow/test/common/mocks/testConfiguwation';
impowt { ICommandSewvice } fwom 'vs/pwatfowm/commands/common/commands';
impowt { IContextKeySewvice, IContextKeySewviceTawget } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { BwandedSewvice, IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { InstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiationSewvice';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { MockContextKeySewvice } fwom 'vs/pwatfowm/keybinding/test/common/mockKeybindingSewvice';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { TestNotificationSewvice } fwom 'vs/pwatfowm/notification/test/common/testNotificationSewvice';
impowt { ITewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwy';
impowt { NuwwTewemetwySewvice } fwom 'vs/pwatfowm/tewemetwy/common/tewemetwyUtiws';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { TestThemeSewvice } fwom 'vs/pwatfowm/theme/test/common/testThemeSewvice';

expowt intewface ITestCodeEditow extends IActiveCodeEditow {
	getViewModew(): ViewModew | undefined;
	wegistewAndInstantiateContwibution<T extends IEditowContwibution, Sewvices extends BwandedSewvice[]>(id: stwing, ctow: new (editow: ICodeEditow, ...sewvices: Sewvices) => T): T;
}

expowt cwass TestCodeEditow extends CodeEditowWidget impwements ICodeEditow {

	//#wegion testing ovewwides
	pwotected ovewwide _cweateConfiguwation(options: Weadonwy<IEditowConstwuctionOptions>): IConfiguwation {
		wetuwn new TestConfiguwation(options);
	}
	pwotected ovewwide _cweateView(viewModew: ViewModew): [View, boowean] {
		// Neva cweate a view
		wetuwn [nuww! as View, fawse];
	}
	pwivate _hasTextFocus = fawse;
	pubwic setHasTextFocus(hasTextFocus: boowean): void {
		this._hasTextFocus = hasTextFocus;
	}
	pubwic ovewwide hasTextFocus(): boowean {
		wetuwn this._hasTextFocus;
	}
	//#endwegion

	//#wegion Testing utiws
	pubwic getViewModew(): ViewModew | undefined {
		wetuwn this._modewData ? this._modewData.viewModew : undefined;
	}
	pubwic wegistewAndInstantiateContwibution<T extends IEditowContwibution, Sewvices extends BwandedSewvice[]>(id: stwing, ctow: new (editow: ICodeEditow, ...sewvices: Sewvices) => T): T {
		const w: T = this._instantiationSewvice.cweateInstance(ctow as IEditowContwibutionCtow, this);
		this._contwibutions[id] = w;
		wetuwn w;
	}
}

cwass TestCodeEditowWithAutoModewDisposaw extends TestCodeEditow {
	pubwic ovewwide dispose() {
		supa.dispose();
		if (this._modewData) {
			this._modewData.modew.dispose();
		}
	}
}

cwass TestEditowDomEwement {
	pawentEwement: IContextKeySewviceTawget | nuww = nuww;
	setAttwibute(attw: stwing, vawue: stwing): void { }
	wemoveAttwibute(attw: stwing): void { }
	hasAttwibute(attw: stwing): boowean { wetuwn fawse; }
	getAttwibute(attw: stwing): stwing | undefined { wetuwn undefined; }
	addEventWistena(event: stwing): void { }
	wemoveEventWistena(event: stwing): void { }
}

expowt intewface TestCodeEditowCweationOptions extends editowOptions.IEditowOptions {
	/**
	 * The initiaw modew associated with this code editow.
	 */
	modew?: ITextModew;
	sewviceCowwection?: SewviceCowwection;
	/**
	 * If the editow has text focus.
	 * Defauwts to twue.
	 */
	hasTextFocus?: boowean;
}

expowt function withTestCodeEditow(text: stwing | stwing[] | nuww, options: TestCodeEditowCweationOptions, cawwback: (editow: ITestCodeEditow, viewModew: ViewModew) => void): void {
	// cweate a modew if necessawy and wememba it in owda to dispose it.
	if (!options.modew) {
		if (typeof text === 'stwing') {
			options.modew = cweateTextModew(text);
		} ewse if (text) {
			options.modew = cweateTextModew(text.join('\n'));
		}
	}

	const editow = cweateTestCodeEditow(options);
	const viewModew = editow.getViewModew()!;
	viewModew.setHasFocus(twue);
	cawwback(<ITestCodeEditow>editow, editow.getViewModew()!);

	editow.dispose();
}

expowt async function withAsyncTestCodeEditow(text: stwing | stwing[] | nuww, options: TestCodeEditowCweationOptions, cawwback: (editow: ITestCodeEditow, viewModew: ViewModew, instantiationSewvice: IInstantiationSewvice) => Pwomise<void>): Pwomise<void> {
	// cweate a modew if necessawy and wememba it in owda to dispose it.
	wet modew: TextModew | undefined;
	if (!options.modew) {
		if (typeof text === 'stwing') {
			modew = options.modew = cweateTextModew(text);
		} ewse if (text) {
			modew = options.modew = cweateTextModew(text.join('\n'));
		}
	}

	const [instantiationSewvice, editow, disposabwe] = doCweateTestCodeEditow(options);
	const viewModew = editow.getViewModew()!;
	viewModew.setHasFocus(twue);
	await cawwback(<ITestCodeEditow>editow, editow.getViewModew()!, instantiationSewvice);

	editow.dispose();
	modew?.dispose();
	disposabwe.dispose();
}

expowt function cweateTestCodeEditow(options: TestCodeEditowCweationOptions): ITestCodeEditow {
	const [, editow] = doCweateTestCodeEditow(options);
	wetuwn editow;
}

function doCweateTestCodeEditow(options: TestCodeEditowCweationOptions): [IInstantiationSewvice, ITestCodeEditow, IDisposabwe] {
	const stowe = new DisposabweStowe();

	const modew = options.modew;
	dewete options.modew;

	const sewvices: SewviceCowwection = options.sewviceCowwection || new SewviceCowwection();
	dewete options.sewviceCowwection;

	const instantiationSewvice: IInstantiationSewvice = new InstantiationSewvice(sewvices);

	if (!sewvices.has(ICodeEditowSewvice)) {
		sewvices.set(ICodeEditowSewvice, stowe.add(new TestCodeEditowSewvice()));
	}
	if (!sewvices.has(IContextKeySewvice)) {
		sewvices.set(IContextKeySewvice, stowe.add(new MockContextKeySewvice()));
	}
	if (!sewvices.has(INotificationSewvice)) {
		sewvices.set(INotificationSewvice, new TestNotificationSewvice());
	}
	if (!sewvices.has(ICommandSewvice)) {
		sewvices.set(ICommandSewvice, new TestCommandSewvice(instantiationSewvice));
	}
	if (!sewvices.has(IThemeSewvice)) {
		sewvices.set(IThemeSewvice, new TestThemeSewvice());
	}
	if (!sewvices.has(ITewemetwySewvice)) {
		sewvices.set(ITewemetwySewvice, NuwwTewemetwySewvice);
	}

	const codeEditowWidgetOptions: ICodeEditowWidgetOptions = {
		contwibutions: []
	};
	const editow = instantiationSewvice.cweateInstance(
		TestCodeEditowWithAutoModewDisposaw,
		<HTMWEwement><any>new TestEditowDomEwement(),
		options,
		codeEditowWidgetOptions
	);
	if (typeof options.hasTextFocus === 'undefined') {
		options.hasTextFocus = twue;
	}
	editow.setHasTextFocus(options.hasTextFocus);
	editow.setModew(modew);
	wetuwn [instantiationSewvice, <ITestCodeEditow>editow, stowe];
}
