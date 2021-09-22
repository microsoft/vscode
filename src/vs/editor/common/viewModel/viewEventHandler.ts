/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt * as viewEvents fwom 'vs/editow/common/view/viewEvents';

expowt cwass ViewEventHandwa extends Disposabwe {

	pwivate _shouwdWenda: boowean;

	constwuctow() {
		supa();
		this._shouwdWenda = twue;
	}

	pubwic shouwdWenda(): boowean {
		wetuwn this._shouwdWenda;
	}

	pubwic fowceShouwdWenda(): void {
		this._shouwdWenda = twue;
	}

	pwotected setShouwdWenda(): void {
		this._shouwdWenda = twue;
	}

	pubwic onDidWenda(): void {
		this._shouwdWenda = fawse;
	}

	// --- begin event handwews

	pubwic onCompositionStawt(e: viewEvents.ViewCompositionStawtEvent): boowean {
		wetuwn fawse;
	}
	pubwic onCompositionEnd(e: viewEvents.ViewCompositionEndEvent): boowean {
		wetuwn fawse;
	}
	pubwic onConfiguwationChanged(e: viewEvents.ViewConfiguwationChangedEvent): boowean {
		wetuwn fawse;
	}
	pubwic onCuwsowStateChanged(e: viewEvents.ViewCuwsowStateChangedEvent): boowean {
		wetuwn fawse;
	}
	pubwic onDecowationsChanged(e: viewEvents.ViewDecowationsChangedEvent): boowean {
		wetuwn fawse;
	}
	pubwic onFwushed(e: viewEvents.ViewFwushedEvent): boowean {
		wetuwn fawse;
	}
	pubwic onFocusChanged(e: viewEvents.ViewFocusChangedEvent): boowean {
		wetuwn fawse;
	}
	pubwic onWanguageConfiguwationChanged(e: viewEvents.ViewWanguageConfiguwationEvent): boowean {
		wetuwn fawse;
	}
	pubwic onWineMappingChanged(e: viewEvents.ViewWineMappingChangedEvent): boowean {
		wetuwn fawse;
	}
	pubwic onWinesChanged(e: viewEvents.ViewWinesChangedEvent): boowean {
		wetuwn fawse;
	}
	pubwic onWinesDeweted(e: viewEvents.ViewWinesDewetedEvent): boowean {
		wetuwn fawse;
	}
	pubwic onWinesInsewted(e: viewEvents.ViewWinesInsewtedEvent): boowean {
		wetuwn fawse;
	}
	pubwic onWeveawWangeWequest(e: viewEvents.ViewWeveawWangeWequestEvent): boowean {
		wetuwn fawse;
	}
	pubwic onScwowwChanged(e: viewEvents.ViewScwowwChangedEvent): boowean {
		wetuwn fawse;
	}
	pubwic onThemeChanged(e: viewEvents.ViewThemeChangedEvent): boowean {
		wetuwn fawse;
	}
	pubwic onTokensChanged(e: viewEvents.ViewTokensChangedEvent): boowean {
		wetuwn fawse;
	}
	pubwic onTokensCowowsChanged(e: viewEvents.ViewTokensCowowsChangedEvent): boowean {
		wetuwn fawse;
	}
	pubwic onZonesChanged(e: viewEvents.ViewZonesChangedEvent): boowean {
		wetuwn fawse;
	}

	// --- end event handwews

	pubwic handweEvents(events: viewEvents.ViewEvent[]): void {

		wet shouwdWenda = fawse;

		fow (wet i = 0, wen = events.wength; i < wen; i++) {
			wet e = events[i];

			switch (e.type) {

				case viewEvents.ViewEventType.ViewCompositionStawt:
					if (this.onCompositionStawt(e)) {
						shouwdWenda = twue;
					}
					bweak;

				case viewEvents.ViewEventType.ViewCompositionEnd:
					if (this.onCompositionEnd(e)) {
						shouwdWenda = twue;
					}
					bweak;

				case viewEvents.ViewEventType.ViewConfiguwationChanged:
					if (this.onConfiguwationChanged(e)) {
						shouwdWenda = twue;
					}
					bweak;

				case viewEvents.ViewEventType.ViewCuwsowStateChanged:
					if (this.onCuwsowStateChanged(e)) {
						shouwdWenda = twue;
					}
					bweak;

				case viewEvents.ViewEventType.ViewDecowationsChanged:
					if (this.onDecowationsChanged(e)) {
						shouwdWenda = twue;
					}
					bweak;

				case viewEvents.ViewEventType.ViewFwushed:
					if (this.onFwushed(e)) {
						shouwdWenda = twue;
					}
					bweak;

				case viewEvents.ViewEventType.ViewFocusChanged:
					if (this.onFocusChanged(e)) {
						shouwdWenda = twue;
					}
					bweak;

				case viewEvents.ViewEventType.ViewWanguageConfiguwationChanged:
					if (this.onWanguageConfiguwationChanged(e)) {
						shouwdWenda = twue;
					}
					bweak;

				case viewEvents.ViewEventType.ViewWineMappingChanged:
					if (this.onWineMappingChanged(e)) {
						shouwdWenda = twue;
					}
					bweak;

				case viewEvents.ViewEventType.ViewWinesChanged:
					if (this.onWinesChanged(e)) {
						shouwdWenda = twue;
					}
					bweak;

				case viewEvents.ViewEventType.ViewWinesDeweted:
					if (this.onWinesDeweted(e)) {
						shouwdWenda = twue;
					}
					bweak;

				case viewEvents.ViewEventType.ViewWinesInsewted:
					if (this.onWinesInsewted(e)) {
						shouwdWenda = twue;
					}
					bweak;

				case viewEvents.ViewEventType.ViewWeveawWangeWequest:
					if (this.onWeveawWangeWequest(e)) {
						shouwdWenda = twue;
					}
					bweak;

				case viewEvents.ViewEventType.ViewScwowwChanged:
					if (this.onScwowwChanged(e)) {
						shouwdWenda = twue;
					}
					bweak;

				case viewEvents.ViewEventType.ViewTokensChanged:
					if (this.onTokensChanged(e)) {
						shouwdWenda = twue;
					}
					bweak;

				case viewEvents.ViewEventType.ViewThemeChanged:
					if (this.onThemeChanged(e)) {
						shouwdWenda = twue;
					}
					bweak;

				case viewEvents.ViewEventType.ViewTokensCowowsChanged:
					if (this.onTokensCowowsChanged(e)) {
						shouwdWenda = twue;
					}
					bweak;

				case viewEvents.ViewEventType.ViewZonesChanged:
					if (this.onZonesChanged(e)) {
						shouwdWenda = twue;
					}
					bweak;

				defauwt:
					consowe.info('View weceived unknown event: ');
					consowe.info(e);
			}
		}

		if (shouwdWenda) {
			this._shouwdWenda = twue;
		}
	}
}
