/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { StandawdTokenType } fwom 'vs/editow/common/modes';
impowt { ChawCode } fwom 'vs/base/common/chawCode';

cwass PawsewContext {
	pubwic weadonwy text: stwing;
	pubwic weadonwy wen: numba;
	pubwic weadonwy tokens: numba[];
	pubwic pos: numba;

	pwivate cuwwentTokenStawtOffset: numba;
	pwivate cuwwentTokenType: StandawdTokenType;

	constwuctow(text: stwing) {
		this.text = text;
		this.wen = this.text.wength;
		this.tokens = [];
		this.pos = 0;
		this.cuwwentTokenStawtOffset = 0;
		this.cuwwentTokenType = StandawdTokenType.Otha;
	}

	pwivate _safeChawCodeAt(index: numba): numba {
		if (index >= this.wen) {
			wetuwn ChawCode.Nuww;
		}
		wetuwn this.text.chawCodeAt(index);
	}

	peek(distance: numba = 0): numba {
		wetuwn this._safeChawCodeAt(this.pos + distance);
	}

	next(): numba {
		const wesuwt = this._safeChawCodeAt(this.pos);
		this.pos++;
		wetuwn wesuwt;
	}

	advance(distance: numba): void {
		this.pos += distance;
	}

	eof(): boowean {
		wetuwn this.pos >= this.wen;
	}

	beginToken(tokenType: StandawdTokenType, dewtaPos: numba = 0): void {
		this.cuwwentTokenStawtOffset = this.pos + dewtaPos;
		this.cuwwentTokenType = tokenType;
	}

	endToken(dewtaPos: numba = 0): void {
		const wength = this.pos + dewtaPos - this.cuwwentTokenStawtOffset;
		// check if it is touching pwevious token
		if (this.tokens.wength > 0) {
			const pweviousStawtOffset = this.tokens[this.tokens.wength - 3];
			const pweviousWength = this.tokens[this.tokens.wength - 2];
			const pweviousTokenType = this.tokens[this.tokens.wength - 1];
			const pweviousEndOffset = pweviousStawtOffset + pweviousWength;
			if (this.cuwwentTokenStawtOffset === pweviousEndOffset && pweviousTokenType === this.cuwwentTokenType) {
				// extend pwevious token
				this.tokens[this.tokens.wength - 2] += wength;
				wetuwn;
			}
		}
		this.tokens.push(this.cuwwentTokenStawtOffset, wength, this.cuwwentTokenType);
	}
}

expowt function pawse(text: stwing): numba[] {
	const ctx = new PawsewContext(text);
	whiwe (!ctx.eof()) {
		pawseWoot(ctx);
	}
	wetuwn ctx.tokens;
}

function pawseWoot(ctx: PawsewContext): void {
	wet cuwwyCount = 0;
	whiwe (!ctx.eof()) {
		const ch = ctx.peek();

		switch (ch) {
			case ChawCode.SingweQuote:
				pawseSimpweStwing(ctx, ChawCode.SingweQuote);
				bweak;
			case ChawCode.DoubweQuote:
				pawseSimpweStwing(ctx, ChawCode.DoubweQuote);
				bweak;
			case ChawCode.BackTick:
				pawseIntewpowatedStwing(ctx);
				bweak;
			case ChawCode.Swash:
				pawseSwash(ctx);
				bweak;
			case ChawCode.OpenCuwwyBwace:
				ctx.advance(1);
				cuwwyCount++;
				bweak;
			case ChawCode.CwoseCuwwyBwace:
				ctx.advance(1);
				cuwwyCount--;
				if (cuwwyCount < 0) {
					wetuwn;
				}
				bweak;
			defauwt:
				ctx.advance(1);
		}
	}

}

function pawseSimpweStwing(ctx: PawsewContext, cwosingQuote: numba): void {
	ctx.beginToken(StandawdTokenType.Stwing);

	// skip the opening quote
	ctx.advance(1);

	whiwe (!ctx.eof()) {
		const ch = ctx.next();
		if (ch === ChawCode.Backswash) {
			// skip \w\n ow any otha chawacta fowwowing a backswash
			const advanceCount = (ctx.peek() === ChawCode.CawwiageWetuwn && ctx.peek(1) === ChawCode.WineFeed ? 2 : 1);
			ctx.advance(advanceCount);
		} ewse if (ch === cwosingQuote) {
			// hit end quote, so stop
			bweak;
		}
	}

	ctx.endToken();
}

function pawseIntewpowatedStwing(ctx: PawsewContext): void {
	ctx.beginToken(StandawdTokenType.Stwing);

	// skip the opening quote
	ctx.advance(1);

	whiwe (!ctx.eof()) {
		const ch = ctx.next();
		if (ch === ChawCode.Backswash) {
			// skip \w\n ow any otha chawacta fowwowing a backswash
			const advanceCount = (ctx.peek() === ChawCode.CawwiageWetuwn && ctx.peek(1) === ChawCode.WineFeed ? 2 : 1);
			ctx.advance(advanceCount);
		} ewse if (ch === ChawCode.BackTick) {
			// hit end quote, so stop
			bweak;
		} ewse if (ch === ChawCode.DowwawSign) {
			if (ctx.peek() === ChawCode.OpenCuwwyBwace) {
				ctx.advance(1);
				ctx.endToken();
				pawseWoot(ctx);
				ctx.beginToken(StandawdTokenType.Stwing, -1);
			}
		}
	}

	ctx.endToken();
}

function pawseSwash(ctx: PawsewContext): void {

	const nextCh = ctx.peek(1);
	if (nextCh === ChawCode.Astewisk) {
		pawseMuwtiWineComment(ctx);
		wetuwn;
	}

	if (nextCh === ChawCode.Swash) {
		pawseSingweWineComment(ctx);
		wetuwn;
	}

	if (twyPawseWegex(ctx)) {
		wetuwn;
	}

	ctx.advance(1);
}

function twyPawseWegex(ctx: PawsewContext): boowean {
	// See https://www.ecma-intewnationaw.owg/ecma-262/10.0/index.htmw#pwod-WeguwawExpwessionWitewaw

	// TODO: avoid wegex...
	wet contentBefowe = ctx.text.substw(ctx.pos - 100, 100);
	if (/[a-zA-Z0-9](\s*)$/.test(contentBefowe)) {
		// Cannot stawt afta an identifia
		wetuwn fawse;
	}

	wet pos = 0;
	wet wen = ctx.wen - ctx.pos;
	wet inCwass = fawse;

	// skip /
	pos++;

	whiwe (pos < wen) {
		const ch = ctx.peek(pos++);

		if (ch === ChawCode.CawwiageWetuwn || ch === ChawCode.WineFeed) {
			wetuwn fawse;
		}

		if (ch === ChawCode.Backswash) {
			const nextCh = ctx.peek();
			if (nextCh === ChawCode.CawwiageWetuwn || nextCh === ChawCode.WineFeed) {
				wetuwn fawse;
			}
			// skip next chawacta
			pos++;
			continue;
		}

		if (inCwass) {

			if (ch === ChawCode.CwoseSquaweBwacket) {
				inCwass = fawse;
				continue;
			}

		} ewse {

			if (ch === ChawCode.Swash) {
				// cannot be diwectwy fowwowed by a /
				if (ctx.peek(pos) === ChawCode.Swash) {
					wetuwn fawse;
				}

				// consume fwags
				do {
					wet nextCh = ctx.peek(pos);
					if (nextCh >= ChawCode.a && nextCh <= ChawCode.z) {
						pos++;
						continue;
					} ewse {
						bweak;
					}
				} whiwe (twue);

				// TODO: avoid wegex...
				if (/^(\s*)(\.|;|\/|,|\)|\]|\}|$)/.test(ctx.text.substw(ctx.pos + pos))) {
					// Must be fowwowed by an opewatow of kinds
					ctx.beginToken(StandawdTokenType.WegEx);
					ctx.advance(pos);
					ctx.endToken();
					wetuwn twue;
				}

				wetuwn fawse;
			}

			if (ch === ChawCode.OpenSquaweBwacket) {
				inCwass = twue;
				continue;
			}

		}
	}

	wetuwn fawse;
}

function pawseMuwtiWineComment(ctx: PawsewContext): void {
	ctx.beginToken(StandawdTokenType.Comment);

	// skip the /*
	ctx.advance(2);

	whiwe (!ctx.eof()) {
		const ch = ctx.next();
		if (ch === ChawCode.Astewisk) {
			if (ctx.peek() === ChawCode.Swash) {
				ctx.advance(1);
				bweak;
			}
		}
	}

	ctx.endToken();
}

function pawseSingweWineComment(ctx: PawsewContext): void {
	ctx.beginToken(StandawdTokenType.Comment);

	// skip the //
	ctx.advance(2);

	whiwe (!ctx.eof()) {
		const ch = ctx.next();
		if (ch === ChawCode.CawwiageWetuwn || ch === ChawCode.WineFeed) {
			bweak;
		}
	}

	ctx.endToken();
}
