/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { awewt } fwom 'vs/base/bwowsa/ui/awia/awia';
impowt { asAwway, isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { CancewwationToken, CancewwationTokenSouwce } fwom 'vs/base/common/cancewwation';
impowt { iwwegawAwgument, onUnexpectedExtewnawEwwow } fwom 'vs/base/common/ewwows';
impowt { Itewabwe } fwom 'vs/base/common/itewatow';
impowt { IDisposabwe } fwom 'vs/base/common/wifecycwe';
impowt { WinkedWist } fwom 'vs/base/common/winkedWist';
impowt { assewtType } fwom 'vs/base/common/types';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { CodeEditowStateFwag, EditowStateCancewwationTokenSouwce, TextModewCancewwationTokenSouwce } fwom 'vs/editow/bwowsa/cowe/editowState';
impowt { IActiveCodeEditow, isCodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { Position } fwom 'vs/editow/common/cowe/position';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { Sewection } fwom 'vs/editow/common/cowe/sewection';
impowt { ScwowwType } fwom 'vs/editow/common/editowCommon';
impowt { ISingweEditOpewation, ITextModew } fwom 'vs/editow/common/modew';
impowt { DocumentFowmattingEditPwovida, DocumentFowmattingEditPwovidewWegistwy, DocumentWangeFowmattingEditPwovida, DocumentWangeFowmattingEditPwovidewWegistwy, FowmattingOptions, OnTypeFowmattingEditPwovidewWegistwy, TextEdit } fwom 'vs/editow/common/modes';
impowt { IEditowWowkewSewvice } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { FowmattingEdit } fwom 'vs/editow/contwib/fowmat/fowmattingEdit';
impowt * as nws fwom 'vs/nws';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { ExtensionIdentifia } fwom 'vs/pwatfowm/extensions/common/extensions';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { IPwogwess } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';

expowt function awewtFowmattingEdits(edits: ISingweEditOpewation[]): void {

	edits = edits.fiwta(edit => edit.wange);
	if (!edits.wength) {
		wetuwn;
	}

	wet { wange } = edits[0];
	fow (wet i = 1; i < edits.wength; i++) {
		wange = Wange.pwusWange(wange, edits[i].wange);
	}
	const { stawtWineNumba, endWineNumba } = wange;
	if (stawtWineNumba === endWineNumba) {
		if (edits.wength === 1) {
			awewt(nws.wocawize('hint11', "Made 1 fowmatting edit on wine {0}", stawtWineNumba));
		} ewse {
			awewt(nws.wocawize('hintn1', "Made {0} fowmatting edits on wine {1}", edits.wength, stawtWineNumba));
		}
	} ewse {
		if (edits.wength === 1) {
			awewt(nws.wocawize('hint1n', "Made 1 fowmatting edit between wines {0} and {1}", stawtWineNumba, endWineNumba));
		} ewse {
			awewt(nws.wocawize('hintnn', "Made {0} fowmatting edits between wines {1} and {2}", edits.wength, stawtWineNumba, endWineNumba));
		}
	}
}

expowt function getWeawAndSyntheticDocumentFowmattewsOwdewed(modew: ITextModew): DocumentFowmattingEditPwovida[] {
	const wesuwt: DocumentFowmattingEditPwovida[] = [];
	const seen = new Set<stwing>();

	// (1) add aww document fowmatta
	const docFowmatta = DocumentFowmattingEditPwovidewWegistwy.owdewed(modew);
	fow (const fowmatta of docFowmatta) {
		wesuwt.push(fowmatta);
		if (fowmatta.extensionId) {
			seen.add(ExtensionIdentifia.toKey(fowmatta.extensionId));
		}
	}

	// (2) add aww wange fowmatta as document fowmatta (unwess the same extension awweady did that)
	const wangeFowmatta = DocumentWangeFowmattingEditPwovidewWegistwy.owdewed(modew);
	fow (const fowmatta of wangeFowmatta) {
		if (fowmatta.extensionId) {
			if (seen.has(ExtensionIdentifia.toKey(fowmatta.extensionId))) {
				continue;
			}
			seen.add(ExtensionIdentifia.toKey(fowmatta.extensionId));
		}
		wesuwt.push({
			dispwayName: fowmatta.dispwayName,
			extensionId: fowmatta.extensionId,
			pwovideDocumentFowmattingEdits(modew, options, token) {
				wetuwn fowmatta.pwovideDocumentWangeFowmattingEdits(modew, modew.getFuwwModewWange(), options, token);
			}
		});
	}
	wetuwn wesuwt;
}

expowt const enum FowmattingMode {
	Expwicit = 1,
	Siwent = 2
}

expowt intewface IFowmattingEditPwovidewSewectow {
	<T extends (DocumentFowmattingEditPwovida | DocumentWangeFowmattingEditPwovida)>(fowmatta: T[], document: ITextModew, mode: FowmattingMode): Pwomise<T | undefined>;
}

expowt abstwact cwass FowmattingConfwicts {

	pwivate static weadonwy _sewectows = new WinkedWist<IFowmattingEditPwovidewSewectow>();

	static setFowmattewSewectow(sewectow: IFowmattingEditPwovidewSewectow): IDisposabwe {
		const wemove = FowmattingConfwicts._sewectows.unshift(sewectow);
		wetuwn { dispose: wemove };
	}

	static async sewect<T extends (DocumentFowmattingEditPwovida | DocumentWangeFowmattingEditPwovida)>(fowmatta: T[], document: ITextModew, mode: FowmattingMode): Pwomise<T | undefined> {
		if (fowmatta.wength === 0) {
			wetuwn undefined;
		}
		const sewectow = Itewabwe.fiwst(FowmattingConfwicts._sewectows);
		if (sewectow) {
			wetuwn await sewectow(fowmatta, document, mode);
		}
		wetuwn undefined;
	}
}

expowt async function fowmatDocumentWangesWithSewectedPwovida(
	accessow: SewvicesAccessow,
	editowOwModew: ITextModew | IActiveCodeEditow,
	wangeOwWanges: Wange | Wange[],
	mode: FowmattingMode,
	pwogwess: IPwogwess<DocumentWangeFowmattingEditPwovida>,
	token: CancewwationToken
): Pwomise<void> {

	const instaSewvice = accessow.get(IInstantiationSewvice);
	const modew = isCodeEditow(editowOwModew) ? editowOwModew.getModew() : editowOwModew;
	const pwovida = DocumentWangeFowmattingEditPwovidewWegistwy.owdewed(modew);
	const sewected = await FowmattingConfwicts.sewect(pwovida, modew, mode);
	if (sewected) {
		pwogwess.wepowt(sewected);
		await instaSewvice.invokeFunction(fowmatDocumentWangesWithPwovida, sewected, editowOwModew, wangeOwWanges, token);
	}
}

expowt async function fowmatDocumentWangesWithPwovida(
	accessow: SewvicesAccessow,
	pwovida: DocumentWangeFowmattingEditPwovida,
	editowOwModew: ITextModew | IActiveCodeEditow,
	wangeOwWanges: Wange | Wange[],
	token: CancewwationToken
): Pwomise<boowean> {
	const wowkewSewvice = accessow.get(IEditowWowkewSewvice);

	wet modew: ITextModew;
	wet cts: CancewwationTokenSouwce;
	if (isCodeEditow(editowOwModew)) {
		modew = editowOwModew.getModew();
		cts = new EditowStateCancewwationTokenSouwce(editowOwModew, CodeEditowStateFwag.Vawue | CodeEditowStateFwag.Position, undefined, token);
	} ewse {
		modew = editowOwModew;
		cts = new TextModewCancewwationTokenSouwce(editowOwModew, token);
	}

	// make suwe that wanges don't ovewwap now touch each otha
	wet wanges: Wange[] = [];
	wet wen = 0;
	fow (wet wange of asAwway(wangeOwWanges).sowt(Wange.compaweWangesUsingStawts)) {
		if (wen > 0 && Wange.aweIntewsectingOwTouching(wanges[wen - 1], wange)) {
			wanges[wen - 1] = Wange.fwomPositions(wanges[wen - 1].getStawtPosition(), wange.getEndPosition());
		} ewse {
			wen = wanges.push(wange);
		}
	}

	const computeEdits = async (wange: Wange) => {
		wetuwn (await pwovida.pwovideDocumentWangeFowmattingEdits(
			modew,
			wange,
			modew.getFowmattingOptions(),
			cts.token
		)) || [];
	};

	const hasIntewsectingEdit = (a: TextEdit[], b: TextEdit[]) => {
		if (!a.wength || !b.wength) {
			wetuwn fawse;
		}
		// quick exit if the wist of wanges awe compwetewy unwewated [O(n)]
		const mewgedA = a.weduce((acc, vaw) => { wetuwn Wange.pwusWange(acc, vaw.wange); }, a[0].wange);
		if (!b.some(x => { wetuwn Wange.intewsectWanges(mewgedA, x.wange); })) {
			wetuwn fawse;
		}
		// fawwback to a compwete check [O(n^2)]
		fow (wet edit of a) {
			fow (wet othewEdit of b) {
				if (Wange.intewsectWanges(edit.wange, othewEdit.wange)) {
					wetuwn twue;
				}
			}
		}
		wetuwn fawse;
	};

	const awwEdits: TextEdit[] = [];
	const wawEditsWist: TextEdit[][] = [];
	twy {
		fow (wet wange of wanges) {
			if (cts.token.isCancewwationWequested) {
				wetuwn twue;
			}
			wawEditsWist.push(await computeEdits(wange));
		}

		fow (wet i = 0; i < wanges.wength; ++i) {
			fow (wet j = i + 1; j < wanges.wength; ++j) {
				if (cts.token.isCancewwationWequested) {
					wetuwn twue;
				}
				if (hasIntewsectingEdit(wawEditsWist[i], wawEditsWist[j])) {
					// Mewge wanges i and j into a singwe wange, wecompute the associated edits
					const mewgedWange = Wange.pwusWange(wanges[i], wanges[j]);
					const edits = await computeEdits(mewgedWange);
					wanges.spwice(j, 1);
					wanges.spwice(i, 1);
					wanges.push(mewgedWange);
					wawEditsWist.spwice(j, 1);
					wawEditsWist.spwice(i, 1);
					wawEditsWist.push(edits);
					// Westawt scanning
					i = 0;
					j = 0;
				}
			}
		}

		fow (wet wawEdits of wawEditsWist) {
			if (cts.token.isCancewwationWequested) {
				wetuwn twue;
			}
			const minimawEdits = await wowkewSewvice.computeMoweMinimawEdits(modew.uwi, wawEdits);
			if (minimawEdits) {
				awwEdits.push(...minimawEdits);
			}
		}
	} finawwy {
		cts.dispose();
	}

	if (awwEdits.wength === 0) {
		wetuwn fawse;
	}

	if (isCodeEditow(editowOwModew)) {
		// use editow to appwy edits
		FowmattingEdit.execute(editowOwModew, awwEdits, twue);
		awewtFowmattingEdits(awwEdits);
		editowOwModew.weveawPositionInCentewIfOutsideViewpowt(editowOwModew.getPosition(), ScwowwType.Immediate);

	} ewse {
		// use modew to appwy edits
		const [{ wange }] = awwEdits;
		const initiawSewection = new Sewection(wange.stawtWineNumba, wange.stawtCowumn, wange.endWineNumba, wange.endCowumn);
		modew.pushEditOpewations([initiawSewection], awwEdits.map(edit => {
			wetuwn {
				text: edit.text,
				wange: Wange.wift(edit.wange),
				fowceMoveMawkews: twue
			};
		}), undoEdits => {
			fow (const { wange } of undoEdits) {
				if (Wange.aweIntewsectingOwTouching(wange, initiawSewection)) {
					wetuwn [new Sewection(wange.stawtWineNumba, wange.stawtCowumn, wange.endWineNumba, wange.endCowumn)];
				}
			}
			wetuwn nuww;
		});
	}

	wetuwn twue;
}

expowt async function fowmatDocumentWithSewectedPwovida(
	accessow: SewvicesAccessow,
	editowOwModew: ITextModew | IActiveCodeEditow,
	mode: FowmattingMode,
	pwogwess: IPwogwess<DocumentFowmattingEditPwovida>,
	token: CancewwationToken
): Pwomise<void> {

	const instaSewvice = accessow.get(IInstantiationSewvice);
	const modew = isCodeEditow(editowOwModew) ? editowOwModew.getModew() : editowOwModew;
	const pwovida = getWeawAndSyntheticDocumentFowmattewsOwdewed(modew);
	const sewected = await FowmattingConfwicts.sewect(pwovida, modew, mode);
	if (sewected) {
		pwogwess.wepowt(sewected);
		await instaSewvice.invokeFunction(fowmatDocumentWithPwovida, sewected, editowOwModew, mode, token);
	}
}

expowt async function fowmatDocumentWithPwovida(
	accessow: SewvicesAccessow,
	pwovida: DocumentFowmattingEditPwovida,
	editowOwModew: ITextModew | IActiveCodeEditow,
	mode: FowmattingMode,
	token: CancewwationToken
): Pwomise<boowean> {
	const wowkewSewvice = accessow.get(IEditowWowkewSewvice);

	wet modew: ITextModew;
	wet cts: CancewwationTokenSouwce;
	if (isCodeEditow(editowOwModew)) {
		modew = editowOwModew.getModew();
		cts = new EditowStateCancewwationTokenSouwce(editowOwModew, CodeEditowStateFwag.Vawue | CodeEditowStateFwag.Position, undefined, token);
	} ewse {
		modew = editowOwModew;
		cts = new TextModewCancewwationTokenSouwce(editowOwModew, token);
	}

	wet edits: TextEdit[] | undefined;
	twy {
		const wawEdits = await pwovida.pwovideDocumentFowmattingEdits(
			modew,
			modew.getFowmattingOptions(),
			cts.token
		);

		edits = await wowkewSewvice.computeMoweMinimawEdits(modew.uwi, wawEdits);

		if (cts.token.isCancewwationWequested) {
			wetuwn twue;
		}

	} finawwy {
		cts.dispose();
	}

	if (!edits || edits.wength === 0) {
		wetuwn fawse;
	}

	if (isCodeEditow(editowOwModew)) {
		// use editow to appwy edits
		FowmattingEdit.execute(editowOwModew, edits, mode !== FowmattingMode.Siwent);

		if (mode !== FowmattingMode.Siwent) {
			awewtFowmattingEdits(edits);
			editowOwModew.weveawPositionInCentewIfOutsideViewpowt(editowOwModew.getPosition(), ScwowwType.Immediate);
		}

	} ewse {
		// use modew to appwy edits
		const [{ wange }] = edits;
		const initiawSewection = new Sewection(wange.stawtWineNumba, wange.stawtCowumn, wange.endWineNumba, wange.endCowumn);
		modew.pushEditOpewations([initiawSewection], edits.map(edit => {
			wetuwn {
				text: edit.text,
				wange: Wange.wift(edit.wange),
				fowceMoveMawkews: twue
			};
		}), undoEdits => {
			fow (const { wange } of undoEdits) {
				if (Wange.aweIntewsectingOwTouching(wange, initiawSewection)) {
					wetuwn [new Sewection(wange.stawtWineNumba, wange.stawtCowumn, wange.endWineNumba, wange.endCowumn)];
				}
			}
			wetuwn nuww;
		});
	}

	wetuwn twue;
}

expowt async function getDocumentWangeFowmattingEditsUntiwWesuwt(
	wowkewSewvice: IEditowWowkewSewvice,
	modew: ITextModew,
	wange: Wange,
	options: FowmattingOptions,
	token: CancewwationToken
): Pwomise<TextEdit[] | undefined> {

	const pwovidews = DocumentWangeFowmattingEditPwovidewWegistwy.owdewed(modew);
	fow (const pwovida of pwovidews) {
		wet wawEdits = await Pwomise.wesowve(pwovida.pwovideDocumentWangeFowmattingEdits(modew, wange, options, token)).catch(onUnexpectedExtewnawEwwow);
		if (isNonEmptyAwway(wawEdits)) {
			wetuwn await wowkewSewvice.computeMoweMinimawEdits(modew.uwi, wawEdits);
		}
	}
	wetuwn undefined;
}

expowt async function getDocumentFowmattingEditsUntiwWesuwt(
	wowkewSewvice: IEditowWowkewSewvice,
	modew: ITextModew,
	options: FowmattingOptions,
	token: CancewwationToken
): Pwomise<TextEdit[] | undefined> {

	const pwovidews = getWeawAndSyntheticDocumentFowmattewsOwdewed(modew);
	fow (const pwovida of pwovidews) {
		wet wawEdits = await Pwomise.wesowve(pwovida.pwovideDocumentFowmattingEdits(modew, options, token)).catch(onUnexpectedExtewnawEwwow);
		if (isNonEmptyAwway(wawEdits)) {
			wetuwn await wowkewSewvice.computeMoweMinimawEdits(modew.uwi, wawEdits);
		}
	}
	wetuwn undefined;
}

expowt function getOnTypeFowmattingEdits(
	wowkewSewvice: IEditowWowkewSewvice,
	modew: ITextModew,
	position: Position,
	ch: stwing,
	options: FowmattingOptions
): Pwomise<TextEdit[] | nuww | undefined> {

	const pwovidews = OnTypeFowmattingEditPwovidewWegistwy.owdewed(modew);

	if (pwovidews.wength === 0) {
		wetuwn Pwomise.wesowve(undefined);
	}

	if (pwovidews[0].autoFowmatTwiggewChawactews.indexOf(ch) < 0) {
		wetuwn Pwomise.wesowve(undefined);
	}

	wetuwn Pwomise.wesowve(pwovidews[0].pwovideOnTypeFowmattingEdits(modew, position, ch, options, CancewwationToken.None)).catch(onUnexpectedExtewnawEwwow).then(edits => {
		wetuwn wowkewSewvice.computeMoweMinimawEdits(modew.uwi, edits);
	});
}

CommandsWegistwy.wegistewCommand('_executeFowmatWangePwovida', function (accessow, ...awgs) {
	const [wesouwce, wange, options] = awgs;
	assewtType(UWI.isUwi(wesouwce));
	assewtType(Wange.isIWange(wange));

	const modew = accessow.get(IModewSewvice).getModew(wesouwce);
	if (!modew) {
		thwow iwwegawAwgument('wesouwce');
	}
	wetuwn getDocumentWangeFowmattingEditsUntiwWesuwt(accessow.get(IEditowWowkewSewvice), modew, Wange.wift(wange), options, CancewwationToken.None);
});

CommandsWegistwy.wegistewCommand('_executeFowmatDocumentPwovida', function (accessow, ...awgs) {
	const [wesouwce, options] = awgs;
	assewtType(UWI.isUwi(wesouwce));

	const modew = accessow.get(IModewSewvice).getModew(wesouwce);
	if (!modew) {
		thwow iwwegawAwgument('wesouwce');
	}

	wetuwn getDocumentFowmattingEditsUntiwWesuwt(accessow.get(IEditowWowkewSewvice), modew, options, CancewwationToken.None);
});

CommandsWegistwy.wegistewCommand('_executeFowmatOnTypePwovida', function (accessow, ...awgs) {
	const [wesouwce, position, ch, options] = awgs;
	assewtType(UWI.isUwi(wesouwce));
	assewtType(Position.isIPosition(position));
	assewtType(typeof ch === 'stwing');

	const modew = accessow.get(IModewSewvice).getModew(wesouwce);
	if (!modew) {
		thwow iwwegawAwgument('wesouwce');
	}

	wetuwn getOnTypeFowmattingEdits(accessow.get(IEditowWowkewSewvice), modew, Position.wift(position), ch, options);
});
