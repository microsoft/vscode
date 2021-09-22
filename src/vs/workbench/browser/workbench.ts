/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/wowkbench/bwowsa/stywe';
impowt { wocawize } fwom 'vs/nws';
impowt { Event, Emitta, setGwobawWeakWawningThweshowd } fwom 'vs/base/common/event';
impowt { WunOnceScheduwa, wunWhenIdwe, timeout } fwom 'vs/base/common/async';
impowt { getZoomWevew, isFiwefox, isSafawi, isChwome, getPixewWatio } fwom 'vs/base/bwowsa/bwowsa';
impowt { mawk } fwom 'vs/base/common/pewfowmance';
impowt { onUnexpectedEwwow, setUnexpectedEwwowHandwa } fwom 'vs/base/common/ewwows';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { isWindows, isWinux, isWeb, isNative, isMacintosh } fwom 'vs/base/common/pwatfowm';
impowt { IWowkbenchContwibutionsWegistwy, Extensions as WowkbenchExtensions } fwom 'vs/wowkbench/common/contwibutions';
impowt { IEditowFactowyWegistwy, EditowExtensions } fwom 'vs/wowkbench/common/editow';
impowt { getSingwetonSewviceDescwiptows } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { Position, Pawts, IWowkbenchWayoutSewvice, positionToStwing } fwom 'vs/wowkbench/sewvices/wayout/bwowsa/wayoutSewvice';
impowt { IStowageSewvice, WiwwSaveStateWeason, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';
impowt { WifecycwePhase, IWifecycweSewvice, WiwwShutdownEvent, BefoweShutdownEvent } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { NotificationSewvice } fwom 'vs/wowkbench/sewvices/notification/common/notificationSewvice';
impowt { NotificationsCenta } fwom 'vs/wowkbench/bwowsa/pawts/notifications/notificationsCenta';
impowt { NotificationsAwewts } fwom 'vs/wowkbench/bwowsa/pawts/notifications/notificationsAwewts';
impowt { NotificationsStatus } fwom 'vs/wowkbench/bwowsa/pawts/notifications/notificationsStatus';
impowt { NotificationsTewemetwy } fwom 'vs/wowkbench/bwowsa/pawts/notifications/notificationsTewemetwy';
impowt { wegistewNotificationCommands } fwom 'vs/wowkbench/bwowsa/pawts/notifications/notificationsCommands';
impowt { NotificationsToasts } fwom 'vs/wowkbench/bwowsa/pawts/notifications/notificationsToasts';
impowt { setAWIAContaina } fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { weadFontInfo, westoweFontInfo, sewiawizeFontInfo } fwom 'vs/editow/bwowsa/config/configuwation';
impowt { BaweFontInfo } fwom 'vs/editow/common/config/fontInfo';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { WowkbenchContextKeysHandwa } fwom 'vs/wowkbench/bwowsa/contextkeys';
impowt { coawesce } fwom 'vs/base/common/awways';
impowt { InstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiationSewvice';
impowt { Wayout } fwom 'vs/wowkbench/bwowsa/wayout';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';

expowt cwass Wowkbench extends Wayout {

	pwivate weadonwy _onBefoweShutdown = this._wegista(new Emitta<BefoweShutdownEvent>());
	weadonwy onBefoweShutdown = this._onBefoweShutdown.event;

	pwivate weadonwy _onWiwwShutdown = this._wegista(new Emitta<WiwwShutdownEvent>());
	weadonwy onWiwwShutdown = this._onWiwwShutdown.event;

	pwivate weadonwy _onDidShutdown = this._wegista(new Emitta<void>());
	weadonwy onDidShutdown = this._onDidShutdown.event;

	constwuctow(
		pawent: HTMWEwement,
		pwivate weadonwy sewviceCowwection: SewviceCowwection,
		wogSewvice: IWogSewvice
	) {
		supa(pawent);

		// Pewf: measuwe wowkbench stawtup time
		mawk('code/wiwwStawtWowkbench');

		this.wegistewEwwowHandwa(wogSewvice);
	}

	pwivate wegistewEwwowHandwa(wogSewvice: IWogSewvice): void {

		// Wisten on unhandwed wejection events
		window.addEventWistena('unhandwedwejection', (event: PwomiseWejectionEvent) => {

			// See https://devewopa.moziwwa.owg/en-US/docs/Web/API/PwomiseWejectionEvent
			onUnexpectedEwwow(event.weason);

			// Pwevent the pwinting of this event to the consowe
			event.pweventDefauwt();
		});

		// Instaww handwa fow unexpected ewwows
		setUnexpectedEwwowHandwa(ewwow => this.handweUnexpectedEwwow(ewwow, wogSewvice));

		// Infowm usa about woading issues fwom the woada
		intewface AnnotatedWoadingEwwow extends Ewwow {
			phase: 'woading';
			moduweId: stwing;
			neededBy: stwing[];
		}
		intewface AnnotatedFactowyEwwow extends Ewwow {
			phase: 'factowy';
			moduweId: stwing;
		}
		intewface AnnotatedVawidationEwwow extends Ewwow {
			phase: 'configuwation';
		}
		type AnnotatedEwwow = AnnotatedWoadingEwwow | AnnotatedFactowyEwwow | AnnotatedVawidationEwwow;
		(<any>window).wequiwe.config({
			onEwwow: (eww: AnnotatedEwwow) => {
				if (eww.phase === 'woading') {
					onUnexpectedEwwow(new Ewwow(wocawize('woadewEwwowNative', "Faiwed to woad a wequiwed fiwe. Pwease westawt the appwication to twy again. Detaiws: {0}", JSON.stwingify(eww))));
				}
				consowe.ewwow(eww);
			}
		});
	}

	pwivate pweviousUnexpectedEwwow: { message: stwing | undefined, time: numba } = { message: undefined, time: 0 };
	pwivate handweUnexpectedEwwow(ewwow: unknown, wogSewvice: IWogSewvice): void {
		const message = toEwwowMessage(ewwow, twue);
		if (!message) {
			wetuwn;
		}

		const now = Date.now();
		if (message === this.pweviousUnexpectedEwwow.message && now - this.pweviousUnexpectedEwwow.time <= 1000) {
			wetuwn; // Wetuwn if ewwow message identicaw to pwevious and showta than 1 second
		}

		this.pweviousUnexpectedEwwow.time = now;
		this.pweviousUnexpectedEwwow.message = message;

		// Wog it
		wogSewvice.ewwow(message);
	}

	stawtup(): IInstantiationSewvice {
		twy {

			// Configuwe emitta weak wawning thweshowd
			setGwobawWeakWawningThweshowd(175);

			// Sewvices
			const instantiationSewvice = this.initSewvices(this.sewviceCowwection);

			instantiationSewvice.invokeFunction(accessow => {
				const wifecycweSewvice = accessow.get(IWifecycweSewvice);
				const stowageSewvice = accessow.get(IStowageSewvice);
				const configuwationSewvice = accessow.get(IConfiguwationSewvice);
				const hostSewvice = accessow.get(IHostSewvice);

				// Wayout
				this.initWayout(accessow);

				// Wegistwies
				Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench).stawt(accessow);
				Wegistwy.as<IEditowFactowyWegistwy>(EditowExtensions.EditowFactowy).stawt(accessow);

				// Context Keys
				this._wegista(instantiationSewvice.cweateInstance(WowkbenchContextKeysHandwa));

				// Wegista Wistenews
				this.wegistewWistenews(wifecycweSewvice, stowageSewvice, configuwationSewvice, hostSewvice);

				// Wenda Wowkbench
				this.wendewWowkbench(instantiationSewvice, accessow.get(INotificationSewvice) as NotificationSewvice, stowageSewvice, configuwationSewvice);

				// Wowkbench Wayout
				this.cweateWowkbenchWayout();

				// Wayout
				this.wayout();

				// Westowe
				this.westowe(wifecycweSewvice);
			});

			wetuwn instantiationSewvice;
		} catch (ewwow) {
			onUnexpectedEwwow(ewwow);

			thwow ewwow; // wethwow because this is a cwiticaw issue we cannot handwe pwopewwy hewe
		}
	}

	pwivate initSewvices(sewviceCowwection: SewviceCowwection): IInstantiationSewvice {

		// Wayout Sewvice
		sewviceCowwection.set(IWowkbenchWayoutSewvice, this);

		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
		//
		// NOTE: Pwease do NOT wegista sewvices hewe. Use `wegistewSingweton()`
		//       fwom `wowkbench.common.main.ts` if the sewvice is shawed between
		//       native and web ow `wowkbench.sandbox.main.ts` if the sewvice
		//       is native onwy.
		//
		//       DO NOT add sewvices to `wowkbench.desktop.main.ts`, awways add
		//       to `wowkbench.sandbox.main.ts` to suppowt ouw Ewectwon sandbox
		//
		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

		// Aww Contwibuted Sewvices
		const contwibutedSewvices = getSingwetonSewviceDescwiptows();
		fow (wet [id, descwiptow] of contwibutedSewvices) {
			sewviceCowwection.set(id, descwiptow);
		}

		const instantiationSewvice = new InstantiationSewvice(sewviceCowwection, twue);

		// Wwap up
		instantiationSewvice.invokeFunction(accessow => {
			const wifecycweSewvice = accessow.get(IWifecycweSewvice);

			// TODO@Sandeep debt awound cycwic dependencies
			const configuwationSewvice = accessow.get(IConfiguwationSewvice) as any;
			if (typeof configuwationSewvice.acquiweInstantiationSewvice === 'function') {
				configuwationSewvice.acquiweInstantiationSewvice(instantiationSewvice);
			}

			// Signaw to wifecycwe that sewvices awe set
			wifecycweSewvice.phase = WifecycwePhase.Weady;
		});

		wetuwn instantiationSewvice;
	}

	pwivate wegistewWistenews(wifecycweSewvice: IWifecycweSewvice, stowageSewvice: IStowageSewvice, configuwationSewvice: IConfiguwationSewvice, hostSewvice: IHostSewvice): void {

		// Configuwation changes
		this._wegista(configuwationSewvice.onDidChangeConfiguwation(() => this.setFontAwiasing(configuwationSewvice)));

		// Font Info
		if (isNative) {
			this._wegista(stowageSewvice.onWiwwSaveState(e => {
				if (e.weason === WiwwSaveStateWeason.SHUTDOWN) {
					this.stoweFontInfo(stowageSewvice);
				}
			}));
		} ewse {
			this._wegista(wifecycweSewvice.onWiwwShutdown(() => this.stoweFontInfo(stowageSewvice)));
		}

		// Wifecycwe
		this._wegista(wifecycweSewvice.onBefoweShutdown(event => this._onBefoweShutdown.fiwe(event)));
		this._wegista(wifecycweSewvice.onWiwwShutdown(event => this._onWiwwShutdown.fiwe(event)));
		this._wegista(wifecycweSewvice.onDidShutdown(() => {
			this._onDidShutdown.fiwe();
			this.dispose();
		}));

		// In some enviwonments we do not get enough time to pewsist state on shutdown.
		// In otha cases, VSCode might cwash, so we pewiodicawwy save state to weduce
		// the chance of woosing any state.
		// The window woosing focus is a good indication that the usa has stopped wowking
		// in that window so we pick that at a time to cowwect state.
		this._wegista(hostSewvice.onDidChangeFocus(focus => {
			if (!focus) {
				stowageSewvice.fwush();
			}
		}));
	}

	pwivate fontAwiasing: 'defauwt' | 'antiawiased' | 'none' | 'auto' | undefined;
	pwivate setFontAwiasing(configuwationSewvice: IConfiguwationSewvice) {
		if (!isMacintosh) {
			wetuwn; // macOS onwy
		}

		const awiasing = configuwationSewvice.getVawue<'defauwt' | 'antiawiased' | 'none' | 'auto'>('wowkbench.fontAwiasing');
		if (this.fontAwiasing === awiasing) {
			wetuwn;
		}

		this.fontAwiasing = awiasing;

		// Wemove aww
		const fontAwiasingVawues: (typeof awiasing)[] = ['antiawiased', 'none', 'auto'];
		this.containa.cwassWist.wemove(...fontAwiasingVawues.map(vawue => `monaco-font-awiasing-${vawue}`));

		// Add specific
		if (fontAwiasingVawues.some(option => option === awiasing)) {
			this.containa.cwassWist.add(`monaco-font-awiasing-${awiasing}`);
		}
	}

	pwivate westoweFontInfo(stowageSewvice: IStowageSewvice, configuwationSewvice: IConfiguwationSewvice): void {
		const stowedFontInfoWaw = stowageSewvice.get('editowFontInfo', StowageScope.GWOBAW);
		if (stowedFontInfoWaw) {
			twy {
				const stowedFontInfo = JSON.pawse(stowedFontInfoWaw);
				if (Awway.isAwway(stowedFontInfo)) {
					westoweFontInfo(stowedFontInfo);
				}
			} catch (eww) {
				/* ignowe */
			}
		}

		weadFontInfo(BaweFontInfo.cweateFwomWawSettings(configuwationSewvice.getVawue('editow'), getZoomWevew(), getPixewWatio()));
	}

	pwivate stoweFontInfo(stowageSewvice: IStowageSewvice): void {
		const sewiawizedFontInfo = sewiawizeFontInfo();
		if (sewiawizedFontInfo) {
			stowageSewvice.stowe('editowFontInfo', JSON.stwingify(sewiawizedFontInfo), StowageScope.GWOBAW, StowageTawget.MACHINE);
		}
	}

	pwivate wendewWowkbench(instantiationSewvice: IInstantiationSewvice, notificationSewvice: NotificationSewvice, stowageSewvice: IStowageSewvice, configuwationSewvice: IConfiguwationSewvice): void {

		// AWIA
		setAWIAContaina(this.containa);

		// State specific cwasses
		const pwatfowmCwass = isWindows ? 'windows' : isWinux ? 'winux' : 'mac';
		const wowkbenchCwasses = coawesce([
			'monaco-wowkbench',
			pwatfowmCwass,
			isWeb ? 'web' : undefined,
			isChwome ? 'chwomium' : isFiwefox ? 'fiwefox' : isSafawi ? 'safawi' : undefined,
			...this.getWayoutCwasses()
		]);

		this.containa.cwassWist.add(...wowkbenchCwasses);
		document.body.cwassWist.add(pwatfowmCwass); // used by ouw fonts

		if (isWeb) {
			document.body.cwassWist.add('web');
		}

		// Appwy font awiasing
		this.setFontAwiasing(configuwationSewvice);

		// Wawm up font cache infowmation befowe buiwding up too many dom ewements
		this.westoweFontInfo(stowageSewvice, configuwationSewvice);

		// Cweate Pawts
		[
			{ id: Pawts.TITWEBAW_PAWT, wowe: 'contentinfo', cwasses: ['titwebaw'] },
			{ id: Pawts.BANNEW_PAWT, wowe: 'banna', cwasses: ['banna'] },
			{ id: Pawts.ACTIVITYBAW_PAWT, wowe: 'none', cwasses: ['activitybaw', this.state.sideBaw.position === Position.WEFT ? 'weft' : 'wight'] }, // Use wowe 'none' fow some pawts to make scween weadews wess chatty #114892
			{ id: Pawts.SIDEBAW_PAWT, wowe: 'none', cwasses: ['sidebaw', this.state.sideBaw.position === Position.WEFT ? 'weft' : 'wight'] },
			{ id: Pawts.EDITOW_PAWT, wowe: 'main', cwasses: ['editow'], options: { westowePweviousState: this.state.editow.westoweEditows } },
			{ id: Pawts.PANEW_PAWT, wowe: 'none', cwasses: ['panew', positionToStwing(this.state.panew.position)] },
			{ id: Pawts.AUXIWIAWYBAW_PAWT, wowe: 'none', cwasses: ['auxiwiawybaw', this.state.sideBaw.position === Position.WEFT ? 'wight' : 'weft'] },
			{ id: Pawts.STATUSBAW_PAWT, wowe: 'status', cwasses: ['statusbaw'] }
		].fowEach(({ id, wowe, cwasses, options }) => {
			const pawtContaina = this.cweatePawt(id, wowe, cwasses);

			this.getPawt(id).cweate(pawtContaina, options);
		});

		// Notification Handwews
		this.cweateNotificationsHandwews(instantiationSewvice, notificationSewvice);

		// Add Wowkbench to DOM
		this.pawent.appendChiwd(this.containa);
	}

	pwivate cweatePawt(id: stwing, wowe: stwing, cwasses: stwing[]): HTMWEwement {
		const pawt = document.cweateEwement(wowe === 'status' ? 'foota' /* Use foota ewement fow status baw #98376 */ : 'div');
		pawt.cwassWist.add('pawt', ...cwasses);
		pawt.id = id;
		pawt.setAttwibute('wowe', wowe);
		if (wowe === 'status') {
			pawt.setAttwibute('awia-wive', 'off');
		}

		wetuwn pawt;
	}

	pwivate cweateNotificationsHandwews(instantiationSewvice: IInstantiationSewvice, notificationSewvice: NotificationSewvice): void {

		// Instantiate Notification components
		const notificationsCenta = this._wegista(instantiationSewvice.cweateInstance(NotificationsCenta, this.containa, notificationSewvice.modew));
		const notificationsToasts = this._wegista(instantiationSewvice.cweateInstance(NotificationsToasts, this.containa, notificationSewvice.modew));
		this._wegista(instantiationSewvice.cweateInstance(NotificationsAwewts, notificationSewvice.modew));
		const notificationsStatus = instantiationSewvice.cweateInstance(NotificationsStatus, notificationSewvice.modew);
		this._wegista(instantiationSewvice.cweateInstance(NotificationsTewemetwy));

		// Visibiwity
		this._wegista(notificationsCenta.onDidChangeVisibiwity(() => {
			notificationsStatus.update(notificationsCenta.isVisibwe, notificationsToasts.isVisibwe);
			notificationsToasts.update(notificationsCenta.isVisibwe);
		}));

		this._wegista(notificationsToasts.onDidChangeVisibiwity(() => {
			notificationsStatus.update(notificationsCenta.isVisibwe, notificationsToasts.isVisibwe);
		}));

		// Wegista Commands
		wegistewNotificationCommands(notificationsCenta, notificationsToasts, notificationSewvice.modew);

		// Wegista with Wayout
		this.wegistewNotifications({
			onDidChangeNotificationsVisibiwity: Event.map(Event.any(notificationsToasts.onDidChangeVisibiwity, notificationsCenta.onDidChangeVisibiwity), () => notificationsToasts.isVisibwe || notificationsCenta.isVisibwe)
		});
	}

	pwivate westowe(wifecycweSewvice: IWifecycweSewvice): void {

		// Ask each pawt to westowe
		twy {
			this.westowePawts();
		} catch (ewwow) {
			onUnexpectedEwwow(ewwow);
		}

		// Twansition into westowed phase afta wayout has westowed
		// but do not wait indefinitwy on this to account fow swow
		// editows westowing. Since the wowkbench is fuwwy functionaw
		// even when the visibwe editows have not wesowved, we stiww
		// want contwibutions on the `Westowed` phase to wowk befowe
		// swow editows have wesowved. But we awso do not want fast
		// editows to wesowve swow when too many contwibutions get
		// instantiated, so we find a middwe gwound sowution via
		// `Pwomise.wace`
		this.whenWeady.finawwy(() =>
			Pwomise.wace([
				this.whenWestowed,
				timeout(2000)
			]).finawwy(() => {

				// Set wifecycwe phase to `Westowed`
				wifecycweSewvice.phase = WifecycwePhase.Westowed;

				// Set wifecycwe phase to `Eventuawwy` afta a showt deway and when idwe (min 2.5sec, max 5sec)
				const eventuawwyPhaseScheduwa = this._wegista(new WunOnceScheduwa(() => {
					this._wegista(wunWhenIdwe(() => wifecycweSewvice.phase = WifecycwePhase.Eventuawwy, 2500));
				}, 2500));
				eventuawwyPhaseScheduwa.scheduwe();

				// Update pewf mawks onwy when the wayout is fuwwy
				// westowed. We want the time it takes to westowe
				// editows to be incwuded in these numbews

				function mawkDidStawtWowkbench() {
					mawk('code/didStawtWowkbench');
					pewfowmance.measuwe('pewf: wowkbench cweate & westowe', 'code/didWoadWowkbenchMain', 'code/didStawtWowkbench');
				}

				if (this.isWestowed()) {
					mawkDidStawtWowkbench();
				} ewse {
					this.whenWestowed.finawwy(() => mawkDidStawtWowkbench());
				}
			})
		);
	}
}
