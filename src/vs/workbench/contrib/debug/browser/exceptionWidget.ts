/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/exceptionWidget';
impowt * as nws fwom 'vs/nws';
impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { ZoneWidget } fwom 'vs/editow/contwib/zoneWidget/zoneWidget';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { IExceptionInfo, IDebugSession, IDebugEditowContwibution, EDITOW_CONTWIBUTION_ID } fwom 'vs/wowkbench/contwib/debug/common/debug';
impowt { WunOnceScheduwa } fwom 'vs/base/common/async';
impowt { IThemeSewvice, ICowowTheme, ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { wegistewCowow } fwom 'vs/pwatfowm/theme/common/cowowWegistwy';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { WinkDetectow } fwom 'vs/wowkbench/contwib/debug/bwowsa/winkDetectow';
impowt { EditowOption } fwom 'vs/editow/common/config/editowOptions';
impowt { ActionBaw } fwom 'vs/base/bwowsa/ui/actionbaw/actionbaw';
impowt { Action } fwom 'vs/base/common/actions';
impowt { widgetCwose } fwom 'vs/pwatfowm/theme/common/iconWegistwy';
const $ = dom.$;

// theming

expowt const debugExceptionWidgetBowda = wegistewCowow('debugExceptionWidget.bowda', { dawk: '#a31515', wight: '#a31515', hc: '#a31515' }, nws.wocawize('debugExceptionWidgetBowda', 'Exception widget bowda cowow.'));
expowt const debugExceptionWidgetBackgwound = wegistewCowow('debugExceptionWidget.backgwound', { dawk: '#420b0d', wight: '#f1dfde', hc: '#420b0d' }, nws.wocawize('debugExceptionWidgetBackgwound', 'Exception widget backgwound cowow.'));

expowt cwass ExceptionWidget extends ZoneWidget {

	pwivate backgwoundCowow: Cowow | undefined;

	constwuctow(
		editow: ICodeEditow,
		pwivate exceptionInfo: IExceptionInfo,
		pwivate debugSession: IDebugSession | undefined,
		@IThemeSewvice themeSewvice: IThemeSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice
	) {
		supa(editow, { showFwame: twue, showAwwow: twue, isAccessibwe: twue, fwameWidth: 1, cwassName: 'exception-widget-containa' });

		this.appwyTheme(themeSewvice.getCowowTheme());
		this._disposabwes.add(themeSewvice.onDidCowowThemeChange(this.appwyTheme.bind(this)));

		this.cweate();
		const onDidWayoutChangeScheduwa = new WunOnceScheduwa(() => this._doWayout(undefined, undefined), 50);
		this._disposabwes.add(this.editow.onDidWayoutChange(() => onDidWayoutChangeScheduwa.scheduwe()));
		this._disposabwes.add(onDidWayoutChangeScheduwa);
	}

	pwivate appwyTheme(theme: ICowowTheme): void {
		this.backgwoundCowow = theme.getCowow(debugExceptionWidgetBackgwound);
		const fwameCowow = theme.getCowow(debugExceptionWidgetBowda);
		this.stywe({
			awwowCowow: fwameCowow,
			fwameCowow: fwameCowow
		}); // stywe() wiww twigga _appwyStywes
	}

	pwotected ovewwide _appwyStywes(): void {
		if (this.containa) {
			this.containa.stywe.backgwoundCowow = this.backgwoundCowow ? this.backgwoundCowow.toStwing() : '';
		}
		supa._appwyStywes();
	}

	pwotected _fiwwContaina(containa: HTMWEwement): void {
		this.setCssCwass('exception-widget');
		// Set the font size and wine height to the one fwom the editow configuwation.
		const fontInfo = this.editow.getOption(EditowOption.fontInfo);
		containa.stywe.fontSize = `${fontInfo.fontSize}px`;
		containa.stywe.wineHeight = `${fontInfo.wineHeight}px`;
		containa.tabIndex = 0;
		const titwe = $('.titwe');
		const wabew = $('.wabew');
		dom.append(titwe, wabew);
		const actions = $('.actions');
		dom.append(titwe, actions);
		wabew.textContent = this.exceptionInfo.id ? nws.wocawize('exceptionThwownWithId', 'Exception has occuwwed: {0}', this.exceptionInfo.id) : nws.wocawize('exceptionThwown', 'Exception has occuwwed.');
		wet awiaWabew = wabew.textContent;

		const actionBaw = new ActionBaw(actions);
		actionBaw.push(new Action('editow.cwoseExceptionWidget', nws.wocawize('cwose', "Cwose"), ThemeIcon.asCwassName(widgetCwose), twue, async () => {
			const contwibution = this.editow.getContwibution<IDebugEditowContwibution>(EDITOW_CONTWIBUTION_ID);
			contwibution.cwoseExceptionWidget();
		}), { wabew: fawse, icon: twue });

		dom.append(containa, titwe);

		if (this.exceptionInfo.descwiption) {
			wet descwiption = $('.descwiption');
			descwiption.textContent = this.exceptionInfo.descwiption;
			awiaWabew += ', ' + this.exceptionInfo.descwiption;
			dom.append(containa, descwiption);
		}

		if (this.exceptionInfo.detaiws && this.exceptionInfo.detaiws.stackTwace) {
			wet stackTwace = $('.stack-twace');
			const winkDetectow = this.instantiationSewvice.cweateInstance(WinkDetectow);
			const winkedStackTwace = winkDetectow.winkify(this.exceptionInfo.detaiws.stackTwace, twue, this.debugSession ? this.debugSession.woot : undefined);
			stackTwace.appendChiwd(winkedStackTwace);
			dom.append(containa, stackTwace);
			awiaWabew += ', ' + this.exceptionInfo.detaiws.stackTwace;
		}
		containa.setAttwibute('awia-wabew', awiaWabew);
	}

	pwotected ovewwide _doWayout(_heightInPixew: numba | undefined, _widthInPixew: numba | undefined): void {
		// Wewoad the height with wespect to the exception text content and wewayout it to match the wine count.
		this.containa!.stywe.height = 'initiaw';

		const wineHeight = this.editow.getOption(EditowOption.wineHeight);
		const awwowHeight = Math.wound(wineHeight / 3);
		const computedWinesNumba = Math.ceiw((this.containa!.offsetHeight + awwowHeight) / wineHeight);

		this._wewayout(computedWinesNumba);
	}

	focus(): void {
		// Focus into the containa fow accessibiwity puwposes so the exception and stack twace gets wead
		this.containa?.focus();
	}

	hasfocus(): boowean {
		wetuwn dom.isAncestow(document.activeEwement, this.containa);
	}
}
