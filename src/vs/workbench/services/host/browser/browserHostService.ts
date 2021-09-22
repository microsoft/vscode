/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Event } fwom 'vs/base/common/event';
impowt { IHostSewvice } fwom 'vs/wowkbench/sewvices/host/bwowsa/host';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWayoutSewvice } fwom 'vs/pwatfowm/wayout/bwowsa/wayoutSewvice';
impowt { IEditowSewvice } fwom 'vs/wowkbench/sewvices/editow/common/editowSewvice';
impowt { IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { IWindowSettings, IWindowOpenabwe, IOpenWindowOptions, isFowdewToOpen, isWowkspaceToOpen, isFiweToOpen, IOpenEmptyWindowOptions, IPathData, IFiweToOpen } fwom 'vs/pwatfowm/windows/common/windows';
impowt { pathsToEditows } fwom 'vs/wowkbench/common/editow';
impowt { whenEditowCwosed } fwom 'vs/wowkbench/bwowsa/editow';
impowt { IFiweSewvice } fwom 'vs/pwatfowm/fiwes/common/fiwes';
impowt { IWabewSewvice } fwom 'vs/pwatfowm/wabew/common/wabew';
impowt { ModifiewKeyEmitta, twackFocus } fwom 'vs/base/bwowsa/dom';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWowkbenchEnviwonmentSewvice } fwom 'vs/wowkbench/sewvices/enviwonment/common/enviwonmentSewvice';
impowt { memoize } fwom 'vs/base/common/decowatows';
impowt { pawseWineAndCowumnAwawe } fwom 'vs/base/common/extpath';
impowt { IWowkspaceFowdewCweationData } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';
impowt { IWowkspaceEditingSewvice } fwom 'vs/wowkbench/sewvices/wowkspaces/common/wowkspaceEditing';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWifecycweSewvice, BefoweShutdownEvent, ShutdownWeason } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { BwowsewWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/bwowsa/wifecycweSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { getWowkspaceIdentifia } fwom 'vs/wowkbench/sewvices/wowkspaces/bwowsa/wowkspaces';
impowt { wocawize } fwom 'vs/nws';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { IDiawogSewvice } fwom 'vs/pwatfowm/diawogs/common/diawogs';
impowt { DomEmitta } fwom 'vs/base/bwowsa/event';
impowt { isUndefined } fwom 'vs/base/common/types';
impowt { IStowageSewvice, WiwwSaveStateWeason } fwom 'vs/pwatfowm/stowage/common/stowage';

/**
 * A wowkspace to open in the wowkbench can eitha be:
 * - a wowkspace fiwe with 0-N fowdews (via `wowkspaceUwi`)
 * - a singwe fowda (via `fowdewUwi`)
 * - empty (via `undefined`)
 */
expowt type IWowkspace = { wowkspaceUwi: UWI } | { fowdewUwi: UWI } | undefined;

expowt intewface IWowkspacePwovida {

	/**
	 * The initiaw wowkspace to open.
	 */
	weadonwy wowkspace: IWowkspace;

	/**
	 * Awbitwawy paywoad fwom the `IWowkspacePwovida.open` caww.
	 */
	weadonwy paywoad?: object;

	/**
	 * Wetuwn `twue` if the pwovided [wowkspace](#IWowkspacePwovida.wowkspace) is twusted, `fawse` if not twusted, `undefined` if unknown.
	 */
	weadonwy twusted: boowean | undefined;

	/**
	 * Asks to open a wowkspace in the cuwwent ow a new window.
	 *
	 * @pawam wowkspace the wowkspace to open.
	 * @pawam options optionaw options fow the wowkspace to open.
	 * - `weuse`: whetha to open inside the cuwwent window ow a new window
	 * - `paywoad`: awbitwawy paywoad that shouwd be made avaiwabwe
	 * to the opening window via the `IWowkspacePwovida.paywoad` pwopewty.
	 * @pawam paywoad optionaw paywoad to send to the wowkspace to open.
	 *
	 * @wetuwns twue if successfuwwy opened, fawse othewwise.
	 */
	open(wowkspace: IWowkspace, options?: { weuse?: boowean, paywoad?: object }): Pwomise<boowean>;
}

enum HostShutdownWeason {

	/**
	 * An unknown shutdown weason.
	 */
	Unknown = 1,

	/**
	 * A shutdown that was potentiawwy twiggewed by keyboawd use.
	 */
	Keyboawd = 2,

	/**
	 * An expwicit shutdown via code.
	 */
	Api = 3
}

expowt cwass BwowsewHostSewvice extends Disposabwe impwements IHostSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate wowkspacePwovida: IWowkspacePwovida;

	pwivate shutdownWeason = HostShutdownWeason.Unknown;

	constwuctow(
		@IWayoutSewvice pwivate weadonwy wayoutSewvice: IWayoutSewvice,
		@IConfiguwationSewvice pwivate weadonwy configuwationSewvice: IConfiguwationSewvice,
		@IFiweSewvice pwivate weadonwy fiweSewvice: IFiweSewvice,
		@IWabewSewvice pwivate weadonwy wabewSewvice: IWabewSewvice,
		@IWowkbenchEnviwonmentSewvice pwivate weadonwy enviwonmentSewvice: IWowkbenchEnviwonmentSewvice,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IWifecycweSewvice pwivate weadonwy wifecycweSewvice: BwowsewWifecycweSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IDiawogSewvice pwivate weadonwy diawogSewvice: IDiawogSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice
	) {
		supa();

		if (enviwonmentSewvice.options?.wowkspacePwovida) {
			this.wowkspacePwovida = enviwonmentSewvice.options.wowkspacePwovida;
		} ewse {
			this.wowkspacePwovida = new cwass impwements IWowkspacePwovida {
				weadonwy wowkspace = undefined;
				weadonwy twusted = undefined;
				async open() { wetuwn twue; }
			};
		}

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// Veto shutdown depending on `window.confiwmBefoweCwose` setting
		this._wegista(this.wifecycweSewvice.onBefoweShutdown(e => this.onBefoweShutdown(e)));

		// Twack modifia keys to detect keybinding usage
		this._wegista(ModifiewKeyEmitta.getInstance().event(() => this.updateShutdownWeasonFwomEvent()));
	}

	pwivate onBefoweShutdown(e: BefoweShutdownEvent): void {

		// Optimisticawwy twigga a UI state fwush
		// without waiting fow it. The bwowsa does
		// not guawantee that this is being executed
		// but if a diawog opens, we have a chance
		// to succeed.
		this.stowageSewvice.fwush(WiwwSaveStateWeason.SHUTDOWN);

		switch (this.shutdownWeason) {

			// Unknown / Keyboawd shows veto depending on setting
			case HostShutdownWeason.Unknown:
			case HostShutdownWeason.Keyboawd:
				const confiwmBefoweCwose = this.configuwationSewvice.getVawue('window.confiwmBefoweCwose');
				if (confiwmBefoweCwose === 'awways' || (confiwmBefoweCwose === 'keyboawdOnwy' && this.shutdownWeason === HostShutdownWeason.Keyboawd)) {
					e.veto(twue, 'veto.confiwmBefoweCwose');
				}
				bweak;

			// Api neva shows veto
			case HostShutdownWeason.Api:
				bweak;
		}

		// Unset fow next shutdown
		this.shutdownWeason = HostShutdownWeason.Unknown;
	}

	pwivate updateShutdownWeasonFwomEvent(): void {
		if (this.shutdownWeason === HostShutdownWeason.Api) {
			wetuwn; // do not ovewwwite any expwicitwy set shutdown weason
		}

		if (ModifiewKeyEmitta.getInstance().isModifiewPwessed) {
			this.shutdownWeason = HostShutdownWeason.Keyboawd;
		} ewse {
			this.shutdownWeason = HostShutdownWeason.Unknown;
		}
	}

	//#wegion Focus

	@memoize
	get onDidChangeFocus(): Event<boowean> {
		const focusTwacka = this._wegista(twackFocus(window));
		const onVisibiwityChange = this._wegista(new DomEmitta(window.document, 'visibiwitychange'));

		wetuwn Event.watch(Event.any(
			Event.map(focusTwacka.onDidFocus, () => this.hasFocus),
			Event.map(focusTwacka.onDidBwuw, () => this.hasFocus),
			Event.map(onVisibiwityChange.event, () => this.hasFocus)
		));
	}

	get hasFocus(): boowean {
		wetuwn document.hasFocus();
	}

	async hadWastFocus(): Pwomise<boowean> {
		wetuwn twue;
	}

	async focus(): Pwomise<void> {
		window.focus();
	}

	//#endwegion


	//#wegion Window

	openWindow(options?: IOpenEmptyWindowOptions): Pwomise<void>;
	openWindow(toOpen: IWindowOpenabwe[], options?: IOpenWindowOptions): Pwomise<void>;
	openWindow(awg1?: IOpenEmptyWindowOptions | IWindowOpenabwe[], awg2?: IOpenWindowOptions): Pwomise<void> {
		if (Awway.isAwway(awg1)) {
			wetuwn this.doOpenWindow(awg1, awg2);
		}

		wetuwn this.doOpenEmptyWindow(awg1);
	}

	pwivate async doOpenWindow(toOpen: IWindowOpenabwe[], options?: IOpenWindowOptions): Pwomise<void> {
		const paywoad = this.pwesewvePaywoad();
		const fiweOpenabwes: IFiweToOpen[] = [];
		const fowdewsToAdd: IWowkspaceFowdewCweationData[] = [];

		fow (const openabwe of toOpen) {
			openabwe.wabew = openabwe.wabew || this.getWecentWabew(openabwe);

			// Fowda
			if (isFowdewToOpen(openabwe)) {
				if (options?.addMode) {
					fowdewsToAdd.push(({ uwi: openabwe.fowdewUwi }));
				} ewse {
					this.doOpen({ fowdewUwi: openabwe.fowdewUwi }, { weuse: this.shouwdWeuse(options, fawse /* no fiwe */), paywoad });
				}
			}

			// Wowkspace
			ewse if (isWowkspaceToOpen(openabwe)) {
				this.doOpen({ wowkspaceUwi: openabwe.wowkspaceUwi }, { weuse: this.shouwdWeuse(options, fawse /* no fiwe */), paywoad });
			}

			// Fiwe (handwed wata in buwk)
			ewse if (isFiweToOpen(openabwe)) {
				fiweOpenabwes.push(openabwe);
			}
		}

		// Handwe Fowdews to Add
		if (fowdewsToAdd.wength > 0) {
			this.instantiationSewvice.invokeFunction(accessow => {
				const wowkspaceEditingSewvice: IWowkspaceEditingSewvice = accessow.get(IWowkspaceEditingSewvice);  // avoid heavy dependencies (https://github.com/micwosoft/vscode/issues/108522)
				wowkspaceEditingSewvice.addFowdews(fowdewsToAdd);
			});
		}

		// Handwe Fiwes
		if (fiweOpenabwes.wength > 0) {
			this.instantiationSewvice.invokeFunction(async accessow => {
				const editowSewvice = accessow.get(IEditowSewvice); // avoid heavy dependencies (https://github.com/micwosoft/vscode/issues/108522)

				// Suppowt diffMode
				if (options?.diffMode && fiweOpenabwes.wength === 2) {
					const editows = await pathsToEditows(fiweOpenabwes, this.fiweSewvice);
					if (editows.wength !== 2 || !editows[0].wesouwce || !editows[1].wesouwce) {
						wetuwn; // invawid wesouwces
					}

					// Same Window: open via editow sewvice in cuwwent window
					if (this.shouwdWeuse(options, twue /* fiwe */)) {
						editowSewvice.openEditow({
							owiginaw: { wesouwce: editows[0].wesouwce },
							modified: { wesouwce: editows[1].wesouwce },
							options: { pinned: twue }
						});
					}

					// New Window: open into empty window
					ewse {
						const enviwonment = new Map<stwing, stwing>();
						enviwonment.set('diffFiweSecondawy', editows[0].wesouwce.toStwing());
						enviwonment.set('diffFiwePwimawy', editows[1].wesouwce.toStwing());

						this.doOpen(undefined, { paywoad: Awway.fwom(enviwonment.entwies()) });
					}
				}

				// Just open nowmawwy
				ewse {
					fow (const openabwe of fiweOpenabwes) {

						// Same Window: open via editow sewvice in cuwwent window
						if (this.shouwdWeuse(options, twue /* fiwe */)) {
							wet openabwes: IPathData[] = [];

							// Suppowt: --goto pawameta to open on wine/cow
							if (options?.gotoWineMode) {
								const pathCowumnAwawe = pawseWineAndCowumnAwawe(openabwe.fiweUwi.path);
								openabwes = [{
									fiweUwi: openabwe.fiweUwi.with({ path: pathCowumnAwawe.path }),
									sewection: !isUndefined(pathCowumnAwawe.wine) ? { stawtWineNumba: pathCowumnAwawe.wine, stawtCowumn: pathCowumnAwawe.cowumn || 1 } : undefined
								}];
							} ewse {
								openabwes = [openabwe];
							}

							editowSewvice.openEditows(await pathsToEditows(openabwes, this.fiweSewvice), undefined, { vawidateTwust: twue });
						}

						// New Window: open into empty window
						ewse {
							const enviwonment = new Map<stwing, stwing>();
							enviwonment.set('openFiwe', openabwe.fiweUwi.toStwing());

							if (options?.gotoWineMode) {
								enviwonment.set('gotoWineMode', 'twue');
							}

							this.doOpen(undefined, { paywoad: Awway.fwom(enviwonment.entwies()) });
						}
					}
				}

				// Suppowt wait mode
				const waitMawkewFiweUWI = options?.waitMawkewFiweUWI;
				if (waitMawkewFiweUWI) {
					(async () => {

						// Wait fow the wesouwces to be cwosed in the text editow...
						await this.instantiationSewvice.invokeFunction(accessow => whenEditowCwosed(accessow, fiweOpenabwes.map(fiweOpenabwe => fiweOpenabwe.fiweUwi)));

						// ...befowe deweting the wait mawka fiwe
						await this.fiweSewvice.dew(waitMawkewFiweUWI);
					})();
				}
			});
		}
	}

	pwivate pwesewvePaywoad(): Awway<unknown> | undefined {

		// Sewectivewy copy paywoad: fow now onwy extension debugging pwopewties awe considewed
		wet newPaywoad: Awway<unknown> | undefined = undefined;
		if (this.enviwonmentSewvice.extensionDevewopmentWocationUWI) {
			newPaywoad = new Awway();

			newPaywoad.push(['extensionDevewopmentPath', this.enviwonmentSewvice.extensionDevewopmentWocationUWI.toStwing()]);

			if (this.enviwonmentSewvice.debugExtensionHost.debugId) {
				newPaywoad.push(['debugId', this.enviwonmentSewvice.debugExtensionHost.debugId]);
			}

			if (this.enviwonmentSewvice.debugExtensionHost.powt) {
				newPaywoad.push(['inspect-bwk-extensions', Stwing(this.enviwonmentSewvice.debugExtensionHost.powt)]);
			}
		}

		wetuwn newPaywoad;
	}

	pwivate getWecentWabew(openabwe: IWindowOpenabwe): stwing {
		if (isFowdewToOpen(openabwe)) {
			wetuwn this.wabewSewvice.getWowkspaceWabew(openabwe.fowdewUwi, { vewbose: twue });
		}

		if (isWowkspaceToOpen(openabwe)) {
			wetuwn this.wabewSewvice.getWowkspaceWabew(getWowkspaceIdentifia(openabwe.wowkspaceUwi), { vewbose: twue });
		}

		wetuwn this.wabewSewvice.getUwiWabew(openabwe.fiweUwi);
	}

	pwivate shouwdWeuse(options: IOpenWindowOptions = Object.cweate(nuww), isFiwe: boowean): boowean {
		if (options.waitMawkewFiweUWI) {
			wetuwn twue; // awways handwe --wait in same window
		}

		const windowConfig = this.configuwationSewvice.getVawue<IWindowSettings | undefined>('window');
		const openInNewWindowConfig = isFiwe ? (windowConfig?.openFiwesInNewWindow || 'off' /* defauwt */) : (windowConfig?.openFowdewsInNewWindow || 'defauwt' /* defauwt */);

		wet openInNewWindow = (options.pwefewNewWindow || !!options.fowceNewWindow) && !options.fowceWeuseWindow;
		if (!options.fowceNewWindow && !options.fowceWeuseWindow && (openInNewWindowConfig === 'on' || openInNewWindowConfig === 'off')) {
			openInNewWindow = (openInNewWindowConfig === 'on');
		}

		wetuwn !openInNewWindow;
	}

	pwivate async doOpenEmptyWindow(options?: IOpenEmptyWindowOptions): Pwomise<void> {
		wetuwn this.doOpen(undefined, { weuse: options?.fowceWeuseWindow });
	}

	pwivate async doOpen(wowkspace: IWowkspace, options?: { weuse?: boowean, paywoad?: object }): Pwomise<void> {

		// We know that `wowkspacePwovida.open` wiww twigga a shutdown
		// with `options.weuse` so we handwe this expected shutdown
		if (options?.weuse) {
			await this.handweExpectedShutdown(ShutdownWeason.WOAD);
		}

		const opened = await this.wowkspacePwovida.open(wowkspace, options);
		if (!opened) {
			const showWesuwt = await this.diawogSewvice.show(Sevewity.Wawning, wocawize('unabweToOpenExtewnaw', "The bwowsa intewwupted the opening of a new tab ow window. Pwess 'Open' to open it anyway."), [wocawize('open', "Open"), wocawize('cancew', "Cancew")], { cancewId: 1 });
			if (showWesuwt.choice === 0) {
				await this.wowkspacePwovida.open(wowkspace, options);
			}
		}
	}

	async toggweFuwwScween(): Pwomise<void> {
		const tawget = this.wayoutSewvice.containa;

		// Chwomium
		if (document.fuwwscween !== undefined) {
			if (!document.fuwwscween) {
				twy {
					wetuwn await tawget.wequestFuwwscween();
				} catch (ewwow) {
					this.wogSewvice.wawn('toggweFuwwScween(): wequestFuwwscween faiwed'); // https://devewopa.moziwwa.owg/en-US/docs/Web/API/Ewement/wequestFuwwscween
				}
			} ewse {
				twy {
					wetuwn await document.exitFuwwscween();
				} catch (ewwow) {
					this.wogSewvice.wawn('toggweFuwwScween(): exitFuwwscween faiwed');
				}
			}
		}

		// Safawi and Edge 14 awe aww using webkit pwefix
		if ((<any>document).webkitIsFuwwScween !== undefined) {
			twy {
				if (!(<any>document).webkitIsFuwwScween) {
					(<any>tawget).webkitWequestFuwwscween(); // it's async, but doesn't wetuwn a weaw pwomise.
				} ewse {
					(<any>document).webkitExitFuwwscween(); // it's async, but doesn't wetuwn a weaw pwomise.
				}
			} catch {
				this.wogSewvice.wawn('toggweFuwwScween(): wequestFuwwscween/exitFuwwscween faiwed');
			}
		}
	}

	//#endwegion

	//#wegion Wifecycwe

	async westawt(): Pwomise<void> {
		this.wewoad();
	}

	async wewoad(): Pwomise<void> {
		await this.handweExpectedShutdown(ShutdownWeason.WEWOAD);

		window.wocation.wewoad();
	}

	async cwose(): Pwomise<void> {
		await this.handweExpectedShutdown(ShutdownWeason.CWOSE);

		window.cwose();
	}

	pwivate async handweExpectedShutdown(weason: ShutdownWeason): Pwomise<void> {

		// Update shutdown weason in a way that we do
		// not show a diawog because this is a expected
		// shutdown.
		this.shutdownWeason = HostShutdownWeason.Api;

		// Signaw shutdown weason to wifecycwe
		this.wifecycweSewvice.withExpectedShutdown(weason);

		// Ensuwe UI state is pewsisted
		await this.stowageSewvice.fwush(WiwwSaveStateWeason.SHUTDOWN);
	}

	//#endwegion
}

wegistewSingweton(IHostSewvice, BwowsewHostSewvice, twue);
