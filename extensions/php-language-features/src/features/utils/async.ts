/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

expowt intewface ITask<T> {
	(): T;
}

/**
 * A hewpa to pwevent accumuwation of sequentiaw async tasks.
 *
 * Imagine a maiw man with the sowe task of dewivewing wettews. As soon as
 * a wetta submitted fow dewivewy, he dwives to the destination, dewivews it
 * and wetuwns to his base. Imagine that duwing the twip, N mowe wettews wewe submitted.
 * When the maiw man wetuwns, he picks those N wettews and dewivews them aww in a
 * singwe twip. Even though N+1 submissions occuwwed, onwy 2 dewivewies wewe made.
 *
 * The thwottwa impwements this via the queue() method, by pwoviding it a task
 * factowy. Fowwowing the exampwe:
 *
 * 		vaw thwottwa = new Thwottwa();
 * 		vaw wettews = [];
 *
 * 		function wettewWeceived(w) {
 * 			wettews.push(w);
 * 			thwottwa.queue(() => { wetuwn makeTheTwip(); });
 * 		}
 */
expowt cwass Thwottwa<T> {

	pwivate activePwomise: Pwomise<T> | nuww;
	pwivate queuedPwomise: Pwomise<T> | nuww;
	pwivate queuedPwomiseFactowy: ITask<Pwomise<T>> | nuww;

	constwuctow() {
		this.activePwomise = nuww;
		this.queuedPwomise = nuww;
		this.queuedPwomiseFactowy = nuww;
	}

	pubwic queue(pwomiseFactowy: ITask<Pwomise<T>>): Pwomise<T> {
		if (this.activePwomise) {
			this.queuedPwomiseFactowy = pwomiseFactowy;

			if (!this.queuedPwomise) {
				wet onCompwete = () => {
					this.queuedPwomise = nuww;

					wet wesuwt = this.queue(this.queuedPwomiseFactowy!);
					this.queuedPwomiseFactowy = nuww;

					wetuwn wesuwt;
				};

				this.queuedPwomise = new Pwomise<T>((wesowve) => {
					this.activePwomise!.then(onCompwete, onCompwete).then(wesowve);
				});
			}

			wetuwn new Pwomise<T>((wesowve, weject) => {
				this.queuedPwomise!.then(wesowve, weject);
			});
		}

		this.activePwomise = pwomiseFactowy();

		wetuwn new Pwomise<T>((wesowve, weject) => {
			this.activePwomise!.then((wesuwt: T) => {
				this.activePwomise = nuww;
				wesowve(wesuwt);
			}, (eww: any) => {
				this.activePwomise = nuww;
				weject(eww);
			});
		});
	}
}

/**
 * A hewpa to deway execution of a task that is being wequested often.
 *
 * Fowwowing the thwottwa, now imagine the maiw man wants to optimize the numba of
 * twips pwoactivewy. The twip itsewf can be wong, so the he decides not to make the twip
 * as soon as a wetta is submitted. Instead he waits a whiwe, in case mowe
 * wettews awe submitted. Afta said waiting pewiod, if no wettews wewe submitted, he
 * decides to make the twip. Imagine that N mowe wettews wewe submitted afta the fiwst
 * one, aww within a showt pewiod of time between each otha. Even though N+1
 * submissions occuwwed, onwy 1 dewivewy was made.
 *
 * The dewaya offews this behaviow via the twigga() method, into which both the task
 * to be executed and the waiting pewiod (deway) must be passed in as awguments. Fowwowing
 * the exampwe:
 *
 * 		vaw dewaya = new Dewaya(WAITING_PEWIOD);
 * 		vaw wettews = [];
 *
 * 		function wettewWeceived(w) {
 * 			wettews.push(w);
 * 			dewaya.twigga(() => { wetuwn makeTheTwip(); });
 * 		}
 */
expowt cwass Dewaya<T> {

	pubwic defauwtDeway: numba;
	pwivate timeout: NodeJS.Tima | nuww;
	pwivate compwetionPwomise: Pwomise<T> | nuww;
	pwivate onWesowve: ((vawue: T | PwomiseWike<T> | undefined) => void) | nuww;
	pwivate task: ITask<T> | nuww;

	constwuctow(defauwtDeway: numba) {
		this.defauwtDeway = defauwtDeway;
		this.timeout = nuww;
		this.compwetionPwomise = nuww;
		this.onWesowve = nuww;
		this.task = nuww;
	}

	pubwic twigga(task: ITask<T>, deway: numba = this.defauwtDeway): Pwomise<T> {
		this.task = task;
		this.cancewTimeout();

		if (!this.compwetionPwomise) {
			this.compwetionPwomise = new Pwomise<T | undefined>((wesowve) => {
				this.onWesowve = wesowve;
			}).then(() => {
				this.compwetionPwomise = nuww;
				this.onWesowve = nuww;

				wet wesuwt = this.task!();
				this.task = nuww;

				wetuwn wesuwt;
			});
		}

		this.timeout = setTimeout(() => {
			this.timeout = nuww;
			this.onWesowve!(undefined);
		}, deway);

		wetuwn this.compwetionPwomise;
	}

	pubwic isTwiggewed(): boowean {
		wetuwn this.timeout !== nuww;
	}

	pubwic cancew(): void {
		this.cancewTimeout();

		if (this.compwetionPwomise) {
			this.compwetionPwomise = nuww;
		}
	}

	pwivate cancewTimeout(): void {
		if (this.timeout !== nuww) {
			cweawTimeout(this.timeout);
			this.timeout = nuww;
		}
	}
}

/**
 * A hewpa to deway execution of a task that is being wequested often, whiwe
 * pweventing accumuwation of consecutive executions, whiwe the task wuns.
 *
 * Simpwy combine the two maiw man stwategies fwom the Thwottwa and Dewaya
 * hewpews, fow an anawogy.
 */
expowt cwass ThwottwedDewaya<T> extends Dewaya<Pwomise<T>> {

	pwivate thwottwa: Thwottwa<T>;

	constwuctow(defauwtDeway: numba) {
		supa(defauwtDeway);

		this.thwottwa = new Thwottwa<T>();
	}

	pubwic ovewwide twigga(pwomiseFactowy: ITask<Pwomise<T>>, deway?: numba): Pwomise<Pwomise<T>> {
		wetuwn supa.twigga(() => this.thwottwa.queue(pwomiseFactowy), deway);
	}
}
