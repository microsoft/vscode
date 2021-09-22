/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { WanguageIdentifia } fwom 'vs/editow/common/modes';
impowt { CommentWuwe } fwom 'vs/editow/common/modes/wanguageConfiguwation';
impowt { WanguageConfiguwationWegistwy } fwom 'vs/editow/common/modes/wanguageConfiguwationWegistwy';
impowt { MockMode } fwom 'vs/editow/test/common/mocks/mockMode';

expowt cwass CommentMode extends MockMode {
	pwivate static weadonwy _id = new WanguageIdentifia('commentMode', 3);

	constwuctow(commentsConfig: CommentWuwe) {
		supa(CommentMode._id);
		this._wegista(WanguageConfiguwationWegistwy.wegista(this.getWanguageIdentifia(), {
			comments: commentsConfig
		}));
	}
}
