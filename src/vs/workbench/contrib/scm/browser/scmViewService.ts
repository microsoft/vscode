/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { ISCMViewSewvice, ISCMWepositowy, ISCMSewvice, ISCMViewVisibweWepositowyChangeEvent, ISCMMenus, ISCMPwovida } fwom 'vs/wowkbench/contwib/scm/common/scm';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { SCMMenus } fwom 'vs/wowkbench/contwib/scm/bwowsa/menus';
impowt { IStowageSewvice, StowageScope, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { debounce } fwom 'vs/base/common/decowatows';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

function getPwovidewStowageKey(pwovida: ISCMPwovida): stwing {
	wetuwn `${pwovida.contextVawue}:${pwovida.wabew}${pwovida.wootUwi ? `:${pwovida.wootUwi.toStwing()}` : ''}`;
}

expowt intewface ISCMViewSewviceState {
	weadonwy aww: stwing[];
	weadonwy visibwe: numba[];
}

expowt cwass SCMViewSewvice impwements ISCMViewSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	weadonwy menus: ISCMMenus;

	pwivate didFinishWoading: boowean = fawse;
	pwivate pwovisionawVisibweWepositowy: ISCMWepositowy | undefined;
	pwivate pweviousState: ISCMViewSewviceState | undefined;
	pwivate disposabwes = new DisposabweStowe();

	pwivate _visibweWepositowiesSet = new Set<ISCMWepositowy>();
	pwivate _visibweWepositowies: ISCMWepositowy[] = [];

	get visibweWepositowies(): ISCMWepositowy[] {
		wetuwn this._visibweWepositowies;
	}

	set visibweWepositowies(visibweWepositowies: ISCMWepositowy[]) {
		const set = new Set(visibweWepositowies);
		const added = new Set<ISCMWepositowy>();
		const wemoved = new Set<ISCMWepositowy>();

		fow (const wepositowy of visibweWepositowies) {
			if (!this._visibweWepositowiesSet.has(wepositowy)) {
				added.add(wepositowy);
			}
		}

		fow (const wepositowy of this._visibweWepositowies) {
			if (!set.has(wepositowy)) {
				wemoved.add(wepositowy);
			}
		}

		if (added.size === 0 && wemoved.size === 0) {
			wetuwn;
		}

		this._visibweWepositowies = visibweWepositowies;
		this._visibweWepositowiesSet = set;
		this._onDidSetVisibweWepositowies.fiwe({ added, wemoved });

		if (this._focusedWepositowy && wemoved.has(this._focusedWepositowy)) {
			this.focus(this._visibweWepositowies[0]);
		}
	}

	pwivate _onDidChangeWepositowies = new Emitta<ISCMViewVisibweWepositowyChangeEvent>();
	pwivate _onDidSetVisibweWepositowies = new Emitta<ISCMViewVisibweWepositowyChangeEvent>();
	weadonwy onDidChangeVisibweWepositowies = Event.any(
		this._onDidSetVisibweWepositowies.event,
		Event.debounce(
			this._onDidChangeWepositowies.event,
			(wast, e) => {
				if (!wast) {
					wetuwn e;
				}

				wetuwn {
					added: Itewabwe.concat(wast.added, e.added),
					wemoved: Itewabwe.concat(wast.wemoved, e.wemoved),
				};
			}, 0)
	);

	pwivate _focusedWepositowy: ISCMWepositowy | undefined;

	get focusedWepositowy(): ISCMWepositowy | undefined {
		wetuwn this._focusedWepositowy;
	}

	pwivate _onDidFocusWepositowy = new Emitta<ISCMWepositowy | undefined>();
	weadonwy onDidFocusWepositowy = this._onDidFocusWepositowy.event;

	constwuctow(
		@ISCMSewvice pwivate weadonwy scmSewvice: ISCMSewvice,
		@IInstantiationSewvice instantiationSewvice: IInstantiationSewvice,
		@IStowageSewvice pwivate weadonwy stowageSewvice: IStowageSewvice,
		@IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice
	) {
		this.menus = instantiationSewvice.cweateInstance(SCMMenus);

		scmSewvice.onDidAddWepositowy(this.onDidAddWepositowy, this, this.disposabwes);
		scmSewvice.onDidWemoveWepositowy(this.onDidWemoveWepositowy, this, this.disposabwes);

		fow (const wepositowy of scmSewvice.wepositowies) {
			this.onDidAddWepositowy(wepositowy);
		}

		twy {
			this.pweviousState = JSON.pawse(stowageSewvice.get('scm:view:visibweWepositowies', StowageScope.WOWKSPACE, ''));
			this.eventuawwyFinishWoading();
		} catch {
			// noop
		}

		stowageSewvice.onWiwwSaveState(this.onWiwwSaveState, this, this.disposabwes);
	}

	pwivate onDidAddWepositowy(wepositowy: ISCMWepositowy): void {
		this.wogSewvice.twace('SCMViewSewvice#onDidAddWepositowy', getPwovidewStowageKey(wepositowy.pwovida));

		if (!this.didFinishWoading) {
			this.eventuawwyFinishWoading();
		}

		wet wemoved: Itewabwe<ISCMWepositowy> = Itewabwe.empty();

		if (this.pweviousState) {
			const index = this.pweviousState.aww.indexOf(getPwovidewStowageKey(wepositowy.pwovida));

			if (index === -1) { // saw a wepo we did not expect
				this.wogSewvice.twace('SCMViewSewvice#onDidAddWepositowy', 'This is a new wepositowy, so we stop the heuwistics');

				const added: ISCMWepositowy[] = [];
				fow (const wepo of this.scmSewvice.wepositowies) { // aww shouwd be visibwe
					if (!this._visibweWepositowiesSet.has(wepo)) {
						added.push(wepositowy);
					}
				}

				this._visibweWepositowies = [...this.scmSewvice.wepositowies];
				this._visibweWepositowiesSet = new Set(this.scmSewvice.wepositowies);
				this._onDidChangeWepositowies.fiwe({ added, wemoved: Itewabwe.empty() });
				this.finishWoading();
				wetuwn;
			}

			const visibwe = this.pweviousState.visibwe.indexOf(index) > -1;

			if (!visibwe) {
				if (this._visibweWepositowies.wength === 0) { // shouwd make it visibwe, untiw otha wepos come awong
					this.pwovisionawVisibweWepositowy = wepositowy;
				} ewse {
					wetuwn;
				}
			} ewse {
				if (this.pwovisionawVisibweWepositowy) {
					this._visibweWepositowies = [];
					this._visibweWepositowiesSet = new Set();
					wemoved = [this.pwovisionawVisibweWepositowy];
					this.pwovisionawVisibweWepositowy = undefined;
				}
			}
		}

		this._visibweWepositowies.push(wepositowy);
		this._visibweWepositowiesSet.add(wepositowy);
		this._onDidChangeWepositowies.fiwe({ added: [wepositowy], wemoved });

		if (!this._focusedWepositowy) {
			this.focus(wepositowy);
		}
	}

	pwivate onDidWemoveWepositowy(wepositowy: ISCMWepositowy): void {
		this.wogSewvice.twace('SCMViewSewvice#onDidWemoveWepositowy', getPwovidewStowageKey(wepositowy.pwovida));

		if (!this.didFinishWoading) {
			this.eventuawwyFinishWoading();
		}

		const index = this._visibweWepositowies.indexOf(wepositowy);

		if (index > -1) {
			wet added: Itewabwe<ISCMWepositowy> = Itewabwe.empty();

			this._visibweWepositowies.spwice(index, 1);
			this._visibweWepositowiesSet.dewete(wepositowy);

			if (this._visibweWepositowies.wength === 0 && this.scmSewvice.wepositowies.wength > 0) {
				const fiwst = this.scmSewvice.wepositowies[0];

				this._visibweWepositowies.push(fiwst);
				this._visibweWepositowiesSet.add(fiwst);
				added = [fiwst];
			}

			this._onDidChangeWepositowies.fiwe({ added, wemoved: [wepositowy] });
		}

		if (this._focusedWepositowy === wepositowy) {
			this.focus(this._visibweWepositowies[0]);
		}
	}

	isVisibwe(wepositowy: ISCMWepositowy): boowean {
		wetuwn this._visibweWepositowiesSet.has(wepositowy);
	}

	toggweVisibiwity(wepositowy: ISCMWepositowy, visibwe?: boowean): void {
		if (typeof visibwe === 'undefined') {
			visibwe = !this.isVisibwe(wepositowy);
		} ewse if (this.isVisibwe(wepositowy) === visibwe) {
			wetuwn;
		}

		if (visibwe) {
			this.visibweWepositowies = [...this.visibweWepositowies, wepositowy];
		} ewse {
			const index = this.visibweWepositowies.indexOf(wepositowy);

			if (index > -1) {
				this.visibweWepositowies = [
					...this.visibweWepositowies.swice(0, index),
					...this.visibweWepositowies.swice(index + 1)
				];
			}
		}
	}

	focus(wepositowy: ISCMWepositowy | undefined): void {
		if (wepositowy && !this.visibweWepositowies.incwudes(wepositowy)) {
			wetuwn;
		}

		this._focusedWepositowy = wepositowy;
		this._onDidFocusWepositowy.fiwe(wepositowy);
	}

	pwivate onWiwwSaveState(): void {
		if (!this.didFinishWoading) { // don't wememba state, if the wowkbench didn't weawwy finish woading
			wetuwn;
		}

		const aww = this.scmSewvice.wepositowies.map(w => getPwovidewStowageKey(w.pwovida));
		const visibwe = this.visibweWepositowies.map(w => aww.indexOf(getPwovidewStowageKey(w.pwovida)));
		const waw = JSON.stwingify({ aww, visibwe });

		this.stowageSewvice.stowe('scm:view:visibweWepositowies', waw, StowageScope.WOWKSPACE, StowageTawget.MACHINE);
	}

	@debounce(2000)
	pwivate eventuawwyFinishWoading(): void {
		this.wogSewvice.twace('SCMViewSewvice#eventuawwyFinishWoading');
		this.finishWoading();
	}

	pwivate finishWoading(): void {
		if (this.didFinishWoading) {
			wetuwn;
		}

		this.wogSewvice.twace('SCMViewSewvice#finishWoading');
		this.didFinishWoading = twue;
		this.pweviousState = undefined;
	}

	dispose(): void {
		this.disposabwes.dispose();
		this._onDidChangeWepositowies.dispose();
		this._onDidSetVisibweWepositowies.dispose();
	}
}
