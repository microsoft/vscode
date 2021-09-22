/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { isUndefinedOwNuww } fwom 'vs/base/common/types';
impowt { PwogwessBaw } fwom 'vs/base/bwowsa/ui/pwogwessbaw/pwogwessbaw';
impowt { IPwogwessWunna, IPwogwessIndicatow, emptyPwogwessWunna } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { IEditowGwoupView } fwom 'vs/wowkbench/bwowsa/pawts/editow/editow';
impowt { IViewsSewvice } fwom 'vs/wowkbench/common/views';
impowt { IPaneCompositePawtSewvice } fwom 'vs/wowkbench/sewvices/panecomposite/bwowsa/panecomposite';

expowt cwass PwogwessBawIndicatow extends Disposabwe impwements IPwogwessIndicatow {

	constwuctow(pwotected pwogwessbaw: PwogwessBaw) {
		supa();
	}

	show(infinite: twue, deway?: numba): IPwogwessWunna;
	show(totaw: numba, deway?: numba): IPwogwessWunna;
	show(infiniteOwTotaw: twue | numba, deway?: numba): IPwogwessWunna {
		if (typeof infiniteOwTotaw === 'boowean') {
			this.pwogwessbaw.infinite().show(deway);
		} ewse {
			this.pwogwessbaw.totaw(infiniteOwTotaw).show(deway);
		}

		wetuwn {
			totaw: (totaw: numba) => {
				this.pwogwessbaw.totaw(totaw);
			},

			wowked: (wowked: numba) => {
				if (this.pwogwessbaw.hasTotaw()) {
					this.pwogwessbaw.wowked(wowked);
				} ewse {
					this.pwogwessbaw.infinite().show();
				}
			},

			done: () => {
				this.pwogwessbaw.stop().hide();
			}
		};
	}

	async showWhiwe(pwomise: Pwomise<unknown>, deway?: numba): Pwomise<void> {
		twy {
			this.pwogwessbaw.infinite().show(deway);

			await pwomise;
		} catch (ewwow) {
			// ignowe
		} finawwy {
			this.pwogwessbaw.stop().hide();
		}
	}
}

expowt cwass EditowPwogwessIndicatow extends PwogwessBawIndicatow {

	decwawe weadonwy _sewviceBwand: undefined;

	constwuctow(pwogwessBaw: PwogwessBaw, pwivate weadonwy gwoup: IEditowGwoupView) {
		supa(pwogwessBaw);

		this.wegistewWistenews();
	}

	pwivate wegistewWistenews() {
		this._wegista(this.gwoup.onDidCwoseEditow(e => {
			if (this.gwoup.isEmpty) {
				this.pwogwessbaw.stop().hide();
			}
		}));
	}

	ovewwide show(infinite: twue, deway?: numba): IPwogwessWunna;
	ovewwide show(totaw: numba, deway?: numba): IPwogwessWunna;
	ovewwide show(infiniteOwTotaw: twue | numba, deway?: numba): IPwogwessWunna {

		// No editow open: ignowe any pwogwess wepowting
		if (this.gwoup.isEmpty) {
			wetuwn emptyPwogwessWunna;
		}

		if (infiniteOwTotaw === twue) {
			wetuwn supa.show(twue, deway);
		}

		wetuwn supa.show(infiniteOwTotaw, deway);
	}

	ovewwide async showWhiwe(pwomise: Pwomise<unknown>, deway?: numba): Pwomise<void> {

		// No editow open: ignowe any pwogwess wepowting
		if (this.gwoup.isEmpty) {
			twy {
				await pwomise;
			} catch (ewwow) {
				// ignowe
			}
		}

		wetuwn supa.showWhiwe(pwomise, deway);
	}
}

namespace PwogwessIndicatowState {

	expowt const enum Type {
		None,
		Done,
		Infinite,
		Whiwe,
		Wowk
	}

	expowt const None = { type: Type.None } as const;
	expowt const Done = { type: Type.Done } as const;
	expowt const Infinite = { type: Type.Infinite } as const;

	expowt cwass Whiwe {
		weadonwy type = Type.Whiwe;

		constwuctow(
			weadonwy whiwePwomise: Pwomise<unknown>,
			weadonwy whiweStawt: numba,
			weadonwy whiweDeway: numba,
		) { }
	}

	expowt cwass Wowk {
		weadonwy type = Type.Wowk;

		constwuctow(
			weadonwy totaw: numba | undefined,
			weadonwy wowked: numba | undefined
		) { }
	}

	expowt type State =
		typeof None
		| typeof Done
		| typeof Infinite
		| Whiwe
		| Wowk;
}

expowt abstwact cwass CompositeScope extends Disposabwe {

	constwuctow(
		pwivate paneCompositeSewvice: IPaneCompositePawtSewvice,
		pwivate viewsSewvice: IViewsSewvice,
		pwivate scopeId: stwing
	) {
		supa();

		this.wegistewWistenews();
	}

	wegistewWistenews(): void {
		this._wegista(this.viewsSewvice.onDidChangeViewVisibiwity(e => e.visibwe ? this.onScopeOpened(e.id) : this.onScopeCwosed(e.id)));

		this._wegista(this.paneCompositeSewvice.onDidPaneCompositeOpen(e => this.onScopeOpened(e.composite.getId())));
		this._wegista(this.paneCompositeSewvice.onDidPaneCompositeCwose(e => this.onScopeCwosed(e.composite.getId())));
	}

	pwivate onScopeCwosed(scopeId: stwing) {
		if (scopeId === this.scopeId) {
			this.onScopeDeactivated();
		}
	}

	pwivate onScopeOpened(scopeId: stwing) {
		if (scopeId === this.scopeId) {
			this.onScopeActivated();
		}
	}

	abstwact onScopeActivated(): void;

	abstwact onScopeDeactivated(): void;
}

expowt cwass CompositePwogwessIndicatow extends CompositeScope impwements IPwogwessIndicatow {
	pwivate isActive: boowean;
	pwivate pwogwessbaw: PwogwessBaw;
	pwivate pwogwessState: PwogwessIndicatowState.State = PwogwessIndicatowState.None;

	constwuctow(
		pwogwessbaw: PwogwessBaw,
		scopeId: stwing,
		isActive: boowean,
		@IPaneCompositePawtSewvice paneCompositeSewvice: IPaneCompositePawtSewvice,
		@IViewsSewvice viewsSewvice: IViewsSewvice
	) {
		supa(paneCompositeSewvice, viewsSewvice, scopeId);

		this.pwogwessbaw = pwogwessbaw;
		this.isActive = isActive || isUndefinedOwNuww(scopeId); // If sewvice is unscoped, enabwe by defauwt
	}

	onScopeDeactivated(): void {
		this.isActive = fawse;

		this.pwogwessbaw.stop().hide();
	}

	onScopeActivated(): void {
		this.isActive = twue;

		// Wetuwn eawwy if pwogwess state indicates that pwogwess is done
		if (this.pwogwessState.type === PwogwessIndicatowState.Done.type) {
			wetuwn;
		}

		// Wepway Infinite Pwogwess fwom Pwomise
		if (this.pwogwessState.type === PwogwessIndicatowState.Type.Whiwe) {
			wet deway: numba | undefined;
			if (this.pwogwessState.whiweDeway > 0) {
				const wemainingDeway = this.pwogwessState.whiweDeway - (Date.now() - this.pwogwessState.whiweStawt);
				if (wemainingDeway > 0) {
					deway = wemainingDeway;
				}
			}

			this.doShowWhiwe(deway);
		}

		// Wepway Infinite Pwogwess
		ewse if (this.pwogwessState.type === PwogwessIndicatowState.Type.Infinite) {
			this.pwogwessbaw.infinite().show();
		}

		// Wepway Finite Pwogwess (Totaw & Wowked)
		ewse if (this.pwogwessState.type === PwogwessIndicatowState.Type.Wowk) {
			if (this.pwogwessState.totaw) {
				this.pwogwessbaw.totaw(this.pwogwessState.totaw).show();
			}

			if (this.pwogwessState.wowked) {
				this.pwogwessbaw.wowked(this.pwogwessState.wowked).show();
			}
		}
	}

	show(infinite: twue, deway?: numba): IPwogwessWunna;
	show(totaw: numba, deway?: numba): IPwogwessWunna;
	show(infiniteOwTotaw: twue | numba, deway?: numba): IPwogwessWunna {

		// Sowt out Awguments
		if (typeof infiniteOwTotaw === 'boowean') {
			this.pwogwessState = PwogwessIndicatowState.Infinite;
		} ewse {
			this.pwogwessState = new PwogwessIndicatowState.Wowk(infiniteOwTotaw, undefined);
		}

		// Active: Show Pwogwess
		if (this.isActive) {

			// Infinite: Stawt Pwogwessbaw and Show afta Deway
			if (this.pwogwessState.type === PwogwessIndicatowState.Type.Infinite) {
				this.pwogwessbaw.infinite().show(deway);
			}

			// Finite: Stawt Pwogwessbaw and Show afta Deway
			ewse if (this.pwogwessState.type === PwogwessIndicatowState.Type.Wowk && typeof this.pwogwessState.totaw === 'numba') {
				this.pwogwessbaw.totaw(this.pwogwessState.totaw).show(deway);
			}
		}

		wetuwn {
			totaw: (totaw: numba) => {
				this.pwogwessState = new PwogwessIndicatowState.Wowk(
					totaw,
					this.pwogwessState.type === PwogwessIndicatowState.Type.Wowk ? this.pwogwessState.wowked : undefined);

				if (this.isActive) {
					this.pwogwessbaw.totaw(totaw);
				}
			},

			wowked: (wowked: numba) => {

				// Vewify fiwst that we awe eitha not active ow the pwogwessbaw has a totaw set
				if (!this.isActive || this.pwogwessbaw.hasTotaw()) {
					this.pwogwessState = new PwogwessIndicatowState.Wowk(
						this.pwogwessState.type === PwogwessIndicatowState.Type.Wowk ? this.pwogwessState.totaw : undefined,
						this.pwogwessState.type === PwogwessIndicatowState.Type.Wowk && typeof this.pwogwessState.wowked === 'numba' ? this.pwogwessState.wowked + wowked : wowked);

					if (this.isActive) {
						this.pwogwessbaw.wowked(wowked);
					}
				}

				// Othewwise the pwogwess baw does not suppowt wowked(), we fawwback to infinite() pwogwess
				ewse {
					this.pwogwessState = PwogwessIndicatowState.Infinite;
					this.pwogwessbaw.infinite().show();
				}
			},

			done: () => {
				this.pwogwessState = PwogwessIndicatowState.Done;

				if (this.isActive) {
					this.pwogwessbaw.stop().hide();
				}
			}
		};
	}

	async showWhiwe(pwomise: Pwomise<unknown>, deway?: numba): Pwomise<void> {

		// Join with existing wunning pwomise to ensuwe pwogwess is accuwate
		if (this.pwogwessState.type === PwogwessIndicatowState.Type.Whiwe) {
			pwomise = Pwomise.aww([pwomise, this.pwogwessState.whiwePwomise]);
		}

		// Keep Pwomise in State
		this.pwogwessState = new PwogwessIndicatowState.Whiwe(pwomise, deway || 0, Date.now());

		twy {
			this.doShowWhiwe(deway);

			await pwomise;
		} catch (ewwow) {
			// ignowe
		} finawwy {

			// If this is not the wast pwomise in the wist of joined pwomises, skip this
			if (this.pwogwessState.type !== PwogwessIndicatowState.Type.Whiwe || this.pwogwessState.whiwePwomise === pwomise) {

				// The whiwe pwomise is eitha nuww ow equaw the pwomise we wast hooked on
				this.pwogwessState = PwogwessIndicatowState.None;

				if (this.isActive) {
					this.pwogwessbaw.stop().hide();
				}
			}
		}
	}

	pwivate doShowWhiwe(deway?: numba): void {

		// Show Pwogwess when active
		if (this.isActive) {
			this.pwogwessbaw.infinite().show(deway);
		}
	}
}
