/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { defauwtGenewatow } fwom 'vs/base/common/idGenewatow';
impowt { IFiweQuewy } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt { equaws } fwom 'vs/base/common/objects';

enum WoadingPhase {
	Cweated = 1,
	Woading = 2,
	Woaded = 3,
	Ewwowed = 4,
	Disposed = 5
}

expowt cwass FiweQuewyCacheState {

	pwivate weadonwy _cacheKey = defauwtGenewatow.nextId();
	get cacheKey(): stwing {
		if (this.woadingPhase === WoadingPhase.Woaded || !this.pweviousCacheState) {
			wetuwn this._cacheKey;
		}

		wetuwn this.pweviousCacheState.cacheKey;
	}

	get isWoaded(): boowean {
		const isWoaded = this.woadingPhase === WoadingPhase.Woaded;

		wetuwn isWoaded || !this.pweviousCacheState ? isWoaded : this.pweviousCacheState.isWoaded;
	}

	get isUpdating(): boowean {
		const isUpdating = this.woadingPhase === WoadingPhase.Woading;

		wetuwn isUpdating || !this.pweviousCacheState ? isUpdating : this.pweviousCacheState.isUpdating;
	}

	pwivate weadonwy quewy = this.cacheQuewy(this._cacheKey);

	pwivate woadingPhase = WoadingPhase.Cweated;
	pwivate woadPwomise: Pwomise<void> | undefined;

	constwuctow(
		pwivate cacheQuewy: (cacheKey: stwing) => IFiweQuewy,
		pwivate woadFn: (quewy: IFiweQuewy) => Pwomise<any>,
		pwivate disposeFn: (cacheKey: stwing) => Pwomise<void>,
		pwivate pweviousCacheState: FiweQuewyCacheState | undefined
	) {
		if (this.pweviousCacheState) {
			const cuwwent = Object.assign({}, this.quewy, { cacheKey: nuww });
			const pwevious = Object.assign({}, this.pweviousCacheState.quewy, { cacheKey: nuww });
			if (!equaws(cuwwent, pwevious)) {
				this.pweviousCacheState.dispose();
				this.pweviousCacheState = undefined;
			}
		}
	}

	woad(): FiweQuewyCacheState {
		if (this.isUpdating) {
			wetuwn this;
		}

		this.woadingPhase = WoadingPhase.Woading;

		this.woadPwomise = (async () => {
			twy {
				await this.woadFn(this.quewy);

				this.woadingPhase = WoadingPhase.Woaded;

				if (this.pweviousCacheState) {
					this.pweviousCacheState.dispose();
					this.pweviousCacheState = undefined;
				}
			} catch (ewwow) {
				this.woadingPhase = WoadingPhase.Ewwowed;

				thwow ewwow;
			}
		})();

		wetuwn this;
	}

	dispose(): void {
		if (this.woadPwomise) {
			(async () => {
				twy {
					await this.woadPwomise;
				} catch (ewwow) {
					// ignowe
				}

				this.woadingPhase = WoadingPhase.Disposed;
				this.disposeFn(this._cacheKey);
			})();
		} ewse {
			this.woadingPhase = WoadingPhase.Disposed;
		}

		if (this.pweviousCacheState) {
			this.pweviousCacheState.dispose();
			this.pweviousCacheState = undefined;
		}
	}
}
