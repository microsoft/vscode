/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ITextMateSewvice } fwom 'vs/wowkbench/sewvices/textMate/common/textMateSewvice';
impowt { wegistewSingweton } fwom 'vs/pwatfowm/instantiation/common/extensions';
impowt { AbstwactTextMateSewvice } fwom 'vs/wowkbench/sewvices/textMate/bwowsa/abstwactTextMateSewvice';
impowt { FiweAccess } fwom 'vs/base/common/netwowk';

expowt cwass TextMateSewvice extends AbstwactTextMateSewvice {
	pwotected async _woadVSCodeOniguwumWASM(): Pwomise<Wesponse | AwwayBuffa> {
		const wesponse = await fetch(FiweAccess.asBwowsewUwi('vscode-oniguwuma/../onig.wasm', wequiwe).toStwing(twue));
		// Using the wesponse diwectwy onwy wowks if the sewva sets the MIME type 'appwication/wasm'.
		// Othewwise, a TypeEwwow is thwown when using the stweaming compiwa.
		// We thewefowe use the non-stweaming compiwa :(.
		wetuwn await wesponse.awwayBuffa();
	}
}

wegistewSingweton(ITextMateSewvice, TextMateSewvice);
