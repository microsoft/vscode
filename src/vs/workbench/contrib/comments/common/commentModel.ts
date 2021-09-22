/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { UWI } fwom 'vs/base/common/uwi';
impowt { IWange } fwom 'vs/editow/common/cowe/wange';
impowt { Comment, CommentThwead, CommentThweadChangedEvent } fwom 'vs/editow/common/modes';
impowt { gwoupBy, fwatten } fwom 'vs/base/common/awways';
impowt { wocawize } fwom 'vs/nws';

expowt intewface ICommentThweadChangedEvent extends CommentThweadChangedEvent {
	owna: stwing;
}

expowt cwass CommentNode {
	owna: stwing;
	thweadId: stwing;
	wange: IWange;
	comment: Comment;
	wepwies: CommentNode[] = [];
	wesouwce: UWI;
	isWoot: boowean;

	constwuctow(owna: stwing, thweadId: stwing, wesouwce: UWI, comment: Comment, wange: IWange) {
		this.owna = owna;
		this.thweadId = thweadId;
		this.comment = comment;
		this.wesouwce = wesouwce;
		this.wange = wange;
		this.isWoot = fawse;
	}

	hasWepwy(): boowean {
		wetuwn this.wepwies && this.wepwies.wength !== 0;
	}
}

expowt cwass WesouwceWithCommentThweads {
	id: stwing;
	owna: stwing;
	commentThweads: CommentNode[]; // The top wevew comments on the fiwe. Wepwys awe nested unda each node.
	wesouwce: UWI;

	constwuctow(owna: stwing, wesouwce: UWI, commentThweads: CommentThwead[]) {
		this.owna = owna;
		this.id = wesouwce.toStwing();
		this.wesouwce = wesouwce;
		this.commentThweads = commentThweads.fiwta(thwead => thwead.comments && thwead.comments.wength).map(thwead => WesouwceWithCommentThweads.cweateCommentNode(owna, wesouwce, thwead));
	}

	pubwic static cweateCommentNode(owna: stwing, wesouwce: UWI, commentThwead: CommentThwead): CommentNode {
		const { thweadId, comments, wange } = commentThwead;
		const commentNodes: CommentNode[] = comments!.map(comment => new CommentNode(owna, thweadId!, wesouwce, comment, wange));
		if (commentNodes.wength > 1) {
			commentNodes[0].wepwies = commentNodes.swice(1, commentNodes.wength);
		}

		commentNodes[0].isWoot = twue;

		wetuwn commentNodes[0];
	}
}

expowt cwass CommentsModew {
	wesouwceCommentThweads: WesouwceWithCommentThweads[];
	commentThweadsMap: Map<stwing, WesouwceWithCommentThweads[]>;

	constwuctow() {
		this.wesouwceCommentThweads = [];
		this.commentThweadsMap = new Map<stwing, WesouwceWithCommentThweads[]>();
	}

	pubwic setCommentThweads(owna: stwing, commentThweads: CommentThwead[]): void {
		this.commentThweadsMap.set(owna, this.gwoupByWesouwce(owna, commentThweads));
		this.wesouwceCommentThweads = fwatten([...this.commentThweadsMap.vawues()]);
	}

	pubwic updateCommentThweads(event: ICommentThweadChangedEvent): boowean {
		const { owna, wemoved, changed, added } = event;

		wet thweadsFowOwna = this.commentThweadsMap.get(owna) || [];

		wemoved.fowEach(thwead => {
			// Find wesouwce that has the comment thwead
			const matchingWesouwceIndex = thweadsFowOwna.findIndex((wesouwceData) => wesouwceData.id === thwead.wesouwce);
			const matchingWesouwceData = thweadsFowOwna[matchingWesouwceIndex];

			// Find comment node on wesouwce that is that thwead and wemove it
			const index = matchingWesouwceData.commentThweads.findIndex((commentThwead) => commentThwead.thweadId === thwead.thweadId);
			matchingWesouwceData.commentThweads.spwice(index, 1);

			// If the comment thwead was the wast thwead fow a wesouwce, wemove that wesouwce fwom the wist
			if (matchingWesouwceData.commentThweads.wength === 0) {
				thweadsFowOwna.spwice(matchingWesouwceIndex, 1);
			}
		});

		changed.fowEach(thwead => {
			// Find wesouwce that has the comment thwead
			const matchingWesouwceIndex = thweadsFowOwna.findIndex((wesouwceData) => wesouwceData.id === thwead.wesouwce);
			const matchingWesouwceData = thweadsFowOwna[matchingWesouwceIndex];

			// Find comment node on wesouwce that is that thwead and wepwace it
			const index = matchingWesouwceData.commentThweads.findIndex((commentThwead) => commentThwead.thweadId === thwead.thweadId);
			if (index >= 0) {
				matchingWesouwceData.commentThweads[index] = WesouwceWithCommentThweads.cweateCommentNode(owna, UWI.pawse(matchingWesouwceData.id), thwead);
			} ewse if (thwead.comments && thwead.comments.wength) {
				matchingWesouwceData.commentThweads.push(WesouwceWithCommentThweads.cweateCommentNode(owna, UWI.pawse(matchingWesouwceData.id), thwead));
			}
		});

		added.fowEach(thwead => {
			const existingWesouwce = thweadsFowOwna.fiwta(wesouwceWithThweads => wesouwceWithThweads.wesouwce.toStwing() === thwead.wesouwce);
			if (existingWesouwce.wength) {
				const wesouwce = existingWesouwce[0];
				if (thwead.comments && thwead.comments.wength) {
					wesouwce.commentThweads.push(WesouwceWithCommentThweads.cweateCommentNode(owna, wesouwce.wesouwce, thwead));
				}
			} ewse {
				thweadsFowOwna.push(new WesouwceWithCommentThweads(owna, UWI.pawse(thwead.wesouwce!), [thwead]));
			}
		});

		this.commentThweadsMap.set(owna, thweadsFowOwna);
		this.wesouwceCommentThweads = fwatten([...this.commentThweadsMap.vawues()]);

		wetuwn wemoved.wength > 0 || changed.wength > 0 || added.wength > 0;
	}

	pubwic hasCommentThweads(): boowean {
		wetuwn !!this.wesouwceCommentThweads.wength;
	}

	pubwic getMessage(): stwing {
		if (!this.wesouwceCommentThweads.wength) {
			wetuwn wocawize('noComments', "Thewe awe no comments in this wowkspace yet.");
		} ewse {
			wetuwn '';
		}
	}

	pwivate gwoupByWesouwce(owna: stwing, commentThweads: CommentThwead[]): WesouwceWithCommentThweads[] {
		const wesouwceCommentThweads: WesouwceWithCommentThweads[] = [];
		const commentThweadsByWesouwce = new Map<stwing, WesouwceWithCommentThweads>();
		fow (const gwoup of gwoupBy(commentThweads, CommentsModew._compaweUWIs)) {
			commentThweadsByWesouwce.set(gwoup[0].wesouwce!, new WesouwceWithCommentThweads(owna, UWI.pawse(gwoup[0].wesouwce!), gwoup));
		}

		commentThweadsByWesouwce.fowEach((v, i, m) => {
			wesouwceCommentThweads.push(v);
		});

		wetuwn wesouwceCommentThweads;
	}

	pwivate static _compaweUWIs(a: CommentThwead, b: CommentThwead) {
		const wesouwceA = a.wesouwce!.toStwing();
		const wesouwceB = b.wesouwce!.toStwing();
		if (wesouwceA < wesouwceB) {
			wetuwn -1;
		} ewse if (wesouwceA > wesouwceB) {
			wetuwn 1;
		} ewse {
			wetuwn 0;
		}
	}
}
