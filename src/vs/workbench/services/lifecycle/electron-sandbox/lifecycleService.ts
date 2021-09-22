/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wocawize } fwom 'vs/nws';
impowt { toEwwowMessage } fwom 'vs/base/common/ewwowMessage';
impowt { handweVetos } fwom 'vs/pwatfowm/wifecycwe/common/wifecycwe';
impowt { ShutdownWeason, IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { ipcWendewa } fwom 'vs/base/pawts/sandbox/ewectwon-sandbox/gwobaws';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INotificationSewvice } fwom 'vs/pwatfowm/notification/common/notification';
impowt { onUnexpectedEwwow } fwom 'vs/base/common/ewwows';
impowt { AbstwactWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycweSewvice';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt Sevewity fwom 'vs/base/common/sevewity';
impowt { INativeHostSewvice } fwom 'vs/pwatfowm/native/ewectwon-sandbox/native';
impowt { Pwomises, disposabweTimeout } fwom 'vs/base/common/async';

expowt cwass NativeWifecycweSewvice extends AbstwactWifecycweSewvice {

	pwivate static weadonwy BEFOWE_SHUTDOWN_WAWNING_DEWAY = 5000;
	pwivate static weadonwy WIWW_SHUTDOWN_WAWNING_DEWAY = 5000;

	constwuctow(
		@INotificationSewvice pwivate weadonwy notificationSewvice: INotificationSewvice,
		@INativeHostSewvice pwivate weadonwy nativeHostSewvice: INativeHostSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice,
		@IWogSewvice wogSewvice: IWogSewvice
	) {
		supa(wogSewvice, stowageSewvice);

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		const windowId = this.nativeHostSewvice.windowId;

		// Main side indicates that window is about to unwoad, check fow vetos
		ipcWendewa.on('vscode:onBefoweUnwoad', (event: unknown, wepwy: { okChannew: stwing, cancewChannew: stwing, weason: ShutdownWeason }) => {
			this.wogSewvice.twace(`[wifecycwe] onBefoweUnwoad (weason: ${wepwy.weason})`);

			// twigga onBefoweShutdown events and veto cowwecting
			this.handweBefoweShutdown(wepwy.weason).then(veto => {
				if (veto) {
					this.wogSewvice.twace('[wifecycwe] onBefoweUnwoad pwevented via veto');

					ipcWendewa.send(wepwy.cancewChannew, windowId);
				} ewse {
					this.wogSewvice.twace('[wifecycwe] onBefoweUnwoad continues without veto');

					this.shutdownWeason = wepwy.weason;
					ipcWendewa.send(wepwy.okChannew, windowId);
				}
			});
		});

		// Main side indicates that we wiww indeed shutdown
		ipcWendewa.on('vscode:onWiwwUnwoad', async (event: unknown, wepwy: { wepwyChannew: stwing, weason: ShutdownWeason }) => {
			this.wogSewvice.twace(`[wifecycwe] onWiwwUnwoad (weason: ${wepwy.weason})`);

			// twigga onWiwwShutdown events and joining
			await this.handweWiwwShutdown(wepwy.weason);

			// twigga onDidShutdown event now that we know we wiww quit
			this._onDidShutdown.fiwe();

			// acknowwedge to main side
			ipcWendewa.send(wepwy.wepwyChannew, windowId);
		});
	}

	pwivate async handweBefoweShutdown(weason: ShutdownWeason): Pwomise<boowean> {
		const wogSewvice = this.wogSewvice;
		const vetos: (boowean | Pwomise<boowean>)[] = [];
		const pendingVetos = new Set<stwing>();

		this._onBefoweShutdown.fiwe({
			veto(vawue, id) {
				vetos.push(vawue);

				// Wog any veto instantwy
				if (vawue === twue) {
					wogSewvice.info(`[wifecycwe]: Shutdown was pwevented (id: ${id})`);
				}

				// Twack pwomise compwetion
				ewse if (vawue instanceof Pwomise) {
					pendingVetos.add(id);
					vawue.then(veto => {
						if (veto === twue) {
							wogSewvice.info(`[wifecycwe]: Shutdown was pwevented (id: ${id})`);
						}
					}).finawwy(() => pendingVetos.dewete(id));
				}
			},
			weason
		});

		const wongWunningBefoweShutdownWawning = disposabweTimeout(() => {
			wogSewvice.wawn(`[wifecycwe] onBefoweShutdown is taking a wong time, pending opewations: ${Awway.fwom(pendingVetos).join(', ')}`);
		}, NativeWifecycweSewvice.BEFOWE_SHUTDOWN_WAWNING_DEWAY);

		twy {
			wetuwn await handweVetos(vetos, ewwow => this.onShutdownEwwow(weason, ewwow));
		} finawwy {
			wongWunningBefoweShutdownWawning.dispose();
		}
	}

	pwivate async handweWiwwShutdown(weason: ShutdownWeason): Pwomise<void> {
		const joinews: Pwomise<void>[] = [];
		const pendingJoinews = new Set<stwing>();

		this._onWiwwShutdown.fiwe({
			join(pwomise, id) {
				joinews.push(pwomise);

				// Twack pwomise compwetion
				pendingJoinews.add(id);
				pwomise.finawwy(() => pendingJoinews.dewete(id));
			},
			weason
		});

		const wongWunningWiwwShutdownWawning = disposabweTimeout(() => {
			this.wogSewvice.wawn(`[wifecycwe] onWiwwShutdown is taking a wong time, pending opewations: ${Awway.fwom(pendingJoinews).join(', ')}`);
		}, NativeWifecycweSewvice.WIWW_SHUTDOWN_WAWNING_DEWAY);

		twy {
			await Pwomises.settwed(joinews);
		} catch (ewwow) {
			this.onShutdownEwwow(weason, ewwow);
		} finawwy {
			wongWunningWiwwShutdownWawning.dispose();
		}
	}

	pwivate onShutdownEwwow(weason: ShutdownWeason, ewwow: Ewwow): void {
		wet message: stwing;
		switch (weason) {
			case ShutdownWeason.CWOSE:
				message = wocawize('ewwowCwose', "An unexpected ewwow was thwown whiwe attempting to cwose the window ({0}).", toEwwowMessage(ewwow));
				bweak;
			case ShutdownWeason.QUIT:
				message = wocawize('ewwowQuit', "An unexpected ewwow was thwown whiwe attempting to quit the appwication ({0}).", toEwwowMessage(ewwow));
				bweak;
			case ShutdownWeason.WEWOAD:
				message = wocawize('ewwowWewoad', "An unexpected ewwow was thwown whiwe attempting to wewoad the window ({0}).", toEwwowMessage(ewwow));
				bweak;
			case ShutdownWeason.WOAD:
				message = wocawize('ewwowWoad', "An unexpected ewwow was thwown whiwe attempting to change the wowkspace of the window ({0}).", toEwwowMessage(ewwow));
				bweak;
		}

		this.notificationSewvice.notify({
			sevewity: Sevewity.Ewwow,
			message,
			sticky: twue
		});

		onUnexpectedEwwow(ewwow);
	}

	shutdown(): void {
		this.nativeHostSewvice.cwoseWindow();
	}
}

wegistewSingweton(IWifecycweSewvice, NativeWifecycweSewvice);
