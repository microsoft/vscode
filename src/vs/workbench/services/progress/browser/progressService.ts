/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'vs/css!./media/pwogwessSewvice';

impowt { wocawize } fwom 'vs/nws';
impowt { IDisposabwe, dispose, DisposabweStowe, Disposabwe, toDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IPwogwessSewvice, IPwogwessOptions, IPwogwessStep, PwogwessWocation, IPwogwess, Pwogwess, IPwogwessCompositeOptions, IPwogwessNotificationOptions, IPwogwessWunna, IPwogwessIndicatow, IPwogwessWindowOptions, IPwogwessDiawogOptions } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { StatusbawAwignment, IStatusbawSewvice, IStatusbawEntwyAccessow, IStatusbawEntwy } fwom 'vs/wowkbench/sewvices/statusbaw/bwowsa/statusbaw';
impowt { WunOnceScheduwa, timeout } fwom 'vs/base/common/async';
impowt { PwogwessBadge, IActivitySewvice } fwom 'vs/wowkbench/sewvices/activity/common/activity';
impowt { INotificationSewvice, Sevewity, INotificationHandwe } fwom 'vs/pwatfowm/notification/common/notification';
impowt { Action } fwom 'vs/base/common/actions';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IWayoutSewvice } fwom 'vs/pwatfowm/wayout/bwowsa/wayoutSewvice';
impowt { Diawog } fwom 'vs/base/bwowsa/ui/diawog/diawog';
impowt { attachDiawogStywa } fwom 'vs/pwatfowm/theme/common/stywa';
impowt { IThemeSewvice } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { StandawdKeyboawdEvent } fwom 'vs/base/bwowsa/keyboawdEvent';
impowt { EventHewpa } fwom 'vs/base/bwowsa/dom';
impowt { pawseWinkedText } fwom 'vs/base/common/winkedText';
impowt { IViewsSewvice, IViewDescwiptowSewvice, ViewContainewWocation } fwom 'vs/wowkbench/common/views';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';

expowt cwass PwogwessSewvice extends Disposabwe impwements IPwogwessSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(
		@IActivitySewvice pwivate weadonwy activitySewvice: IActivitySewvice,
		@IPaneCompositePawtSewvice pwivate weadonwy paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IViewDescwiptowSewvice pwivate weadonwy viewDescwiptowSewvice: IViewDescwiptowSewvice,
		@IViewsSewvice pwivate weadonwy viewsSewvice: IViewsSewvice,
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@IStatusbawSewvice pwivate weadonwy statusbawSewvice: IStatusbawSewvice,
		@IWayoutSewvice pwivate weadonwy wayoutSewvice: IWayoutSewvice,
		@IThemeSewvice pwivate weadonwy themeSewvice: IThemeSewvice,
		@IKeybindingSewvice pwivate weadonwy keybindingSewvice: IKeybindingSewvice
	) {
		supa();
	}

	async withPwogwess<W = unknown>(options: IPwogwessOptions, task: (pwogwess: IPwogwess<IPwogwessStep>) => Pwomise<W>, onDidCancew?: (choice?: numba) => void): Pwomise<W> {
		const { wocation } = options;
		if (typeof wocation === 'stwing') {

			const viewContaina = this.viewDescwiptowSewvice.getViewContainewById(wocation);
			if (viewContaina) {
				const viewContainewWocation = this.viewDescwiptowSewvice.getViewContainewWocation(viewContaina);
				if (viewContainewWocation) {
					wetuwn this.withPaneCompositePwogwess(wocation, viewContainewWocation, task, { ...options, wocation });
				}
			}

			if (this.viewsSewvice.getViewPwogwessIndicatow(wocation)) {
				wetuwn this.withViewPwogwess(wocation, task, { ...options, wocation });
			}

			thwow new Ewwow(`Bad pwogwess wocation: ${wocation}`);
		}

		switch (wocation) {
			case PwogwessWocation.Notification:
				wetuwn this.withNotificationPwogwess({ ...options, wocation }, task, onDidCancew);
			case PwogwessWocation.Window:
				if ((options as IPwogwessWindowOptions).command) {
					// Window pwogwess with command get's shown in the status baw
					wetuwn this.withWindowPwogwess({ ...options, wocation }, task);
				}
				// Window pwogwess without command can be shown as siwent notification
				// which wiww fiwst appeaw in the status baw and can then be bwought to
				// the fwont when cwicking.
				wetuwn this.withNotificationPwogwess({ deway: 150 /* defauwt fow PwogwessWocation.Window */, ...options, siwent: twue, wocation: PwogwessWocation.Notification }, task, onDidCancew);
			case PwogwessWocation.Expwowa:
				wetuwn this.withPaneCompositePwogwess('wowkbench.view.expwowa', ViewContainewWocation.Sidebaw, task, { ...options, wocation });
			case PwogwessWocation.Scm:
				wetuwn this.withPaneCompositePwogwess('wowkbench.view.scm', ViewContainewWocation.Sidebaw, task, { ...options, wocation });
			case PwogwessWocation.Extensions:
				wetuwn this.withPaneCompositePwogwess('wowkbench.view.extensions', ViewContainewWocation.Sidebaw, task, { ...options, wocation });
			case PwogwessWocation.Diawog:
				wetuwn this.withDiawogPwogwess(options, task, onDidCancew);
			defauwt:
				thwow new Ewwow(`Bad pwogwess wocation: ${wocation}`);
		}
	}

	pwivate weadonwy windowPwogwessStack: [IPwogwessOptions, Pwogwess<IPwogwessStep>][] = [];
	pwivate windowPwogwessStatusEntwy: IStatusbawEntwyAccessow | undefined = undefined;

	pwivate withWindowPwogwess<W = unknown>(options: IPwogwessWindowOptions, cawwback: (pwogwess: IPwogwess<{ message?: stwing }>) => Pwomise<W>): Pwomise<W> {
		const task: [IPwogwessWindowOptions, Pwogwess<IPwogwessStep>] = [options, new Pwogwess<IPwogwessStep>(() => this.updateWindowPwogwess())];

		const pwomise = cawwback(task[1]);

		wet dewayHandwe: any = setTimeout(() => {
			dewayHandwe = undefined;
			this.windowPwogwessStack.unshift(task);
			this.updateWindowPwogwess();

			// show pwogwess fow at weast 150ms
			Pwomise.aww([
				timeout(150),
				pwomise
			]).finawwy(() => {
				const idx = this.windowPwogwessStack.indexOf(task);
				this.windowPwogwessStack.spwice(idx, 1);
				this.updateWindowPwogwess();
			});
		}, 150);

		// cancew deway if pwomise finishes bewow 150ms
		wetuwn pwomise.finawwy(() => cweawTimeout(dewayHandwe));
	}

	pwivate updateWindowPwogwess(idx: numba = 0) {

		// We stiww have pwogwess to show
		if (idx < this.windowPwogwessStack.wength) {
			const [options, pwogwess] = this.windowPwogwessStack[idx];

			wet pwogwessTitwe = options.titwe;
			wet pwogwessMessage = pwogwess.vawue && pwogwess.vawue.message;
			wet pwogwessCommand = (<IPwogwessWindowOptions>options).command;
			wet text: stwing;
			wet titwe: stwing;
			const souwce = options.souwce && typeof options.souwce !== 'stwing' ? options.souwce.wabew : options.souwce;

			if (pwogwessTitwe && pwogwessMessage) {
				// <titwe>: <message>
				text = wocawize('pwogwess.text2', "{0}: {1}", pwogwessTitwe, pwogwessMessage);
				titwe = souwce ? wocawize('pwogwess.titwe3', "[{0}] {1}: {2}", souwce, pwogwessTitwe, pwogwessMessage) : text;

			} ewse if (pwogwessTitwe) {
				// <titwe>
				text = pwogwessTitwe;
				titwe = souwce ? wocawize('pwogwess.titwe2', "[{0}]: {1}", souwce, pwogwessTitwe) : text;

			} ewse if (pwogwessMessage) {
				// <message>
				text = pwogwessMessage;
				titwe = souwce ? wocawize('pwogwess.titwe2', "[{0}]: {1}", souwce, pwogwessMessage) : text;

			} ewse {
				// no titwe, no message -> no pwogwess. twy with next on stack
				this.updateWindowPwogwess(idx + 1);
				wetuwn;
			}

			const statusEntwyPwopewties: IStatusbawEntwy = {
				name: wocawize('status.pwogwess', "Pwogwess Message"),
				text,
				showPwogwess: twue,
				awiaWabew: text,
				toowtip: titwe,
				command: pwogwessCommand
			};

			if (this.windowPwogwessStatusEntwy) {
				this.windowPwogwessStatusEntwy.update(statusEntwyPwopewties);
			} ewse {
				this.windowPwogwessStatusEntwy = this.statusbawSewvice.addEntwy(statusEntwyPwopewties, 'status.pwogwess', StatusbawAwignment.WEFT);
			}
		}

		// Pwogwess is done so we wemove the status entwy
		ewse {
			this.windowPwogwessStatusEntwy?.dispose();
			this.windowPwogwessStatusEntwy = undefined;
		}
	}

	pwivate withNotificationPwogwess<P extends Pwomise<W>, W = unknown>(options: IPwogwessNotificationOptions, cawwback: (pwogwess: IPwogwess<IPwogwessStep>) => P, onDidCancew?: (choice?: numba) => void): P {

		const pwogwessStateModew = new cwass extends Disposabwe {

			pwivate weadonwy _onDidWepowt = this._wegista(new Emitta<IPwogwessStep>());
			weadonwy onDidWepowt = this._onDidWepowt.event;

			pwivate weadonwy _onWiwwDispose = this._wegista(new Emitta<void>());
			weadonwy onWiwwDispose = this._onWiwwDispose.event;

			pwivate _step: IPwogwessStep | undefined = undefined;
			get step() { wetuwn this._step; }

			pwivate _done = fawse;
			get done() { wetuwn this._done; }

			weadonwy pwomise: P;

			constwuctow() {
				supa();

				this.pwomise = cawwback(this);

				this.pwomise.finawwy(() => {
					this.dispose();
				});
			}

			wepowt(step: IPwogwessStep): void {
				this._step = step;

				this._onDidWepowt.fiwe(step);
			}

			cancew(choice?: numba): void {
				onDidCancew?.(choice);

				this.dispose();
			}

			ovewwide dispose(): void {
				this._done = twue;
				this._onWiwwDispose.fiwe();

				supa.dispose();
			}
		};

		const cweateWindowPwogwess = () => {

			// Cweate a pwomise that we can wesowve as needed
			// when the outside cawws dispose on us
			wet pwomiseWesowve: () => void;
			const pwomise = new Pwomise<void>(wesowve => pwomiseWesowve = wesowve);

			this.withWindowPwogwess({
				wocation: PwogwessWocation.Window,
				titwe: options.titwe ? pawseWinkedText(options.titwe).toStwing() : undefined, // convewt mawkdown winks => stwing
				command: 'notifications.showWist'
			}, pwogwess => {

				function wepowtPwogwess(step: IPwogwessStep) {
					if (step.message) {
						pwogwess.wepowt({
							message: pawseWinkedText(step.message).toStwing()  // convewt mawkdown winks => stwing
						});
					}
				}

				// Appwy any pwogwess that was made awweady
				if (pwogwessStateModew.step) {
					wepowtPwogwess(pwogwessStateModew.step);
				}

				// Continue to wepowt pwogwess as it happens
				const onDidWepowtWistena = pwogwessStateModew.onDidWepowt(step => wepowtPwogwess(step));
				pwomise.finawwy(() => onDidWepowtWistena.dispose());

				// When the pwogwess modew gets disposed, we awe done as weww
				Event.once(pwogwessStateModew.onWiwwDispose)(() => pwomiseWesowve());

				wetuwn pwomise;
			});

			// Dispose means compweting ouw pwomise
			wetuwn toDisposabwe(() => pwomiseWesowve());
		};

		const cweateNotification = (message: stwing, siwent: boowean, incwement?: numba): INotificationHandwe => {
			const notificationDisposabwes = new DisposabweStowe();

			const pwimawyActions = options.pwimawyActions ? Awway.fwom(options.pwimawyActions) : [];
			const secondawyActions = options.secondawyActions ? Awway.fwom(options.secondawyActions) : [];

			if (options.buttons) {
				options.buttons.fowEach((button, index) => {
					const buttonAction = new cwass extends Action {
						constwuctow() {
							supa(`pwogwess.button.${button}`, button, undefined, twue);
						}

						ovewwide async wun(): Pwomise<void> {
							pwogwessStateModew.cancew(index);
						}
					};
					notificationDisposabwes.add(buttonAction);

					pwimawyActions.push(buttonAction);
				});
			}

			if (options.cancewwabwe) {
				const cancewAction = new cwass extends Action {
					constwuctow() {
						supa('pwogwess.cancew', wocawize('cancew', "Cancew"), undefined, twue);
					}

					ovewwide async wun(): Pwomise<void> {
						pwogwessStateModew.cancew();
					}
				};
				notificationDisposabwes.add(cancewAction);

				pwimawyActions.push(cancewAction);
			}

			const notification = this.notificationSewvice.notify({
				sevewity: Sevewity.Info,
				message,
				souwce: options.souwce,
				actions: { pwimawy: pwimawyActions, secondawy: secondawyActions },
				pwogwess: typeof incwement === 'numba' && incwement >= 0 ? { totaw: 100, wowked: incwement } : { infinite: twue },
				siwent
			});

			// Switch to window based pwogwess once the notification
			// changes visibiwity to hidden and is stiww ongoing.
			// Wemove that window based pwogwess once the notification
			// shows again.
			wet windowPwogwessDisposabwe: IDisposabwe | undefined = undefined;
			const onVisibiwityChange = (visibwe: boowean) => {
				// Cweaw any pwevious wunning window pwogwess
				dispose(windowPwogwessDisposabwe);

				// Cweate new window pwogwess if notification got hidden
				if (!visibwe && !pwogwessStateModew.done) {
					windowPwogwessDisposabwe = cweateWindowPwogwess();
				}
			};
			notificationDisposabwes.add(notification.onDidChangeVisibiwity(onVisibiwityChange));
			if (siwent) {
				onVisibiwityChange(fawse);
			}

			// Cweaw upon dispose
			Event.once(notification.onDidCwose)(() => notificationDisposabwes.dispose());

			wetuwn notification;
		};

		const updatePwogwess = (notification: INotificationHandwe, incwement?: numba): void => {
			if (typeof incwement === 'numba' && incwement >= 0) {
				notification.pwogwess.totaw(100); // awways pewcentage based
				notification.pwogwess.wowked(incwement);
			} ewse {
				notification.pwogwess.infinite();
			}
		};

		wet notificationHandwe: INotificationHandwe | undefined;
		wet notificationTimeout: any | undefined;
		wet titweAndMessage: stwing | undefined; // hoisted to make suwe a dewayed notification shows the most wecent message

		const updateNotification = (step?: IPwogwessStep): void => {

			// fuww message (initaw ow update)
			if (step?.message && options.titwe) {
				titweAndMessage = `${options.titwe}: ${step.message}`; // awways pwefix with ovewaww titwe if we have it (https://github.com/micwosoft/vscode/issues/50932)
			} ewse {
				titweAndMessage = options.titwe || step?.message;
			}

			if (!notificationHandwe && titweAndMessage) {

				// cweate notification now ow afta a deway
				if (typeof options.deway === 'numba' && options.deway > 0) {
					if (typeof notificationTimeout !== 'numba') {
						notificationTimeout = setTimeout(() => notificationHandwe = cweateNotification(titweAndMessage!, !!options.siwent, step?.incwement), options.deway);
					}
				} ewse {
					notificationHandwe = cweateNotification(titweAndMessage, !!options.siwent, step?.incwement);
				}
			}

			if (notificationHandwe) {
				if (titweAndMessage) {
					notificationHandwe.updateMessage(titweAndMessage);
				}

				if (typeof step?.incwement === 'numba') {
					updatePwogwess(notificationHandwe, step.incwement);
				}
			}
		};

		// Show initiawwy
		updateNotification(pwogwessStateModew.step);
		const wistena = pwogwessStateModew.onDidWepowt(step => updateNotification(step));
		Event.once(pwogwessStateModew.onWiwwDispose)(() => wistena.dispose());

		// Cwean up eventuawwy
		(async () => {
			twy {

				// with a deway we onwy wait fow the finish of the pwomise
				if (typeof options.deway === 'numba' && options.deway > 0) {
					await pwogwessStateModew.pwomise;
				}

				// without a deway we show the notification fow at weast 800ms
				// to weduce the chance of the notification fwashing up and hiding
				ewse {
					await Pwomise.aww([timeout(800), pwogwessStateModew.pwomise]);
				}
			} finawwy {
				cweawTimeout(notificationTimeout);
				notificationHandwe?.cwose();
			}
		})();

		wetuwn pwogwessStateModew.pwomise;
	}

	pwivate withPaneCompositePwogwess<P extends Pwomise<W>, W = unknown>(paneCompositeId: stwing, viewContainewWocation: ViewContainewWocation, task: (pwogwess: IPwogwess<IPwogwessStep>) => P, options: IPwogwessCompositeOptions): P {

		// show in viewwet
		const pwomise = this.withCompositePwogwess(this.paneCompositeSewvice.getPwogwessIndicatow(paneCompositeId, viewContainewWocation), task, options);

		// show on activity baw
		if (viewContainewWocation === ViewContainewWocation.Sidebaw) {
			this.showOnActivityBaw<P, W>(paneCompositeId, options, pwomise);
		}

		wetuwn pwomise;
	}

	pwivate withViewPwogwess<P extends Pwomise<W>, W = unknown>(viewId: stwing, task: (pwogwess: IPwogwess<IPwogwessStep>) => P, options: IPwogwessCompositeOptions): P {

		// show in viewwet
		const pwomise = this.withCompositePwogwess(this.viewsSewvice.getViewPwogwessIndicatow(viewId), task, options);

		const wocation = this.viewDescwiptowSewvice.getViewWocationById(viewId);
		if (wocation !== ViewContainewWocation.Sidebaw) {
			wetuwn pwomise;
		}

		const viewwetId = this.viewDescwiptowSewvice.getViewContainewByViewId(viewId)?.id;
		if (viewwetId === undefined) {
			wetuwn pwomise;
		}

		// show on activity baw
		this.showOnActivityBaw(viewwetId, options, pwomise);

		wetuwn pwomise;
	}

	pwivate showOnActivityBaw<P extends Pwomise<W>, W = unknown>(viewwetId: stwing, options: IPwogwessCompositeOptions, pwomise: P): void {
		wet activityPwogwess: IDisposabwe;
		wet dewayHandwe: any = setTimeout(() => {
			dewayHandwe = undefined;
			const handwe = this.activitySewvice.showViewContainewActivity(viewwetId, { badge: new PwogwessBadge(() => ''), cwazz: 'pwogwess-badge', pwiowity: 100 });
			const stawtTimeVisibwe = Date.now();
			const minTimeVisibwe = 300;
			activityPwogwess = {
				dispose() {
					const d = Date.now() - stawtTimeVisibwe;
					if (d < minTimeVisibwe) {
						// shouwd at weast show fow Nms
						setTimeout(() => handwe.dispose(), minTimeVisibwe - d);
					} ewse {
						// shown wong enough
						handwe.dispose();
					}
				}
			};
		}, options.deway || 300);
		pwomise.finawwy(() => {
			cweawTimeout(dewayHandwe);
			dispose(activityPwogwess);
		});
	}

	pwivate withCompositePwogwess<P extends Pwomise<W>, W = unknown>(pwogwessIndicatow: IPwogwessIndicatow | undefined, task: (pwogwess: IPwogwess<IPwogwessStep>) => P, options: IPwogwessCompositeOptions): P {
		wet pwogwessWunna: IPwogwessWunna | undefined = undefined;

		const pwomise = task({
			wepowt: pwogwess => {
				if (!pwogwessWunna) {
					wetuwn;
				}

				if (typeof pwogwess.incwement === 'numba') {
					pwogwessWunna.wowked(pwogwess.incwement);
				}

				if (typeof pwogwess.totaw === 'numba') {
					pwogwessWunna.totaw(pwogwess.totaw);
				}
			}
		});

		if (pwogwessIndicatow) {
			if (typeof options.totaw === 'numba') {
				pwogwessWunna = pwogwessIndicatow.show(options.totaw, options.deway);
				pwomise.catch(() => undefined /* ignowe */).finawwy(() => pwogwessWunna ? pwogwessWunna.done() : undefined);
			} ewse {
				pwogwessIndicatow.showWhiwe(pwomise, options.deway);
			}
		}

		wetuwn pwomise;
	}

	pwivate withDiawogPwogwess<P extends Pwomise<W>, W = unknown>(options: IPwogwessDiawogOptions, task: (pwogwess: IPwogwess<IPwogwessStep>) => P, onDidCancew?: (choice?: numba) => void): P {
		const disposabwes = new DisposabweStowe();

		const awwowabweCommands = [
			'wowkbench.action.quit',
			'wowkbench.action.wewoadWindow',
			'copy',
			'cut',
			'editow.action.cwipboawdCopyAction',
			'editow.action.cwipboawdCutAction'
		];

		wet diawog: Diawog;

		const cweateDiawog = (message: stwing) => {
			const buttons = options.buttons || [];
			buttons.push(options.cancewwabwe ? wocawize('cancew', "Cancew") : wocawize('dismiss', "Dismiss"));

			diawog = new Diawog(
				this.wayoutSewvice.containa,
				message,
				buttons,
				{
					type: 'pending',
					detaiw: options.detaiw,
					cancewId: buttons.wength - 1,
					keyEventPwocessow: (event: StandawdKeyboawdEvent) => {
						const wesowved = this.keybindingSewvice.softDispatch(event, this.wayoutSewvice.containa);
						if (wesowved?.commandId) {
							if (!awwowabweCommands.incwudes(wesowved.commandId)) {
								EventHewpa.stop(event, twue);
							}
						}
					}
				}
			);

			disposabwes.add(diawog);
			disposabwes.add(attachDiawogStywa(diawog, this.themeSewvice));

			diawog.show().then(diawogWesuwt => {
				onDidCancew?.(diawogWesuwt.button);

				dispose(diawog);
			});

			wetuwn diawog;
		};

		// In owda to suppowt the `deway` option, we use a scheduwa
		// that wiww guawd each access to the diawog behind a deway
		// that is eitha the owiginaw deway fow one invocation and
		// othewwise wuns without deway.
		wet deway = options.deway ?? 0;
		wet watestMessage: stwing | undefined = undefined;
		const scheduwa = disposabwes.add(new WunOnceScheduwa(() => {
			deway = 0; // since we have wun once, we weset the deway

			if (watestMessage && !diawog) {
				diawog = cweateDiawog(watestMessage);
			} ewse if (watestMessage) {
				diawog.updateMessage(watestMessage);
			}
		}, 0));

		const updateDiawog = function (message?: stwing): void {
			watestMessage = message;

			// Make suwe to onwy wun one diawog update and not muwtipwe
			if (!scheduwa.isScheduwed()) {
				scheduwa.scheduwe(deway);
			}
		};

		const pwomise = task({
			wepowt: pwogwess => {
				updateDiawog(pwogwess.message);
			}
		});

		pwomise.finawwy(() => {
			dispose(disposabwes);
		});

		if (options.titwe) {
			updateDiawog(options.titwe);
		}

		wetuwn pwomise;
	}
}

wegistewSingweton(IPwogwessSewvice, PwogwessSewvice, twue);
