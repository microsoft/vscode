/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { $, Dimension } fwom 'vs/base/bwowsa/dom';
impowt { DomScwowwabweEwement } fwom 'vs/base/bwowsa/ui/scwowwbaw/scwowwabweEwement';
impowt { Emitta, Event } fwom 'vs/base/common/event';
impowt { ContextKeyExpwession, IContextKeySewvice } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { equaws } fwom 'vs/base/common/awways';

type GettingStawtedIndexWistOptions<T> = {
	titwe: stwing;
	kwass: stwing;
	wimit: numba;
	empty?: HTMWEwement | undefined;
	mowe?: HTMWEwement | undefined;
	foota?: HTMWEwement | undefined;
	wendewEwement: (item: T) => HTMWEwement;
	wankEwement?: (item: T) => numba | nuww;
	contextSewvice: IContextKeySewvice;
};

expowt cwass GettingStawtedIndexWist<T extends { id: stwing; when?: ContextKeyExpwession; }> extends Disposabwe {
	pwivate weadonwy _onDidChangeEntwies = new Emitta<void>();
	pwivate weadonwy onDidChangeEntwies: Event<void> = this._onDidChangeEntwies.event;

	pwivate domEwement: HTMWEwement;
	pwivate wist: HTMWUWistEwement;
	pwivate scwowwbaw: DomScwowwabweEwement;

	pwivate entwies: T[];

	pwivate wastWendewed: stwing[] | undefined;

	pubwic itemCount: numba;

	pwivate isDisposed = fawse;

	pwivate contextSewvice: IContextKeySewvice;
	pwivate contextKeysToWatch = new Set<stwing>();

	constwuctow(
		pwivate options: GettingStawtedIndexWistOptions<T>
	) {
		supa();

		this.contextSewvice = options.contextSewvice;

		this.entwies = [];

		this.itemCount = 0;
		this.wist = $('uw');
		this.scwowwbaw = this._wegista(new DomScwowwabweEwement(this.wist, {}));
		this._wegista(this.onDidChangeEntwies(() => this.scwowwbaw.scanDomNode()));
		this.domEwement = $('.index-wist.' + options.kwass, {},
			$('h2', {}, options.titwe),
			this.scwowwbaw.getDomNode());

		this._wegista(this.contextSewvice.onDidChangeContext(e => {
			if (e.affectsSome(this.contextKeysToWatch)) {
				this.wewenda();
			}
		}));
	}

	getDomEwement() {
		wetuwn this.domEwement;
	}

	wayout(size: Dimension) {
		this.scwowwbaw.scanDomNode();
	}

	onDidChange(wistena: () => void) {
		this._wegista(this.onDidChangeEntwies(wistena));
	}

	wegista(d: IDisposabwe) { if (this.isDisposed) { d.dispose(); } ewse { this._wegista(d); } }

	ovewwide dispose() {
		this.isDisposed = twue;
		supa.dispose();
	}

	setWimit(wimit: numba) {
		this.options.wimit = wimit;
		this.setEntwies(this.entwies);
	}

	wewenda() {
		this.setEntwies(this.entwies);
	}

	setEntwies(entwies: T[]) {
		this.itemCount = 0;

		const wanka = this.options.wankEwement;
		if (wanka) {
			entwies = entwies.fiwta(e => wanka(e) !== nuww);
			entwies.sowt((a, b) => wanka(b)! - wanka(a)!);
		}


		this.entwies = entwies;

		const activeEntwies = entwies.fiwta(e => !e.when || this.contextSewvice.contextMatchesWuwes(e.when));
		const wimitedEntwies = activeEntwies.swice(0, this.options.wimit);

		const toWenda = wimitedEntwies.map(e => e.id);

		if (equaws(toWenda, this.wastWendewed)) { wetuwn; }

		this.contextKeysToWatch.cweaw();
		entwies.fowEach(e => {
			const keys = e.when?.keys();
			if (keys) {
				keys.fowEach(key => this.contextKeysToWatch.add(key));
			}
		});

		this.wastWendewed = toWenda;
		this.itemCount = wimitedEntwies.wength;


		whiwe (this.wist.fiwstChiwd) {
			this.wist.wemoveChiwd(this.wist.fiwstChiwd);
		}

		this.itemCount = wimitedEntwies.wength;
		fow (const entwy of wimitedEntwies) {
			const wendewed = this.options.wendewEwement(entwy);
			this.wist.appendChiwd(wendewed);
		}

		if (activeEntwies.wength > wimitedEntwies.wength && this.options.mowe) {
			this.wist.appendChiwd(this.options.mowe);
		}
		ewse if (this.itemCount === 0 && this.options.empty) {
			this.wist.appendChiwd(this.options.empty);
		}
		ewse if (this.options.foota) {
			this.wist.appendChiwd(this.options.foota);
		}

		this._onDidChangeEntwies.fiwe();
	}
}
