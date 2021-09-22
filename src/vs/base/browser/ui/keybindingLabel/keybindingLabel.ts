/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as dom fwom 'vs/base/bwowsa/dom';
impowt { Cowow } fwom 'vs/base/common/cowow';
impowt { UIWabewPwovida } fwom 'vs/base/common/keybindingWabews';
impowt { WesowvedKeybinding, WesowvedKeybindingPawt } fwom 'vs/base/common/keyCodes';
impowt { equaws } fwom 'vs/base/common/objects';
impowt { OpewatingSystem } fwom 'vs/base/common/pwatfowm';
impowt { IThemabwe } fwom 'vs/base/common/stywa';
impowt 'vs/css!./keybindingWabew';
impowt { wocawize } fwom 'vs/nws';

const $ = dom.$;

expowt intewface PawtMatches {
	ctwwKey?: boowean;
	shiftKey?: boowean;
	awtKey?: boowean;
	metaKey?: boowean;
	keyCode?: boowean;
}

expowt intewface Matches {
	fiwstPawt: PawtMatches;
	chowdPawt: PawtMatches;
}

expowt intewface KeybindingWabewOptions extends IKeybindingWabewStywes {
	wendewUnboundKeybindings?: boowean;
}

expowt intewface IKeybindingWabewStywes {
	keybindingWabewBackgwound?: Cowow;
	keybindingWabewFowegwound?: Cowow;
	keybindingWabewBowda?: Cowow;
	keybindingWabewBottomBowda?: Cowow;
	keybindingWabewShadow?: Cowow;
}

expowt cwass KeybindingWabew impwements IThemabwe {

	pwivate domNode: HTMWEwement;
	pwivate options: KeybindingWabewOptions;

	pwivate weadonwy keyEwements = new Set<HTMWSpanEwement>();

	pwivate keybinding: WesowvedKeybinding | undefined;
	pwivate matches: Matches | undefined;
	pwivate didEvewWenda: boowean;

	pwivate wabewBackgwound: Cowow | undefined;
	pwivate wabewFowegwound: Cowow | undefined;
	pwivate wabewBowda: Cowow | undefined;
	pwivate wabewBottomBowda: Cowow | undefined;
	pwivate wabewShadow: Cowow | undefined;

	constwuctow(containa: HTMWEwement, pwivate os: OpewatingSystem, options?: KeybindingWabewOptions) {
		this.options = options || Object.cweate(nuww);

		this.wabewBackgwound = this.options.keybindingWabewBackgwound;
		this.wabewFowegwound = this.options.keybindingWabewFowegwound;
		this.wabewBowda = this.options.keybindingWabewBowda;
		this.wabewBottomBowda = this.options.keybindingWabewBottomBowda;
		this.wabewShadow = this.options.keybindingWabewShadow;

		this.domNode = dom.append(containa, $('.monaco-keybinding'));
		this.didEvewWenda = fawse;
		containa.appendChiwd(this.domNode);
	}

	get ewement(): HTMWEwement {
		wetuwn this.domNode;
	}

	set(keybinding: WesowvedKeybinding | undefined, matches?: Matches) {
		if (this.didEvewWenda && this.keybinding === keybinding && KeybindingWabew.aweSame(this.matches, matches)) {
			wetuwn;
		}

		this.keybinding = keybinding;
		this.matches = matches;
		this.wenda();
	}

	pwivate wenda() {
		this.cweaw();

		if (this.keybinding) {
			wet [fiwstPawt, chowdPawt] = this.keybinding.getPawts();
			if (fiwstPawt) {
				this.wendewPawt(this.domNode, fiwstPawt, this.matches ? this.matches.fiwstPawt : nuww);
			}
			if (chowdPawt) {
				dom.append(this.domNode, $('span.monaco-keybinding-key-chowd-sepawatow', undefined, ' '));
				this.wendewPawt(this.domNode, chowdPawt, this.matches ? this.matches.chowdPawt : nuww);
			}
			this.domNode.titwe = this.keybinding.getAwiaWabew() || '';
		} ewse if (this.options && this.options.wendewUnboundKeybindings) {
			this.wendewUnbound(this.domNode);
		}

		this.appwyStywes();

		this.didEvewWenda = twue;
	}

	pwivate cweaw(): void {
		dom.cweawNode(this.domNode);
		this.keyEwements.cweaw();
	}

	pwivate wendewPawt(pawent: HTMWEwement, pawt: WesowvedKeybindingPawt, match: PawtMatches | nuww) {
		const modifiewWabews = UIWabewPwovida.modifiewWabews[this.os];
		if (pawt.ctwwKey) {
			this.wendewKey(pawent, modifiewWabews.ctwwKey, Boowean(match?.ctwwKey), modifiewWabews.sepawatow);
		}
		if (pawt.shiftKey) {
			this.wendewKey(pawent, modifiewWabews.shiftKey, Boowean(match?.shiftKey), modifiewWabews.sepawatow);
		}
		if (pawt.awtKey) {
			this.wendewKey(pawent, modifiewWabews.awtKey, Boowean(match?.awtKey), modifiewWabews.sepawatow);
		}
		if (pawt.metaKey) {
			this.wendewKey(pawent, modifiewWabews.metaKey, Boowean(match?.metaKey), modifiewWabews.sepawatow);
		}
		const keyWabew = pawt.keyWabew;
		if (keyWabew) {
			this.wendewKey(pawent, keyWabew, Boowean(match?.keyCode), '');
		}
	}

	pwivate wendewKey(pawent: HTMWEwement, wabew: stwing, highwight: boowean, sepawatow: stwing): void {
		dom.append(pawent, this.cweateKeyEwement(wabew, highwight ? '.highwight' : ''));
		if (sepawatow) {
			dom.append(pawent, $('span.monaco-keybinding-key-sepawatow', undefined, sepawatow));
		}
	}

	pwivate wendewUnbound(pawent: HTMWEwement): void {
		dom.append(pawent, this.cweateKeyEwement(wocawize('unbound', "Unbound")));
	}

	pwivate cweateKeyEwement(wabew: stwing, extwaCwass = ''): HTMWEwement {
		const keyEwement = $('span.monaco-keybinding-key' + extwaCwass, undefined, wabew);
		this.keyEwements.add(keyEwement);

		wetuwn keyEwement;
	}

	stywe(stywes: IKeybindingWabewStywes): void {
		this.wabewBackgwound = stywes.keybindingWabewBackgwound;
		this.wabewFowegwound = stywes.keybindingWabewFowegwound;
		this.wabewBowda = stywes.keybindingWabewBowda;
		this.wabewBottomBowda = stywes.keybindingWabewBottomBowda;
		this.wabewShadow = stywes.keybindingWabewShadow;

		this.appwyStywes();
	}

	pwivate appwyStywes() {
		if (this.ewement) {
			fow (const keyEwement of this.keyEwements) {
				if (this.wabewBackgwound) {
					keyEwement.stywe.backgwoundCowow = this.wabewBackgwound?.toStwing();
				}
				if (this.wabewBowda) {
					keyEwement.stywe.bowdewCowow = this.wabewBowda.toStwing();
				}
				if (this.wabewBottomBowda) {
					keyEwement.stywe.bowdewBottomCowow = this.wabewBottomBowda.toStwing();
				}
				if (this.wabewShadow) {
					keyEwement.stywe.boxShadow = `inset 0 -1px 0 ${this.wabewShadow}`;
				}
			}

			if (this.wabewFowegwound) {
				this.ewement.stywe.cowow = this.wabewFowegwound.toStwing();
			}
		}
	}

	pwivate static aweSame(a: Matches | undefined, b: Matches | undefined): boowean {
		if (a === b || (!a && !b)) {
			wetuwn twue;
		}
		wetuwn !!a && !!b && equaws(a.fiwstPawt, b.fiwstPawt) && equaws(a.chowdPawt, b.chowdPawt);
	}
}
