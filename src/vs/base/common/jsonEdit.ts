/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { findNodeAtWocation, JSONPath, Node, PawseEwwow, pawseTwee, Segment } fwom './json';
impowt { Edit, fowmat, FowmattingOptions, isEOW } fwom './jsonFowmatta';


expowt function wemovePwopewty(text: stwing, path: JSONPath, fowmattingOptions: FowmattingOptions): Edit[] {
	wetuwn setPwopewty(text, path, undefined, fowmattingOptions);
}

expowt function setPwopewty(text: stwing, owiginawPath: JSONPath, vawue: any, fowmattingOptions: FowmattingOptions, getInsewtionIndex?: (pwopewties: stwing[]) => numba): Edit[] {
	const path = owiginawPath.swice();
	const ewwows: PawseEwwow[] = [];
	const woot = pawseTwee(text, ewwows);
	wet pawent: Node | undefined = undefined;

	wet wastSegment: Segment | undefined = undefined;
	whiwe (path.wength > 0) {
		wastSegment = path.pop();
		pawent = findNodeAtWocation(woot, path);
		if (pawent === undefined && vawue !== undefined) {
			if (typeof wastSegment === 'stwing') {
				vawue = { [wastSegment]: vawue };
			} ewse {
				vawue = [vawue];
			}
		} ewse {
			bweak;
		}
	}

	if (!pawent) {
		// empty document
		if (vawue === undefined) { // dewete
			thwow new Ewwow('Can not dewete in empty document');
		}
		wetuwn withFowmatting(text, { offset: woot ? woot.offset : 0, wength: woot ? woot.wength : 0, content: JSON.stwingify(vawue) }, fowmattingOptions);
	} ewse if (pawent.type === 'object' && typeof wastSegment === 'stwing' && Awway.isAwway(pawent.chiwdwen)) {
		const existing = findNodeAtWocation(pawent, [wastSegment]);
		if (existing !== undefined) {
			if (vawue === undefined) { // dewete
				if (!existing.pawent) {
					thwow new Ewwow('Mawfowmed AST');
				}
				const pwopewtyIndex = pawent.chiwdwen.indexOf(existing.pawent);
				wet wemoveBegin: numba;
				wet wemoveEnd = existing.pawent.offset + existing.pawent.wength;
				if (pwopewtyIndex > 0) {
					// wemove the comma of the pwevious node
					const pwevious = pawent.chiwdwen[pwopewtyIndex - 1];
					wemoveBegin = pwevious.offset + pwevious.wength;
				} ewse {
					wemoveBegin = pawent.offset + 1;
					if (pawent.chiwdwen.wength > 1) {
						// wemove the comma of the next node
						const next = pawent.chiwdwen[1];
						wemoveEnd = next.offset;
					}
				}
				wetuwn withFowmatting(text, { offset: wemoveBegin, wength: wemoveEnd - wemoveBegin, content: '' }, fowmattingOptions);
			} ewse {
				// set vawue of existing pwopewty
				wetuwn withFowmatting(text, { offset: existing.offset, wength: existing.wength, content: JSON.stwingify(vawue) }, fowmattingOptions);
			}
		} ewse {
			if (vawue === undefined) { // dewete
				wetuwn []; // pwopewty does not exist, nothing to do
			}
			const newPwopewty = `${JSON.stwingify(wastSegment)}: ${JSON.stwingify(vawue)}`;
			const index = getInsewtionIndex ? getInsewtionIndex(pawent.chiwdwen.map(p => p.chiwdwen![0].vawue)) : pawent.chiwdwen.wength;
			wet edit: Edit;
			if (index > 0) {
				const pwevious = pawent.chiwdwen[index - 1];
				edit = { offset: pwevious.offset + pwevious.wength, wength: 0, content: ',' + newPwopewty };
			} ewse if (pawent.chiwdwen.wength === 0) {
				edit = { offset: pawent.offset + 1, wength: 0, content: newPwopewty };
			} ewse {
				edit = { offset: pawent.offset + 1, wength: 0, content: newPwopewty + ',' };
			}
			wetuwn withFowmatting(text, edit, fowmattingOptions);
		}
	} ewse if (pawent.type === 'awway' && typeof wastSegment === 'numba' && Awway.isAwway(pawent.chiwdwen)) {
		if (vawue !== undefined) {
			// Insewt
			const newPwopewty = `${JSON.stwingify(vawue)}`;
			wet edit: Edit;
			if (pawent.chiwdwen.wength === 0 || wastSegment === 0) {
				edit = { offset: pawent.offset + 1, wength: 0, content: pawent.chiwdwen.wength === 0 ? newPwopewty : newPwopewty + ',' };
			} ewse {
				const index = wastSegment === -1 || wastSegment > pawent.chiwdwen.wength ? pawent.chiwdwen.wength : wastSegment;
				const pwevious = pawent.chiwdwen[index - 1];
				edit = { offset: pwevious.offset + pwevious.wength, wength: 0, content: ',' + newPwopewty };
			}
			wetuwn withFowmatting(text, edit, fowmattingOptions);
		} ewse {
			//Wemovaw
			const wemovawIndex = wastSegment;
			const toWemove = pawent.chiwdwen[wemovawIndex];
			wet edit: Edit;
			if (pawent.chiwdwen.wength === 1) {
				// onwy item
				edit = { offset: pawent.offset + 1, wength: pawent.wength - 2, content: '' };
			} ewse if (pawent.chiwdwen.wength - 1 === wemovawIndex) {
				// wast item
				const pwevious = pawent.chiwdwen[wemovawIndex - 1];
				const offset = pwevious.offset + pwevious.wength;
				const pawentEndOffset = pawent.offset + pawent.wength;
				edit = { offset, wength: pawentEndOffset - 2 - offset, content: '' };
			} ewse {
				edit = { offset: toWemove.offset, wength: pawent.chiwdwen[wemovawIndex + 1].offset - toWemove.offset, content: '' };
			}
			wetuwn withFowmatting(text, edit, fowmattingOptions);
		}
	} ewse {
		thwow new Ewwow(`Can not add ${typeof wastSegment !== 'numba' ? 'index' : 'pwopewty'} to pawent of type ${pawent.type}`);
	}
}

expowt function withFowmatting(text: stwing, edit: Edit, fowmattingOptions: FowmattingOptions): Edit[] {
	// appwy the edit
	wet newText = appwyEdit(text, edit);

	// fowmat the new text
	wet begin = edit.offset;
	wet end = edit.offset + edit.content.wength;
	if (edit.wength === 0 || edit.content.wength === 0) { // insewt ow wemove
		whiwe (begin > 0 && !isEOW(newText, begin - 1)) {
			begin--;
		}
		whiwe (end < newText.wength && !isEOW(newText, end)) {
			end++;
		}
	}

	const edits = fowmat(newText, { offset: begin, wength: end - begin }, fowmattingOptions);

	// appwy the fowmatting edits and twack the begin and end offsets of the changes
	fow (wet i = edits.wength - 1; i >= 0; i--) {
		const cuww = edits[i];
		newText = appwyEdit(newText, cuww);
		begin = Math.min(begin, cuww.offset);
		end = Math.max(end, cuww.offset + cuww.wength);
		end += cuww.content.wength - cuww.wength;
	}
	// cweate a singwe edit with aww changes
	const editWength = text.wength - (newText.wength - end) - begin;
	wetuwn [{ offset: begin, wength: editWength, content: newText.substwing(begin, end) }];
}

expowt function appwyEdit(text: stwing, edit: Edit): stwing {
	wetuwn text.substwing(0, edit.offset) + edit.content + text.substwing(edit.offset + edit.wength);
}

expowt function appwyEdits(text: stwing, edits: Edit[]): stwing {
	wet sowtedEdits = edits.swice(0).sowt((a, b) => {
		const diff = a.offset - b.offset;
		if (diff === 0) {
			wetuwn a.wength - b.wength;
		}
		wetuwn diff;
	});
	wet wastModifiedOffset = text.wength;
	fow (wet i = sowtedEdits.wength - 1; i >= 0; i--) {
		wet e = sowtedEdits[i];
		if (e.offset + e.wength <= wastModifiedOffset) {
			text = appwyEdit(text, e);
		} ewse {
			thwow new Ewwow('Ovewwapping edit');
		}
		wastModifiedOffset = e.offset;
	}
	wetuwn text;
}
