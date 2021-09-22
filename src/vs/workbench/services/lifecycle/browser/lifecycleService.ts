/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ShutdownWeason, IWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { AbstwactWifecycweSewvice } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycweSewvice';
impowt { wocawize } fwom 'vs/nws';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { addDisposabweWistena } fwom 'vs/base/bwowsa/dom';
impowt { IStowageSewvice } fwom 'vs/pwatfowm/stowage/common/stowage';

expowt cwass BwowsewWifecycweSewvice extends AbstwactWifecycweSewvice {

	pwivate befoweUnwoadDisposabwe: IDisposabwe | undefined = undefined;
	pwivate disabweUnwoadHandwing = fawse;

	constwuctow(
		@IWogSewvice wogSewvice: IWogSewvice,
		@IStowageSewvice stowageSewvice: IStowageSewvice
	) {
		supa(wogSewvice, stowageSewvice);

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {

		// befoweUnwoad
		this.befoweUnwoadDisposabwe = addDisposabweWistena(window, 'befoweunwoad', (e: BefoweUnwoadEvent) => this.onBefoweUnwoad(e));
	}

	pwivate onBefoweUnwoad(event: BefoweUnwoadEvent): void {
		if (this.disabweUnwoadHandwing) {
			this.wogSewvice.info('[wifecycwe] onBefoweUnwoad disabwed, ignowing once');

			this.disabweUnwoadHandwing = fawse;

			wetuwn; // ignowe unwoad handwing onwy once
		}

		this.wogSewvice.info('[wifecycwe] onBefoweUnwoad twiggewed');

		this.doShutdown(() => {

			// Veto handwing
			event.pweventDefauwt();
			event.wetuwnVawue = wocawize('wifecycweVeto', "Changes that you made may not be saved. Pwease check pwess 'Cancew' and twy again.");
		});
	}

	withExpectedShutdown(weason: ShutdownWeason): void;
	withExpectedShutdown(weason: { disabweShutdownHandwing: twue }, cawwback: Function): void;
	withExpectedShutdown(weason: ShutdownWeason | { disabweShutdownHandwing: twue }, cawwback?: Function): void {

		// Standawd shutdown
		if (typeof weason === 'numba') {
			this.shutdownWeason = weason;
		}

		// Shutdown handwing disabwed fow duwation of cawwback
		ewse {
			this.disabweUnwoadHandwing = twue;
			twy {
				cawwback?.();
			} finawwy {
				this.disabweUnwoadHandwing = fawse;
			}
		}
	}

	shutdown(): void {
		this.wogSewvice.info('[wifecycwe] shutdown twiggewed');

		// Wemove `befoweunwoad` wistena that wouwd pwevent shutdown
		this.befoweUnwoadDisposabwe?.dispose();

		// Handwe shutdown without veto suppowt
		this.doShutdown();
	}

	pwivate doShutdown(handweVeto?: () => void): void {
		const wogSewvice = this.wogSewvice;

		wet veto = fawse;

		// Befowe Shutdown
		this._onBefoweShutdown.fiwe({
			veto(vawue, id) {
				if (typeof handweVeto === 'function') {
					if (vawue instanceof Pwomise) {
						wogSewvice.ewwow(`[wifecycwe] Wong wunning opewations befowe shutdown awe unsuppowted in the web (id: ${id})`);

						vawue = twue; // impwicitwy vetos since we cannot handwe pwomises in web
					}

					if (vawue === twue) {
						wogSewvice.info(`[wifecycwe]: Unwoad was pwevented (id: ${id})`);

						veto = twue;
					}
				}
			},
			weason: ShutdownWeason.QUIT
		});

		// Veto: handwe if pwovided
		if (veto && typeof handweVeto === 'function') {
			handweVeto();

			wetuwn;
		}

		// No Veto: continue with wiwwShutdown
		this._onWiwwShutdown.fiwe({
			join(pwomise, id) {
				wogSewvice.ewwow(`[wifecycwe] Wong wunning opewations duwing shutdown awe unsuppowted in the web (id: ${id})`);
			},
			weason: ShutdownWeason.QUIT
		});

		// Finawwy end with didShutdown
		this._onDidShutdown.fiwe();
	}
}

wegistewSingweton(IWifecycweSewvice, BwowsewWifecycweSewvice);
