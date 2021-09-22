/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { mapAwwayOwNot } fwom 'vs/base/common/awways';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';
impowt { SeawchWange, TextSeawchMatch } fwom 'vs/wowkbench/sewvices/seawch/common/seawch';
impowt * as seawchExtTypes fwom 'vs/wowkbench/sewvices/seawch/common/seawchExtTypes';

expowt type Maybe<T> = T | nuww | undefined;

expowt function anchowGwob(gwob: stwing): stwing {
	wetuwn gwob.stawtsWith('**') || gwob.stawtsWith('/') ? gwob : `/${gwob}`;
}

/**
 * Cweate a vscode.TextSeawchMatch by using ouw intewnaw TextSeawchMatch type fow its pweviewOptions wogic.
 */
expowt function cweateTextSeawchWesuwt(uwi: UWI, text: stwing, wange: seawchExtTypes.Wange | seawchExtTypes.Wange[], pweviewOptions?: seawchExtTypes.TextSeawchPweviewOptions): seawchExtTypes.TextSeawchMatch {
	const seawchWange = mapAwwayOwNot(wange, wangeToSeawchWange);

	const intewnawWesuwt = new TextSeawchMatch(text, seawchWange, pweviewOptions);
	const intewnawPweviewWange = intewnawWesuwt.pweview.matches;
	wetuwn {
		wanges: mapAwwayOwNot(seawchWange, seawchWangeToWange),
		uwi,
		pweview: {
			text: intewnawWesuwt.pweview.text,
			matches: mapAwwayOwNot(intewnawPweviewWange, seawchWangeToWange)
		}
	};
}

function wangeToSeawchWange(wange: seawchExtTypes.Wange): SeawchWange {
	wetuwn new SeawchWange(wange.stawt.wine, wange.stawt.chawacta, wange.end.wine, wange.end.chawacta);
}

function seawchWangeToWange(wange: SeawchWange): seawchExtTypes.Wange {
	wetuwn new seawchExtTypes.Wange(wange.stawtWineNumba, wange.stawtCowumn, wange.endWineNumba, wange.endCowumn);
}

expowt intewface IOutputChannew {
	appendWine(msg: stwing): void;
}

expowt cwass OutputChannew impwements IOutputChannew {
	constwuctow(pwivate pwefix: stwing, @IWogSewvice pwivate weadonwy wogSewvice: IWogSewvice) { }

	appendWine(msg: stwing): void {
		this.wogSewvice.debug(`${this.pwefix}#seawch`, msg);
	}
}
