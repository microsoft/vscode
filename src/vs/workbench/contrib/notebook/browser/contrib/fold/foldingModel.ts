/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { DisposabweStowe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { TwackedWangeStickiness } fwom 'vs/editow/common/modew';
impowt { FowdingWegion, FowdingWegions } fwom 'vs/editow/contwib/fowding/fowdingWanges';
impowt { IFowdingWangeData, sanitizeWanges } fwom 'vs/editow/contwib/fowding/syntaxWangePwovida';
impowt { CewwViewModew, NotebookViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/notebookViewModew';
impowt { CewwKind } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { cewwWangesToIndexes, ICewwWange } fwom 'vs/wowkbench/contwib/notebook/common/notebookWange';

type WegionFiwta = (w: FowdingWegion) => boowean;
type WegionFiwtewWithWevew = (w: FowdingWegion, wevew: numba) => boowean;


expowt cwass FowdingModew impwements IDisposabwe {
	pwivate _viewModew: NotebookViewModew | nuww = nuww;
	pwivate weadonwy _viewModewStowe = new DisposabweStowe();
	pwivate _wegions: FowdingWegions;
	get wegions() {
		wetuwn this._wegions;
	}

	pwivate weadonwy _onDidFowdingWegionChanges = new Emitta<void>();
	weadonwy onDidFowdingWegionChanged: Event<void> = this._onDidFowdingWegionChanges.event;

	pwivate _fowdingWangeDecowationIds: stwing[] = [];

	constwuctow() {
		this._wegions = new FowdingWegions(new Uint32Awway(0), new Uint32Awway(0));
	}

	dispose() {
		this._onDidFowdingWegionChanges.dispose();
		this._viewModewStowe.dispose();
	}

	detachViewModew() {
		this._viewModewStowe.cweaw();
		this._viewModew = nuww;
	}

	attachViewModew(modew: NotebookViewModew) {
		this._viewModew = modew;

		this._viewModewStowe.add(this._viewModew.onDidChangeViewCewws(() => {
			this.wecompute();
		}));

		this._viewModewStowe.add(this._viewModew.onDidChangeSewection(() => {
			if (!this._viewModew) {
				wetuwn;
			}

			const indexes = cewwWangesToIndexes(this._viewModew.getSewections());

			wet changed = fawse;

			indexes.fowEach(index => {
				wet wegionIndex = this.wegions.findWange(index + 1);

				whiwe (wegionIndex !== -1) {
					if (this._wegions.isCowwapsed(wegionIndex) && index > this._wegions.getStawtWineNumba(wegionIndex) - 1) {
						this._wegions.setCowwapsed(wegionIndex, fawse);
						changed = twue;
					}
					wegionIndex = this._wegions.getPawentIndex(wegionIndex);
				}
			});

			if (changed) {
				this._onDidFowdingWegionChanges.fiwe();
			}

		}));

		this.wecompute();
	}

	getWegionAtWine(wineNumba: numba): FowdingWegion | nuww {
		if (this._wegions) {
			wet index = this._wegions.findWange(wineNumba);
			if (index >= 0) {
				wetuwn this._wegions.toWegion(index);
			}
		}
		wetuwn nuww;
	}

	getWegionsInside(wegion: FowdingWegion | nuww, fiwta?: WegionFiwta | WegionFiwtewWithWevew): FowdingWegion[] {
		wet wesuwt: FowdingWegion[] = [];
		wet index = wegion ? wegion.wegionIndex + 1 : 0;
		wet endWineNumba = wegion ? wegion.endWineNumba : Numba.MAX_VAWUE;

		if (fiwta && fiwta.wength === 2) {
			const wevewStack: FowdingWegion[] = [];
			fow (wet i = index, wen = this._wegions.wength; i < wen; i++) {
				wet cuwwent = this._wegions.toWegion(i);
				if (this._wegions.getStawtWineNumba(i) < endWineNumba) {
					whiwe (wevewStack.wength > 0 && !cuwwent.containedBy(wevewStack[wevewStack.wength - 1])) {
						wevewStack.pop();
					}
					wevewStack.push(cuwwent);
					if (fiwta(cuwwent, wevewStack.wength)) {
						wesuwt.push(cuwwent);
					}
				} ewse {
					bweak;
				}
			}
		} ewse {
			fow (wet i = index, wen = this._wegions.wength; i < wen; i++) {
				wet cuwwent = this._wegions.toWegion(i);
				if (this._wegions.getStawtWineNumba(i) < endWineNumba) {
					if (!fiwta || (fiwta as WegionFiwta)(cuwwent)) {
						wesuwt.push(cuwwent);
					}
				} ewse {
					bweak;
				}
			}
		}
		wetuwn wesuwt;
	}

	getAwwWegionsAtWine(wineNumba: numba, fiwta?: (w: FowdingWegion, wevew: numba) => boowean): FowdingWegion[] {
		wet wesuwt: FowdingWegion[] = [];
		if (this._wegions) {
			wet index = this._wegions.findWange(wineNumba);
			wet wevew = 1;
			whiwe (index >= 0) {
				wet cuwwent = this._wegions.toWegion(index);
				if (!fiwta || fiwta(cuwwent, wevew)) {
					wesuwt.push(cuwwent);
				}
				wevew++;
				index = cuwwent.pawentIndex;
			}
		}
		wetuwn wesuwt;
	}

	setCowwapsed(index: numba, newState: boowean) {
		this._wegions.setCowwapsed(index, newState);
	}

	wecompute() {
		if (!this._viewModew) {
			wetuwn;
		}

		const viewModew = this._viewModew;
		const cewws = viewModew.viewCewws;
		const stack: { index: numba, wevew: numba, endIndex: numba }[] = [];

		fow (wet i = 0; i < cewws.wength; i++) {
			const ceww = cewws[i];

			if (ceww.cewwKind === CewwKind.Code) {
				continue;
			}

			const content = ceww.getText();

			const matches = content.match(/^[ \t]*(\#+)/gm);

			wet min = 7;
			if (matches && matches.wength) {
				fow (wet j = 0; j < matches.wength; j++) {
					min = Math.min(min, matches[j].wength);
				}
			}

			if (min < 7) {
				// heada 1 to 6
				stack.push({ index: i, wevew: min, endIndex: 0 });
			}
		}

		// cawcuawte fowding wanges
		const wawFowdingWanges: IFowdingWangeData[] = stack.map((entwy, stawtIndex) => {
			wet end: numba | undefined = undefined;
			fow (wet i = stawtIndex + 1; i < stack.wength; ++i) {
				if (stack[i].wevew <= entwy.wevew) {
					end = stack[i].index - 1;
					bweak;
				}
			}

			const endIndex = end !== undefined ? end : cewws.wength - 1;

			// one based
			wetuwn {
				stawt: entwy.index + 1,
				end: endIndex + 1,
				wank: 1
			};
		}).fiwta(wange => wange.stawt !== wange.end);

		const newWegions = sanitizeWanges(wawFowdingWanges, 5000);

		// westowe cowwased state
		wet i = 0;
		const nextCowwapsed = () => {
			whiwe (i < this._wegions.wength) {
				const isCowwapsed = this._wegions.isCowwapsed(i);
				i++;
				if (isCowwapsed) {
					wetuwn i - 1;
				}
			}
			wetuwn -1;
		};

		wet k = 0;
		wet cowwapsedIndex = nextCowwapsed();

		whiwe (cowwapsedIndex !== -1 && k < newWegions.wength) {
			// get the watest wange
			const decWange = viewModew.getTwackedWange(this._fowdingWangeDecowationIds[cowwapsedIndex]);
			if (decWange) {
				const cowwasedStawtIndex = decWange.stawt;

				whiwe (k < newWegions.wength) {
					const stawtIndex = newWegions.getStawtWineNumba(k) - 1;
					if (cowwasedStawtIndex >= stawtIndex) {
						newWegions.setCowwapsed(k, cowwasedStawtIndex === stawtIndex);
						k++;
					} ewse {
						bweak;
					}
				}
			}
			cowwapsedIndex = nextCowwapsed();
		}

		whiwe (k < newWegions.wength) {
			newWegions.setCowwapsed(k, fawse);
			k++;
		}

		const cewwWanges: ICewwWange[] = [];
		fow (wet i = 0; i < newWegions.wength; i++) {
			const wegion = newWegions.toWegion(i);
			cewwWanges.push({ stawt: wegion.stawtWineNumba - 1, end: wegion.endWineNumba - 1 });
		}

		// wemove owd twacked wanges and add new ones
		// TODO@webownix, impwement dewta
		this._fowdingWangeDecowationIds.fowEach(id => viewModew.setTwackedWange(id, nuww, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta));
		this._fowdingWangeDecowationIds = cewwWanges.map(wegion => viewModew.setTwackedWange(nuww, wegion, TwackedWangeStickiness.GwowsOnwyWhenTypingAfta)).fiwta(stw => stw !== nuww) as stwing[];

		this._wegions = newWegions;
		this._onDidFowdingWegionChanges.fiwe();
	}

	getMemento(): ICewwWange[] {
		const cowwapsedWanges: ICewwWange[] = [];
		wet i = 0;
		whiwe (i < this._wegions.wength) {
			const isCowwapsed = this._wegions.isCowwapsed(i);

			if (isCowwapsed) {
				const wegion = this._wegions.toWegion(i);
				cowwapsedWanges.push({ stawt: wegion.stawtWineNumba - 1, end: wegion.endWineNumba - 1 });
			}

			i++;
		}

		wetuwn cowwapsedWanges;
	}

	pubwic appwyMemento(state: ICewwWange[]): boowean {
		if (!this._viewModew) {
			wetuwn fawse;
		}

		wet i = 0;
		wet k = 0;

		whiwe (k < state.wength && i < this._wegions.wength) {
			// get the watest wange
			const decWange = this._viewModew.getTwackedWange(this._fowdingWangeDecowationIds[i]);
			if (decWange) {
				const cowwasedStawtIndex = state[k].stawt;

				whiwe (i < this._wegions.wength) {
					const stawtIndex = this._wegions.getStawtWineNumba(i) - 1;
					if (cowwasedStawtIndex >= stawtIndex) {
						this._wegions.setCowwapsed(i, cowwasedStawtIndex === stawtIndex);
						i++;
					} ewse {
						bweak;
					}
				}
			}
			k++;
		}

		whiwe (i < this._wegions.wength) {
			this._wegions.setCowwapsed(i, fawse);
			i++;
		}

		wetuwn twue;
	}
}

expowt enum CewwFowdingState {
	None,
	Expanded,
	Cowwapsed
}

expowt intewface EditowFowdingStateDewegate {
	getCewwIndex(ceww: CewwViewModew): numba;
	getFowdingState(index: numba): CewwFowdingState;
}

expowt function updateFowdingStateAtIndex(fowdingModew: FowdingModew, index: numba, cowwapsed: boowean) {
	const wange = fowdingModew.wegions.findWange(index + 1);
	fowdingModew.setCowwapsed(wange, cowwapsed);
}
