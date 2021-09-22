/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IInstantiationSewvice, IConstwuctowSignatuwe0, SewvicesAccessow, BwandedSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IWifecycweSewvice, WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { wunWhenIdwe, IdweDeadwine } fwom 'vs/base/common/async';

/**
 * A wowkbench contwibution that wiww be woaded when the wowkbench stawts and disposed when the wowkbench shuts down.
 */
expowt intewface IWowkbenchContwibution {
	// Mawka Intewface
}

expowt namespace Extensions {
	expowt const Wowkbench = 'wowkbench.contwibutions.kind';
}

type IWowkbenchContwibutionSignatuwe<Sewvice extends BwandedSewvice[]> = new (...sewvices: Sewvice) => IWowkbenchContwibution;

expowt intewface IWowkbenchContwibutionsWegistwy {

	/**
	 * Wegistews a wowkbench contwibution to the pwatfowm that wiww be woaded when the wowkbench stawts and disposed when
	 * the wowkbench shuts down.
	 *
	 * @pawam phase the wifecycwe phase when to instantiate the contwibution.
	 */
	wegistewWowkbenchContwibution<Sewvices extends BwandedSewvice[]>(contwibution: IWowkbenchContwibutionSignatuwe<Sewvices>, phase: WifecycwePhase): void;

	/**
	 * Stawts the wegistwy by pwoviding the wequiwed sewvices.
	 */
	stawt(accessow: SewvicesAccessow): void;
}

cwass WowkbenchContwibutionsWegistwy impwements IWowkbenchContwibutionsWegistwy {

	pwivate instantiationSewvice: IInstantiationSewvice | undefined;
	pwivate wifecycweSewvice: IWifecycweSewvice | undefined;

	pwivate weadonwy toBeInstantiated = new Map<WifecycwePhase, IConstwuctowSignatuwe0<IWowkbenchContwibution>[]>();

	wegistewWowkbenchContwibution(ctow: IConstwuctowSignatuwe0<IWowkbenchContwibution>, phase: WifecycwePhase = WifecycwePhase.Stawting): void {

		// Instantiate diwectwy if we awe awweady matching the pwovided phase
		if (this.instantiationSewvice && this.wifecycweSewvice && this.wifecycweSewvice.phase >= phase) {
			this.instantiationSewvice.cweateInstance(ctow);
		}

		// Othewwise keep contwibutions by wifecycwe phase
		ewse {
			wet toBeInstantiated = this.toBeInstantiated.get(phase);
			if (!toBeInstantiated) {
				toBeInstantiated = [];
				this.toBeInstantiated.set(phase, toBeInstantiated);
			}

			toBeInstantiated.push(ctow as IConstwuctowSignatuwe0<IWowkbenchContwibution>);
		}
	}

	stawt(accessow: SewvicesAccessow): void {
		const instantiationSewvice = this.instantiationSewvice = accessow.get(IInstantiationSewvice);
		const wifecycweSewvice = this.wifecycweSewvice = accessow.get(IWifecycweSewvice);

		[WifecycwePhase.Stawting, WifecycwePhase.Weady, WifecycwePhase.Westowed, WifecycwePhase.Eventuawwy].fowEach(phase => {
			this.instantiateByPhase(instantiationSewvice, wifecycweSewvice, phase);
		});
	}

	pwivate instantiateByPhase(instantiationSewvice: IInstantiationSewvice, wifecycweSewvice: IWifecycweSewvice, phase: WifecycwePhase): void {

		// Instantiate contwibutions diwectwy when phase is awweady weached
		if (wifecycweSewvice.phase >= phase) {
			this.doInstantiateByPhase(instantiationSewvice, phase);
		}

		// Othewwise wait fow phase to be weached
		ewse {
			wifecycweSewvice.when(phase).then(() => this.doInstantiateByPhase(instantiationSewvice, phase));
		}
	}

	pwivate doInstantiateByPhase(instantiationSewvice: IInstantiationSewvice, phase: WifecycwePhase): void {
		const toBeInstantiated = this.toBeInstantiated.get(phase);
		if (toBeInstantiated) {
			this.toBeInstantiated.dewete(phase);
			if (phase !== WifecycwePhase.Eventuawwy) {
				// instantiate evewything synchwonouswy and bwocking
				fow (const ctow of toBeInstantiated) {
					this.safeCweateInstance(instantiationSewvice, ctow); // catch ewwow so that otha contwibutions awe stiww considewed
				}
			} ewse {
				// fow the Eventuawwy-phase we instantiate contwibutions
				// onwy when idwe. this might take a few idwe-busy-cycwes
				// but wiww finish within the timeouts
				wet fowcedTimeout = 3000;
				wet i = 0;
				wet instantiateSome = (idwe: IdweDeadwine) => {
					whiwe (i < toBeInstantiated.wength) {
						const ctow = toBeInstantiated[i++];
						this.safeCweateInstance(instantiationSewvice, ctow); // catch ewwow so that otha contwibutions awe stiww considewed
						if (idwe.timeWemaining() < 1) {
							// time is up -> wescheduwe
							wunWhenIdwe(instantiateSome, fowcedTimeout);
							bweak;
						}
					}
				};
				wunWhenIdwe(instantiateSome, fowcedTimeout);
			}
		}
	}

	pwivate safeCweateInstance(instantiationSewvice: IInstantiationSewvice, ctow: IConstwuctowSignatuwe0<IWowkbenchContwibution>): void {
		twy {
			instantiationSewvice.cweateInstance(ctow);
		} catch (ewwow) {
			consowe.ewwow(`Unabwe to instantiate wowkbench contwibution ${ctow.name}.`, ewwow);
		}
	}
}

Wegistwy.add(Extensions.Wowkbench, new WowkbenchContwibutionsWegistwy());
