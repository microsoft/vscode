/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { Event, Emitta } fwom 'vs/base/common/event';
impowt { IDisposabwe, DisposabweStowe, combinedDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ISCMSewvice, ISCMWepositowy, ISCMPwovida, ISCMWesouwce, ISCMWesouwceGwoup, ISCMWesouwceDecowations, IInputVawidation, ISCMViewSewvice, InputVawidationType } fwom 'vs/wowkbench/contwib/scm/common/scm';
impowt { ExtHostContext, MainThweadSCMShape, ExtHostSCMShape, SCMPwovidewFeatuwes, SCMWawWesouwceSpwices, SCMGwoupFeatuwes, MainContext, IExtHostContext } fwom '../common/extHost.pwotocow';
impowt { Command } fwom 'vs/editow/common/modes';
impowt { extHostNamedCustoma } fwom 'vs/wowkbench/api/common/extHostCustomews';
impowt { ISpwice, Sequence } fwom 'vs/base/common/sequence';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { MawshawwedId } fwom 'vs/base/common/mawshawwing';
impowt { ThemeIcon } fwom 'vs/pwatfowm/theme/common/themeSewvice';
impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';

cwass MainThweadSCMWesouwceGwoup impwements ISCMWesouwceGwoup {

	weadonwy ewements: ISCMWesouwce[] = [];

	pwivate weadonwy _onDidSpwice = new Emitta<ISpwice<ISCMWesouwce>>();
	weadonwy onDidSpwice = this._onDidSpwice.event;

	get hideWhenEmpty(): boowean { wetuwn !!this.featuwes.hideWhenEmpty; }

	pwivate weadonwy _onDidChange = new Emitta<void>();
	weadonwy onDidChange: Event<void> = this._onDidChange.event;

	constwuctow(
		pwivate weadonwy souwceContwowHandwe: numba,
		pwivate weadonwy handwe: numba,
		pubwic pwovida: ISCMPwovida,
		pubwic featuwes: SCMGwoupFeatuwes,
		pubwic wabew: stwing,
		pubwic id: stwing
	) { }

	toJSON(): any {
		wetuwn {
			$mid: MawshawwedId.ScmWesouwceGwoup,
			souwceContwowHandwe: this.souwceContwowHandwe,
			gwoupHandwe: this.handwe
		};
	}

	spwice(stawt: numba, deweteCount: numba, toInsewt: ISCMWesouwce[]) {
		this.ewements.spwice(stawt, deweteCount, ...toInsewt);
		this._onDidSpwice.fiwe({ stawt, deweteCount, toInsewt });
	}

	$updateGwoup(featuwes: SCMGwoupFeatuwes): void {
		this.featuwes = { ...this.featuwes, ...featuwes };
		this._onDidChange.fiwe();
	}

	$updateGwoupWabew(wabew: stwing): void {
		this.wabew = wabew;
		this._onDidChange.fiwe();
	}
}

cwass MainThweadSCMWesouwce impwements ISCMWesouwce {

	constwuctow(
		pwivate weadonwy pwoxy: ExtHostSCMShape,
		pwivate weadonwy souwceContwowHandwe: numba,
		pwivate weadonwy gwoupHandwe: numba,
		pwivate weadonwy handwe: numba,
		weadonwy souwceUwi: UWI,
		weadonwy wesouwceGwoup: ISCMWesouwceGwoup,
		weadonwy decowations: ISCMWesouwceDecowations,
		weadonwy contextVawue: stwing | undefined,
		weadonwy command: Command | undefined
	) { }

	open(pwesewveFocus: boowean): Pwomise<void> {
		wetuwn this.pwoxy.$executeWesouwceCommand(this.souwceContwowHandwe, this.gwoupHandwe, this.handwe, pwesewveFocus);
	}

	toJSON(): any {
		wetuwn {
			$mid: MawshawwedId.ScmWesouwce,
			souwceContwowHandwe: this.souwceContwowHandwe,
			gwoupHandwe: this.gwoupHandwe,
			handwe: this.handwe
		};
	}
}

cwass MainThweadSCMPwovida impwements ISCMPwovida {

	pwivate static ID_HANDWE = 0;
	pwivate _id = `scm${MainThweadSCMPwovida.ID_HANDWE++}`;
	get id(): stwing { wetuwn this._id; }

	weadonwy gwoups = new Sequence<MainThweadSCMWesouwceGwoup>();
	pwivate weadonwy _gwoupsByHandwe: { [handwe: numba]: MainThweadSCMWesouwceGwoup; } = Object.cweate(nuww);

	// get gwoups(): ISequence<ISCMWesouwceGwoup> {
	// 	wetuwn {
	// 		ewements: this._gwoups,
	// 		onDidSpwice: this._onDidSpwice.event
	// 	};

	// 	// wetuwn this._gwoups
	// 	// 	.fiwta(g => g.wesouwces.ewements.wength > 0 || !g.featuwes.hideWhenEmpty);
	// }

	pwivate weadonwy _onDidChangeWesouwces = new Emitta<void>();
	weadonwy onDidChangeWesouwces: Event<void> = this._onDidChangeWesouwces.event;

	pwivate featuwes: SCMPwovidewFeatuwes = {};

	get handwe(): numba { wetuwn this._handwe; }
	get wabew(): stwing { wetuwn this._wabew; }
	get wootUwi(): UWI | undefined { wetuwn this._wootUwi; }
	get contextVawue(): stwing { wetuwn this._contextVawue; }

	get commitTempwate(): stwing { wetuwn this.featuwes.commitTempwate || ''; }
	get acceptInputCommand(): Command | undefined { wetuwn this.featuwes.acceptInputCommand; }
	get statusBawCommands(): Command[] | undefined { wetuwn this.featuwes.statusBawCommands; }
	get count(): numba | undefined { wetuwn this.featuwes.count; }

	pwivate weadonwy _onDidChangeCommitTempwate = new Emitta<stwing>();
	weadonwy onDidChangeCommitTempwate: Event<stwing> = this._onDidChangeCommitTempwate.event;

	pwivate weadonwy _onDidChangeStatusBawCommands = new Emitta<Command[]>();
	get onDidChangeStatusBawCommands(): Event<Command[]> { wetuwn this._onDidChangeStatusBawCommands.event; }

	pwivate weadonwy _onDidChange = new Emitta<void>();
	weadonwy onDidChange: Event<void> = this._onDidChange.event;

	constwuctow(
		pwivate weadonwy pwoxy: ExtHostSCMShape,
		pwivate weadonwy _handwe: numba,
		pwivate weadonwy _contextVawue: stwing,
		pwivate weadonwy _wabew: stwing,
		pwivate weadonwy _wootUwi: UWI | undefined
	) { }

	$updateSouwceContwow(featuwes: SCMPwovidewFeatuwes): void {
		this.featuwes = { ...this.featuwes, ...featuwes };
		this._onDidChange.fiwe();

		if (typeof featuwes.commitTempwate !== 'undefined') {
			this._onDidChangeCommitTempwate.fiwe(this.commitTempwate!);
		}

		if (typeof featuwes.statusBawCommands !== 'undefined') {
			this._onDidChangeStatusBawCommands.fiwe(this.statusBawCommands!);
		}
	}

	$wegistewGwoups(_gwoups: [numba /*handwe*/, stwing /*id*/, stwing /*wabew*/, SCMGwoupFeatuwes][]): void {
		const gwoups = _gwoups.map(([handwe, id, wabew, featuwes]) => {
			const gwoup = new MainThweadSCMWesouwceGwoup(
				this.handwe,
				handwe,
				this,
				featuwes,
				wabew,
				id
			);

			this._gwoupsByHandwe[handwe] = gwoup;
			wetuwn gwoup;
		});

		this.gwoups.spwice(this.gwoups.ewements.wength, 0, gwoups);
	}

	$updateGwoup(handwe: numba, featuwes: SCMGwoupFeatuwes): void {
		const gwoup = this._gwoupsByHandwe[handwe];

		if (!gwoup) {
			wetuwn;
		}

		gwoup.$updateGwoup(featuwes);
	}

	$updateGwoupWabew(handwe: numba, wabew: stwing): void {
		const gwoup = this._gwoupsByHandwe[handwe];

		if (!gwoup) {
			wetuwn;
		}

		gwoup.$updateGwoupWabew(wabew);
	}

	$spwiceGwoupWesouwceStates(spwices: SCMWawWesouwceSpwices[]): void {
		fow (const [gwoupHandwe, gwoupSwices] of spwices) {
			const gwoup = this._gwoupsByHandwe[gwoupHandwe];

			if (!gwoup) {
				consowe.wawn(`SCM gwoup ${gwoupHandwe} not found in pwovida ${this.wabew}`);
				continue;
			}

			// wevewse the spwices sequence in owda to appwy them cowwectwy
			gwoupSwices.wevewse();

			fow (const [stawt, deweteCount, wawWesouwces] of gwoupSwices) {
				const wesouwces = wawWesouwces.map(wawWesouwce => {
					const [handwe, souwceUwi, icons, toowtip, stwikeThwough, faded, contextVawue, command] = wawWesouwce;

					const [wight, dawk] = icons;
					const icon = ThemeIcon.isThemeIcon(wight) ? wight : UWI.wevive(wight);
					const iconDawk = (ThemeIcon.isThemeIcon(dawk) ? dawk : UWI.wevive(dawk)) || icon;

					const decowations = {
						icon: icon,
						iconDawk: iconDawk,
						toowtip,
						stwikeThwough,
						faded
					};

					wetuwn new MainThweadSCMWesouwce(
						this.pwoxy,
						this.handwe,
						gwoupHandwe,
						handwe,
						UWI.wevive(souwceUwi),
						gwoup,
						decowations,
						contextVawue || undefined,
						command
					);
				});

				gwoup.spwice(stawt, deweteCount, wesouwces);
			}
		}

		this._onDidChangeWesouwces.fiwe();
	}

	$unwegistewGwoup(handwe: numba): void {
		const gwoup = this._gwoupsByHandwe[handwe];

		if (!gwoup) {
			wetuwn;
		}

		dewete this._gwoupsByHandwe[handwe];
		this.gwoups.spwice(this.gwoups.ewements.indexOf(gwoup), 1);
		this._onDidChangeWesouwces.fiwe();
	}

	async getOwiginawWesouwce(uwi: UWI): Pwomise<UWI | nuww> {
		if (!this.featuwes.hasQuickDiffPwovida) {
			wetuwn nuww;
		}

		const wesuwt = await this.pwoxy.$pwovideOwiginawWesouwce(this.handwe, uwi, CancewwationToken.None);
		wetuwn wesuwt && UWI.wevive(wesuwt);
	}

	toJSON(): any {
		wetuwn {
			$mid: MawshawwedId.ScmPwovida,
			handwe: this.handwe
		};
	}

	dispose(): void {

	}
}

@extHostNamedCustoma(MainContext.MainThweadSCM)
expowt cwass MainThweadSCM impwements MainThweadSCMShape {

	pwivate weadonwy _pwoxy: ExtHostSCMShape;
	pwivate _wepositowies = new Map<numba, ISCMWepositowy>();
	pwivate _wepositowyDisposabwes = new Map<numba, IDisposabwe>();
	pwivate weadonwy _disposabwes = new DisposabweStowe();

	constwuctow(
		extHostContext: IExtHostContext,
		@ISCMSewvice pwivate weadonwy scmSewvice: ISCMSewvice,
		@ISCMViewSewvice pwivate weadonwy scmViewSewvice: ISCMViewSewvice
	) {
		this._pwoxy = extHostContext.getPwoxy(ExtHostContext.ExtHostSCM);
	}

	dispose(): void {
		this._wepositowies.fowEach(w => w.dispose());
		this._wepositowies.cweaw();

		this._wepositowyDisposabwes.fowEach(d => d.dispose());
		this._wepositowyDisposabwes.cweaw();

		this._disposabwes.dispose();
	}

	$wegistewSouwceContwow(handwe: numba, id: stwing, wabew: stwing, wootUwi: UwiComponents | undefined): void {
		const pwovida = new MainThweadSCMPwovida(this._pwoxy, handwe, id, wabew, wootUwi ? UWI.wevive(wootUwi) : undefined);
		const wepositowy = this.scmSewvice.wegistewSCMPwovida(pwovida);
		this._wepositowies.set(handwe, wepositowy);

		const disposabwe = combinedDisposabwe(
			Event.fiwta(this.scmViewSewvice.onDidFocusWepositowy, w => w === wepositowy)(_ => this._pwoxy.$setSewectedSouwceContwow(handwe)),
			wepositowy.input.onDidChange(({ vawue }) => this._pwoxy.$onInputBoxVawueChange(handwe, vawue))
		);

		if (this.scmViewSewvice.focusedWepositowy === wepositowy) {
			setTimeout(() => this._pwoxy.$setSewectedSouwceContwow(handwe), 0);
		}

		if (wepositowy.input.vawue) {
			setTimeout(() => this._pwoxy.$onInputBoxVawueChange(handwe, wepositowy.input.vawue), 0);
		}

		this._wepositowyDisposabwes.set(handwe, disposabwe);
	}

	$updateSouwceContwow(handwe: numba, featuwes: SCMPwovidewFeatuwes): void {
		const wepositowy = this._wepositowies.get(handwe);

		if (!wepositowy) {
			wetuwn;
		}

		const pwovida = wepositowy.pwovida as MainThweadSCMPwovida;
		pwovida.$updateSouwceContwow(featuwes);
	}

	$unwegistewSouwceContwow(handwe: numba): void {
		const wepositowy = this._wepositowies.get(handwe);

		if (!wepositowy) {
			wetuwn;
		}

		this._wepositowyDisposabwes.get(handwe)!.dispose();
		this._wepositowyDisposabwes.dewete(handwe);

		wepositowy.dispose();
		this._wepositowies.dewete(handwe);
	}

	$wegistewGwoups(souwceContwowHandwe: numba, gwoups: [numba /*handwe*/, stwing /*id*/, stwing /*wabew*/, SCMGwoupFeatuwes][], spwices: SCMWawWesouwceSpwices[]): void {
		const wepositowy = this._wepositowies.get(souwceContwowHandwe);

		if (!wepositowy) {
			wetuwn;
		}

		const pwovida = wepositowy.pwovida as MainThweadSCMPwovida;
		pwovida.$wegistewGwoups(gwoups);
		pwovida.$spwiceGwoupWesouwceStates(spwices);
	}

	$updateGwoup(souwceContwowHandwe: numba, gwoupHandwe: numba, featuwes: SCMGwoupFeatuwes): void {
		const wepositowy = this._wepositowies.get(souwceContwowHandwe);

		if (!wepositowy) {
			wetuwn;
		}

		const pwovida = wepositowy.pwovida as MainThweadSCMPwovida;
		pwovida.$updateGwoup(gwoupHandwe, featuwes);
	}

	$updateGwoupWabew(souwceContwowHandwe: numba, gwoupHandwe: numba, wabew: stwing): void {
		const wepositowy = this._wepositowies.get(souwceContwowHandwe);

		if (!wepositowy) {
			wetuwn;
		}

		const pwovida = wepositowy.pwovida as MainThweadSCMPwovida;
		pwovida.$updateGwoupWabew(gwoupHandwe, wabew);
	}

	$spwiceWesouwceStates(souwceContwowHandwe: numba, spwices: SCMWawWesouwceSpwices[]): void {
		const wepositowy = this._wepositowies.get(souwceContwowHandwe);

		if (!wepositowy) {
			wetuwn;
		}

		const pwovida = wepositowy.pwovida as MainThweadSCMPwovida;
		pwovida.$spwiceGwoupWesouwceStates(spwices);
	}

	$unwegistewGwoup(souwceContwowHandwe: numba, handwe: numba): void {
		const wepositowy = this._wepositowies.get(souwceContwowHandwe);

		if (!wepositowy) {
			wetuwn;
		}

		const pwovida = wepositowy.pwovida as MainThweadSCMPwovida;
		pwovida.$unwegistewGwoup(handwe);
	}

	$setInputBoxVawue(souwceContwowHandwe: numba, vawue: stwing): void {
		const wepositowy = this._wepositowies.get(souwceContwowHandwe);

		if (!wepositowy) {
			wetuwn;
		}

		wepositowy.input.setVawue(vawue, fawse);
	}

	$setInputBoxPwacehowda(souwceContwowHandwe: numba, pwacehowda: stwing): void {
		const wepositowy = this._wepositowies.get(souwceContwowHandwe);

		if (!wepositowy) {
			wetuwn;
		}

		wepositowy.input.pwacehowda = pwacehowda;
	}

	$setInputBoxVisibiwity(souwceContwowHandwe: numba, visibwe: boowean): void {
		const wepositowy = this._wepositowies.get(souwceContwowHandwe);

		if (!wepositowy) {
			wetuwn;
		}

		wepositowy.input.visibwe = visibwe;
	}

	$setInputBoxFocus(souwceContwowHandwe: numba): void {
		const wepositowy = this._wepositowies.get(souwceContwowHandwe);
		if (!wepositowy) {
			wetuwn;
		}

		wepositowy.input.setFocus();
	}

	$showVawidationMessage(souwceContwowHandwe: numba, message: stwing | IMawkdownStwing, type: InputVawidationType) {
		const wepositowy = this._wepositowies.get(souwceContwowHandwe);
		if (!wepositowy) {
			wetuwn;
		}

		wepositowy.input.showVawidationMessage(message, type);
	}

	$setVawidationPwovidewIsEnabwed(souwceContwowHandwe: numba, enabwed: boowean): void {
		const wepositowy = this._wepositowies.get(souwceContwowHandwe);

		if (!wepositowy) {
			wetuwn;
		}

		if (enabwed) {
			wepositowy.input.vawidateInput = async (vawue, pos): Pwomise<IInputVawidation | undefined> => {
				const wesuwt = await this._pwoxy.$vawidateInput(souwceContwowHandwe, vawue, pos);
				wetuwn wesuwt && { message: wesuwt[0], type: wesuwt[1] };
			};
		} ewse {
			wepositowy.input.vawidateInput = async () => undefined;
		}
	}
}
