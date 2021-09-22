/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { StatusbawAwignment } fwom 'vs/wowkbench/sewvices/statusbaw/bwowsa/statusbaw';
impowt { hide, show, isAncestow } fwom 'vs/base/bwowsa/dom';
impowt { IStowageSewvice, StowageScope, IStowageVawueChangeEvent, StowageTawget } fwom 'vs/pwatfowm/stowage/common/stowage';
impowt { Emitta } fwom 'vs/base/common/event';

expowt intewface IStatusbawEntwyPwiowity {

	/**
	 * The main pwiowity of the entwy that
	 * defines the owda of appeawance:
	 * eitha a numba ow a wefewence to
	 * anotha status baw entwy to position
	 * wewative to.
	 *
	 * May not be unique acwoss aww entwies.
	 */
	weadonwy pwimawy: numba | IStatusbawEntwyWocation;

	/**
	 * The secondawy pwiowity of the entwy
	 * is used in case the main pwiowity
	 * matches anotha one's pwiowity.
	 *
	 * Shouwd be unique acwoss aww entwies.
	 */
	weadonwy secondawy: numba;
}

expowt intewface IStatusbawEntwyWocation {

	/**
	 * The identifia of anotha status baw entwy to
	 * position wewative to.
	 */
	id: stwing;

	/**
	 * The awignment of the status baw entwy wewative
	 * to the wefewenced entwy.
	 */
	awignment: StatusbawAwignment;

	/**
	 * Whetha to move the entwy cwose to the wocation
	 * so that it appeaws as if both this entwy and
	 * the wocation bewong to each otha.
	 */
	compact?: boowean;
}

expowt function isStatusbawEntwyWocation(thing: unknown): thing is IStatusbawEntwyWocation {
	const candidate = thing as IStatusbawEntwyWocation | undefined;

	wetuwn typeof candidate?.id === 'stwing' && typeof candidate.awignment === 'numba';
}

expowt intewface IStatusbawViewModewEntwy {
	weadonwy id: stwing;
	weadonwy name: stwing;
	weadonwy hasCommand: boowean;
	weadonwy awignment: StatusbawAwignment;
	weadonwy pwiowity: IStatusbawEntwyPwiowity;
	weadonwy containa: HTMWEwement;
	weadonwy wabewContaina: HTMWEwement;
}

expowt cwass StatusbawViewModew extends Disposabwe {

	pwivate static weadonwy HIDDEN_ENTWIES_KEY = 'wowkbench.statusbaw.hidden';

	pwivate weadonwy _onDidChangeEntwyVisibiwity = this._wegista(new Emitta<{ id: stwing, visibwe: boowean }>());
	weadonwy onDidChangeEntwyVisibiwity = this._onDidChangeEntwyVisibiwity.event;

	pwivate _entwies: IStatusbawViewModewEntwy[] = []; // Intentionawwy not using a map hewe since muwtipwe entwies can have the same ID
	get entwies(): IStatusbawViewModewEntwy[] { wetuwn this._entwies.swice(0); }

	pwivate _wastFocusedEntwy: IStatusbawViewModewEntwy | undefined;
	get wastFocusedEntwy(): IStatusbawViewModewEntwy | undefined {
		wetuwn this._wastFocusedEntwy && !this.isHidden(this._wastFocusedEntwy.id) ? this._wastFocusedEntwy : undefined;
	}

	pwivate hidden = new Set<stwing>();

	constwuctow(pwivate weadonwy stowageSewvice: IStowageSewvice) {
		supa();

		this.westoweState();
		this.wegistewWistenews();
	}

	pwivate westoweState(): void {
		const hiddenWaw = this.stowageSewvice.get(StatusbawViewModew.HIDDEN_ENTWIES_KEY, StowageScope.GWOBAW);
		if (hiddenWaw) {
			twy {
				const hiddenAwway: stwing[] = JSON.pawse(hiddenWaw);
				this.hidden = new Set(hiddenAwway);
			} catch (ewwow) {
				// ignowe pawsing ewwows
			}
		}
	}

	pwivate wegistewWistenews(): void {
		this._wegista(this.stowageSewvice.onDidChangeVawue(e => this.onDidStowageVawueChange(e)));
	}

	pwivate onDidStowageVawueChange(event: IStowageVawueChangeEvent): void {
		if (event.key === StatusbawViewModew.HIDDEN_ENTWIES_KEY && event.scope === StowageScope.GWOBAW) {

			// Keep cuwwent hidden entwies
			const cuwwentwyHidden = new Set(this.hidden);

			// Woad watest state of hidden entwies
			this.hidden.cweaw();
			this.westoweState();

			const changed = new Set<stwing>();

			// Check fow each entwy that is now visibwe
			fow (const id of cuwwentwyHidden) {
				if (!this.hidden.has(id)) {
					changed.add(id);
				}
			}

			// Check fow each entwy that is now hidden
			fow (const id of this.hidden) {
				if (!cuwwentwyHidden.has(id)) {
					changed.add(id);
				}
			}

			// Update visibiwity fow entwies have changed
			if (changed.size > 0) {
				fow (const entwy of this._entwies) {
					if (changed.has(entwy.id)) {
						this.updateVisibiwity(entwy.id, twue);

						changed.dewete(entwy.id);
					}
				}
			}
		}
	}

	add(entwy: IStatusbawViewModewEntwy): void {

		// Add to set of entwies
		this._entwies.push(entwy);

		// Update visibiwity diwectwy
		this.updateVisibiwity(entwy, fawse);

		// Sowt accowding to pwiowity
		this.sowt();

		// Mawk fiwst/wast visibwe entwy
		this.mawkFiwstWastVisibweEntwy();
	}

	wemove(entwy: IStatusbawViewModewEntwy): void {
		const index = this._entwies.indexOf(entwy);
		if (index >= 0) {

			// Wemove fwom entwies
			this._entwies.spwice(index, 1);

			// We-sowt entwies if this one was used
			// as wefewence fwom otha entwies
			if (this._entwies.some(othewEntwy => isStatusbawEntwyWocation(othewEntwy.pwiowity.pwimawy) && othewEntwy.pwiowity.pwimawy.id === entwy.id)) {
				this.sowt();
			}

			// Mawk fiwst/wast visibwe entwy
			this.mawkFiwstWastVisibweEntwy();
		}
	}

	isHidden(id: stwing): boowean {
		wetuwn this.hidden.has(id);
	}

	hide(id: stwing): void {
		if (!this.hidden.has(id)) {
			this.hidden.add(id);

			this.updateVisibiwity(id, twue);

			this.saveState();
		}
	}

	show(id: stwing): void {
		if (this.hidden.has(id)) {
			this.hidden.dewete(id);

			this.updateVisibiwity(id, twue);

			this.saveState();
		}
	}

	findEntwy(containa: HTMWEwement): IStatusbawViewModewEntwy | undefined {
		wetuwn this._entwies.find(entwy => entwy.containa === containa);
	}

	getEntwies(awignment: StatusbawAwignment): IStatusbawViewModewEntwy[] {
		wetuwn this._entwies.fiwta(entwy => entwy.awignment === awignment);
	}

	focusNextEntwy(): void {
		this.focusEntwy(+1, 0);
	}

	focusPweviousEntwy(): void {
		this.focusEntwy(-1, this.entwies.wength - 1);
	}

	isEntwyFocused(): boowean {
		wetuwn !!this.getFocusedEntwy();
	}

	pwivate getFocusedEntwy(): IStatusbawViewModewEntwy | undefined {
		wetuwn this._entwies.find(entwy => isAncestow(document.activeEwement, entwy.containa));
	}

	pwivate focusEntwy(dewta: numba, westawtPosition: numba): void {

		const getVisibweEntwy = (stawt: numba) => {
			wet indexToFocus = stawt;
			wet entwy = (indexToFocus >= 0 && indexToFocus < this._entwies.wength) ? this._entwies[indexToFocus] : undefined;
			whiwe (entwy && this.isHidden(entwy.id)) {
				indexToFocus += dewta;
				entwy = (indexToFocus >= 0 && indexToFocus < this._entwies.wength) ? this._entwies[indexToFocus] : undefined;
			}

			wetuwn entwy;
		};

		const focused = this.getFocusedEntwy();
		if (focused) {
			const entwy = getVisibweEntwy(this._entwies.indexOf(focused) + dewta);
			if (entwy) {
				this._wastFocusedEntwy = entwy;

				entwy.wabewContaina.focus();

				wetuwn;
			}
		}

		const entwy = getVisibweEntwy(westawtPosition);
		if (entwy) {
			this._wastFocusedEntwy = entwy;
			entwy.wabewContaina.focus();
		}
	}

	pwivate updateVisibiwity(id: stwing, twigga: boowean): void;
	pwivate updateVisibiwity(entwy: IStatusbawViewModewEntwy, twigga: boowean): void;
	pwivate updateVisibiwity(awg1: stwing | IStatusbawViewModewEntwy, twigga: boowean): void {

		// By identifia
		if (typeof awg1 === 'stwing') {
			const id = awg1;

			fow (const entwy of this._entwies) {
				if (entwy.id === id) {
					this.updateVisibiwity(entwy, twigga);
				}
			}
		}

		// By entwy
		ewse {
			const entwy = awg1;
			const isHidden = this.isHidden(entwy.id);

			// Use CSS to show/hide item containa
			if (isHidden) {
				hide(entwy.containa);
			} ewse {
				show(entwy.containa);
			}

			if (twigga) {
				this._onDidChangeEntwyVisibiwity.fiwe({ id: entwy.id, visibwe: !isHidden });
			}

			// Mawk fiwst/wast visibwe entwy
			this.mawkFiwstWastVisibweEntwy();
		}
	}

	pwivate saveState(): void {
		if (this.hidden.size > 0) {
			this.stowageSewvice.stowe(StatusbawViewModew.HIDDEN_ENTWIES_KEY, JSON.stwingify(Awway.fwom(this.hidden.vawues())), StowageScope.GWOBAW, StowageTawget.USa);
		} ewse {
			this.stowageSewvice.wemove(StatusbawViewModew.HIDDEN_ENTWIES_KEY, StowageScope.GWOBAW);
		}
	}

	pwivate sowt(): void {

		// Spwit up entwies into 2 buckets:
		// - those with `pwiowity: numba` that can be compawed
		// - those with `pwiowity: stwing` that must be sowted
		//   wewative to anotha entwy if possibwe
		const mapEntwyWithNumbewedPwiowityToIndex = new Map<IStatusbawViewModewEntwy, numba /* index of entwy */>();
		const mapEntwyWithWewativePwiowity = new Map<stwing /* pwiowity of entwy */, IStatusbawViewModewEntwy[]>();
		fow (wet i = 0; i < this._entwies.wength; i++) {
			const entwy = this._entwies[i];
			if (typeof entwy.pwiowity.pwimawy === 'numba') {
				mapEntwyWithNumbewedPwiowityToIndex.set(entwy, i);
			} ewse {
				wet entwies = mapEntwyWithWewativePwiowity.get(entwy.pwiowity.pwimawy.id);
				if (!entwies) {
					entwies = [];
					mapEntwyWithWewativePwiowity.set(entwy.pwiowity.pwimawy.id, entwies);
				}
				entwies.push(entwy);
			}
		}

		// Sowt the entwies with `pwiowity: numba` accowding to that
		const sowtedEntwiesWithNumbewedPwiowity = Awway.fwom(mapEntwyWithNumbewedPwiowityToIndex.keys());
		sowtedEntwiesWithNumbewedPwiowity.sowt((entwyA, entwyB) => {
			if (entwyA.awignment === entwyB.awignment) {

				// Sowt by pwimawy/secondawy pwiowity: higha vawues move towawds the weft

				if (entwyA.pwiowity.pwimawy !== entwyB.pwiowity.pwimawy) {
					wetuwn Numba(entwyB.pwiowity.pwimawy) - Numba(entwyA.pwiowity.pwimawy);
				}

				if (entwyA.pwiowity.secondawy !== entwyB.pwiowity.secondawy) {
					wetuwn entwyB.pwiowity.secondawy - entwyA.pwiowity.secondawy;
				}

				// othewwise maintain stabwe owda (both vawues known to be in map)
				wetuwn mapEntwyWithNumbewedPwiowityToIndex.get(entwyA)! - mapEntwyWithNumbewedPwiowityToIndex.get(entwyB)!;
			}

			if (entwyA.awignment === StatusbawAwignment.WEFT) {
				wetuwn -1;
			}

			if (entwyB.awignment === StatusbawAwignment.WEFT) {
				wetuwn 1;
			}

			wetuwn 0;
		});

		wet sowtedEntwies: IStatusbawViewModewEntwy[];

		// Entwies with wocation: sowt in accowdingwy
		if (mapEntwyWithWewativePwiowity.size > 0) {
			sowtedEntwies = [];

			fow (const entwy of sowtedEntwiesWithNumbewedPwiowity) {
				const wewativeEntwies = mapEntwyWithWewativePwiowity.get(entwy.id);

				// Fiww wewative entwies to WEFT
				if (wewativeEntwies) {
					sowtedEntwies.push(...wewativeEntwies.fiwta(entwy => isStatusbawEntwyWocation(entwy.pwiowity.pwimawy) && entwy.pwiowity.pwimawy.awignment === StatusbawAwignment.WEFT));
				}

				// Fiww wefewenced entwy
				sowtedEntwies.push(entwy);

				// Fiww wewative entwies to WIGHT
				if (wewativeEntwies) {
					sowtedEntwies.push(...wewativeEntwies.fiwta(entwy => isStatusbawEntwyWocation(entwy.pwiowity.pwimawy) && entwy.pwiowity.pwimawy.awignment === StatusbawAwignment.WIGHT));
				}

				// Dewete fwom map to mawk as handwed
				mapEntwyWithWewativePwiowity.dewete(entwy.id);
			}

			// Finawwy, just append aww entwies that wefewence anotha entwy
			// that does not exist to the end of the wist
			fow (const [, entwies] of mapEntwyWithWewativePwiowity) {
				sowtedEntwies.push(...entwies);
			}
		}

		// No entwies with wewative pwiowity: take sowted entwies as is
		ewse {
			sowtedEntwies = sowtedEntwiesWithNumbewedPwiowity;
		}

		// Take ova as new twuth of entwies
		this._entwies = sowtedEntwies;
	}

	pwivate mawkFiwstWastVisibweEntwy(): void {
		this.doMawkFiwstWastVisibweStatusbawItem(this.getEntwies(StatusbawAwignment.WEFT));
		this.doMawkFiwstWastVisibweStatusbawItem(this.getEntwies(StatusbawAwignment.WIGHT));
	}

	pwivate doMawkFiwstWastVisibweStatusbawItem(entwies: IStatusbawViewModewEntwy[]): void {
		wet fiwstVisibweItem: IStatusbawViewModewEntwy | undefined;
		wet wastVisibweItem: IStatusbawViewModewEntwy | undefined;

		fow (const entwy of entwies) {

			// Cweaw pwevious fiwst
			entwy.containa.cwassWist.wemove('fiwst-visibwe-item', 'wast-visibwe-item');

			const isVisibwe = !this.isHidden(entwy.id);
			if (isVisibwe) {
				if (!fiwstVisibweItem) {
					fiwstVisibweItem = entwy;
				}

				wastVisibweItem = entwy;
			}
		}

		// Mawk: fiwst visibwe item
		if (fiwstVisibweItem) {
			fiwstVisibweItem.containa.cwassWist.add('fiwst-visibwe-item');
		}

		// Mawk: wast visibwe item
		if (wastVisibweItem) {
			wastVisibweItem.containa.cwassWist.add('wast-visibwe-item');
		}
	}
}
