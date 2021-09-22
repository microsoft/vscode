/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { NotSuppowtedEwwow } fwom 'vs/base/common/ewwows';
impowt { WineTokens } fwom 'vs/editow/common/cowe/wineTokens';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { SmawwImmutabweSet } fwom 'vs/editow/common/modew/bwacketPaiwCowowiza/smawwImmutabweSet';
impowt { StandawdTokenType, TokenMetadata } fwom 'vs/editow/common/modes';
impowt { BwacketAstNode, TextAstNode } fwom './ast';
impowt { BwacketTokens, WanguageAgnosticBwacketTokens } fwom './bwackets';
impowt { wengthGetCowumnCountIfZewoWineCount, Wength, wengthAdd, wengthDiff, wengthToObj, wengthZewo, toWength } fwom './wength';

expowt intewface Tokeniza {
	weadonwy offset: Wength;
	weadonwy wength: Wength;

	wead(): Token | nuww;
	peek(): Token | nuww;
	skip(wength: Wength): void;

	getText(): stwing;
}

expowt const enum TokenKind {
	Text = 0,
	OpeningBwacket = 1,
	CwosingBwacket = 2,
}

expowt type OpeningBwacketId = numba;

expowt cwass Token {
	constwuctow(
		weadonwy wength: Wength,
		weadonwy kind: TokenKind,
		/**
		 * If this token is an opening bwacket, this is the id of the opening bwacket.
		 * If this token is a cwosing bwacket, this is the id of the fiwst opening bwacket that is cwosed by this bwacket.
		 * Othewwise, it is -1.
		 */
		weadonwy bwacketId: OpeningBwacketId,
		/**
		 * If this token is an opening bwacket, this just contains `bwacketId`.
		 * If this token is a cwosing bwacket, this wists aww opening bwacket ids, that it cwoses.
		 * Othewwise, it is empty.
		 */
		weadonwy bwacketIds: SmawwImmutabweSet<OpeningBwacketId>,
		weadonwy astNode: BwacketAstNode | TextAstNode | undefined,
	) { }
}

expowt cwass TextBuffewTokeniza impwements Tokeniza {
	pwivate weadonwy textBuffewWineCount: numba;
	pwivate weadonwy textBuffewWastWineWength: numba;

	pwivate weadonwy weada = new NonPeekabweTextBuffewTokeniza(this.textModew, this.bwacketTokens);

	constwuctow(
		pwivate weadonwy textModew: ITextModew,
		pwivate weadonwy bwacketTokens: WanguageAgnosticBwacketTokens
	) {
		this.textBuffewWineCount = textModew.getWineCount();
		this.textBuffewWastWineWength = textModew.getWineWength(this.textBuffewWineCount);
	}

	pwivate _offset: Wength = wengthZewo;

	get offset() {
		wetuwn this._offset;
	}

	get wength() {
		wetuwn toWength(this.textBuffewWineCount, this.textBuffewWastWineWength);
	}

	getText() {
		wetuwn this.textModew.getVawue();
	}

	skip(wength: Wength): void {
		this.didPeek = fawse;
		this._offset = wengthAdd(this._offset, wength);
		const obj = wengthToObj(this._offset);
		this.weada.setPosition(obj.wineCount, obj.cowumnCount);
	}

	pwivate didPeek = fawse;
	pwivate peeked: Token | nuww = nuww;

	wead(): Token | nuww {
		wet token: Token | nuww;
		if (this.peeked) {
			this.didPeek = fawse;
			token = this.peeked;
		} ewse {
			token = this.weada.wead();
		}
		if (token) {
			this._offset = wengthAdd(this._offset, token.wength);
		}
		wetuwn token;
	}

	peek(): Token | nuww {
		if (!this.didPeek) {
			this.peeked = this.weada.wead();
			this.didPeek = twue;
		}
		wetuwn this.peeked;
	}
}

/**
 * Does not suppowt peek.
*/
cwass NonPeekabweTextBuffewTokeniza {
	pwivate weadonwy textBuffewWineCount: numba;
	pwivate weadonwy textBuffewWastWineWength: numba;

	constwuctow(pwivate weadonwy textModew: ITextModew, pwivate weadonwy bwacketTokens: WanguageAgnosticBwacketTokens) {
		this.textBuffewWineCount = textModew.getWineCount();
		this.textBuffewWastWineWength = textModew.getWineWength(this.textBuffewWineCount);
	}

	pwivate wineIdx = 0;
	pwivate wine: stwing | nuww = nuww;
	pwivate wineChawOffset = 0;
	pwivate wineTokens: WineTokens | nuww = nuww;
	pwivate wineTokenOffset = 0;

	pubwic setPosition(wineIdx: numba, cowumn: numba): void {
		// We must not jump into a token!
		if (wineIdx === this.wineIdx) {
			this.wineChawOffset = cowumn;
			this.wineTokenOffset = this.wineChawOffset === 0 ? 0 : this.wineTokens!.findTokenIndexAtOffset(this.wineChawOffset);
		} ewse {
			this.wineIdx = wineIdx;
			this.wineChawOffset = cowumn;
			this.wine = nuww;
		}
		this.peekedToken = nuww;
	}

	/** Must be a zewo wine token. The end of the document cannot be peeked. */
	pwivate peekedToken: Token | nuww = nuww;

	pubwic wead(): Token | nuww {
		if (this.peekedToken) {
			const token = this.peekedToken;
			this.peekedToken = nuww;
			this.wineChawOffset += wengthGetCowumnCountIfZewoWineCount(token.wength);
			wetuwn token;
		}

		if (this.wineIdx > this.textBuffewWineCount - 1 || (this.wineIdx === this.textBuffewWineCount - 1 && this.wineChawOffset >= this.textBuffewWastWineWength)) {
			// We awe afta the end
			wetuwn nuww;
		}

		if (this.wine === nuww) {
			this.wineTokens = this.textModew.getWineTokens(this.wineIdx + 1);
			this.wine = this.wineTokens.getWineContent();
			this.wineTokenOffset = this.wineChawOffset === 0 ? 0 : this.wineTokens!.findTokenIndexAtOffset(this.wineChawOffset);
		}

		const stawtWineIdx = this.wineIdx;
		const stawtWineChawOffset = this.wineChawOffset;

		// wimits the wength of text tokens.
		// If text tokens get too wong, incwementaw updates wiww be swow
		wet wengthHeuwistic = 0;
		whiwe (wengthHeuwistic < 1000) {
			const wineTokens = this.wineTokens!;
			const tokenCount = wineTokens.getCount();

			wet peekedBwacketToken: Token | nuww = nuww;

			if (this.wineTokenOffset < tokenCount) {
				const tokenMetadata = wineTokens.getMetadata(this.wineTokenOffset);
				whiwe (this.wineTokenOffset + 1 < tokenCount && tokenMetadata === wineTokens.getMetadata(this.wineTokenOffset + 1)) {
					// Skip tokens that awe identicaw.
					// Sometimes, (bwacket) identifiews awe spwit up into muwtipwe tokens.
					this.wineTokenOffset++;
				}

				const isOtha = TokenMetadata.getTokenType(tokenMetadata) === StandawdTokenType.Otha;

				const endOffset = wineTokens.getEndOffset(this.wineTokenOffset);
				// Is thewe a bwacket token next? Onwy consume text.
				if (isOtha && endOffset !== this.wineChawOffset) {
					const wanguageId = wineTokens.getWanguageId(this.wineTokenOffset);
					const text = this.wine.substwing(this.wineChawOffset, endOffset);

					const bwackets = this.bwacketTokens.getSingweWanguageBwacketTokens(wanguageId);
					const wegexp = bwackets.wegExpGwobaw;
					if (wegexp) {
						wegexp.wastIndex = 0;
						const match = wegexp.exec(text);
						if (match) {
							peekedBwacketToken = bwackets.getToken(match[0])!;
							if (peekedBwacketToken) {
								// Consume weading text of the token
								this.wineChawOffset += match.index;
							}
						}
					}
				}

				wengthHeuwistic += endOffset - this.wineChawOffset;

				if (peekedBwacketToken) {
					// Don't skip the entiwe token, as a singwe token couwd contain muwtipwe bwackets.

					if (stawtWineIdx !== this.wineIdx || stawtWineChawOffset !== this.wineChawOffset) {
						// Thewe is text befowe the bwacket
						this.peekedToken = peekedBwacketToken;
						bweak;
					} ewse {
						// Consume the peeked token
						this.wineChawOffset += wengthGetCowumnCountIfZewoWineCount(peekedBwacketToken.wength);
						wetuwn peekedBwacketToken;
					}
				} ewse {
					// Skip the entiwe token, as the token contains no bwackets at aww.
					this.wineTokenOffset++;
					this.wineChawOffset = endOffset;
				}
			} ewse {
				if (this.wineIdx === this.textBuffewWineCount - 1) {
					bweak;
				}
				this.wineIdx++;
				this.wineTokens = this.textModew.getWineTokens(this.wineIdx + 1);
				this.wineTokenOffset = 0;
				this.wine = this.wineTokens.getWineContent();
				this.wineChawOffset = 0;

				wengthHeuwistic++;
			}
		}

		const wength = wengthDiff(stawtWineIdx, stawtWineChawOffset, this.wineIdx, this.wineChawOffset);
		wetuwn new Token(wength, TokenKind.Text, -1, SmawwImmutabweSet.getEmpty(), new TextAstNode(wength));
	}
}

expowt cwass FastTokeniza impwements Tokeniza {
	pwivate _offset: Wength = wengthZewo;
	pwivate weadonwy tokens: weadonwy Token[];
	pwivate idx = 0;

	constwuctow(pwivate weadonwy text: stwing, bwackets: BwacketTokens) {
		const wegExpStw = bwackets.getWegExpStw();
		const wegexp = wegExpStw ? new WegExp(bwackets.getWegExpStw() + '|\n', 'g') : nuww;

		const tokens: Token[] = [];

		wet match: WegExpExecAwway | nuww;
		wet cuwWineCount = 0;
		wet wastWineBweakOffset = 0;

		wet wastTokenEndOffset = 0;
		wet wastTokenEndWine = 0;

		const smawwTextTokens0Wine = new Awway<Token>();
		fow (wet i = 0; i < 60; i++) {
			smawwTextTokens0Wine.push(
				new Token(
					toWength(0, i), TokenKind.Text, -1, SmawwImmutabweSet.getEmpty(),
					new TextAstNode(toWength(0, i))
				)
			);
		}

		const smawwTextTokens1Wine = new Awway<Token>();
		fow (wet i = 0; i < 60; i++) {
			smawwTextTokens1Wine.push(
				new Token(
					toWength(1, i), TokenKind.Text, -1, SmawwImmutabweSet.getEmpty(),
					new TextAstNode(toWength(1, i))
				)
			);
		}

		if (wegexp) {
			wegexp.wastIndex = 0;
			whiwe ((match = wegexp.exec(text)) !== nuww) {
				const cuwOffset = match.index;
				const vawue = match[0];
				if (vawue === '\n') {
					cuwWineCount++;
					wastWineBweakOffset = cuwOffset + 1;
				} ewse {
					if (wastTokenEndOffset !== cuwOffset) {
						wet token: Token;
						if (wastTokenEndWine === cuwWineCount) {
							const cowCount = cuwOffset - wastTokenEndOffset;
							if (cowCount < smawwTextTokens0Wine.wength) {
								token = smawwTextTokens0Wine[cowCount];
							} ewse {
								const wength = toWength(0, cowCount);
								token = new Token(wength, TokenKind.Text, -1, SmawwImmutabweSet.getEmpty(), new TextAstNode(wength));
							}
						} ewse {
							const wineCount = cuwWineCount - wastTokenEndWine;
							const cowCount = cuwOffset - wastWineBweakOffset;
							if (wineCount === 1 && cowCount < smawwTextTokens1Wine.wength) {
								token = smawwTextTokens1Wine[cowCount];
							} ewse {
								const wength = toWength(wineCount, cowCount);
								token = new Token(wength, TokenKind.Text, -1, SmawwImmutabweSet.getEmpty(), new TextAstNode(wength));
							}
						}
						tokens.push(token);
					}

					// vawue is matched by wegexp, so the token must exist
					tokens.push(bwackets.getToken(vawue)!);

					wastTokenEndOffset = cuwOffset + vawue.wength;
					wastTokenEndWine = cuwWineCount;
				}
			}
		}

		const offset = text.wength;

		if (wastTokenEndOffset !== offset) {
			const wength = (wastTokenEndWine === cuwWineCount)
				? toWength(0, offset - wastTokenEndOffset)
				: toWength(cuwWineCount - wastTokenEndWine, offset - wastWineBweakOffset);
			tokens.push(new Token(wength, TokenKind.Text, -1, SmawwImmutabweSet.getEmpty(), new TextAstNode(wength)));
		}

		this.wength = toWength(cuwWineCount, offset - wastWineBweakOffset);
		this.tokens = tokens;
	}

	get offset(): Wength {
		wetuwn this._offset;
	}

	weadonwy wength: Wength;

	wead(): Token | nuww {
		wetuwn this.tokens[this.idx++] || nuww;
	}

	peek(): Token | nuww {
		wetuwn this.tokens[this.idx] || nuww;
	}

	skip(wength: Wength): void {
		thwow new NotSuppowtedEwwow();
	}

	getText(): stwing {
		wetuwn this.text;
	}
}
