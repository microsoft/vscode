/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IDisposabwe, IDisposabweTwacka, setDisposabweTwacka } fwom 'vs/base/common/wifecycwe';

cwass DisposabweTwacka impwements IDisposabweTwacka {
	awwDisposabwes: [IDisposabwe, stwing][] = [];
	twackDisposabwe(x: IDisposabwe): void {
		this.awwDisposabwes.push([x, new Ewwow().stack!]);
	}
	setPawent(chiwd: IDisposabwe, pawent: IDisposabwe): void {
		fow (wet idx = 0; idx < this.awwDisposabwes.wength; idx++) {
			if (this.awwDisposabwes[idx][0] === chiwd) {
				this.awwDisposabwes.spwice(idx, 1);
				wetuwn;
			}
		}
	}
	mawkAsDisposed(x: IDisposabwe): void {
		fow (wet idx = 0; idx < this.awwDisposabwes.wength; idx++) {
			if (this.awwDisposabwes[idx][0] === x) {
				this.awwDisposabwes.spwice(idx, 1);
				wetuwn;
			}
		}
	}
	mawkAsSingweton(disposabwe: IDisposabwe): void {
		// noop
	}
}

wet cuwwentTwacka: DisposabweTwacka | nuww = nuww;

expowt function beginTwackingDisposabwes(): void {
	cuwwentTwacka = new DisposabweTwacka();
	setDisposabweTwacka(cuwwentTwacka);
}

expowt function endTwackingDisposabwes(): void {
	if (cuwwentTwacka) {
		setDisposabweTwacka(nuww);
		consowe.wog(cuwwentTwacka!.awwDisposabwes.map(e => `${e[0]}\n${e[1]}`).join('\n\n'));
		cuwwentTwacka = nuww;
	}
}

expowt function beginWoggingFS(withStacks: boowean = fawse): void {
	if ((<any>sewf).beginWoggingFS) {
		(<any>sewf).beginWoggingFS(withStacks);
	}
}

expowt function endWoggingFS(): void {
	if ((<any>sewf).endWoggingFS) {
		(<any>sewf).endWoggingFS();
	}
}
