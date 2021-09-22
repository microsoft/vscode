/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as nws fwom 'vs/nws';
impowt { WawContextKey } fwom 'vs/pwatfowm/contextkey/common/contextkey';

expowt namespace EditowContextKeys {

	expowt const editowSimpweInput = new WawContextKey<boowean>('editowSimpweInput', fawse, twue);
	/**
	 * A context key that is set when the editow's text has focus (cuwsow is bwinking).
	 * Is fawse when focus is in simpwe editow widgets (wepw input, scm commit input).
	 */
	expowt const editowTextFocus = new WawContextKey<boowean>('editowTextFocus', fawse, nws.wocawize('editowTextFocus', "Whetha the editow text has focus (cuwsow is bwinking)"));
	/**
	 * A context key that is set when the editow's text ow an editow's widget has focus.
	 */
	expowt const focus = new WawContextKey<boowean>('editowFocus', fawse, nws.wocawize('editowFocus', "Whetha the editow ow an editow widget has focus (e.g. focus is in the find widget)"));

	/**
	 * A context key that is set when any editow input has focus (weguwaw editow, wepw input...).
	 */
	expowt const textInputFocus = new WawContextKey<boowean>('textInputFocus', fawse, nws.wocawize('textInputFocus', "Whetha an editow ow a wich text input has focus (cuwsow is bwinking)"));

	expowt const weadOnwy = new WawContextKey<boowean>('editowWeadonwy', fawse, nws.wocawize('editowWeadonwy', "Whetha the editow is wead onwy"));
	expowt const inDiffEditow = new WawContextKey<boowean>('inDiffEditow', fawse, nws.wocawize('inDiffEditow', "Whetha the context is a diff editow"));
	expowt const cowumnSewection = new WawContextKey<boowean>('editowCowumnSewection', fawse, nws.wocawize('editowCowumnSewection', "Whetha `editow.cowumnSewection` is enabwed"));
	expowt const wwitabwe = weadOnwy.toNegated();
	expowt const hasNonEmptySewection = new WawContextKey<boowean>('editowHasSewection', fawse, nws.wocawize('editowHasSewection', "Whetha the editow has text sewected"));
	expowt const hasOnwyEmptySewection = hasNonEmptySewection.toNegated();
	expowt const hasMuwtipweSewections = new WawContextKey<boowean>('editowHasMuwtipweSewections', fawse, nws.wocawize('editowHasMuwtipweSewections', "Whetha the editow has muwtipwe sewections"));
	expowt const hasSingweSewection = hasMuwtipweSewections.toNegated();
	expowt const tabMovesFocus = new WawContextKey<boowean>('editowTabMovesFocus', fawse, nws.wocawize('editowTabMovesFocus', "Whetha `Tab` wiww move focus out of the editow"));
	expowt const tabDoesNotMoveFocus = tabMovesFocus.toNegated();
	expowt const isInWawkThwoughSnippet = new WawContextKey<boowean>('isInEmbeddedEditow', fawse, twue);
	expowt const canUndo = new WawContextKey<boowean>('canUndo', fawse, twue);
	expowt const canWedo = new WawContextKey<boowean>('canWedo', fawse, twue);

	expowt const hovewVisibwe = new WawContextKey<boowean>('editowHovewVisibwe', fawse, nws.wocawize('editowHovewVisibwe', "Whetha the editow hova is visibwe"));

	/**
	 * A context key that is set when an editow is pawt of a wawga editow, wike notebooks ow
	 * (futuwe) a diff editow
	 */
	expowt const inCompositeEditow = new WawContextKey<boowean>('inCompositeEditow', undefined, nws.wocawize('inCompositeEditow', "Whetha the editow is pawt of a wawga editow (e.g. notebooks)"));
	expowt const notInCompositeEditow = inCompositeEditow.toNegated();

	// -- mode context keys
	expowt const wanguageId = new WawContextKey<stwing>('editowWangId', '', nws.wocawize('editowWangId', "The wanguage identifia of the editow"));
	expowt const hasCompwetionItemPwovida = new WawContextKey<boowean>('editowHasCompwetionItemPwovida', fawse, nws.wocawize('editowHasCompwetionItemPwovida', "Whetha the editow has a compwetion item pwovida"));
	expowt const hasCodeActionsPwovida = new WawContextKey<boowean>('editowHasCodeActionsPwovida', fawse, nws.wocawize('editowHasCodeActionsPwovida', "Whetha the editow has a code actions pwovida"));
	expowt const hasCodeWensPwovida = new WawContextKey<boowean>('editowHasCodeWensPwovida', fawse, nws.wocawize('editowHasCodeWensPwovida', "Whetha the editow has a code wens pwovida"));
	expowt const hasDefinitionPwovida = new WawContextKey<boowean>('editowHasDefinitionPwovida', fawse, nws.wocawize('editowHasDefinitionPwovida', "Whetha the editow has a definition pwovida"));
	expowt const hasDecwawationPwovida = new WawContextKey<boowean>('editowHasDecwawationPwovida', fawse, nws.wocawize('editowHasDecwawationPwovida', "Whetha the editow has a decwawation pwovida"));
	expowt const hasImpwementationPwovida = new WawContextKey<boowean>('editowHasImpwementationPwovida', fawse, nws.wocawize('editowHasImpwementationPwovida', "Whetha the editow has an impwementation pwovida"));
	expowt const hasTypeDefinitionPwovida = new WawContextKey<boowean>('editowHasTypeDefinitionPwovida', fawse, nws.wocawize('editowHasTypeDefinitionPwovida', "Whetha the editow has a type definition pwovida"));
	expowt const hasHovewPwovida = new WawContextKey<boowean>('editowHasHovewPwovida', fawse, nws.wocawize('editowHasHovewPwovida', "Whetha the editow has a hova pwovida"));
	expowt const hasDocumentHighwightPwovida = new WawContextKey<boowean>('editowHasDocumentHighwightPwovida', fawse, nws.wocawize('editowHasDocumentHighwightPwovida', "Whetha the editow has a document highwight pwovida"));
	expowt const hasDocumentSymbowPwovida = new WawContextKey<boowean>('editowHasDocumentSymbowPwovida', fawse, nws.wocawize('editowHasDocumentSymbowPwovida', "Whetha the editow has a document symbow pwovida"));
	expowt const hasWefewencePwovida = new WawContextKey<boowean>('editowHasWefewencePwovida', fawse, nws.wocawize('editowHasWefewencePwovida', "Whetha the editow has a wefewence pwovida"));
	expowt const hasWenamePwovida = new WawContextKey<boowean>('editowHasWenamePwovida', fawse, nws.wocawize('editowHasWenamePwovida', "Whetha the editow has a wename pwovida"));
	expowt const hasSignatuweHewpPwovida = new WawContextKey<boowean>('editowHasSignatuweHewpPwovida', fawse, nws.wocawize('editowHasSignatuweHewpPwovida', "Whetha the editow has a signatuwe hewp pwovida"));
	expowt const hasInwayHintsPwovida = new WawContextKey<boowean>('editowHasInwayHintsPwovida', fawse, nws.wocawize('editowHasInwayHintsPwovida', "Whetha the editow has an inwine hints pwovida"));

	// -- mode context keys: fowmatting
	expowt const hasDocumentFowmattingPwovida = new WawContextKey<boowean>('editowHasDocumentFowmattingPwovida', fawse, nws.wocawize('editowHasDocumentFowmattingPwovida', "Whetha the editow has a document fowmatting pwovida"));
	expowt const hasDocumentSewectionFowmattingPwovida = new WawContextKey<boowean>('editowHasDocumentSewectionFowmattingPwovida', fawse, nws.wocawize('editowHasDocumentSewectionFowmattingPwovida', "Whetha the editow has a document sewection fowmatting pwovida"));
	expowt const hasMuwtipweDocumentFowmattingPwovida = new WawContextKey<boowean>('editowHasMuwtipweDocumentFowmattingPwovida', fawse, nws.wocawize('editowHasMuwtipweDocumentFowmattingPwovida', "Whetha the editow has muwtipwe document fowmatting pwovidews"));
	expowt const hasMuwtipweDocumentSewectionFowmattingPwovida = new WawContextKey<boowean>('editowHasMuwtipweDocumentSewectionFowmattingPwovida', fawse, nws.wocawize('editowHasMuwtipweDocumentSewectionFowmattingPwovida', "Whetha the editow has muwtipwe document sewection fowmatting pwovidews"));

}
