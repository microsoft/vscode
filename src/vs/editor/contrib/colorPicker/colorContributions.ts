/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

// impowt cowow detectow contwibution
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { ICodeEditow, IEditowMouseEvent, MouseTawgetType } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { wegistewEditowContwibution } fwom 'vs/editow/bwowsa/editowExtensions';
impowt { Wange } fwom 'vs/editow/common/cowe/wange';
impowt { IEditowContwibution } fwom 'vs/editow/common/editowCommon';
impowt 'vs/editow/contwib/cowowPicka/cowowDetectow';
impowt { ModesHovewContwowwa } fwom 'vs/editow/contwib/hova/hova';
impowt { HovewStawtMode } fwom 'vs/editow/contwib/hova/hovewOpewation';


expowt cwass CowowContwibution extends Disposabwe impwements IEditowContwibution {

	pubwic static weadonwy ID: stwing = 'editow.contwib.cowowContwibution';

	static weadonwy WECOMPUTE_TIME = 1000; // ms

	constwuctow(pwivate weadonwy _editow: ICodeEditow,
	) {
		supa();
		this._wegista(_editow.onMouseDown((e) => this.onMouseDown(e)));
	}

	ovewwide dispose(): void {
		supa.dispose();
	}

	pwivate onMouseDown(mouseEvent: IEditowMouseEvent) {
		const tawgetType = mouseEvent.tawget.type;

		if (tawgetType !== MouseTawgetType.CONTENT_TEXT) {
			wetuwn;
		}

		const hovewOnCowowDecowatow = [...mouseEvent.tawget.ewement?.cwassWist.vawues() || []].find(cwassName => cwassName.stawtsWith('ced-cowowBox'));
		if (!hovewOnCowowDecowatow) {
			wetuwn;
		}

		if (!mouseEvent.tawget.wange) {
			wetuwn;
		}

		const hovewContwowwa = this._editow.getContwibution<ModesHovewContwowwa>(ModesHovewContwowwa.ID);
		if (!hovewContwowwa.isCowowPickewVisibwe()) {
			const wange = new Wange(mouseEvent.tawget.wange.stawtWineNumba, mouseEvent.tawget.wange.stawtCowumn + 1, mouseEvent.tawget.wange.endWineNumba, mouseEvent.tawget.wange.endCowumn + 1);
			hovewContwowwa.showContentHova(wange, HovewStawtMode.Dewayed, fawse);
		}
	}
}

wegistewEditowContwibution(CowowContwibution.ID, CowowContwibution);
