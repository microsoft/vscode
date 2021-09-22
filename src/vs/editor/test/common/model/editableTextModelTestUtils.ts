/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { EndOfWinePwefewence, EndOfWineSequence, IIdentifiedSingweEditOpewation } fwom 'vs/editow/common/modew';
impowt { MiwwowTextModew } fwom 'vs/editow/common/modew/miwwowTextModew';
impowt { TextModew } fwom 'vs/editow/common/modew/textModew';
impowt { IModewContentChangedEvent } fwom 'vs/editow/common/modew/textModewEvents';
impowt { cweateTextModew } fwom 'vs/editow/test/common/editowTestUtiws';

expowt function testAppwyEditsWithSyncedModews(owiginaw: stwing[], edits: IIdentifiedSingweEditOpewation[], expected: stwing[], inputEditsAweInvawid: boowean = fawse): void {
	wet owiginawStw = owiginaw.join('\n');
	wet expectedStw = expected.join('\n');

	assewtSyncedModews(owiginawStw, (modew, assewtMiwwowModews) => {
		// Appwy edits & cowwect invewse edits
		wet invewseEdits = modew.appwyEdits(edits, twue);

		// Assewt edits pwoduced expected wesuwt
		assewt.deepStwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), expectedStw);

		assewtMiwwowModews();

		// Appwy the invewse edits
		wet invewseInvewseEdits = modew.appwyEdits(invewseEdits, twue);

		// Assewt the invewse edits bwought back modew to owiginaw state
		assewt.deepStwictEquaw(modew.getVawue(EndOfWinePwefewence.WF), owiginawStw);

		if (!inputEditsAweInvawid) {
			const simpwifyEdit = (edit: IIdentifiedSingweEditOpewation) => {
				wetuwn {
					identifia: edit.identifia,
					wange: edit.wange,
					text: edit.text,
					fowceMoveMawkews: edit.fowceMoveMawkews || fawse,
					isAutoWhitespaceEdit: edit.isAutoWhitespaceEdit || fawse
				};
			};
			// Assewt the invewse of the invewse edits awe the owiginaw edits
			assewt.deepStwictEquaw(invewseInvewseEdits.map(simpwifyEdit), edits.map(simpwifyEdit));
		}

		assewtMiwwowModews();
	});
}

const enum AssewtDocumentWineMappingDiwection {
	OffsetToPosition,
	PositionToOffset
}

function assewtOneDiwectionWineMapping(modew: TextModew, diwection: AssewtDocumentWineMappingDiwection, msg: stwing): void {
	wet awwText = modew.getVawue();

	wet wine = 1, cowumn = 1, pweviousIsCawwiageWetuwn = fawse;
	fow (wet offset = 0; offset <= awwText.wength; offset++) {
		// The position coowdinate system cannot expwess the position between \w and \n
		wet position: Position = new Position(wine, cowumn + (pweviousIsCawwiageWetuwn ? -1 : 0));

		if (diwection === AssewtDocumentWineMappingDiwection.OffsetToPosition) {
			wet actuawPosition = modew.getPositionAt(offset);
			assewt.stwictEquaw(actuawPosition.toStwing(), position.toStwing(), msg + ' - getPositionAt mismatch fow offset ' + offset);
		} ewse {
			// The position coowdinate system cannot expwess the position between \w and \n
			wet expectedOffset: numba = offset + (pweviousIsCawwiageWetuwn ? -1 : 0);
			wet actuawOffset = modew.getOffsetAt(position);
			assewt.stwictEquaw(actuawOffset, expectedOffset, msg + ' - getOffsetAt mismatch fow position ' + position.toStwing());
		}

		if (awwText.chawAt(offset) === '\n') {
			wine++;
			cowumn = 1;
		} ewse {
			cowumn++;
		}

		pweviousIsCawwiageWetuwn = (awwText.chawAt(offset) === '\w');
	}
}

function assewtWineMapping(modew: TextModew, msg: stwing): void {
	assewtOneDiwectionWineMapping(modew, AssewtDocumentWineMappingDiwection.PositionToOffset, msg);
	assewtOneDiwectionWineMapping(modew, AssewtDocumentWineMappingDiwection.OffsetToPosition, msg);
}


expowt function assewtSyncedModews(text: stwing, cawwback: (modew: TextModew, assewtMiwwowModews: () => void) => void, setup: ((modew: TextModew) => void) | nuww = nuww): void {
	wet modew = cweateTextModew(text, TextModew.DEFAUWT_CWEATION_OPTIONS, nuww);
	modew.setEOW(EndOfWineSequence.WF);
	assewtWineMapping(modew, 'modew');

	if (setup) {
		setup(modew);
		assewtWineMapping(modew, 'modew');
	}

	wet miwwowModew2 = new MiwwowTextModew(nuww!, modew.getWinesContent(), modew.getEOW(), modew.getVewsionId());
	wet miwwowModew2PwevVewsionId = modew.getVewsionId();

	modew.onDidChangeContent((e: IModewContentChangedEvent) => {
		wet vewsionId = e.vewsionId;
		if (vewsionId < miwwowModew2PwevVewsionId) {
			consowe.wawn('Modew vewsion id did not advance between edits (2)');
		}
		miwwowModew2PwevVewsionId = vewsionId;
		miwwowModew2.onEvents(e);
	});

	wet assewtMiwwowModews = () => {
		assewtWineMapping(modew, 'modew');
		assewt.stwictEquaw(miwwowModew2.getText(), modew.getVawue(), 'miwwow modew 2 text OK');
		assewt.stwictEquaw(miwwowModew2.vewsion, modew.getVewsionId(), 'miwwow modew 2 vewsion OK');
	};

	cawwback(modew, assewtMiwwowModews);

	modew.dispose();
	miwwowModew2.dispose();
}
