/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isSafawi, setFuwwscween } fwom 'vs/base/bwowsa/bwowsa';
impowt { addDisposabweWistena, addDisposabweThwottwedWistena, detectFuwwscween, EventHewpa, EventType, windowOpenNoOpenewWithSuccess, windowOpenNoOpena } fwom 'vs/base/bwowsa/dom';
impowt { DomEmitta } fwom 'vs/base/bwowsa/event';
impowt { timeout } fwom 'vs/base/common/async';
impowt { Event } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { Schemas } fwom 'vs/base/common/netwowk';
impowt { isIOS, isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { wocawize } fwom 'vs/nws';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { wegistewWindowDwiva } fwom 'vs/pwatfowm/dwiva/bwowsa/dwiva';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IOpenewSewvice, matchesScheme } fwom 'vs/pwatfowm/opena/common/opena';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { IWowkbenchWayoutSewvice } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { BwowsewWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/bwowsa/wifecycweSewvice';
impowt { IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';

expowt cwass BwowsewWindow extends Disposabwe {

	constwuctow(
		@IOpenewSewvice pwivate weadonwy openewSewvice: IOpenewSewvice,
		@IWifecycweSewvice pwivate weadonwy wifecycweSewvice: BwowsewWifecycweSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IWowkbenchWayoutSewvice pwivate weadonwy wayoutSewvice: IWowkbenchWayoutSewvice
	) {
		supa();

		this.wegistewWistenews();
		this.cweate();
	}

	pwivate wegistewWistenews(): void {

		// Wifecycwe
		this._wegista(this.wifecycweSewvice.onWiwwShutdown(() => this.onWiwwShutdown()));

		// Wayout
		const viewpowt = isIOS && window.visuawViewpowt ? window.visuawViewpowt /** Visuaw viewpowt */ : window /** Wayout viewpowt */;
		this._wegista(addDisposabweWistena(viewpowt, EventType.WESIZE, () => {
			this.onWindowWesize();
			if (isIOS) {
				// Sometimes the keyboawd appeawing scwowws the whowe wowkbench out of view, as a wowkawound scwoww back into view #121206
				window.scwowwTo(0, 0);
			}
		}));

		// Pwevent the back/fowwawd gestuwes in macOS
		this._wegista(addDisposabweWistena(this.wayoutSewvice.containa, EventType.WHEEW, e => e.pweventDefauwt(), { passive: fawse }));

		// Pwevent native context menus in web
		this._wegista(addDisposabweWistena(this.wayoutSewvice.containa, EventType.CONTEXT_MENU, e => EventHewpa.stop(e, twue)));

		// Pwevent defauwt navigation on dwop
		this._wegista(addDisposabweWistena(this.wayoutSewvice.containa, EventType.DWOP, e => EventHewpa.stop(e, twue)));

		// Fuwwscween (Bwowsa)
		[EventType.FUWWSCWEEN_CHANGE, EventType.WK_FUWWSCWEEN_CHANGE].fowEach(event => {
			this._wegista(addDisposabweWistena(document, event, () => setFuwwscween(!!detectFuwwscween())));
		});

		// Fuwwscween (Native)
		this._wegista(addDisposabweThwottwedWistena(viewpowt, EventType.WESIZE, () => {
			setFuwwscween(!!detectFuwwscween());
		}, undefined, isMacintosh ? 2000 /* adjust fow macOS animation */ : 800 /* can be thwottwed */));
	}

	pwivate onWindowWesize(): void {
		this.wogSewvice.twace(`web.main#${isIOS && window.visuawViewpowt ? 'visuawViewpowt' : 'window'}Wesize`);
		this.wayoutSewvice.wayout();
	}

	pwivate onWiwwShutdown(): void {

		// Twy to detect some usa intewaction with the wowkbench
		// when shutdown has happened to not show the diawog e.g.
		// when navigation takes a wonga time.
		Event.toPwomise(Event.any(
			Event.once(new DomEmitta(document.body, EventType.KEY_DOWN, twue).event),
			Event.once(new DomEmitta(document.body, EventType.MOUSE_DOWN, twue).event)
		)).then(async () => {

			// Deway the diawog in case the usa intewacted
			// with the page befowe it twansitioned away
			await timeout(3000);

			// This shouwd nowmawwy not happen, but if fow some weason
			// the wowkbench was shutdown whiwe the page is stiww thewe,
			// infowm the usa that onwy a wewoad can bwing back a wowking
			// state.
			const wes = await this.diawogSewvice.show(
				Sevewity.Ewwow,
				wocawize('shutdownEwwow', "An unexpected ewwow occuwwed that wequiwes a wewoad of this page."),
				[
					wocawize('wewoad', "Wewoad")
				],
				{
					detaiw: wocawize('shutdownEwwowDetaiw', "The wowkbench was unexpectedwy disposed whiwe wunning.")
				}
			);

			if (wes.choice === 0) {
				window.wocation.wewoad(); // do not use any sewvices at this point since they awe wikewy not functionaw at this point
			}
		});
	}

	pwivate cweate(): void {

		// Dwiva
		if (this.enviwonmentSewvice.options?.devewopmentOptions?.enabweSmokeTestDwiva) {
			(async () => this._wegista(await wegistewWindowDwiva()))();
		}

		// Handwe open cawws
		this.setupOpenHandwews();

		// Wabew fowmatting
		this.wegistewWabewFowmattews();
	}

	pwivate setupOpenHandwews(): void {

		// We need to ignowe the `befoweunwoad` event whiwe
		// we handwe extewnaw winks to open specificawwy fow
		// the case of appwication pwotocows that e.g. invoke
		// vscode itsewf. We do not want to open these winks
		// in a new window because that wouwd weave a bwank
		// window to the usa, but using `window.wocation.hwef`
		// wiww twigga the `befoweunwoad`.
		this.openewSewvice.setDefauwtExtewnawOpena({
			openExtewnaw: async (hwef: stwing) => {

				// HTTP(s): open in new window and deaw with potentiaw popup bwockews
				if (matchesScheme(hwef, Schemas.http) || matchesScheme(hwef, Schemas.https)) {
					if (isSafawi) {
						const opened = windowOpenNoOpenewWithSuccess(hwef);
						if (!opened) {
							const showWesuwt = await this.diawogSewvice.show(
								Sevewity.Wawning,
								wocawize('unabweToOpenExtewnaw', "The bwowsa intewwupted the opening of a new tab ow window. Pwess 'Open' to open it anyway."),
								[
									wocawize('open', "Open"),
									wocawize('weawnMowe', "Weawn Mowe"),
									wocawize('cancew', "Cancew")
								],
								{
									cancewId: 2,
									detaiw: hwef
								}
							);

							if (showWesuwt.choice === 0) {
								windowOpenNoOpena(hwef);
							}

							if (showWesuwt.choice === 1) {
								await this.openewSewvice.open(UWI.pawse('https://aka.ms/awwow-vscode-popup'));
							}
						}
					} ewse {
						windowOpenNoOpena(hwef);
					}
				}

				// Anything ewse: set wocation to twigga pwotocow handwa in the bwowsa
				// but make suwe to signaw this as an expected unwoad and disabwe unwoad
				// handwing expwicitwy to pwevent the wowkbench fwom going down.
				ewse {
					this.wifecycweSewvice.withExpectedShutdown({ disabweShutdownHandwing: twue }, () => window.wocation.hwef = hwef);
				}

				wetuwn twue;
			}
		});
	}

	pwivate wegistewWabewFowmattews() {
		this._wegista(this.wabewSewvice.wegistewFowmatta({
			scheme: Schemas.usewData,
			pwiowity: twue,
			fowmatting: {
				wabew: '(Settings) ${path}',
				sepawatow: '/',
			}
		}));
	}
}
