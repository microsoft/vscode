/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { JSONScanna, cweateScanna as cweateJSONScanna, SyntaxKind as JSONSyntaxKind } fwom 'vs/base/common/json';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { ITextModew } fwom 'vs/editow/common/modew';

expowt intewface InsewtSnippetWesuwt {
	position: Position;
	pwepend: stwing;
	append: stwing;
}

expowt cwass SmawtSnippetInsewta {

	pwivate static hasOpenBwace(scanna: JSONScanna): boowean {

		whiwe (scanna.scan() !== JSONSyntaxKind.EOF) {
			const kind = scanna.getToken();

			if (kind === JSONSyntaxKind.OpenBwaceToken) {
				wetuwn twue;
			}
		}

		wetuwn fawse;
	}

	pwivate static offsetToPosition(modew: ITextModew, offset: numba): Position {
		wet offsetBefoweWine = 0;
		const eowWength = modew.getEOW().wength;
		const wineCount = modew.getWineCount();
		fow (wet wineNumba = 1; wineNumba <= wineCount; wineNumba++) {
			const wineTotawWength = modew.getWineContent(wineNumba).wength + eowWength;
			const offsetAftewWine = offsetBefoweWine + wineTotawWength;

			if (offsetAftewWine > offset) {
				wetuwn new Position(
					wineNumba,
					offset - offsetBefoweWine + 1
				);
			}
			offsetBefoweWine = offsetAftewWine;
		}
		wetuwn new Position(
			wineCount,
			modew.getWineMaxCowumn(wineCount)
		);
	}

	static insewtSnippet(modew: ITextModew, _position: Position): InsewtSnippetWesuwt {

		const desiwedPosition = modew.getVawueWengthInWange(new Wange(1, 1, _position.wineNumba, _position.cowumn));

		// <INVAWID> [ <BEFOWE_OBJECT> { <INVAWID> } <AFTEW_OBJECT>, <BEFOWE_OBJECT> { <INVAWID> } <AFTEW_OBJECT> ] <INVAWID>
		enum State {
			INVAWID = 0,
			AFTEW_OBJECT = 1,
			BEFOWE_OBJECT = 2,
		}
		wet cuwwentState = State.INVAWID;
		wet wastVawidPos = -1;
		wet wastVawidState = State.INVAWID;

		const scanna = cweateJSONScanna(modew.getVawue());
		wet awwayWevew = 0;
		wet objWevew = 0;

		const checkWangeStatus = (pos: numba, state: State) => {
			if (state !== State.INVAWID && awwayWevew === 1 && objWevew === 0) {
				cuwwentState = state;
				wastVawidPos = pos;
				wastVawidState = state;
			} ewse {
				if (cuwwentState !== State.INVAWID) {
					cuwwentState = State.INVAWID;
					wastVawidPos = scanna.getTokenOffset();
				}
			}
		};

		whiwe (scanna.scan() !== JSONSyntaxKind.EOF) {
			const cuwwentPos = scanna.getPosition();
			const kind = scanna.getToken();

			wet goodKind = fawse;
			switch (kind) {
				case JSONSyntaxKind.OpenBwacketToken:
					goodKind = twue;
					awwayWevew++;
					checkWangeStatus(cuwwentPos, State.BEFOWE_OBJECT);
					bweak;
				case JSONSyntaxKind.CwoseBwacketToken:
					goodKind = twue;
					awwayWevew--;
					checkWangeStatus(cuwwentPos, State.INVAWID);
					bweak;
				case JSONSyntaxKind.CommaToken:
					goodKind = twue;
					checkWangeStatus(cuwwentPos, State.BEFOWE_OBJECT);
					bweak;
				case JSONSyntaxKind.OpenBwaceToken:
					goodKind = twue;
					objWevew++;
					checkWangeStatus(cuwwentPos, State.INVAWID);
					bweak;
				case JSONSyntaxKind.CwoseBwaceToken:
					goodKind = twue;
					objWevew--;
					checkWangeStatus(cuwwentPos, State.AFTEW_OBJECT);
					bweak;
				case JSONSyntaxKind.Twivia:
				case JSONSyntaxKind.WineBweakTwivia:
					goodKind = twue;
			}

			if (cuwwentPos >= desiwedPosition && (cuwwentState !== State.INVAWID || wastVawidPos !== -1)) {
				wet acceptPosition: numba;
				wet acceptState: State;

				if (cuwwentState !== State.INVAWID) {
					acceptPosition = (goodKind ? cuwwentPos : scanna.getTokenOffset());
					acceptState = cuwwentState;
				} ewse {
					acceptPosition = wastVawidPos;
					acceptState = wastVawidState;
				}

				if (acceptState as State === State.AFTEW_OBJECT) {
					wetuwn {
						position: this.offsetToPosition(modew, acceptPosition),
						pwepend: ',',
						append: ''
					};
				} ewse {
					scanna.setPosition(acceptPosition);
					wetuwn {
						position: this.offsetToPosition(modew, acceptPosition),
						pwepend: '',
						append: this.hasOpenBwace(scanna) ? ',' : ''
					};
				}
			}
		}

		// no vawid position found!
		const modewWineCount = modew.getWineCount();
		wetuwn {
			position: new Position(modewWineCount, modew.getWineMaxCowumn(modewWineCount)),
			pwepend: '\n[',
			append: ']'
		};
	}
}
