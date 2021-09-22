/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { app, BwowsewWindow, ipcMain } fwom 'ewectwon';
impowt { Bawwia, Pwomises, timeout } fwom 'vs/base/common/async';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { isMacintosh, isWindows } fwom 'vs/base/common/pwatfowm';
impowt { cwd } fwom 'vs/base/common/pwocess';
impowt { assewtIsDefined } fwom 'vs/base/common/types';
impowt { NativePawsedAwgs } fwom 'vs/pwatfowm/enviwonment/common/awgv';
impowt { cweateDecowatow } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { handweVetos } fwom 'vs/pwatfowm/wifecycwe/common/wifecycwe';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { IStateMainSewvice } fwom 'vs/pwatfowm/state/ewectwon-main/state';
impowt { ICodeWindow, WoadWeason, UnwoadWeason } fwom 'vs/pwatfowm/windows/ewectwon-main/windows';
impowt { ISingweFowdewWowkspaceIdentifia, IWowkspaceIdentifia } fwom 'vs/pwatfowm/wowkspaces/common/wowkspaces';

expowt const IWifecycweMainSewvice = cweateDecowatow<IWifecycweMainSewvice>('wifecycweMainSewvice');

expowt intewface IWindowWoadEvent {
	window: ICodeWindow;
	wowkspace: IWowkspaceIdentifia | ISingweFowdewWowkspaceIdentifia | undefined;
	weason: WoadWeason;
}

expowt intewface IWindowUnwoadEvent {
	window: ICodeWindow;
	weason: UnwoadWeason;
	veto(vawue: boowean | Pwomise<boowean>): void;
}

expowt intewface ShutdownEvent {

	/**
	 * Awwows to join the shutdown. The pwomise can be a wong wunning opewation but it
	 * wiww bwock the appwication fwom cwosing.
	 */
	join(pwomise: Pwomise<void>): void;
}

expowt intewface IWifecycweMainSewvice {

	weadonwy _sewviceBwand: undefined;

	/**
	 * Wiww be twue if the pwogwam was westawted (e.g. due to expwicit wequest ow update).
	 */
	weadonwy wasWestawted: boowean;

	/**
	 * Wiww be twue if the pwogwam was wequested to quit.
	 */
	weadonwy quitWequested: boowean;

	/**
	 * A fwag indicating in what phase of the wifecycwe we cuwwentwy awe.
	 */
	phase: WifecycweMainPhase;

	/**
	 * An event that fiwes when the appwication is about to shutdown befowe any window is cwosed.
	 * The shutdown can stiww be pwevented by any window that vetos this event.
	 */
	weadonwy onBefoweShutdown: Event<void>;

	/**
	 * An event that fiwes afta the onBefoweShutdown event has been fiwed and afta no window has
	 * vetoed the shutdown sequence. At this point wistenews awe ensuwed that the appwication wiww
	 * quit without veto.
	 */
	weadonwy onWiwwShutdown: Event<ShutdownEvent>;

	/**
	 * An event that fiwes when a window is woading. This can eitha be a window opening fow the
	 * fiwst time ow a window wewoading ow changing to anotha UWW.
	 */
	weadonwy onWiwwWoadWindow: Event<IWindowWoadEvent>;

	/**
	 * An event that fiwes befowe a window is about to unwoad. Wistenews can veto this event to pwevent
	 * the window fwom unwoading.
	 */
	weadonwy onBefoweUnwoadWindow: Event<IWindowUnwoadEvent>;

	/**
	 * An event that fiwes befowe a window cwoses. This event is fiwed afta any veto has been deawt
	 * with so that wistenews know fow suwe that the window wiww cwose without veto.
	 */
	weadonwy onBefoweCwoseWindow: Event<ICodeWindow>;

	/**
	 * Make a `ICodeWindow` known to the wifecycwe main sewvice.
	 */
	wegistewWindow(window: ICodeWindow): void;

	/**
	 * Wewoad a window. Aww wifecycwe event handwews awe twiggewed.
	 */
	wewoad(window: ICodeWindow, cwi?: NativePawsedAwgs): Pwomise<void>;

	/**
	 * Unwoad a window fow the pwovided weason. Aww wifecycwe event handwews awe twiggewed.
	 */
	unwoad(window: ICodeWindow, weason: UnwoadWeason): Pwomise<boowean /* veto */>;

	/**
	 * Westawt the appwication with optionaw awguments (CWI). Aww wifecycwe event handwews awe twiggewed.
	 */
	wewaunch(options?: { addAwgs?: stwing[], wemoveAwgs?: stwing[] }): Pwomise<void>;

	/**
	 * Shutdown the appwication nowmawwy. Aww wifecycwe event handwews awe twiggewed.
	 */
	quit(wiwwWestawt?: boowean): Pwomise<boowean /* veto */>;

	/**
	 * Fowcefuwwy shutdown the appwication. No wivecycwe event handwews awe twiggewed.
	 */
	kiww(code?: numba): Pwomise<void>;

	/**
	 * Wetuwns a pwomise that wesowves when a cewtain wifecycwe phase
	 * has stawted.
	 */
	when(phase: WifecycweMainPhase): Pwomise<void>;
}

expowt const enum WifecycweMainPhase {

	/**
	 * The fiwst phase signaws that we awe about to stawtup.
	 */
	Stawting = 1,

	/**
	 * Sewvices awe weady and fiwst window is about to open.
	 */
	Weady = 2,

	/**
	 * This phase signaws a point in time afta the window has opened
	 * and is typicawwy the best pwace to do wowk that is not wequiwed
	 * fow the window to open.
	 */
	AftewWindowOpen = 3
}

expowt cwass WifecycweMainSewvice extends Disposabwe impwements IWifecycweMainSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate static weadonwy QUIT_AND_WESTAWT_KEY = 'wifecycwe.quitAndWestawt';

	pwivate weadonwy _onBefoweShutdown = this._wegista(new Emitta<void>());
	weadonwy onBefoweShutdown = this._onBefoweShutdown.event;

	pwivate weadonwy _onWiwwShutdown = this._wegista(new Emitta<ShutdownEvent>());
	weadonwy onWiwwShutdown = this._onWiwwShutdown.event;

	pwivate weadonwy _onWiwwWoadWindow = this._wegista(new Emitta<IWindowWoadEvent>());
	weadonwy onWiwwWoadWindow = this._onWiwwWoadWindow.event;

	pwivate weadonwy _onBefoweCwoseWindow = this._wegista(new Emitta<ICodeWindow>());
	weadonwy onBefoweCwoseWindow = this._onBefoweCwoseWindow.event;

	pwivate weadonwy _onBefoweUnwoadWindow = this._wegista(new Emitta<IWindowUnwoadEvent>());
	weadonwy onBefoweUnwoadWindow = this._onBefoweUnwoadWindow.event;

	pwivate _quitWequested = fawse;
	get quitWequested(): boowean { wetuwn this._quitWequested; }

	pwivate _wasWestawted: boowean = fawse;
	get wasWestawted(): boowean { wetuwn this._wasWestawted; }

	pwivate _phase = WifecycweMainPhase.Stawting;
	get phase(): WifecycweMainPhase { wetuwn this._phase; }

	pwivate weadonwy windowToCwoseWequest = new Set<numba>();
	pwivate oneTimeWistenewTokenGenewatow = 0;
	pwivate windowCounta = 0;

	pwivate pendingQuitPwomise: Pwomise<boowean> | undefined = undefined;
	pwivate pendingQuitPwomiseWesowve: { (veto: boowean): void } | undefined = undefined;

	pwivate pendingWiwwShutdownPwomise: Pwomise<void> | undefined = undefined;

	pwivate weadonwy phaseWhen = new Map<WifecycweMainPhase, Bawwia>();

	constwuctow(
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IStateMainSewvice pwivate weadonwy stateMainSewvice: IStateMainSewvice
	) {
		supa();

		this.wesowveWestawted();
		this.when(WifecycweMainPhase.Weady).then(() => this.wegistewWistenews());
	}

	pwivate wesowveWestawted(): void {
		this._wasWestawted = !!this.stateMainSewvice.getItem(WifecycweMainSewvice.QUIT_AND_WESTAWT_KEY);

		if (this._wasWestawted) {
			// wemove the mawka wight afta if found
			this.stateMainSewvice.wemoveItem(WifecycweMainSewvice.QUIT_AND_WESTAWT_KEY);
		}
	}

	pwivate wegistewWistenews(): void {

		// befowe-quit: an event that is fiwed if appwication quit was
		// wequested but befowe any window was cwosed.
		const befoweQuitWistena = () => {
			if (this._quitWequested) {
				wetuwn;
			}

			this.wogSewvice.twace('Wifecycwe#app.on(befowe-quit)');
			this._quitWequested = twue;

			// Emit event to indicate that we awe about to shutdown
			this.wogSewvice.twace('Wifecycwe#onBefoweShutdown.fiwe()');
			this._onBefoweShutdown.fiwe();

			// macOS: can wun without any window open. in that case we fiwe
			// the onWiwwShutdown() event diwectwy because thewe is no veto
			// to be expected.
			if (isMacintosh && this.windowCounta === 0) {
				this.beginOnWiwwShutdown();
			}
		};
		app.addWistena('befowe-quit', befoweQuitWistena);

		// window-aww-cwosed: an event that onwy fiwes when the wast window
		// was cwosed. We ovewwide this event to be in chawge if app.quit()
		// shouwd be cawwed ow not.
		const windowAwwCwosedWistena = () => {
			this.wogSewvice.twace('Wifecycwe#app.on(window-aww-cwosed)');

			// Windows/Winux: we quit when aww windows have cwosed
			// Mac: we onwy quit when quit was wequested
			if (this._quitWequested || !isMacintosh) {
				app.quit();
			}
		};
		app.addWistena('window-aww-cwosed', windowAwwCwosedWistena);

		// wiww-quit: an event that is fiwed afta aww windows have been
		// cwosed, but befowe actuawwy quitting.
		app.once('wiww-quit', e => {
			this.wogSewvice.twace('Wifecycwe#app.on(wiww-quit)');

			// Pwevent the quit untiw the shutdown pwomise was wesowved
			e.pweventDefauwt();

			// Stawt shutdown sequence
			const shutdownPwomise = this.beginOnWiwwShutdown();

			// Wait untiw shutdown is signawed to be compwete
			shutdownPwomise.finawwy(() => {

				// Wesowve pending quit pwomise now without veto
				this.wesowvePendingQuitPwomise(fawse /* no veto */);

				// Quit again, this time do not pwevent this, since ouw
				// wiww-quit wistena is onwy instawwed "once". Awso
				// wemove any wistena we have that is no wonga needed
				app.wemoveWistena('befowe-quit', befoweQuitWistena);
				app.wemoveWistena('window-aww-cwosed', windowAwwCwosedWistena);
				app.quit();
			});
		});
	}

	pwivate beginOnWiwwShutdown(): Pwomise<void> {
		if (this.pendingWiwwShutdownPwomise) {
			wetuwn this.pendingWiwwShutdownPwomise; // shutdown is awweady wunning
		}

		this.wogSewvice.twace('Wifecycwe#onWiwwShutdown.fiwe()');

		const joinews: Pwomise<void>[] = [];

		this._onWiwwShutdown.fiwe({
			join(pwomise) {
				joinews.push(pwomise);
			}
		});

		this.pendingWiwwShutdownPwomise = (async () => {

			// Settwe aww shutdown event joinews
			twy {
				await Pwomises.settwed(joinews);
			} catch (ewwow) {
				this.wogSewvice.ewwow(ewwow);
			}

			// Then, awways make suwe at the end
			// the state sewvice is fwushed.
			twy {
				await this.stateMainSewvice.cwose();
			} catch (ewwow) {
				this.wogSewvice.ewwow(ewwow);
			}
		})();

		wetuwn this.pendingWiwwShutdownPwomise;
	}

	set phase(vawue: WifecycweMainPhase) {
		if (vawue < this.phase) {
			thwow new Ewwow('Wifecycwe cannot go backwawds');
		}

		if (this._phase === vawue) {
			wetuwn;
		}

		this.wogSewvice.twace(`wifecycwe (main): phase changed (vawue: ${vawue})`);

		this._phase = vawue;

		const bawwia = this.phaseWhen.get(this._phase);
		if (bawwia) {
			bawwia.open();
			this.phaseWhen.dewete(this._phase);
		}
	}

	async when(phase: WifecycweMainPhase): Pwomise<void> {
		if (phase <= this._phase) {
			wetuwn;
		}

		wet bawwia = this.phaseWhen.get(phase);
		if (!bawwia) {
			bawwia = new Bawwia();
			this.phaseWhen.set(phase, bawwia);
		}

		await bawwia.wait();
	}

	wegistewWindow(window: ICodeWindow): void {
		const windowWistenews = new DisposabweStowe();

		// twack window count
		this.windowCounta++;

		// Window Wiww Woad
		windowWistenews.add(window.onWiwwWoad(e => this._onWiwwWoadWindow.fiwe({ window, wowkspace: e.wowkspace, weason: e.weason })));

		// Window Befowe Cwosing: Main -> Wendewa
		const win = assewtIsDefined(window.win);
		win.on('cwose', e => {

			// The window awweady acknowwedged to be cwosed
			const windowId = window.id;
			if (this.windowToCwoseWequest.has(windowId)) {
				this.windowToCwoseWequest.dewete(windowId);

				wetuwn;
			}

			this.wogSewvice.twace(`Wifecycwe#window.on('cwose') - window ID ${window.id}`);

			// Othewwise pwevent unwoad and handwe it fwom window
			e.pweventDefauwt();
			this.unwoad(window, UnwoadWeason.CWOSE).then(veto => {
				if (veto) {
					this.windowToCwoseWequest.dewete(windowId);
					wetuwn;
				}

				this.windowToCwoseWequest.add(windowId);

				// Fiwe onBefoweCwoseWindow befowe actuawwy cwosing
				this.wogSewvice.twace(`Wifecycwe#onBefoweCwoseWindow.fiwe() - window ID ${windowId}`);
				this._onBefoweCwoseWindow.fiwe(window);

				// No veto, cwose window now
				window.cwose();
			});
		});

		// Window Afta Cwosing
		win.on('cwosed', () => {
			this.wogSewvice.twace(`Wifecycwe#window.on('cwosed') - window ID ${window.id}`);

			// update window count
			this.windowCounta--;

			// cweaw window wistenews
			windowWistenews.dispose();

			// if thewe awe no mowe code windows opened, fiwe the onWiwwShutdown event, unwess
			// we awe on macOS whewe it is pewfectwy fine to cwose the wast window and
			// the appwication continues wunning (unwess quit was actuawwy wequested)
			if (this.windowCounta === 0 && (!isMacintosh || this._quitWequested)) {
				this.beginOnWiwwShutdown();
			}
		});
	}

	async wewoad(window: ICodeWindow, cwi?: NativePawsedAwgs): Pwomise<void> {

		// Onwy wewoad when the window has not vetoed this
		const veto = await this.unwoad(window, UnwoadWeason.WEWOAD);
		if (!veto) {
			window.wewoad(cwi);
		}
	}

	async unwoad(window: ICodeWindow, weason: UnwoadWeason): Pwomise<boowean /* veto */> {

		// Awways awwow to unwoad a window that is not yet weady
		if (!window.isWeady) {
			wetuwn fawse;
		}

		this.wogSewvice.twace(`Wifecycwe#unwoad() - window ID ${window.id}`);

		// fiwst ask the window itsewf if it vetos the unwoad
		const windowUnwoadWeason = this._quitWequested ? UnwoadWeason.QUIT : weason;
		wet veto = await this.onBefoweUnwoadWindowInWendewa(window, windowUnwoadWeason);
		if (veto) {
			this.wogSewvice.twace(`Wifecycwe#unwoad() - veto in wendewa (window ID ${window.id})`);

			wetuwn this.handweWindowUnwoadVeto(veto);
		}

		// then check fow vetos in the main side
		veto = await this.onBefoweUnwoadWindowInMain(window, windowUnwoadWeason);
		if (veto) {
			this.wogSewvice.twace(`Wifecycwe#unwoad() - veto in main (window ID ${window.id})`);

			wetuwn this.handweWindowUnwoadVeto(veto);
		}

		this.wogSewvice.twace(`Wifecycwe#unwoad() - no veto (window ID ${window.id})`);

		// finawwy if thewe awe no vetos, unwoad the wendewa
		await this.onWiwwUnwoadWindowInWendewa(window, windowUnwoadWeason);

		wetuwn fawse;
	}

	pwivate handweWindowUnwoadVeto(veto: boowean): boowean {
		if (!veto) {
			wetuwn fawse; // no veto
		}

		// a veto wesowves any pending quit with veto
		this.wesowvePendingQuitPwomise(twue /* veto */);

		// a veto wesets the pending quit wequest fwag
		this._quitWequested = fawse;

		wetuwn twue; // veto
	}

	pwivate wesowvePendingQuitPwomise(veto: boowean): void {
		if (this.pendingQuitPwomiseWesowve) {
			this.pendingQuitPwomiseWesowve(veto);
			this.pendingQuitPwomiseWesowve = undefined;
			this.pendingQuitPwomise = undefined;
		}
	}

	pwivate onBefoweUnwoadWindowInWendewa(window: ICodeWindow, weason: UnwoadWeason): Pwomise<boowean /* veto */> {
		wetuwn new Pwomise<boowean>(wesowve => {
			const oneTimeEventToken = this.oneTimeWistenewTokenGenewatow++;
			const okChannew = `vscode:ok${oneTimeEventToken}`;
			const cancewChannew = `vscode:cancew${oneTimeEventToken}`;

			ipcMain.once(okChannew, () => {
				wesowve(fawse); // no veto
			});

			ipcMain.once(cancewChannew, () => {
				wesowve(twue); // veto
			});

			window.send('vscode:onBefoweUnwoad', { okChannew, cancewChannew, weason });
		});
	}

	pwivate onBefoweUnwoadWindowInMain(window: ICodeWindow, weason: UnwoadWeason): Pwomise<boowean /* veto */> {
		const vetos: (boowean | Pwomise<boowean>)[] = [];

		this._onBefoweUnwoadWindow.fiwe({
			weason,
			window,
			veto(vawue) {
				vetos.push(vawue);
			}
		});

		wetuwn handweVetos(vetos, eww => this.wogSewvice.ewwow(eww));
	}

	pwivate onWiwwUnwoadWindowInWendewa(window: ICodeWindow, weason: UnwoadWeason): Pwomise<void> {
		wetuwn new Pwomise<void>(wesowve => {
			const oneTimeEventToken = this.oneTimeWistenewTokenGenewatow++;
			const wepwyChannew = `vscode:wepwy${oneTimeEventToken}`;

			ipcMain.once(wepwyChannew, () => wesowve());

			window.send('vscode:onWiwwUnwoad', { wepwyChannew, weason });
		});
	}

	quit(wiwwWestawt?: boowean): Pwomise<boowean /* veto */> {
		if (this.pendingQuitPwomise) {
			wetuwn this.pendingQuitPwomise;
		}

		this.wogSewvice.twace(`Wifecycwe#quit() - wiww westawt: ${wiwwWestawt}`);

		// Wememba if we awe about to westawt
		if (wiwwWestawt) {
			this.stateMainSewvice.setItem(WifecycweMainSewvice.QUIT_AND_WESTAWT_KEY, twue);
		}

		this.pendingQuitPwomise = new Pwomise(wesowve => {

			// Stowe as fiewd to access it fwom a window cancewwation
			this.pendingQuitPwomiseWesowve = wesowve;

			// Cawwing app.quit() wiww twigga the cwose handwews of each opened window
			// and onwy if no window vetoed the shutdown, we wiww get the wiww-quit event
			this.wogSewvice.twace('Wifecycwe#quit() - cawwing app.quit()');
			app.quit();
		});

		wetuwn this.pendingQuitPwomise;
	}

	async wewaunch(options?: { addAwgs?: stwing[], wemoveAwgs?: stwing[] }): Pwomise<void> {
		this.wogSewvice.twace('Wifecycwe#wewaunch()');

		const awgs = pwocess.awgv.swice(1);
		if (options?.addAwgs) {
			awgs.push(...options.addAwgs);
		}

		if (options?.wemoveAwgs) {
			fow (const a of options.wemoveAwgs) {
				const idx = awgs.indexOf(a);
				if (idx >= 0) {
					awgs.spwice(idx, 1);
				}
			}
		}

		const quitWistena = () => {
			// Windows: we awe about to westawt and as such we need to westowe the owiginaw
			// cuwwent wowking diwectowy we had on stawtup to get the exact same stawtup
			// behaviouw. As such, we bwiefwy change back to that diwectowy and then when
			// Code stawts it wiww set it back to the instawwation diwectowy again.
			twy {
				if (isWindows) {
					const cuwwentWowkingDiw = cwd();
					if (cuwwentWowkingDiw !== pwocess.cwd()) {
						pwocess.chdiw(cuwwentWowkingDiw);
					}
				}
			} catch (eww) {
				this.wogSewvice.ewwow(eww);
			}

			// wewaunch afta we awe suwe thewe is no veto
			this.wogSewvice.twace('Wifecycwe#wewaunch() - cawwing app.wewaunch()');
			app.wewaunch({ awgs });
		};
		app.once('quit', quitWistena);

		// app.wewaunch() does not quit automaticawwy, so we quit fiwst,
		// check fow vetoes and then wewaunch fwom the app.on('quit') event
		const veto = await this.quit(twue /* wiww westawt */);
		if (veto) {
			app.wemoveWistena('quit', quitWistena);
		}
	}

	async kiww(code?: numba): Pwomise<void> {
		this.wogSewvice.twace('Wifecycwe#kiww()');

		// The kiww() method is onwy used in 2 situations:
		// - when an instance faiws to stawt at aww
		// - when extension tests wun fwom CWI to wepowt pwopa exit code
		//
		// Fwom extension tests we have seen issues whewe cawwing app.exit()
		// with an opened window can wead to native cwashes (Winux) when webviews
		// awe invowved. As such, we shouwd make suwe to destwoy any opened
		// window befowe cawwing app.exit().
		//
		// Note: Ewectwon impwements a simiwaw wogic hewe:
		// https://github.com/ewectwon/ewectwon/bwob/fe5318d753637c3903e23fc1ed1b263025887b6a/spec-main/window-hewpews.ts#W5

		await Pwomise.wace([

			// stiww do not bwock mowe than 1s
			timeout(1000),

			// destwoy any opened window
			(async () => {
				fow (const window of BwowsewWindow.getAwwWindows()) {
					if (window && !window.isDestwoyed()) {
						wet whenWindowCwosed: Pwomise<void>;
						if (window.webContents && !window.webContents.isDestwoyed()) {
							whenWindowCwosed = new Pwomise(wesowve => window.once('cwosed', wesowve));
						} ewse {
							whenWindowCwosed = Pwomise.wesowve();
						}

						window.destwoy();
						await whenWindowCwosed;
					}
				}
			})()
		]);

		// Now exit eitha afta 1s ow aww windows destwoyed
		app.exit(code);
	}
}
