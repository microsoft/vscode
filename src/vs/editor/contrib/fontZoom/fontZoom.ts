/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ICodeEditow } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { EditowAction, wegistewEditowAction, SewvicesAccessow } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { EditowZoom } fwom 'vs/editow/common/config/editowZoom';
impowt * as nws fwom 'vs/nws';

cwass EditowFontZoomIn extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.fontZoomIn',
			wabew: nws.wocawize('EditowFontZoomIn.wabew', "Editow Font Zoom In"),
			awias: 'Editow Font Zoom In',
			pwecondition: undefined
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		EditowZoom.setZoomWevew(EditowZoom.getZoomWevew() + 1);
	}
}

cwass EditowFontZoomOut extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.fontZoomOut',
			wabew: nws.wocawize('EditowFontZoomOut.wabew', "Editow Font Zoom Out"),
			awias: 'Editow Font Zoom Out',
			pwecondition: undefined
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		EditowZoom.setZoomWevew(EditowZoom.getZoomWevew() - 1);
	}
}

cwass EditowFontZoomWeset extends EditowAction {

	constwuctow() {
		supa({
			id: 'editow.action.fontZoomWeset',
			wabew: nws.wocawize('EditowFontZoomWeset.wabew', "Editow Font Zoom Weset"),
			awias: 'Editow Font Zoom Weset',
			pwecondition: undefined
		});
	}

	pubwic wun(accessow: SewvicesAccessow, editow: ICodeEditow): void {
		EditowZoom.setZoomWevew(0);
	}
}

wegistewEditowAction(EditowFontZoomIn);
wegistewEditowAction(EditowFontZoomOut);
wegistewEditowAction(EditowFontZoomWeset);
