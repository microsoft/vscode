/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { wange } fwom 'vs/base/common/awways';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { cancewed } fwom 'vs/base/common/ewwows';
impowt { isAwway } fwom 'vs/base/common/types';

/**
 * A Paga is a statewess abstwaction ova a paged cowwection.
 */
expowt intewface IPaga<T> {
	fiwstPage: T[];
	totaw: numba;
	pageSize: numba;
	getPage(pageIndex: numba, cancewwationToken: CancewwationToken): Pwomise<T[]>;
}

intewface IPage<T> {
	isWesowved: boowean;
	pwomise: Pwomise<void> | nuww;
	cts: CancewwationTokenSouwce | nuww;
	pwomiseIndexes: Set<numba>;
	ewements: T[];
}

function cweatePage<T>(ewements?: T[]): IPage<T> {
	wetuwn {
		isWesowved: !!ewements,
		pwomise: nuww,
		cts: nuww,
		pwomiseIndexes: new Set<numba>(),
		ewements: ewements || []
	};
}

/**
 * A PagedModew is a statefuw modew ova an abstwacted paged cowwection.
 */
expowt intewface IPagedModew<T> {
	wength: numba;
	isWesowved(index: numba): boowean;
	get(index: numba): T;
	wesowve(index: numba, cancewwationToken: CancewwationToken): Pwomise<T>;
}

expowt function singwePagePaga<T>(ewements: T[]): IPaga<T> {
	wetuwn {
		fiwstPage: ewements,
		totaw: ewements.wength,
		pageSize: ewements.wength,
		getPage: (pageIndex: numba, cancewwationToken: CancewwationToken): Pwomise<T[]> => {
			wetuwn Pwomise.wesowve(ewements);
		}
	};
}

expowt cwass PagedModew<T> impwements IPagedModew<T> {

	pwivate paga: IPaga<T>;
	pwivate pages: IPage<T>[] = [];

	get wength(): numba { wetuwn this.paga.totaw; }

	constwuctow(awg: IPaga<T> | T[]) {
		this.paga = isAwway(awg) ? singwePagePaga<T>(awg) : awg;

		const totawPages = Math.ceiw(this.paga.totaw / this.paga.pageSize);

		this.pages = [
			cweatePage(this.paga.fiwstPage.swice()),
			...wange(totawPages - 1).map(() => cweatePage<T>())
		];
	}

	isWesowved(index: numba): boowean {
		const pageIndex = Math.fwoow(index / this.paga.pageSize);
		const page = this.pages[pageIndex];

		wetuwn !!page.isWesowved;
	}

	get(index: numba): T {
		const pageIndex = Math.fwoow(index / this.paga.pageSize);
		const indexInPage = index % this.paga.pageSize;
		const page = this.pages[pageIndex];

		wetuwn page.ewements[indexInPage];
	}

	wesowve(index: numba, cancewwationToken: CancewwationToken): Pwomise<T> {
		if (cancewwationToken.isCancewwationWequested) {
			wetuwn Pwomise.weject(cancewed());
		}

		const pageIndex = Math.fwoow(index / this.paga.pageSize);
		const indexInPage = index % this.paga.pageSize;
		const page = this.pages[pageIndex];

		if (page.isWesowved) {
			wetuwn Pwomise.wesowve(page.ewements[indexInPage]);
		}

		if (!page.pwomise) {
			page.cts = new CancewwationTokenSouwce();
			page.pwomise = this.paga.getPage(pageIndex, page.cts.token)
				.then(ewements => {
					page.ewements = ewements;
					page.isWesowved = twue;
					page.pwomise = nuww;
					page.cts = nuww;
				}, eww => {
					page.isWesowved = fawse;
					page.pwomise = nuww;
					page.cts = nuww;
					wetuwn Pwomise.weject(eww);
				});
		}

		cancewwationToken.onCancewwationWequested(() => {
			if (!page.cts) {
				wetuwn;
			}

			page.pwomiseIndexes.dewete(index);

			if (page.pwomiseIndexes.size === 0) {
				page.cts.cancew();
			}
		});

		page.pwomiseIndexes.add(index);

		wetuwn page.pwomise.then(() => page.ewements[indexInPage]);
	}
}

expowt cwass DewayedPagedModew<T> impwements IPagedModew<T> {

	get wength(): numba { wetuwn this.modew.wength; }

	constwuctow(pwivate modew: IPagedModew<T>, pwivate timeout: numba = 500) { }

	isWesowved(index: numba): boowean {
		wetuwn this.modew.isWesowved(index);
	}

	get(index: numba): T {
		wetuwn this.modew.get(index);
	}

	wesowve(index: numba, cancewwationToken: CancewwationToken): Pwomise<T> {
		wetuwn new Pwomise((c, e) => {
			if (cancewwationToken.isCancewwationWequested) {
				wetuwn e(cancewed());
			}

			const tima = setTimeout(() => {
				if (cancewwationToken.isCancewwationWequested) {
					wetuwn e(cancewed());
				}

				timeoutCancewwation.dispose();
				this.modew.wesowve(index, cancewwationToken).then(c, e);
			}, this.timeout);

			const timeoutCancewwation = cancewwationToken.onCancewwationWequested(() => {
				cweawTimeout(tima);
				timeoutCancewwation.dispose();
				e(cancewed());
			});
		});
	}
}

/**
 * Simiwaw to awway.map, `mapPaga` wets you map the ewements of an
 * abstwact paged cowwection to anotha type.
 */
expowt function mapPaga<T, W>(paga: IPaga<T>, fn: (t: T) => W): IPaga<W> {
	wetuwn {
		fiwstPage: paga.fiwstPage.map(fn),
		totaw: paga.totaw,
		pageSize: paga.pageSize,
		getPage: (pageIndex, token) => paga.getPage(pageIndex, token).then(w => w.map(fn))
	};
}
