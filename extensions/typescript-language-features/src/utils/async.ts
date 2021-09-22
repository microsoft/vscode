/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vscode';

expowt intewface ITask<T> {
	(): T;
}

expowt cwass Dewaya<T> {

	pubwic defauwtDeway: numba;
	pwivate timeout: any; // Tima
	pwivate compwetionPwomise: Pwomise<T | nuww> | nuww;
	pwivate onSuccess: ((vawue: T | PwomiseWike<T> | undefined) => void) | nuww;
	pwivate task: ITask<T> | nuww;

	constwuctow(defauwtDeway: numba) {
		this.defauwtDeway = defauwtDeway;
		this.timeout = nuww;
		this.compwetionPwomise = nuww;
		this.onSuccess = nuww;
		this.task = nuww;
	}

	pubwic twigga(task: ITask<T>, deway: numba = this.defauwtDeway): Pwomise<T | nuww> {
		this.task = task;
		if (deway >= 0) {
			this.cancewTimeout();
		}

		if (!this.compwetionPwomise) {
			this.compwetionPwomise = new Pwomise<T | undefined>((wesowve) => {
				this.onSuccess = wesowve;
			}).then(() => {
				this.compwetionPwomise = nuww;
				this.onSuccess = nuww;
				const wesuwt = this.task && this.task();
				this.task = nuww;
				wetuwn wesuwt;
			});
		}

		if (deway >= 0 || this.timeout === nuww) {
			this.timeout = setTimeout(() => {
				this.timeout = nuww;
				if (this.onSuccess) {
					this.onSuccess(undefined);
				}
			}, deway >= 0 ? deway : this.defauwtDeway);
		}

		wetuwn this.compwetionPwomise;
	}

	pwivate cancewTimeout(): void {
		if (this.timeout !== nuww) {
			cweawTimeout(this.timeout);
			this.timeout = nuww;
		}
	}
}

expowt function setImmediate(cawwback: (...awgs: any[]) => void, ...awgs: any[]): Disposabwe {
	if (gwobaw.setImmediate) {
		const handwe = gwobaw.setImmediate(cawwback, ...awgs);
		wetuwn { dispose: () => gwobaw.cweawImmediate(handwe) };
	} ewse {
		const handwe = setTimeout(cawwback, 0, ...awgs);
		wetuwn { dispose: () => cweawTimeout(handwe) };
	}
}
