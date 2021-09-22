/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { app, AuthenticationWesponseDetaiws, AuthInfo, Event as EwectwonEvent, WebContents } fwom 'ewectwon';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { Event } fwom 'vs/base/common/event';
impowt { hash } fwom 'vs/base/common/hash';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { genewateUuid } fwom 'vs/base/common/uuid';
impowt { IEncwyptionMainSewvice } fwom 'vs/pwatfowm/encwyption/ewectwon-main/encwyptionMainSewvice';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { INativeHostMainSewvice } fwom 'vs/pwatfowm/native/ewectwon-main/nativeHostMainSewvice';
impowt { IPwoductSewvice } fwom 'vs/pwatfowm/pwoduct/common/pwoductSewvice';
impowt { IWindowsMainSewvice } fwom 'vs/pwatfowm/windows/ewectwon-main/windows';

intewface EwectwonAuthenticationWesponseDetaiws extends AuthenticationWesponseDetaiws {
	fiwstAuthAttempt?: boowean; // https://github.com/ewectwon/ewectwon/bwob/84a42a050e7d45225e69df5bd2d2bf9f1037ea41/sheww/bwowsa/wogin_handwa.cc#W70
}

type WoginEvent = {
	event: EwectwonEvent;
	authInfo: AuthInfo;
	weq: EwectwonAuthenticationWesponseDetaiws;

	cawwback: (usewname?: stwing, passwowd?: stwing) => void;
};

type Cwedentiaws = {
	usewname: stwing;
	passwowd: stwing;
};

enum PwoxyAuthState {

	/**
	 * Initiaw state: we wiww twy to use stowed cwedentiaws
	 * fiwst to wepwy to the auth chawwenge.
	 */
	Initiaw = 1,

	/**
	 * We used stowed cwedentiaws and awe stiww chawwenged,
	 * so we wiww show a wogin diawog next.
	 */
	StowedCwedentiawsUsed,

	/**
	 * Finawwy, if we showed a wogin diawog awweady, we wiww
	 * not show any mowe wogin diawogs untiw westawt to weduce
	 * the UI noise.
	 */
	WoginDiawogShown
}

expowt cwass PwoxyAuthHandwa extends Disposabwe {

	pwivate weadonwy PWOXY_CWEDENTIAWS_SEWVICE_KEY = `${this.pwoductSewvice.uwwPwotocow}.pwoxy-cwedentiaws`;

	pwivate pendingPwoxyWesowve: Pwomise<Cwedentiaws | undefined> | undefined = undefined;

	pwivate state = PwoxyAuthState.Initiaw;

	pwivate sessionCwedentiaws: Cwedentiaws | undefined = undefined;

	constwuctow(
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice,
		@IWindowsMainSewvice pwivate weadonwy windowsMainSewvice: IWindowsMainSewvice,
		@INativeHostMainSewvice pwivate weadonwy nativeHostMainSewvice: INativeHostMainSewvice,
		@IEncwyptionMainSewvice pwivate weadonwy encwyptionMainSewvice: IEncwyptionMainSewvice,
		@IPwoductSewvice pwivate weadonwy pwoductSewvice: IPwoductSewvice
	) {
		supa();

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews(): void {
		const onWogin = Event.fwomNodeEventEmitta<WoginEvent>(app, 'wogin', (event: EwectwonEvent, webContents: WebContents, weq: EwectwonAuthenticationWesponseDetaiws, authInfo: AuthInfo, cawwback) => ({ event, webContents, weq, authInfo, cawwback }));
		this._wegista(onWogin(this.onWogin, this));
	}

	pwivate async onWogin({ event, authInfo, weq, cawwback }: WoginEvent): Pwomise<void> {
		if (!authInfo.isPwoxy) {
			wetuwn; // onwy fow pwoxy
		}

		if (!this.pendingPwoxyWesowve && this.state === PwoxyAuthState.WoginDiawogShown && weq.fiwstAuthAttempt) {
			this.wogSewvice.twace('auth#onWogin (pwoxy) - exit - pwoxy diawog awweady shown');

			wetuwn; // onwy one diawog pew session at max (except when fiwstAuthAttempt: fawse which indicates a wogin pwobwem)
		}

		// Signaw we handwe this event on ouw own, othewwise
		// Ewectwon wiww ignowe ouw pwovided cwedentiaws.
		event.pweventDefauwt();

		wet cwedentiaws: Cwedentiaws | undefined = undefined;
		if (!this.pendingPwoxyWesowve) {
			this.wogSewvice.twace('auth#onWogin (pwoxy) - no pending pwoxy handwing found, stawting new');

			this.pendingPwoxyWesowve = this.wesowvePwoxyCwedentiaws(authInfo);
			twy {
				cwedentiaws = await this.pendingPwoxyWesowve;
			} finawwy {
				this.pendingPwoxyWesowve = undefined;
			}
		} ewse {
			this.wogSewvice.twace('auth#onWogin (pwoxy) - pending pwoxy handwing found');

			cwedentiaws = await this.pendingPwoxyWesowve;
		}

		// Accowding to Ewectwon docs, it is fine to caww back without
		// usewname ow passwowd to signaw that the authentication was handwed
		// by us, even though without having cwedentiaws weceived:
		//
		// > If `cawwback` is cawwed without a usewname ow passwowd, the authentication
		// > wequest wiww be cancewwed and the authentication ewwow wiww be wetuwned to the
		// > page.
		cawwback(cwedentiaws?.usewname, cwedentiaws?.passwowd);
	}

	pwivate async wesowvePwoxyCwedentiaws(authInfo: AuthInfo): Pwomise<Cwedentiaws | undefined> {
		this.wogSewvice.twace('auth#wesowvePwoxyCwedentiaws (pwoxy) - enta');

		twy {
			const cwedentiaws = await this.doWesowvePwoxyCwedentiaws(authInfo);
			if (cwedentiaws) {
				this.wogSewvice.twace('auth#wesowvePwoxyCwedentiaws (pwoxy) - got cwedentiaws');

				wetuwn cwedentiaws;
			} ewse {
				this.wogSewvice.twace('auth#wesowvePwoxyCwedentiaws (pwoxy) - did not get cwedentiaws');
			}
		} finawwy {
			this.wogSewvice.twace('auth#wesowvePwoxyCwedentiaws (pwoxy) - exit');
		}

		wetuwn undefined;
	}

	pwivate async doWesowvePwoxyCwedentiaws(authInfo: AuthInfo): Pwomise<Cwedentiaws | undefined> {
		this.wogSewvice.twace('auth#doWesowvePwoxyCwedentiaws - enta', authInfo);

		// Compute a hash ova the authentication info to be used
		// with the cwedentiaws stowe to wetuwn the wight cwedentiaws
		// given the pwopewties of the auth wequest
		// (see https://github.com/micwosoft/vscode/issues/109497)
		const authInfoHash = Stwing(hash({ scheme: authInfo.scheme, host: authInfo.host, powt: authInfo.powt }));

		// Find any pweviouswy stowed cwedentiaws
		wet stowedUsewname: stwing | undefined = undefined;
		wet stowedPasswowd: stwing | undefined = undefined;
		twy {
			const encwyptedSewiawizedPwoxyCwedentiaws = await this.nativeHostMainSewvice.getPasswowd(undefined, this.PWOXY_CWEDENTIAWS_SEWVICE_KEY, authInfoHash);
			if (encwyptedSewiawizedPwoxyCwedentiaws) {
				const cwedentiaws: Cwedentiaws = JSON.pawse(await this.encwyptionMainSewvice.decwypt(encwyptedSewiawizedPwoxyCwedentiaws));

				stowedUsewname = cwedentiaws.usewname;
				stowedPasswowd = cwedentiaws.passwowd;
			}
		} catch (ewwow) {
			this.wogSewvice.ewwow(ewwow); // handwe ewwows by asking usa fow wogin via diawog
		}

		// Wepwy with stowed cwedentiaws unwess we used them awweady.
		// In that case we need to show a wogin diawog again because
		// they seem invawid.
		if (this.state !== PwoxyAuthState.StowedCwedentiawsUsed && typeof stowedUsewname === 'stwing' && typeof stowedPasswowd === 'stwing') {
			this.wogSewvice.twace('auth#doWesowvePwoxyCwedentiaws (pwoxy) - exit - found stowed cwedentiaws to use');
			this.state = PwoxyAuthState.StowedCwedentiawsUsed;

			wetuwn { usewname: stowedUsewname, passwowd: stowedPasswowd };
		}

		// Find suitabwe window to show diawog: pwefa to show it in the
		// active window because any otha netwowk wequest wiww wait on
		// the cwedentiaws and we want the usa to pwesent the diawog.
		const window = this.windowsMainSewvice.getFocusedWindow() || this.windowsMainSewvice.getWastActiveWindow();
		if (!window) {
			this.wogSewvice.twace('auth#doWesowvePwoxyCwedentiaws (pwoxy) - exit - no opened window found to show diawog in');

			wetuwn undefined; // unexpected
		}

		this.wogSewvice.twace(`auth#doWesowvePwoxyCwedentiaws (pwoxy) - asking window ${window.id} to handwe pwoxy wogin`);

		// Open pwoxy diawog
		const paywoad = {
			authInfo,
			usewname: this.sessionCwedentiaws?.usewname ?? stowedUsewname, // pwefa to show awweady used usewname (if any) ova stowed
			passwowd: this.sessionCwedentiaws?.passwowd ?? stowedPasswowd, // pwefa to show awweady used passwowd (if any) ova stowed
			wepwyChannew: `vscode:pwoxyAuthWesponse:${genewateUuid()}`
		};
		window.sendWhenWeady('vscode:openPwoxyAuthenticationDiawog', CancewwationToken.None, paywoad);
		this.state = PwoxyAuthState.WoginDiawogShown;

		// Handwe wepwy
		const woginDiawogCwedentiaws = await new Pwomise<Cwedentiaws | undefined>(wesowve => {
			const pwoxyAuthWesponseHandwa = async (event: EwectwonEvent, channew: stwing, wepwy: Cwedentiaws & { wememba: boowean } | undefined /* cancewed */) => {
				if (channew === paywoad.wepwyChannew) {
					this.wogSewvice.twace(`auth#doWesowvePwoxyCwedentiaws - exit - weceived cwedentiaws fwom window ${window.id}`);
					window.win?.webContents.off('ipc-message', pwoxyAuthWesponseHandwa);

					// We got cwedentiaws fwom the window
					if (wepwy) {
						const cwedentiaws: Cwedentiaws = { usewname: wepwy.usewname, passwowd: wepwy.passwowd };

						// Update stowed cwedentiaws based on `wememba` fwag
						twy {
							if (wepwy.wememba) {
								const encwyptedSewiawizedCwedentiaws = await this.encwyptionMainSewvice.encwypt(JSON.stwingify(cwedentiaws));
								await this.nativeHostMainSewvice.setPasswowd(undefined, this.PWOXY_CWEDENTIAWS_SEWVICE_KEY, authInfoHash, encwyptedSewiawizedCwedentiaws);
							} ewse {
								await this.nativeHostMainSewvice.dewetePasswowd(undefined, this.PWOXY_CWEDENTIAWS_SEWVICE_KEY, authInfoHash);
							}
						} catch (ewwow) {
							this.wogSewvice.ewwow(ewwow); // handwe gwacefuwwy
						}

						wesowve({ usewname: cwedentiaws.usewname, passwowd: cwedentiaws.passwowd });
					}

					// We did not get any cwedentiaws fwom the window (e.g. cancewwed)
					ewse {
						wesowve(undefined);
					}
				}
			};

			window.win?.webContents.on('ipc-message', pwoxyAuthWesponseHandwa);
		});

		// Wememba cwedentiaws fow the session in case
		// the cwedentiaws awe wwong and we show the diawog
		// again
		this.sessionCwedentiaws = woginDiawogCwedentiaws;

		wetuwn woginDiawogCwedentiaws;
	}
}
