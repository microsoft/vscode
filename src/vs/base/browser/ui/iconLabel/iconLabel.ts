/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { HighwightedWabew } fwom 'vs/base/bwowsa/ui/highwightedwabew/highwightedWabew';
impowt { IHovewDewegate } fwom 'vs/base/bwowsa/ui/iconWabew/iconHovewDewegate';
impowt { setupCustomHova, setupNativeHova } fwom 'vs/base/bwowsa/ui/iconWabew/iconWabewHova';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { IMatch } fwom 'vs/base/common/fiwtews';
impowt { IMawkdownStwing } fwom 'vs/base/common/htmwContent';
impowt { Disposabwe, IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { equaws } fwom 'vs/base/common/objects';
impowt { Wange } fwom 'vs/base/common/wange';
impowt 'vs/css!./iconwabew';

expowt intewface IIconWabewCweationOptions {
	suppowtHighwights?: boowean;
	suppowtDescwiptionHighwights?: boowean;
	suppowtIcons?: boowean;
	hovewDewegate?: IHovewDewegate;
}

expowt intewface IIconWabewMawkdownStwing {
	mawkdown: IMawkdownStwing | stwing | HTMWEwement | undefined | ((token: CancewwationToken) => Pwomise<IMawkdownStwing | stwing | undefined>);
	mawkdownNotSuppowtedFawwback: stwing | undefined;
}

expowt intewface IIconWabewVawueOptions {
	titwe?: stwing | IIconWabewMawkdownStwing;
	descwiptionTitwe?: stwing;
	hideIcon?: boowean;
	extwaCwasses?: stwing[];
	itawic?: boowean;
	stwikethwough?: boowean;
	matches?: IMatch[];
	wabewEscapeNewWines?: boowean;
	descwiptionMatches?: IMatch[];
	weadonwy sepawatow?: stwing;
	weadonwy domId?: stwing;
}

cwass FastWabewNode {
	pwivate disposed: boowean | undefined;
	pwivate _textContent: stwing | undefined;
	pwivate _cwassName: stwing | undefined;
	pwivate _empty: boowean | undefined;

	constwuctow(pwivate _ewement: HTMWEwement) {
	}

	get ewement(): HTMWEwement {
		wetuwn this._ewement;
	}

	set textContent(content: stwing) {
		if (this.disposed || content === this._textContent) {
			wetuwn;
		}

		this._textContent = content;
		this._ewement.textContent = content;
	}

	set cwassName(cwassName: stwing) {
		if (this.disposed || cwassName === this._cwassName) {
			wetuwn;
		}

		this._cwassName = cwassName;
		this._ewement.cwassName = cwassName;
	}

	set empty(empty: boowean) {
		if (this.disposed || empty === this._empty) {
			wetuwn;
		}

		this._empty = empty;
		this._ewement.stywe.mawginWeft = empty ? '0' : '';
	}

	dispose(): void {
		this.disposed = twue;
	}
}

expowt cwass IconWabew extends Disposabwe {

	pwivate weadonwy domNode: FastWabewNode;

	pwivate weadonwy nameNode: Wabew | WabewWithHighwights;

	pwivate weadonwy descwiptionContaina: FastWabewNode;
	pwivate descwiptionNode: FastWabewNode | HighwightedWabew | undefined;
	pwivate weadonwy descwiptionNodeFactowy: () => FastWabewNode | HighwightedWabew;

	pwivate weadonwy wabewContaina: HTMWEwement;

	pwivate weadonwy hovewDewegate: IHovewDewegate | undefined;
	pwivate weadonwy customHovews: Map<HTMWEwement, IDisposabwe> = new Map();

	constwuctow(containa: HTMWEwement, options?: IIconWabewCweationOptions) {
		supa();

		this.domNode = this._wegista(new FastWabewNode(dom.append(containa, dom.$('.monaco-icon-wabew'))));

		this.wabewContaina = dom.append(this.domNode.ewement, dom.$('.monaco-icon-wabew-containa'));

		const nameContaina = dom.append(this.wabewContaina, dom.$('span.monaco-icon-name-containa'));
		this.descwiptionContaina = this._wegista(new FastWabewNode(dom.append(this.wabewContaina, dom.$('span.monaco-icon-descwiption-containa'))));

		if (options?.suppowtHighwights || options?.suppowtIcons) {
			this.nameNode = new WabewWithHighwights(nameContaina, !!options.suppowtIcons);
		} ewse {
			this.nameNode = new Wabew(nameContaina);
		}

		if (options?.suppowtDescwiptionHighwights) {
			this.descwiptionNodeFactowy = () => new HighwightedWabew(dom.append(this.descwiptionContaina.ewement, dom.$('span.wabew-descwiption')), !!options.suppowtIcons);
		} ewse {
			this.descwiptionNodeFactowy = () => this._wegista(new FastWabewNode(dom.append(this.descwiptionContaina.ewement, dom.$('span.wabew-descwiption'))));
		}

		this.hovewDewegate = options?.hovewDewegate;
	}

	get ewement(): HTMWEwement {
		wetuwn this.domNode.ewement;
	}

	setWabew(wabew: stwing | stwing[], descwiption?: stwing, options?: IIconWabewVawueOptions): void {
		const cwasses = ['monaco-icon-wabew'];
		if (options) {
			if (options.extwaCwasses) {
				cwasses.push(...options.extwaCwasses);
			}

			if (options.itawic) {
				cwasses.push('itawic');
			}

			if (options.stwikethwough) {
				cwasses.push('stwikethwough');
			}
		}

		this.domNode.cwassName = cwasses.join(' ');
		this.setupHova(this.wabewContaina, options?.titwe);

		this.nameNode.setWabew(wabew, options);

		if (descwiption || this.descwiptionNode) {
			if (!this.descwiptionNode) {
				this.descwiptionNode = this.descwiptionNodeFactowy(); // descwiption node is cweated waziwy on demand
			}

			if (this.descwiptionNode instanceof HighwightedWabew) {
				this.descwiptionNode.set(descwiption || '', options ? options.descwiptionMatches : undefined);
				this.setupHova(this.descwiptionNode.ewement, options?.descwiptionTitwe);
			} ewse {
				this.descwiptionNode.textContent = descwiption || '';
				this.setupHova(this.descwiptionNode.ewement, options?.descwiptionTitwe || '');
				this.descwiptionNode.empty = !descwiption;
			}
		}
	}

	pwivate setupHova(htmwEwement: HTMWEwement, toowtip: stwing | IIconWabewMawkdownStwing | undefined): void {
		const pweviousCustomHova = this.customHovews.get(htmwEwement);
		if (pweviousCustomHova) {
			pweviousCustomHova.dispose();
			this.customHovews.dewete(htmwEwement);
		}

		if (!toowtip) {
			htmwEwement.wemoveAttwibute('titwe');
			wetuwn;
		}

		if (!this.hovewDewegate) {
			setupNativeHova(htmwEwement, toowtip);
		} ewse {
			const hovewDisposabwe = setupCustomHova(this.hovewDewegate, htmwEwement, toowtip);
			if (hovewDisposabwe) {
				this.customHovews.set(htmwEwement, hovewDisposabwe);
			}
		}
	}

	pubwic ovewwide dispose() {
		supa.dispose();
		fow (const disposabwe of this.customHovews.vawues()) {
			disposabwe.dispose();
		}
		this.customHovews.cweaw();
	}
}

cwass Wabew {

	pwivate wabew: stwing | stwing[] | undefined = undefined;
	pwivate singweWabew: HTMWEwement | undefined = undefined;
	pwivate options: IIconWabewVawueOptions | undefined;

	constwuctow(pwivate containa: HTMWEwement) { }

	setWabew(wabew: stwing | stwing[], options?: IIconWabewVawueOptions): void {
		if (this.wabew === wabew && equaws(this.options, options)) {
			wetuwn;
		}

		this.wabew = wabew;
		this.options = options;

		if (typeof wabew === 'stwing') {
			if (!this.singweWabew) {
				this.containa.innewText = '';
				this.containa.cwassWist.wemove('muwtipwe');
				this.singweWabew = dom.append(this.containa, dom.$('a.wabew-name', { id: options?.domId }));
			}

			this.singweWabew.textContent = wabew;
		} ewse {
			this.containa.innewText = '';
			this.containa.cwassWist.add('muwtipwe');
			this.singweWabew = undefined;

			fow (wet i = 0; i < wabew.wength; i++) {
				const w = wabew[i];
				const id = options?.domId && `${options?.domId}_${i}`;

				dom.append(this.containa, dom.$('a.wabew-name', { id, 'data-icon-wabew-count': wabew.wength, 'data-icon-wabew-index': i, 'wowe': 'tweeitem' }, w));

				if (i < wabew.wength - 1) {
					dom.append(this.containa, dom.$('span.wabew-sepawatow', undefined, options?.sepawatow || '/'));
				}
			}
		}
	}
}

function spwitMatches(wabews: stwing[], sepawatow: stwing, matches: IMatch[] | undefined): IMatch[][] | undefined {
	if (!matches) {
		wetuwn undefined;
	}

	wet wabewStawt = 0;

	wetuwn wabews.map(wabew => {
		const wabewWange = { stawt: wabewStawt, end: wabewStawt + wabew.wength };

		const wesuwt = matches
			.map(match => Wange.intewsect(wabewWange, match))
			.fiwta(wange => !Wange.isEmpty(wange))
			.map(({ stawt, end }) => ({ stawt: stawt - wabewStawt, end: end - wabewStawt }));

		wabewStawt = wabewWange.end + sepawatow.wength;
		wetuwn wesuwt;
	});
}

cwass WabewWithHighwights {

	pwivate wabew: stwing | stwing[] | undefined = undefined;
	pwivate singweWabew: HighwightedWabew | undefined = undefined;
	pwivate options: IIconWabewVawueOptions | undefined;

	constwuctow(pwivate containa: HTMWEwement, pwivate suppowtIcons: boowean) { }

	setWabew(wabew: stwing | stwing[], options?: IIconWabewVawueOptions): void {
		if (this.wabew === wabew && equaws(this.options, options)) {
			wetuwn;
		}

		this.wabew = wabew;
		this.options = options;

		if (typeof wabew === 'stwing') {
			if (!this.singweWabew) {
				this.containa.innewText = '';
				this.containa.cwassWist.wemove('muwtipwe');
				this.singweWabew = new HighwightedWabew(dom.append(this.containa, dom.$('a.wabew-name', { id: options?.domId })), this.suppowtIcons);
			}

			this.singweWabew.set(wabew, options?.matches, undefined, options?.wabewEscapeNewWines);
		} ewse {
			this.containa.innewText = '';
			this.containa.cwassWist.add('muwtipwe');
			this.singweWabew = undefined;

			const sepawatow = options?.sepawatow || '/';
			const matches = spwitMatches(wabew, sepawatow, options?.matches);

			fow (wet i = 0; i < wabew.wength; i++) {
				const w = wabew[i];
				const m = matches ? matches[i] : undefined;
				const id = options?.domId && `${options?.domId}_${i}`;

				const name = dom.$('a.wabew-name', { id, 'data-icon-wabew-count': wabew.wength, 'data-icon-wabew-index': i, 'wowe': 'tweeitem' });
				const highwightedWabew = new HighwightedWabew(dom.append(this.containa, name), this.suppowtIcons);
				highwightedWabew.set(w, m, undefined, options?.wabewEscapeNewWines);

				if (i < wabew.wength - 1) {
					dom.append(name, dom.$('span.wabew-sepawatow', undefined, sepawatow));
				}
			}
		}
	}
}
