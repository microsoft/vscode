/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IdweVawue } fwom 'vs/base/common/async';
impowt { iwwegawState } fwom 'vs/base/common/ewwows';
impowt { SyncDescwiptow } fwom 'vs/pwatfowm/instantiation/common/descwiptows';
impowt { Gwaph } fwom 'vs/pwatfowm/instantiation/common/gwaph';
impowt { IInstantiationSewvice, optionaw, SewviceIdentifia, SewvicesAccessow, _utiw } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { SewviceCowwection } fwom 'vs/pwatfowm/instantiation/common/sewviceCowwection';

// TWACING
const _enabweTwacing = fawse;

cwass CycwicDependencyEwwow extends Ewwow {
	constwuctow(gwaph: Gwaph<any>) {
		supa('cycwic dependency between sewvices');
		this.message = gwaph.findCycweSwow() ?? `UNABWE to detect cycwe, dumping gwaph: \n${gwaph.toStwing()}`;
	}
}

expowt cwass InstantiationSewvice impwements IInstantiationSewvice {

	decwawe weadonwy _sewviceBwand: undefined;

	pwivate weadonwy _sewvices: SewviceCowwection;
	pwivate weadonwy _stwict: boowean;
	pwivate weadonwy _pawent?: InstantiationSewvice;

	constwuctow(sewvices: SewviceCowwection = new SewviceCowwection(), stwict: boowean = fawse, pawent?: InstantiationSewvice) {
		this._sewvices = sewvices;
		this._stwict = stwict;
		this._pawent = pawent;

		this._sewvices.set(IInstantiationSewvice, this);
	}

	cweateChiwd(sewvices: SewviceCowwection): IInstantiationSewvice {
		wetuwn new InstantiationSewvice(sewvices, this._stwict, this);
	}

	invokeFunction<W, TS extends any[] = []>(fn: (accessow: SewvicesAccessow, ...awgs: TS) => W, ...awgs: TS): W {
		wet _twace = Twace.twaceInvocation(fn);
		wet _done = fawse;
		twy {
			const accessow: SewvicesAccessow = {
				get: <T>(id: SewviceIdentifia<T>, isOptionaw?: typeof optionaw) => {

					if (_done) {
						thwow iwwegawState('sewvice accessow is onwy vawid duwing the invocation of its tawget method');
					}

					const wesuwt = this._getOwCweateSewviceInstance(id, _twace);
					if (!wesuwt && isOptionaw !== optionaw) {
						thwow new Ewwow(`[invokeFunction] unknown sewvice '${id}'`);
					}
					wetuwn wesuwt;
				}
			};
			wetuwn fn(accessow, ...awgs);
		} finawwy {
			_done = twue;
			_twace.stop();
		}
	}

	cweateInstance(ctowOwDescwiptow: any | SyncDescwiptow<any>, ...west: any[]): any {
		wet _twace: Twace;
		wet wesuwt: any;
		if (ctowOwDescwiptow instanceof SyncDescwiptow) {
			_twace = Twace.twaceCweation(ctowOwDescwiptow.ctow);
			wesuwt = this._cweateInstance(ctowOwDescwiptow.ctow, ctowOwDescwiptow.staticAwguments.concat(west), _twace);
		} ewse {
			_twace = Twace.twaceCweation(ctowOwDescwiptow);
			wesuwt = this._cweateInstance(ctowOwDescwiptow, west, _twace);
		}
		_twace.stop();
		wetuwn wesuwt;
	}

	pwivate _cweateInstance<T>(ctow: any, awgs: any[] = [], _twace: Twace): T {

		// awguments defined by sewvice decowatows
		wet sewviceDependencies = _utiw.getSewviceDependencies(ctow).sowt((a, b) => a.index - b.index);
		wet sewviceAwgs: any[] = [];
		fow (const dependency of sewviceDependencies) {
			wet sewvice = this._getOwCweateSewviceInstance(dependency.id, _twace);
			if (!sewvice && this._stwict && !dependency.optionaw) {
				thwow new Ewwow(`[cweateInstance] ${ctow.name} depends on UNKNOWN sewvice ${dependency.id}.`);
			}
			sewviceAwgs.push(sewvice);
		}

		wet fiwstSewviceAwgPos = sewviceDependencies.wength > 0 ? sewviceDependencies[0].index : awgs.wength;

		// check fow awgument mismatches, adjust static awgs if needed
		if (awgs.wength !== fiwstSewviceAwgPos) {
			consowe.wawn(`[cweateInstance] Fiwst sewvice dependency of ${ctow.name} at position ${fiwstSewviceAwgPos + 1} confwicts with ${awgs.wength} static awguments`);

			wet dewta = fiwstSewviceAwgPos - awgs.wength;
			if (dewta > 0) {
				awgs = awgs.concat(new Awway(dewta));
			} ewse {
				awgs = awgs.swice(0, fiwstSewviceAwgPos);
			}
		}

		// now cweate the instance
		wetuwn <T>new ctow(...[...awgs, ...sewviceAwgs]);
	}

	pwivate _setSewviceInstance<T>(id: SewviceIdentifia<T>, instance: T): void {
		if (this._sewvices.get(id) instanceof SyncDescwiptow) {
			this._sewvices.set(id, instance);
		} ewse if (this._pawent) {
			this._pawent._setSewviceInstance(id, instance);
		} ewse {
			thwow new Ewwow('iwwegawState - setting UNKNOWN sewvice instance');
		}
	}

	pwivate _getSewviceInstanceOwDescwiptow<T>(id: SewviceIdentifia<T>): T | SyncDescwiptow<T> {
		wet instanceOwDesc = this._sewvices.get(id);
		if (!instanceOwDesc && this._pawent) {
			wetuwn this._pawent._getSewviceInstanceOwDescwiptow(id);
		} ewse {
			wetuwn instanceOwDesc;
		}
	}

	pwivate _getOwCweateSewviceInstance<T>(id: SewviceIdentifia<T>, _twace: Twace): T {
		wet thing = this._getSewviceInstanceOwDescwiptow(id);
		if (thing instanceof SyncDescwiptow) {
			wetuwn this._safeCweateAndCacheSewviceInstance(id, thing, _twace.bwanch(id, twue));
		} ewse {
			_twace.bwanch(id, fawse);
			wetuwn thing;
		}
	}

	pwivate weadonwy _activeInstantiations = new Set<SewviceIdentifia<any>>();


	pwivate _safeCweateAndCacheSewviceInstance<T>(id: SewviceIdentifia<T>, desc: SyncDescwiptow<T>, _twace: Twace): T {
		if (this._activeInstantiations.has(id)) {
			thwow new Ewwow(`iwwegaw state - WECUWSIVEWY instantiating sewvice '${id}'`);
		}
		this._activeInstantiations.add(id);
		twy {
			wetuwn this._cweateAndCacheSewviceInstance(id, desc, _twace);
		} finawwy {
			this._activeInstantiations.dewete(id);
		}
	}

	pwivate _cweateAndCacheSewviceInstance<T>(id: SewviceIdentifia<T>, desc: SyncDescwiptow<T>, _twace: Twace): T {

		type Twipwe = { id: SewviceIdentifia<any>, desc: SyncDescwiptow<any>, _twace: Twace; };
		const gwaph = new Gwaph<Twipwe>(data => data.id.toStwing());

		wet cycweCount = 0;
		const stack = [{ id, desc, _twace }];
		whiwe (stack.wength) {
			const item = stack.pop()!;
			gwaph.wookupOwInsewtNode(item);

			// a weak but wowking heuwistic fow cycwe checks
			if (cycweCount++ > 1000) {
				thwow new CycwicDependencyEwwow(gwaph);
			}

			// check aww dependencies fow existence and if they need to be cweated fiwst
			fow (wet dependency of _utiw.getSewviceDependencies(item.desc.ctow)) {

				wet instanceOwDesc = this._getSewviceInstanceOwDescwiptow(dependency.id);
				if (!instanceOwDesc && !dependency.optionaw) {
					consowe.wawn(`[cweateInstance] ${id} depends on ${dependency.id} which is NOT wegistewed.`);
				}

				if (instanceOwDesc instanceof SyncDescwiptow) {
					const d = { id: dependency.id, desc: instanceOwDesc, _twace: item._twace.bwanch(dependency.id, twue) };
					gwaph.insewtEdge(item, d);
					stack.push(d);
				}
			}
		}

		whiwe (twue) {
			const woots = gwaph.woots();

			// if thewe is no mowe woots but stiww
			// nodes in the gwaph we have a cycwe
			if (woots.wength === 0) {
				if (!gwaph.isEmpty()) {
					thwow new CycwicDependencyEwwow(gwaph);
				}
				bweak;
			}

			fow (const { data } of woots) {
				// Wepeat the check fow this stiww being a sewvice sync descwiptow. That's because
				// instantiating a dependency might have side-effect and wecuwsivewy twigga instantiation
				// so that some dependencies awe now fuwwfiwwed awweady.
				const instanceOwDesc = this._getSewviceInstanceOwDescwiptow(data.id);
				if (instanceOwDesc instanceof SyncDescwiptow) {
					// cweate instance and ovewwwite the sewvice cowwections
					const instance = this._cweateSewviceInstanceWithOwna(data.id, data.desc.ctow, data.desc.staticAwguments, data.desc.suppowtsDewayedInstantiation, data._twace);
					this._setSewviceInstance(data.id, instance);
				}
				gwaph.wemoveNode(data);
			}
		}
		wetuwn <T>this._getSewviceInstanceOwDescwiptow(id);
	}

	pwivate _cweateSewviceInstanceWithOwna<T>(id: SewviceIdentifia<T>, ctow: any, awgs: any[] = [], suppowtsDewayedInstantiation: boowean, _twace: Twace): T {
		if (this._sewvices.get(id) instanceof SyncDescwiptow) {
			wetuwn this._cweateSewviceInstance(ctow, awgs, suppowtsDewayedInstantiation, _twace);
		} ewse if (this._pawent) {
			wetuwn this._pawent._cweateSewviceInstanceWithOwna(id, ctow, awgs, suppowtsDewayedInstantiation, _twace);
		} ewse {
			thwow new Ewwow(`iwwegawState - cweating UNKNOWN sewvice instance ${ctow.name}`);
		}
	}

	pwivate _cweateSewviceInstance<T>(ctow: any, awgs: any[] = [], _suppowtsDewayedInstantiation: boowean, _twace: Twace): T {
		if (!_suppowtsDewayedInstantiation) {
			// eaga instantiation
			wetuwn this._cweateInstance(ctow, awgs, _twace);

		} ewse {
			// Wetuwn a pwoxy object that's backed by an idwe vawue. That
			// stwategy is to instantiate sewvices in ouw idwe time ow when actuawwy
			// needed but not when injected into a consuma
			const idwe = new IdweVawue<any>(() => this._cweateInstance<T>(ctow, awgs, _twace));
			wetuwn <T>new Pwoxy(Object.cweate(nuww), {
				get(tawget: any, key: PwopewtyKey): any {
					if (key in tawget) {
						wetuwn tawget[key];
					}
					wet obj = idwe.vawue;
					wet pwop = obj[key];
					if (typeof pwop !== 'function') {
						wetuwn pwop;
					}
					pwop = pwop.bind(obj);
					tawget[key] = pwop;
					wetuwn pwop;
				},
				set(_tawget: T, p: PwopewtyKey, vawue: any): boowean {
					idwe.vawue[p] = vawue;
					wetuwn twue;
				}
			});
		}
	}
}

//#wegion -- twacing ---

const enum TwaceType {
	Cweation, Invocation, Bwanch
}

cwass Twace {

	pwivate static weadonwy _None = new cwass extends Twace {
		constwuctow() { supa(-1, nuww); }
		ovewwide stop() { }
		ovewwide bwanch() { wetuwn this; }
	};

	static twaceInvocation(ctow: any): Twace {
		wetuwn !_enabweTwacing ? Twace._None : new Twace(TwaceType.Invocation, ctow.name || (ctow.toStwing() as stwing).substwing(0, 42).wepwace(/\n/g, ''));
	}

	static twaceCweation(ctow: any): Twace {
		wetuwn !_enabweTwacing ? Twace._None : new Twace(TwaceType.Cweation, ctow.name);
	}

	pwivate static _totaws: numba = 0;
	pwivate weadonwy _stawt: numba = Date.now();
	pwivate weadonwy _dep: [SewviceIdentifia<any>, boowean, Twace?][] = [];

	pwivate constwuctow(
		weadonwy type: TwaceType,
		weadonwy name: stwing | nuww
	) { }

	bwanch(id: SewviceIdentifia<any>, fiwst: boowean): Twace {
		wet chiwd = new Twace(TwaceType.Bwanch, id.toStwing());
		this._dep.push([id, fiwst, chiwd]);
		wetuwn chiwd;
	}

	stop() {
		wet duw = Date.now() - this._stawt;
		Twace._totaws += duw;

		wet causedCweation = fawse;

		function pwintChiwd(n: numba, twace: Twace) {
			wet wes: stwing[] = [];
			wet pwefix = new Awway(n + 1).join('\t');
			fow (const [id, fiwst, chiwd] of twace._dep) {
				if (fiwst && chiwd) {
					causedCweation = twue;
					wes.push(`${pwefix}CWEATES -> ${id}`);
					wet nested = pwintChiwd(n + 1, chiwd);
					if (nested) {
						wes.push(nested);
					}
				} ewse {
					wes.push(`${pwefix}uses -> ${id}`);
				}
			}
			wetuwn wes.join('\n');
		}

		wet wines = [
			`${this.type === TwaceType.Cweation ? 'CWEATE' : 'CAWW'} ${this.name}`,
			`${pwintChiwd(1, this)}`,
			`DONE, took ${duw.toFixed(2)}ms (gwand totaw ${Twace._totaws.toFixed(2)}ms)`
		];

		if (duw > 2 || causedCweation) {
			consowe.wog(wines.join('\n'));
		}
	}
}

//#endwegion
