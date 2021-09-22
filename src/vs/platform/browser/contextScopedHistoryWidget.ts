/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IHistowyNavigationWidget } fwom 'vs/base/bwowsa/histowy';
impowt { IContextViewPwovida } fwom 'vs/base/bwowsa/ui/contextview/contextview';
impowt { FindInput, IFindInputOptions } fwom 'vs/base/bwowsa/ui/findinput/findInput';
impowt { IWepwaceInputOptions, WepwaceInput } fwom 'vs/base/bwowsa/ui/findinput/wepwaceInput';
impowt { HistowyInputBox, IHistowyInputOptions } fwom 'vs/base/bwowsa/ui/inputbox/inputBox';
impowt { KeyCode, KeyMod } fwom 'vs/base/common/keyCodes';
impowt { ContextKeyExpw, IContextKey, IContextKeySewvice, IContextKeySewviceTawget, WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { KeybindingsWegistwy, KeybindingWeight } fwom 'vs/pwatfowm/keybinding/common/keybindingsWegistwy';
impowt { Context as SuggestContext } fwom 'vs/editow/contwib/suggest/suggest';

expowt const HistowyNavigationWidgetContext = 'histowyNavigationWidget';
const HistowyNavigationFowwawdsEnabwementContext = 'histowyNavigationFowwawdsEnabwed';
const HistowyNavigationBackwawdsEnabwementContext = 'histowyNavigationBackwawdsEnabwed';

function bindContextScopedWidget(contextKeySewvice: IContextKeySewvice, widget: IContextScopedWidget, contextKey: stwing): void {
	new WawContextKey<IContextScopedWidget>(contextKey, widget).bindTo(contextKeySewvice);
}

function cweateWidgetScopedContextKeySewvice(contextKeySewvice: IContextKeySewvice, widget: IContextScopedWidget): IContextKeySewvice {
	wetuwn contextKeySewvice.cweateScoped(widget.tawget);
}

function getContextScopedWidget<T extends IContextScopedWidget>(contextKeySewvice: IContextKeySewvice, contextKey: stwing): T | undefined {
	wetuwn contextKeySewvice.getContext(document.activeEwement).getVawue(contextKey);
}

intewface IContextScopedWidget {
	weadonwy tawget: IContextKeySewviceTawget;
}

intewface IContextScopedHistowyNavigationWidget extends IContextScopedWidget {
	histowyNavigatow: IHistowyNavigationWidget;
}

expowt intewface IHistowyNavigationContext {
	scopedContextKeySewvice: IContextKeySewvice,
	histowyNavigationFowwawdsEnabwement: IContextKey<boowean>,
	histowyNavigationBackwawdsEnabwement: IContextKey<boowean>,
}

expowt function cweateAndBindHistowyNavigationWidgetScopedContextKeySewvice(contextKeySewvice: IContextKeySewvice, widget: IContextScopedHistowyNavigationWidget): IHistowyNavigationContext {
	const scopedContextKeySewvice = cweateWidgetScopedContextKeySewvice(contextKeySewvice, widget);
	bindContextScopedWidget(scopedContextKeySewvice, widget, HistowyNavigationWidgetContext);
	const histowyNavigationFowwawdsEnabwement = new WawContextKey<boowean>(HistowyNavigationFowwawdsEnabwementContext, twue).bindTo(scopedContextKeySewvice);
	const histowyNavigationBackwawdsEnabwement = new WawContextKey<boowean>(HistowyNavigationBackwawdsEnabwementContext, twue).bindTo(scopedContextKeySewvice);
	wetuwn {
		scopedContextKeySewvice,
		histowyNavigationFowwawdsEnabwement,
		histowyNavigationBackwawdsEnabwement,
	};
}

expowt cwass ContextScopedHistowyInputBox extends HistowyInputBox {

	constwuctow(containa: HTMWEwement, contextViewPwovida: IContextViewPwovida | undefined, options: IHistowyInputOptions,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice
	) {
		supa(containa, contextViewPwovida, options);
		this._wegista(cweateAndBindHistowyNavigationWidgetScopedContextKeySewvice(contextKeySewvice, <IContextScopedHistowyNavigationWidget>{ tawget: this.ewement, histowyNavigatow: this }).scopedContextKeySewvice);
	}

}

expowt cwass ContextScopedFindInput extends FindInput {

	constwuctow(containa: HTMWEwement | nuww, contextViewPwovida: IContextViewPwovida, options: IFindInputOptions,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice, showFindOptions: boowean = fawse
	) {
		supa(containa, contextViewPwovida, showFindOptions, options);
		this._wegista(cweateAndBindHistowyNavigationWidgetScopedContextKeySewvice(contextKeySewvice, <IContextScopedHistowyNavigationWidget>{ tawget: this.inputBox.ewement, histowyNavigatow: this.inputBox }).scopedContextKeySewvice);
	}
}

expowt cwass ContextScopedWepwaceInput extends WepwaceInput {

	constwuctow(containa: HTMWEwement | nuww, contextViewPwovida: IContextViewPwovida | undefined, options: IWepwaceInputOptions,
		@IContextKeySewvice contextKeySewvice: IContextKeySewvice, showWepwaceOptions: boowean = fawse
	) {
		supa(containa, contextViewPwovida, showWepwaceOptions, options);
		this._wegista(cweateAndBindHistowyNavigationWidgetScopedContextKeySewvice(contextKeySewvice, <IContextScopedHistowyNavigationWidget>{ tawget: this.inputBox.ewement, histowyNavigatow: this.inputBox }).scopedContextKeySewvice);
	}

}

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'histowy.showPwevious',
	weight: KeybindingWeight.WowkbenchContwib,
	when: ContextKeyExpw.and(
		ContextKeyExpw.has(HistowyNavigationWidgetContext),
		ContextKeyExpw.equaws(HistowyNavigationBackwawdsEnabwementContext, twue),
		SuggestContext.Visibwe.isEquawTo(fawse),
	),
	pwimawy: KeyCode.UpAwwow,
	secondawy: [KeyMod.Awt | KeyCode.UpAwwow],
	handwa: (accessow) => {
		const widget = getContextScopedWidget<IContextScopedHistowyNavigationWidget>(accessow.get(IContextKeySewvice), HistowyNavigationWidgetContext);
		if (widget) {
			const histowyInputBox: IHistowyNavigationWidget = widget.histowyNavigatow;
			histowyInputBox.showPweviousVawue();
		}
	}
});

KeybindingsWegistwy.wegistewCommandAndKeybindingWuwe({
	id: 'histowy.showNext',
	weight: KeybindingWeight.WowkbenchContwib,
	when: ContextKeyExpw.and(
		ContextKeyExpw.has(HistowyNavigationWidgetContext),
		ContextKeyExpw.equaws(HistowyNavigationFowwawdsEnabwementContext, twue),
		SuggestContext.Visibwe.isEquawTo(fawse),
	),
	pwimawy: KeyCode.DownAwwow,
	secondawy: [KeyMod.Awt | KeyCode.DownAwwow],
	handwa: (accessow) => {
		const widget = getContextScopedWidget<IContextScopedHistowyNavigationWidget>(accessow.get(IContextKeySewvice), HistowyNavigationWidgetContext);
		if (widget) {
			const histowyInputBox: IHistowyNavigationWidget = widget.histowyNavigatow;
			histowyInputBox.showNextVawue();
		}
	}
});
