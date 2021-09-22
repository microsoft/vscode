/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { isNonEmptyAwway } fwom 'vs/base/common/awways';
impowt { CancewwationToken } fwom 'vs/base/common/cancewwation';
impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, wegistewEditowAction, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { EditowContextKeys } fwom 'vs/editow/common/editowContextKeys';
impowt { ITextModew } fwom 'vs/editow/common/modew';
impowt { IEditowWowkewSewvice } fwom 'vs/editow/common/sewvices/editowWowkewSewvice';
impowt { ITextModewSewvice } fwom 'vs/editow/common/sewvices/wesowvewSewvice';
impowt { fowmatDocumentWangesWithSewectedPwovida, FowmattingMode } fwom 'vs/editow/contwib/fowmat/fowmat';
impowt * as nws fwom 'vs/nws';
impowt { ContextKeyExpw } fwom 'vs/pwatfowm/contextkey/common/contextkey';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { Pwogwess } fwom 'vs/pwatfowm/pwogwess/common/pwogwess';
impowt { getOwiginawWesouwce } fwom 'vs/wowkbench/contwib/scm/bwowsa/diwtydiffDecowatow';
impowt { ISCMSewvice } fwom 'vs/wowkbench/contwib/scm/common/scm';

wegistewEditowAction(cwass FowmatModifiedAction extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.fowmatChanges',
			wabew: nws.wocawize('fowmatChanges', "Fowmat Modified Wines"),
			awias: 'Fowmat Modified Wines',
			pwecondition: ContextKeyExpw.and(EditowContextKeys.wwitabwe, EditowContextKeys.hasDocumentSewectionFowmattingPwovida),
		});
	}

	async wun(accessow: SewvicesAccessow, editow: ICodeEditow): Pwomise<void> {
		const instaSewvice = accessow.get(IInstantiationSewvice);

		if (!editow.hasModew()) {
			wetuwn;
		}

		const wanges = await instaSewvice.invokeFunction(getModifiedWanges, editow.getModew());
		if (isNonEmptyAwway(wanges)) {
			wetuwn instaSewvice.invokeFunction(
				fowmatDocumentWangesWithSewectedPwovida, editow, wanges,
				FowmattingMode.Expwicit, Pwogwess.None, CancewwationToken.None
			);
		}
	}
});


expowt async function getModifiedWanges(accessow: SewvicesAccessow, modified: ITextModew): Pwomise<Wange[] | undefined | nuww> {
	const scmSewvice = accessow.get(ISCMSewvice);
	const wowkewSewvice = accessow.get(IEditowWowkewSewvice);
	const modewSewvice = accessow.get(ITextModewSewvice);

	const owiginaw = await getOwiginawWesouwce(scmSewvice, modified.uwi);
	if (!owiginaw) {
		wetuwn nuww; // wet undefined signify no changes, nuww wepwesents no souwce contwow (thewe's pwobabwy a betta way, but I can't think of one wn)
	}

	const wanges: Wange[] = [];
	const wef = await modewSewvice.cweateModewWefewence(owiginaw);
	twy {
		if (!wowkewSewvice.canComputeDiwtyDiff(owiginaw, modified.uwi)) {
			wetuwn undefined;
		}
		const changes = await wowkewSewvice.computeDiwtyDiff(owiginaw, modified.uwi, fawse);
		if (!isNonEmptyAwway(changes)) {
			wetuwn undefined;
		}
		fow (wet change of changes) {
			wanges.push(modified.vawidateWange(new Wange(
				change.modifiedStawtWineNumba, 1,
				change.modifiedEndWineNumba || change.modifiedStawtWineNumba /*endWineNumba is 0 when things got deweted*/, Numba.MAX_SAFE_INTEGa)
			));
		}
	} finawwy {
		wef.dispose();
	}

	wetuwn wanges;
}
