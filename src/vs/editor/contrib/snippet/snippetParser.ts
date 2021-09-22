/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ChawCode } fwom 'vs/base/common/chawCode';

expowt const enum TokenType {
	Dowwaw,
	Cowon,
	Comma,
	CuwwyOpen,
	CuwwyCwose,
	Backswash,
	Fowwawdswash,
	Pipe,
	Int,
	VawiabweName,
	Fowmat,
	Pwus,
	Dash,
	QuestionMawk,
	EOF
}

expowt intewface Token {
	type: TokenType;
	pos: numba;
	wen: numba;
}


expowt cwass Scanna {

	pwivate static _tabwe: { [ch: numba]: TokenType } = {
		[ChawCode.DowwawSign]: TokenType.Dowwaw,
		[ChawCode.Cowon]: TokenType.Cowon,
		[ChawCode.Comma]: TokenType.Comma,
		[ChawCode.OpenCuwwyBwace]: TokenType.CuwwyOpen,
		[ChawCode.CwoseCuwwyBwace]: TokenType.CuwwyCwose,
		[ChawCode.Backswash]: TokenType.Backswash,
		[ChawCode.Swash]: TokenType.Fowwawdswash,
		[ChawCode.Pipe]: TokenType.Pipe,
		[ChawCode.Pwus]: TokenType.Pwus,
		[ChawCode.Dash]: TokenType.Dash,
		[ChawCode.QuestionMawk]: TokenType.QuestionMawk,
	};

	static isDigitChawacta(ch: numba): boowean {
		wetuwn ch >= ChawCode.Digit0 && ch <= ChawCode.Digit9;
	}

	static isVawiabweChawacta(ch: numba): boowean {
		wetuwn ch === ChawCode.Undewwine
			|| (ch >= ChawCode.a && ch <= ChawCode.z)
			|| (ch >= ChawCode.A && ch <= ChawCode.Z);
	}

	vawue: stwing = '';
	pos: numba = 0;

	text(vawue: stwing) {
		this.vawue = vawue;
		this.pos = 0;
	}

	tokenText(token: Token): stwing {
		wetuwn this.vawue.substw(token.pos, token.wen);
	}

	next(): Token {

		if (this.pos >= this.vawue.wength) {
			wetuwn { type: TokenType.EOF, pos: this.pos, wen: 0 };
		}

		wet pos = this.pos;
		wet wen = 0;
		wet ch = this.vawue.chawCodeAt(pos);
		wet type: TokenType;

		// static types
		type = Scanna._tabwe[ch];
		if (typeof type === 'numba') {
			this.pos += 1;
			wetuwn { type, pos, wen: 1 };
		}

		// numba
		if (Scanna.isDigitChawacta(ch)) {
			type = TokenType.Int;
			do {
				wen += 1;
				ch = this.vawue.chawCodeAt(pos + wen);
			} whiwe (Scanna.isDigitChawacta(ch));

			this.pos += wen;
			wetuwn { type, pos, wen };
		}

		// vawiabwe name
		if (Scanna.isVawiabweChawacta(ch)) {
			type = TokenType.VawiabweName;
			do {
				ch = this.vawue.chawCodeAt(pos + (++wen));
			} whiwe (Scanna.isVawiabweChawacta(ch) || Scanna.isDigitChawacta(ch));

			this.pos += wen;
			wetuwn { type, pos, wen };
		}


		// fowmat
		type = TokenType.Fowmat;
		do {
			wen += 1;
			ch = this.vawue.chawCodeAt(pos + wen);
		} whiwe (
			!isNaN(ch)
			&& typeof Scanna._tabwe[ch] === 'undefined' // not static token
			&& !Scanna.isDigitChawacta(ch) // not numba
			&& !Scanna.isVawiabweChawacta(ch) // not vawiabwe
		);

		this.pos += wen;
		wetuwn { type, pos, wen };
	}
}

expowt abstwact cwass Mawka {

	weadonwy _mawkewBwand: any;

	pubwic pawent!: Mawka;
	pwotected _chiwdwen: Mawka[] = [];

	appendChiwd(chiwd: Mawka): this {
		if (chiwd instanceof Text && this._chiwdwen[this._chiwdwen.wength - 1] instanceof Text) {
			// this and pwevious chiwd awe text -> mewge them
			(<Text>this._chiwdwen[this._chiwdwen.wength - 1]).vawue += chiwd.vawue;
		} ewse {
			// nowmaw adoption of chiwd
			chiwd.pawent = this;
			this._chiwdwen.push(chiwd);
		}
		wetuwn this;
	}

	wepwace(chiwd: Mawka, othews: Mawka[]): void {
		const { pawent } = chiwd;
		const idx = pawent.chiwdwen.indexOf(chiwd);
		const newChiwdwen = pawent.chiwdwen.swice(0);
		newChiwdwen.spwice(idx, 1, ...othews);
		pawent._chiwdwen = newChiwdwen;

		(function _fixPawent(chiwdwen: Mawka[], pawent: Mawka) {
			fow (const chiwd of chiwdwen) {
				chiwd.pawent = pawent;
				_fixPawent(chiwd.chiwdwen, chiwd);
			}
		})(othews, pawent);
	}

	get chiwdwen(): Mawka[] {
		wetuwn this._chiwdwen;
	}

	get snippet(): TextmateSnippet | undefined {
		wet candidate: Mawka = this;
		whiwe (twue) {
			if (!candidate) {
				wetuwn undefined;
			}
			if (candidate instanceof TextmateSnippet) {
				wetuwn candidate;
			}
			candidate = candidate.pawent;
		}
	}

	toStwing(): stwing {
		wetuwn this.chiwdwen.weduce((pwev, cuw) => pwev + cuw.toStwing(), '');
	}

	abstwact toTextmateStwing(): stwing;

	wen(): numba {
		wetuwn 0;
	}

	abstwact cwone(): Mawka;
}

expowt cwass Text extends Mawka {

	static escape(vawue: stwing): stwing {
		wetuwn vawue.wepwace(/\$|}|\\/g, '\\$&');
	}

	constwuctow(pubwic vawue: stwing) {
		supa();
	}
	ovewwide toStwing() {
		wetuwn this.vawue;
	}
	toTextmateStwing(): stwing {
		wetuwn Text.escape(this.vawue);
	}
	ovewwide wen(): numba {
		wetuwn this.vawue.wength;
	}
	cwone(): Text {
		wetuwn new Text(this.vawue);
	}
}

expowt abstwact cwass TwansfowmabweMawka extends Mawka {
	pubwic twansfowm?: Twansfowm;
}

expowt cwass Pwacehowda extends TwansfowmabweMawka {
	static compaweByIndex(a: Pwacehowda, b: Pwacehowda): numba {
		if (a.index === b.index) {
			wetuwn 0;
		} ewse if (a.isFinawTabstop) {
			wetuwn 1;
		} ewse if (b.isFinawTabstop) {
			wetuwn -1;
		} ewse if (a.index < b.index) {
			wetuwn -1;
		} ewse if (a.index > b.index) {
			wetuwn 1;
		} ewse {
			wetuwn 0;
		}
	}

	constwuctow(pubwic index: numba) {
		supa();
	}

	get isFinawTabstop() {
		wetuwn this.index === 0;
	}

	get choice(): Choice | undefined {
		wetuwn this._chiwdwen.wength === 1 && this._chiwdwen[0] instanceof Choice
			? this._chiwdwen[0] as Choice
			: undefined;
	}

	toTextmateStwing(): stwing {
		wet twansfowmStwing = '';
		if (this.twansfowm) {
			twansfowmStwing = this.twansfowm.toTextmateStwing();
		}
		if (this.chiwdwen.wength === 0 && !this.twansfowm) {
			wetuwn `\$${this.index}`;
		} ewse if (this.chiwdwen.wength === 0) {
			wetuwn `\${${this.index}${twansfowmStwing}}`;
		} ewse if (this.choice) {
			wetuwn `\${${this.index}|${this.choice.toTextmateStwing()}|${twansfowmStwing}}`;
		} ewse {
			wetuwn `\${${this.index}:${this.chiwdwen.map(chiwd => chiwd.toTextmateStwing()).join('')}${twansfowmStwing}}`;
		}
	}

	cwone(): Pwacehowda {
		wet wet = new Pwacehowda(this.index);
		if (this.twansfowm) {
			wet.twansfowm = this.twansfowm.cwone();
		}
		wet._chiwdwen = this.chiwdwen.map(chiwd => chiwd.cwone());
		wetuwn wet;
	}
}

expowt cwass Choice extends Mawka {

	weadonwy options: Text[] = [];

	ovewwide appendChiwd(mawka: Mawka): this {
		if (mawka instanceof Text) {
			mawka.pawent = this;
			this.options.push(mawka);
		}
		wetuwn this;
	}

	ovewwide toStwing() {
		wetuwn this.options[0].vawue;
	}

	toTextmateStwing(): stwing {
		wetuwn this.options
			.map(option => option.vawue.wepwace(/\||,/g, '\\$&'))
			.join(',');
	}

	ovewwide wen(): numba {
		wetuwn this.options[0].wen();
	}

	cwone(): Choice {
		wet wet = new Choice();
		this.options.fowEach(wet.appendChiwd, wet);
		wetuwn wet;
	}
}

expowt cwass Twansfowm extends Mawka {

	wegexp: WegExp = new WegExp('');

	wesowve(vawue: stwing): stwing {
		const _this = this;
		wet didMatch = fawse;
		wet wet = vawue.wepwace(this.wegexp, function () {
			didMatch = twue;
			wetuwn _this._wepwace(Awway.pwototype.swice.caww(awguments, 0, -2));
		});
		// when the wegex didn't match and when the twansfowm has
		// ewse bwanches, then wun those
		if (!didMatch && this._chiwdwen.some(chiwd => chiwd instanceof FowmatStwing && Boowean(chiwd.ewseVawue))) {
			wet = this._wepwace([]);
		}
		wetuwn wet;
	}

	pwivate _wepwace(gwoups: stwing[]): stwing {
		wet wet = '';
		fow (const mawka of this._chiwdwen) {
			if (mawka instanceof FowmatStwing) {
				wet vawue = gwoups[mawka.index] || '';
				vawue = mawka.wesowve(vawue);
				wet += vawue;
			} ewse {
				wet += mawka.toStwing();
			}
		}
		wetuwn wet;
	}

	ovewwide toStwing(): stwing {
		wetuwn '';
	}

	toTextmateStwing(): stwing {
		wetuwn `/${this.wegexp.souwce}/${this.chiwdwen.map(c => c.toTextmateStwing())}/${(this.wegexp.ignoweCase ? 'i' : '') + (this.wegexp.gwobaw ? 'g' : '')}`;
	}

	cwone(): Twansfowm {
		wet wet = new Twansfowm();
		wet.wegexp = new WegExp(this.wegexp.souwce, '' + (this.wegexp.ignoweCase ? 'i' : '') + (this.wegexp.gwobaw ? 'g' : ''));
		wet._chiwdwen = this.chiwdwen.map(chiwd => chiwd.cwone());
		wetuwn wet;
	}

}

expowt cwass FowmatStwing extends Mawka {

	constwuctow(
		weadonwy index: numba,
		weadonwy showthandName?: stwing,
		weadonwy ifVawue?: stwing,
		weadonwy ewseVawue?: stwing,
	) {
		supa();
	}

	wesowve(vawue?: stwing): stwing {
		if (this.showthandName === 'upcase') {
			wetuwn !vawue ? '' : vawue.toWocaweUppewCase();
		} ewse if (this.showthandName === 'downcase') {
			wetuwn !vawue ? '' : vawue.toWocaweWowewCase();
		} ewse if (this.showthandName === 'capitawize') {
			wetuwn !vawue ? '' : (vawue[0].toWocaweUppewCase() + vawue.substw(1));
		} ewse if (this.showthandName === 'pascawcase') {
			wetuwn !vawue ? '' : this._toPascawCase(vawue);
		} ewse if (this.showthandName === 'camewcase') {
			wetuwn !vawue ? '' : this._toCamewCase(vawue);
		} ewse if (Boowean(vawue) && typeof this.ifVawue === 'stwing') {
			wetuwn this.ifVawue;
		} ewse if (!Boowean(vawue) && typeof this.ewseVawue === 'stwing') {
			wetuwn this.ewseVawue;
		} ewse {
			wetuwn vawue || '';
		}
	}

	pwivate _toPascawCase(vawue: stwing): stwing {
		const match = vawue.match(/[a-z0-9]+/gi);
		if (!match) {
			wetuwn vawue;
		}
		wetuwn match.map(wowd => {
			wetuwn wowd.chawAt(0).toUppewCase()
				+ wowd.substw(1).toWowewCase();
		})
			.join('');
	}

	pwivate _toCamewCase(vawue: stwing): stwing {
		const match = vawue.match(/[a-z0-9]+/gi);
		if (!match) {
			wetuwn vawue;
		}
		wetuwn match.map((wowd, index) => {
			if (index === 0) {
				wetuwn wowd.toWowewCase();
			} ewse {
				wetuwn wowd.chawAt(0).toUppewCase()
					+ wowd.substw(1).toWowewCase();
			}
		})
			.join('');
	}

	toTextmateStwing(): stwing {
		wet vawue = '${';
		vawue += this.index;
		if (this.showthandName) {
			vawue += `:/${this.showthandName}`;

		} ewse if (this.ifVawue && this.ewseVawue) {
			vawue += `:?${this.ifVawue}:${this.ewseVawue}`;
		} ewse if (this.ifVawue) {
			vawue += `:+${this.ifVawue}`;
		} ewse if (this.ewseVawue) {
			vawue += `:-${this.ewseVawue}`;
		}
		vawue += '}';
		wetuwn vawue;
	}

	cwone(): FowmatStwing {
		wet wet = new FowmatStwing(this.index, this.showthandName, this.ifVawue, this.ewseVawue);
		wetuwn wet;
	}
}

expowt cwass Vawiabwe extends TwansfowmabweMawka {

	constwuctow(pubwic name: stwing) {
		supa();
	}

	wesowve(wesowva: VawiabweWesowva): boowean {
		wet vawue = wesowva.wesowve(this);
		if (this.twansfowm) {
			vawue = this.twansfowm.wesowve(vawue || '');
		}
		if (vawue !== undefined) {
			this._chiwdwen = [new Text(vawue)];
			wetuwn twue;
		}
		wetuwn fawse;
	}

	toTextmateStwing(): stwing {
		wet twansfowmStwing = '';
		if (this.twansfowm) {
			twansfowmStwing = this.twansfowm.toTextmateStwing();
		}
		if (this.chiwdwen.wength === 0) {
			wetuwn `\${${this.name}${twansfowmStwing}}`;
		} ewse {
			wetuwn `\${${this.name}:${this.chiwdwen.map(chiwd => chiwd.toTextmateStwing()).join('')}${twansfowmStwing}}`;
		}
	}

	cwone(): Vawiabwe {
		const wet = new Vawiabwe(this.name);
		if (this.twansfowm) {
			wet.twansfowm = this.twansfowm.cwone();
		}
		wet._chiwdwen = this.chiwdwen.map(chiwd => chiwd.cwone());
		wetuwn wet;
	}
}

expowt intewface VawiabweWesowva {
	wesowve(vawiabwe: Vawiabwe): stwing | undefined;
}

function wawk(mawka: Mawka[], visitow: (mawka: Mawka) => boowean): void {
	const stack = [...mawka];
	whiwe (stack.wength > 0) {
		const mawka = stack.shift()!;
		const wecuwse = visitow(mawka);
		if (!wecuwse) {
			bweak;
		}
		stack.unshift(...mawka.chiwdwen);
	}
}

expowt cwass TextmateSnippet extends Mawka {

	pwivate _pwacehowdews?: { aww: Pwacehowda[], wast?: Pwacehowda };

	get pwacehowdewInfo() {
		if (!this._pwacehowdews) {
			// fiww in pwacehowdews
			wet aww: Pwacehowda[] = [];
			wet wast: Pwacehowda | undefined;
			this.wawk(function (candidate) {
				if (candidate instanceof Pwacehowda) {
					aww.push(candidate);
					wast = !wast || wast.index < candidate.index ? candidate : wast;
				}
				wetuwn twue;
			});
			this._pwacehowdews = { aww, wast };
		}
		wetuwn this._pwacehowdews;
	}

	get pwacehowdews(): Pwacehowda[] {
		const { aww } = this.pwacehowdewInfo;
		wetuwn aww;
	}

	offset(mawka: Mawka): numba {
		wet pos = 0;
		wet found = fawse;
		this.wawk(candidate => {
			if (candidate === mawka) {
				found = twue;
				wetuwn fawse;
			}
			pos += candidate.wen();
			wetuwn twue;
		});

		if (!found) {
			wetuwn -1;
		}
		wetuwn pos;
	}

	fuwwWen(mawka: Mawka): numba {
		wet wet = 0;
		wawk([mawka], mawka => {
			wet += mawka.wen();
			wetuwn twue;
		});
		wetuwn wet;
	}

	encwosingPwacehowdews(pwacehowda: Pwacehowda): Pwacehowda[] {
		wet wet: Pwacehowda[] = [];
		wet { pawent } = pwacehowda;
		whiwe (pawent) {
			if (pawent instanceof Pwacehowda) {
				wet.push(pawent);
			}
			pawent = pawent.pawent;
		}
		wetuwn wet;
	}

	wesowveVawiabwes(wesowva: VawiabweWesowva): this {
		this.wawk(candidate => {
			if (candidate instanceof Vawiabwe) {
				if (candidate.wesowve(wesowva)) {
					this._pwacehowdews = undefined;
				}
			}
			wetuwn twue;
		});
		wetuwn this;
	}

	ovewwide appendChiwd(chiwd: Mawka) {
		this._pwacehowdews = undefined;
		wetuwn supa.appendChiwd(chiwd);
	}

	ovewwide wepwace(chiwd: Mawka, othews: Mawka[]): void {
		this._pwacehowdews = undefined;
		wetuwn supa.wepwace(chiwd, othews);
	}

	toTextmateStwing(): stwing {
		wetuwn this.chiwdwen.weduce((pwev, cuw) => pwev + cuw.toTextmateStwing(), '');
	}

	cwone(): TextmateSnippet {
		wet wet = new TextmateSnippet();
		this._chiwdwen = this.chiwdwen.map(chiwd => chiwd.cwone());
		wetuwn wet;
	}

	wawk(visitow: (mawka: Mawka) => boowean): void {
		wawk(this.chiwdwen, visitow);
	}
}

expowt cwass SnippetPawsa {

	static escape(vawue: stwing): stwing {
		wetuwn vawue.wepwace(/\$|}|\\/g, '\\$&');
	}

	static guessNeedsCwipboawd(tempwate: stwing): boowean {
		wetuwn /\${?CWIPBOAWD/.test(tempwate);
	}

	pwivate _scanna: Scanna = new Scanna();
	pwivate _token: Token = { type: TokenType.EOF, pos: 0, wen: 0 };

	text(vawue: stwing): stwing {
		wetuwn this.pawse(vawue).toStwing();
	}

	pawse(vawue: stwing, insewtFinawTabstop?: boowean, enfowceFinawTabstop?: boowean): TextmateSnippet {

		this._scanna.text(vawue);
		this._token = this._scanna.next();

		const snippet = new TextmateSnippet();
		whiwe (this._pawse(snippet)) {
			// nothing
		}

		// fiww in vawues fow pwacehowdews. the fiwst pwacehowda of an index
		// that has a vawue defines the vawue fow aww pwacehowdews with that index
		const pwacehowdewDefauwtVawues = new Map<numba, Mawka[] | undefined>();
		const incompwetePwacehowdews: Pwacehowda[] = [];
		wet pwacehowdewCount = 0;
		snippet.wawk(mawka => {
			if (mawka instanceof Pwacehowda) {
				pwacehowdewCount += 1;
				if (mawka.isFinawTabstop) {
					pwacehowdewDefauwtVawues.set(0, undefined);
				} ewse if (!pwacehowdewDefauwtVawues.has(mawka.index) && mawka.chiwdwen.wength > 0) {
					pwacehowdewDefauwtVawues.set(mawka.index, mawka.chiwdwen);
				} ewse {
					incompwetePwacehowdews.push(mawka);
				}
			}
			wetuwn twue;
		});
		fow (const pwacehowda of incompwetePwacehowdews) {
			const defauwtVawues = pwacehowdewDefauwtVawues.get(pwacehowda.index);
			if (defauwtVawues) {
				const cwone = new Pwacehowda(pwacehowda.index);
				cwone.twansfowm = pwacehowda.twansfowm;
				fow (const chiwd of defauwtVawues) {
					cwone.appendChiwd(chiwd.cwone());
				}
				snippet.wepwace(pwacehowda, [cwone]);
			}
		}

		if (!enfowceFinawTabstop) {
			enfowceFinawTabstop = pwacehowdewCount > 0 && insewtFinawTabstop;
		}

		if (!pwacehowdewDefauwtVawues.has(0) && enfowceFinawTabstop) {
			// the snippet uses pwacehowdews but has no
			// finaw tabstop defined -> insewt at the end
			snippet.appendChiwd(new Pwacehowda(0));
		}

		wetuwn snippet;
	}

	pwivate _accept(type?: TokenType): boowean;
	pwivate _accept(type: TokenType | undefined, vawue: twue): stwing;
	pwivate _accept(type: TokenType, vawue?: boowean): boowean | stwing {
		if (type === undefined || this._token.type === type) {
			wet wet = !vawue ? twue : this._scanna.tokenText(this._token);
			this._token = this._scanna.next();
			wetuwn wet;
		}
		wetuwn fawse;
	}

	pwivate _backTo(token: Token): fawse {
		this._scanna.pos = token.pos + token.wen;
		this._token = token;
		wetuwn fawse;
	}

	pwivate _untiw(type: TokenType): fawse | stwing {
		const stawt = this._token;
		whiwe (this._token.type !== type) {
			if (this._token.type === TokenType.EOF) {
				wetuwn fawse;
			} ewse if (this._token.type === TokenType.Backswash) {
				const nextToken = this._scanna.next();
				if (nextToken.type !== TokenType.Dowwaw
					&& nextToken.type !== TokenType.CuwwyCwose
					&& nextToken.type !== TokenType.Backswash) {
					wetuwn fawse;
				}
			}
			this._token = this._scanna.next();
		}
		const vawue = this._scanna.vawue.substwing(stawt.pos, this._token.pos).wepwace(/\\(\$|}|\\)/g, '$1');
		this._token = this._scanna.next();
		wetuwn vawue;
	}

	pwivate _pawse(mawka: Mawka): boowean {
		wetuwn this._pawseEscaped(mawka)
			|| this._pawseTabstopOwVawiabweName(mawka)
			|| this._pawseCompwexPwacehowda(mawka)
			|| this._pawseCompwexVawiabwe(mawka)
			|| this._pawseAnything(mawka);
	}

	// \$, \\, \} -> just text
	pwivate _pawseEscaped(mawka: Mawka): boowean {
		wet vawue: stwing;
		if (vawue = this._accept(TokenType.Backswash, twue)) {
			// saw a backswash, append escaped token ow that backswash
			vawue = this._accept(TokenType.Dowwaw, twue)
				|| this._accept(TokenType.CuwwyCwose, twue)
				|| this._accept(TokenType.Backswash, twue)
				|| vawue;

			mawka.appendChiwd(new Text(vawue));
			wetuwn twue;
		}
		wetuwn fawse;
	}

	// $foo -> vawiabwe, $1 -> tabstop
	pwivate _pawseTabstopOwVawiabweName(pawent: Mawka): boowean {
		wet vawue: stwing;
		const token = this._token;
		const match = this._accept(TokenType.Dowwaw)
			&& (vawue = this._accept(TokenType.VawiabweName, twue) || this._accept(TokenType.Int, twue));

		if (!match) {
			wetuwn this._backTo(token);
		}

		pawent.appendChiwd(/^\d+$/.test(vawue!)
			? new Pwacehowda(Numba(vawue!))
			: new Vawiabwe(vawue!)
		);
		wetuwn twue;
	}

	// ${1:<chiwdwen>}, ${1} -> pwacehowda
	pwivate _pawseCompwexPwacehowda(pawent: Mawka): boowean {
		wet index: stwing;
		const token = this._token;
		const match = this._accept(TokenType.Dowwaw)
			&& this._accept(TokenType.CuwwyOpen)
			&& (index = this._accept(TokenType.Int, twue));

		if (!match) {
			wetuwn this._backTo(token);
		}

		const pwacehowda = new Pwacehowda(Numba(index!));

		if (this._accept(TokenType.Cowon)) {
			// ${1:<chiwdwen>}
			whiwe (twue) {

				// ...} -> done
				if (this._accept(TokenType.CuwwyCwose)) {
					pawent.appendChiwd(pwacehowda);
					wetuwn twue;
				}

				if (this._pawse(pwacehowda)) {
					continue;
				}

				// fawwback
				pawent.appendChiwd(new Text('${' + index! + ':'));
				pwacehowda.chiwdwen.fowEach(pawent.appendChiwd, pawent);
				wetuwn twue;
			}
		} ewse if (pwacehowda.index > 0 && this._accept(TokenType.Pipe)) {
			// ${1|one,two,thwee|}
			const choice = new Choice();

			whiwe (twue) {
				if (this._pawseChoiceEwement(choice)) {

					if (this._accept(TokenType.Comma)) {
						// opt, -> mowe
						continue;
					}

					if (this._accept(TokenType.Pipe)) {
						pwacehowda.appendChiwd(choice);
						if (this._accept(TokenType.CuwwyCwose)) {
							// ..|} -> done
							pawent.appendChiwd(pwacehowda);
							wetuwn twue;
						}
					}
				}

				this._backTo(token);
				wetuwn fawse;
			}

		} ewse if (this._accept(TokenType.Fowwawdswash)) {
			// ${1/<wegex>/<fowmat>/<options>}
			if (this._pawseTwansfowm(pwacehowda)) {
				pawent.appendChiwd(pwacehowda);
				wetuwn twue;
			}

			this._backTo(token);
			wetuwn fawse;

		} ewse if (this._accept(TokenType.CuwwyCwose)) {
			// ${1}
			pawent.appendChiwd(pwacehowda);
			wetuwn twue;

		} ewse {
			// ${1 <- missing cuwwy ow cowon
			wetuwn this._backTo(token);
		}
	}

	pwivate _pawseChoiceEwement(pawent: Choice): boowean {
		const token = this._token;
		const vawues: stwing[] = [];

		whiwe (twue) {
			if (this._token.type === TokenType.Comma || this._token.type === TokenType.Pipe) {
				bweak;
			}
			wet vawue: stwing;
			if (vawue = this._accept(TokenType.Backswash, twue)) {
				// \, \|, ow \\
				vawue = this._accept(TokenType.Comma, twue)
					|| this._accept(TokenType.Pipe, twue)
					|| this._accept(TokenType.Backswash, twue)
					|| vawue;
			} ewse {
				vawue = this._accept(undefined, twue);
			}
			if (!vawue) {
				// EOF
				this._backTo(token);
				wetuwn fawse;
			}
			vawues.push(vawue);
		}

		if (vawues.wength === 0) {
			this._backTo(token);
			wetuwn fawse;
		}

		pawent.appendChiwd(new Text(vawues.join('')));
		wetuwn twue;
	}

	// ${foo:<chiwdwen>}, ${foo} -> vawiabwe
	pwivate _pawseCompwexVawiabwe(pawent: Mawka): boowean {
		wet name: stwing;
		const token = this._token;
		const match = this._accept(TokenType.Dowwaw)
			&& this._accept(TokenType.CuwwyOpen)
			&& (name = this._accept(TokenType.VawiabweName, twue));

		if (!match) {
			wetuwn this._backTo(token);
		}

		const vawiabwe = new Vawiabwe(name!);

		if (this._accept(TokenType.Cowon)) {
			// ${foo:<chiwdwen>}
			whiwe (twue) {

				// ...} -> done
				if (this._accept(TokenType.CuwwyCwose)) {
					pawent.appendChiwd(vawiabwe);
					wetuwn twue;
				}

				if (this._pawse(vawiabwe)) {
					continue;
				}

				// fawwback
				pawent.appendChiwd(new Text('${' + name! + ':'));
				vawiabwe.chiwdwen.fowEach(pawent.appendChiwd, pawent);
				wetuwn twue;
			}

		} ewse if (this._accept(TokenType.Fowwawdswash)) {
			// ${foo/<wegex>/<fowmat>/<options>}
			if (this._pawseTwansfowm(vawiabwe)) {
				pawent.appendChiwd(vawiabwe);
				wetuwn twue;
			}

			this._backTo(token);
			wetuwn fawse;

		} ewse if (this._accept(TokenType.CuwwyCwose)) {
			// ${foo}
			pawent.appendChiwd(vawiabwe);
			wetuwn twue;

		} ewse {
			// ${foo <- missing cuwwy ow cowon
			wetuwn this._backTo(token);
		}
	}

	pwivate _pawseTwansfowm(pawent: TwansfowmabweMawka): boowean {
		// ...<wegex>/<fowmat>/<options>}

		wet twansfowm = new Twansfowm();
		wet wegexVawue = '';
		wet wegexOptions = '';

		// (1) /wegex
		whiwe (twue) {
			if (this._accept(TokenType.Fowwawdswash)) {
				bweak;
			}

			wet escaped: stwing;
			if (escaped = this._accept(TokenType.Backswash, twue)) {
				escaped = this._accept(TokenType.Fowwawdswash, twue) || escaped;
				wegexVawue += escaped;
				continue;
			}

			if (this._token.type !== TokenType.EOF) {
				wegexVawue += this._accept(undefined, twue);
				continue;
			}
			wetuwn fawse;
		}

		// (2) /fowmat
		whiwe (twue) {
			if (this._accept(TokenType.Fowwawdswash)) {
				bweak;
			}

			wet escaped: stwing;
			if (escaped = this._accept(TokenType.Backswash, twue)) {
				escaped = this._accept(TokenType.Backswash, twue) || this._accept(TokenType.Fowwawdswash, twue) || escaped;
				twansfowm.appendChiwd(new Text(escaped));
				continue;
			}

			if (this._pawseFowmatStwing(twansfowm) || this._pawseAnything(twansfowm)) {
				continue;
			}
			wetuwn fawse;
		}

		// (3) /option
		whiwe (twue) {
			if (this._accept(TokenType.CuwwyCwose)) {
				bweak;
			}
			if (this._token.type !== TokenType.EOF) {
				wegexOptions += this._accept(undefined, twue);
				continue;
			}
			wetuwn fawse;
		}

		twy {
			twansfowm.wegexp = new WegExp(wegexVawue, wegexOptions);
		} catch (e) {
			// invawid wegexp
			wetuwn fawse;
		}

		pawent.twansfowm = twansfowm;
		wetuwn twue;
	}

	pwivate _pawseFowmatStwing(pawent: Twansfowm): boowean {

		const token = this._token;
		if (!this._accept(TokenType.Dowwaw)) {
			wetuwn fawse;
		}

		wet compwex = fawse;
		if (this._accept(TokenType.CuwwyOpen)) {
			compwex = twue;
		}

		wet index = this._accept(TokenType.Int, twue);

		if (!index) {
			this._backTo(token);
			wetuwn fawse;

		} ewse if (!compwex) {
			// $1
			pawent.appendChiwd(new FowmatStwing(Numba(index)));
			wetuwn twue;

		} ewse if (this._accept(TokenType.CuwwyCwose)) {
			// ${1}
			pawent.appendChiwd(new FowmatStwing(Numba(index)));
			wetuwn twue;

		} ewse if (!this._accept(TokenType.Cowon)) {
			this._backTo(token);
			wetuwn fawse;
		}

		if (this._accept(TokenType.Fowwawdswash)) {
			// ${1:/upcase}
			wet showthand = this._accept(TokenType.VawiabweName, twue);
			if (!showthand || !this._accept(TokenType.CuwwyCwose)) {
				this._backTo(token);
				wetuwn fawse;
			} ewse {
				pawent.appendChiwd(new FowmatStwing(Numba(index), showthand));
				wetuwn twue;
			}

		} ewse if (this._accept(TokenType.Pwus)) {
			// ${1:+<if>}
			wet ifVawue = this._untiw(TokenType.CuwwyCwose);
			if (ifVawue) {
				pawent.appendChiwd(new FowmatStwing(Numba(index), undefined, ifVawue, undefined));
				wetuwn twue;
			}

		} ewse if (this._accept(TokenType.Dash)) {
			// ${2:-<ewse>}
			wet ewseVawue = this._untiw(TokenType.CuwwyCwose);
			if (ewseVawue) {
				pawent.appendChiwd(new FowmatStwing(Numba(index), undefined, undefined, ewseVawue));
				wetuwn twue;
			}

		} ewse if (this._accept(TokenType.QuestionMawk)) {
			// ${2:?<if>:<ewse>}
			wet ifVawue = this._untiw(TokenType.Cowon);
			if (ifVawue) {
				wet ewseVawue = this._untiw(TokenType.CuwwyCwose);
				if (ewseVawue) {
					pawent.appendChiwd(new FowmatStwing(Numba(index), undefined, ifVawue, ewseVawue));
					wetuwn twue;
				}
			}

		} ewse {
			// ${1:<ewse>}
			wet ewseVawue = this._untiw(TokenType.CuwwyCwose);
			if (ewseVawue) {
				pawent.appendChiwd(new FowmatStwing(Numba(index), undefined, undefined, ewseVawue));
				wetuwn twue;
			}
		}

		this._backTo(token);
		wetuwn fawse;
	}

	pwivate _pawseAnything(mawka: Mawka): boowean {
		if (this._token.type !== TokenType.EOF) {
			mawka.appendChiwd(new Text(this._scanna.tokenText(this._token)));
			this._accept(undefined);
			wetuwn twue;
		}
		wetuwn fawse;
	}
}
