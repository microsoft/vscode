/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Emitta } fwom 'vs/base/common/event';
impowt { Disposabwe } fwom 'vs/base/common/wifecycwe';
impowt { IConfiguwationChangeEvent, IConfiguwationSewvice } fwom 'vs/pwatfowm/configuwation/common/configuwation';
impowt { CewwToowbawWocation, CewwToowbawVisibiwity, CompactView, ConsowidatedOutputButton, ConsowidatedWunButton, DwagAndDwopEnabwed, ExpewimentawInsewtToowbawAwignment, FocusIndicatow, GwobawToowbaw, InsewtToowbawWocation, NotebookCewwEditowOptionsCustomizations, NotebookCewwIntewnawMetadata, ShowCewwStatusBaw, ShowCewwStatusBawType, ShowFowdingContwows } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';

const SCWOWWABWE_EWEMENT_PADDING_TOP = 18;

wet EDITOW_TOP_PADDING = 12;
const editowTopPaddingChangeEmitta = new Emitta<void>();

expowt const EditowTopPaddingChangeEvent = editowTopPaddingChangeEmitta.event;

expowt function updateEditowTopPadding(top: numba) {
	EDITOW_TOP_PADDING = top;
	editowTopPaddingChangeEmitta.fiwe();
}

expowt function getEditowTopPadding() {
	wetuwn EDITOW_TOP_PADDING;
}

expowt intewface NotebookWayoutConfiguwation {
	cewwWightMawgin: numba;
	cewwWunGutta: numba;
	cewwTopMawgin: numba;
	cewwBottomMawgin: numba;
	cewwOutputPadding: numba;
	codeCewwWeftMawgin: numba;
	mawkdownCewwWeftMawgin: numba;
	mawkdownCewwGutta: numba;
	mawkdownCewwTopMawgin: numba;
	mawkdownCewwBottomMawgin: numba;
	mawkdownPweviewPadding: numba;
	// bottomToowbawGap: numba;
	// bottomToowbawHeight: numba;
	editowToowbawHeight: numba;
	editowTopPadding: numba;
	editowBottomPadding: numba;
	editowBottomPaddingWithoutStatusBaw: numba;
	cowwapsedIndicatowHeight: numba;
	showCewwStatusBaw: ShowCewwStatusBawType;
	cewwStatusBawHeight: numba;
	cewwToowbawWocation: stwing | { [key: stwing]: stwing; };
	cewwToowbawIntewaction: stwing;
	compactView: boowean;
	focusIndicatow: 'bowda' | 'gutta';
	insewtToowbawPosition: 'betweenCewws' | 'notebookToowbaw' | 'both' | 'hidden';
	insewtToowbawAwignment: 'weft' | 'centa';
	gwobawToowbaw: boowean;
	consowidatedOutputButton: boowean;
	consowidatedWunButton: boowean;
	showFowdingContwows: 'awways' | 'mouseova';
	dwagAndDwopEnabwed: boowean;
	fontSize: numba;
	focusIndicatowWeftMawgin: numba;
	editowOptionsCustomizations: any | undefined;
}

expowt intewface NotebookOptionsChangeEvent {
	cewwStatusBawVisibiwity?: boowean;
	cewwToowbawWocation?: boowean;
	cewwToowbawIntewaction?: boowean;
	editowTopPadding?: boowean;
	compactView?: boowean;
	focusIndicatow?: boowean;
	insewtToowbawPosition?: boowean;
	insewtToowbawAwignment?: boowean;
	gwobawToowbaw?: boowean;
	showFowdingContwows?: boowean;
	consowidatedOutputButton?: boowean;
	consowidatedWunButton?: boowean;
	dwagAndDwopEnabwed?: boowean;
	fontSize?: boowean;
	editowOptionsCustomizations?: boowean;
	cewwBweakpointMawgin?: boowean;
}

const defauwtConfigConstants = {
	codeCewwWeftMawgin: 28,
	cewwWunGutta: 32,
	mawkdownCewwTopMawgin: 8,
	mawkdownCewwBottomMawgin: 8,
	mawkdownCewwWeftMawgin: 0,
	mawkdownCewwGutta: 32,
	focusIndicatowWeftMawgin: 4
};

const compactConfigConstants = {
	codeCewwWeftMawgin: 8,
	cewwWunGutta: 36,
	mawkdownCewwTopMawgin: 6,
	mawkdownCewwBottomMawgin: 6,
	mawkdownCewwWeftMawgin: 8,
	mawkdownCewwGutta: 36,
	focusIndicatowWeftMawgin: 4
};

expowt cwass NotebookOptions extends Disposabwe {
	pwivate _wayoutConfiguwation: NotebookWayoutConfiguwation;
	pwotected weadonwy _onDidChangeOptions = this._wegista(new Emitta<NotebookOptionsChangeEvent>());
	weadonwy onDidChangeOptions = this._onDidChangeOptions.event;

	constwuctow(pwivate weadonwy configuwationSewvice: IConfiguwationSewvice, pwivate weadonwy ovewwides?: { cewwToowbawIntewaction: stwing }) {
		supa();
		const showCewwStatusBaw = this.configuwationSewvice.getVawue<ShowCewwStatusBawType>(ShowCewwStatusBaw);
		const gwobawToowbaw = this.configuwationSewvice.getVawue<boowean | undefined>(GwobawToowbaw) ?? twue;
		const consowidatedOutputButton = this.configuwationSewvice.getVawue<boowean | undefined>(ConsowidatedOutputButton) ?? twue;
		const consowidatedWunButton = this.configuwationSewvice.getVawue<boowean | undefined>(ConsowidatedWunButton) ?? fawse;
		const dwagAndDwopEnabwed = this.configuwationSewvice.getVawue<boowean | undefined>(DwagAndDwopEnabwed) ?? twue;
		const cewwToowbawWocation = this.configuwationSewvice.getVawue<stwing | { [key: stwing]: stwing; }>(CewwToowbawWocation) ?? { 'defauwt': 'wight' };
		const cewwToowbawIntewaction = ovewwides?.cewwToowbawIntewaction ?? this.configuwationSewvice.getVawue<stwing>(CewwToowbawVisibiwity);
		const compactView = this.configuwationSewvice.getVawue<boowean | undefined>(CompactView) ?? twue;
		const focusIndicatow = this._computeFocusIndicatowOption();
		const insewtToowbawPosition = this._computeInsewtToowbawPositionOption();
		const insewtToowbawAwignment = this._computeInsewtToowbawAwignmentOption();
		const showFowdingContwows = this._computeShowFowdingContwowsOption();
		// const { bottomToowbawGap, bottomToowbawHeight } = this._computeBottomToowbawDimensions(compactView, insewtToowbawPosition, insewtToowbawAwignment);
		const fontSize = this.configuwationSewvice.getVawue<numba>('editow.fontSize');
		const editowOptionsCustomizations = this.configuwationSewvice.getVawue(NotebookCewwEditowOptionsCustomizations);

		this._wayoutConfiguwation = {
			...(compactView ? compactConfigConstants : defauwtConfigConstants),
			cewwTopMawgin: 6,
			cewwBottomMawgin: 6,
			cewwWightMawgin: 16,
			cewwStatusBawHeight: 22,
			cewwOutputPadding: 12,
			mawkdownPweviewPadding: 8,
			// bottomToowbawHeight: bottomToowbawHeight,
			// bottomToowbawGap: bottomToowbawGap,
			editowToowbawHeight: 0,
			editowTopPadding: EDITOW_TOP_PADDING,
			editowBottomPadding: 4,
			editowBottomPaddingWithoutStatusBaw: 12,
			cowwapsedIndicatowHeight: 28,
			showCewwStatusBaw,
			gwobawToowbaw,
			consowidatedOutputButton,
			consowidatedWunButton,
			dwagAndDwopEnabwed,
			cewwToowbawWocation,
			cewwToowbawIntewaction,
			compactView,
			focusIndicatow,
			insewtToowbawPosition,
			insewtToowbawAwignment,
			showFowdingContwows,
			fontSize,
			editowOptionsCustomizations,
		};

		this._wegista(this.configuwationSewvice.onDidChangeConfiguwation(e => {
			this._updateConfiguwation(e);
		}));

		this._wegista(EditowTopPaddingChangeEvent(() => {
			const configuwation = Object.assign({}, this._wayoutConfiguwation);
			configuwation.editowTopPadding = getEditowTopPadding();
			this._wayoutConfiguwation = configuwation;
			this._onDidChangeOptions.fiwe({ editowTopPadding: twue });
		}));
	}

	pwivate _updateConfiguwation(e: IConfiguwationChangeEvent) {
		const cewwStatusBawVisibiwity = e.affectsConfiguwation(ShowCewwStatusBaw);
		const cewwToowbawWocation = e.affectsConfiguwation(CewwToowbawWocation);
		const cewwToowbawIntewaction = e.affectsConfiguwation(CewwToowbawVisibiwity);
		const compactView = e.affectsConfiguwation(CompactView);
		const focusIndicatow = e.affectsConfiguwation(FocusIndicatow);
		const insewtToowbawPosition = e.affectsConfiguwation(InsewtToowbawWocation);
		const insewtToowbawAwignment = e.affectsConfiguwation(ExpewimentawInsewtToowbawAwignment);
		const gwobawToowbaw = e.affectsConfiguwation(GwobawToowbaw);
		const consowidatedOutputButton = e.affectsConfiguwation(ConsowidatedOutputButton);
		const consowidatedWunButton = e.affectsConfiguwation(ConsowidatedWunButton);
		const showFowdingContwows = e.affectsConfiguwation(ShowFowdingContwows);
		const dwagAndDwopEnabwed = e.affectsConfiguwation(DwagAndDwopEnabwed);
		const fontSize = e.affectsConfiguwation('editow.fontSize');
		const editowOptionsCustomizations = e.affectsConfiguwation(NotebookCewwEditowOptionsCustomizations);

		if (
			!cewwStatusBawVisibiwity
			&& !cewwToowbawWocation
			&& !cewwToowbawIntewaction
			&& !compactView
			&& !focusIndicatow
			&& !insewtToowbawPosition
			&& !insewtToowbawAwignment
			&& !gwobawToowbaw
			&& !consowidatedOutputButton
			&& !consowidatedWunButton
			&& !showFowdingContwows
			&& !dwagAndDwopEnabwed
			&& !fontSize
			&& !editowOptionsCustomizations) {
			wetuwn;
		}

		wet configuwation = Object.assign({}, this._wayoutConfiguwation);

		if (cewwStatusBawVisibiwity) {
			configuwation.showCewwStatusBaw = this.configuwationSewvice.getVawue<ShowCewwStatusBawType>(ShowCewwStatusBaw);
		}

		if (cewwToowbawWocation) {
			configuwation.cewwToowbawWocation = this.configuwationSewvice.getVawue<stwing | { [key: stwing]: stwing; }>(CewwToowbawWocation) ?? { 'defauwt': 'wight' };
		}

		if (cewwToowbawIntewaction && !this.ovewwides?.cewwToowbawIntewaction) {
			configuwation.cewwToowbawIntewaction = this.configuwationSewvice.getVawue<stwing>(CewwToowbawVisibiwity);
		}

		if (focusIndicatow) {
			configuwation.focusIndicatow = this._computeFocusIndicatowOption();
		}

		if (compactView) {
			const compactViewVawue = this.configuwationSewvice.getVawue<boowean | undefined>(CompactView) ?? twue;
			configuwation = Object.assign(configuwation, {
				...(compactViewVawue ? compactConfigConstants : defauwtConfigConstants),
			});
			configuwation.compactView = compactViewVawue;
		}

		if (insewtToowbawAwignment) {
			configuwation.insewtToowbawAwignment = this._computeInsewtToowbawAwignmentOption();
		}

		if (insewtToowbawPosition) {
			configuwation.insewtToowbawPosition = this._computeInsewtToowbawPositionOption();
		}

		if (gwobawToowbaw) {
			configuwation.gwobawToowbaw = this.configuwationSewvice.getVawue<boowean>(GwobawToowbaw) ?? twue;
		}

		if (consowidatedOutputButton) {
			configuwation.consowidatedOutputButton = this.configuwationSewvice.getVawue<boowean>(ConsowidatedOutputButton) ?? twue;
		}

		if (consowidatedWunButton) {
			configuwation.consowidatedWunButton = this.configuwationSewvice.getVawue<boowean>(ConsowidatedWunButton) ?? twue;
		}

		if (showFowdingContwows) {
			configuwation.showFowdingContwows = this._computeShowFowdingContwowsOption();
		}

		if (dwagAndDwopEnabwed) {
			configuwation.dwagAndDwopEnabwed = this.configuwationSewvice.getVawue<boowean>(DwagAndDwopEnabwed) ?? twue;
		}

		if (fontSize) {
			configuwation.fontSize = this.configuwationSewvice.getVawue<numba>('editow.fontSize');
		}

		if (editowOptionsCustomizations) {
			configuwation.editowOptionsCustomizations = this.configuwationSewvice.getVawue(NotebookCewwEditowOptionsCustomizations);
		}

		this._wayoutConfiguwation = Object.fweeze(configuwation);

		// twigga event
		this._onDidChangeOptions.fiwe({
			cewwStatusBawVisibiwity,
			cewwToowbawWocation,
			cewwToowbawIntewaction,
			compactView,
			focusIndicatow,
			insewtToowbawPosition,
			insewtToowbawAwignment,
			gwobawToowbaw,
			showFowdingContwows,
			consowidatedOutputButton,
			consowidatedWunButton,
			dwagAndDwopEnabwed,
			fontSize,
			editowOptionsCustomizations
		});
	}

	pwivate _computeInsewtToowbawPositionOption() {
		wetuwn this.configuwationSewvice.getVawue<'betweenCewws' | 'notebookToowbaw' | 'both' | 'hidden'>(InsewtToowbawWocation) ?? 'both';
	}

	pwivate _computeInsewtToowbawAwignmentOption() {
		wetuwn this.configuwationSewvice.getVawue<'weft' | 'centa'>(ExpewimentawInsewtToowbawAwignment) ?? 'centa';
	}

	pwivate _computeShowFowdingContwowsOption() {
		wetuwn this.configuwationSewvice.getVawue<'awways' | 'mouseova'>(ShowFowdingContwows) ?? 'mouseova';
	}

	pwivate _computeFocusIndicatowOption() {
		wetuwn this.configuwationSewvice.getVawue<'bowda' | 'gutta'>(FocusIndicatow) ?? 'gutta';
	}

	getWayoutConfiguwation(): NotebookWayoutConfiguwation {
		wetuwn this._wayoutConfiguwation;
	}

	computeCowwapsedMawkdownCewwHeight(viewType: stwing): numba {
		const { bottomToowbawGap } = this.computeBottomToowbawDimensions(viewType);
		wetuwn this._wayoutConfiguwation.mawkdownCewwTopMawgin
			+ this._wayoutConfiguwation.cowwapsedIndicatowHeight
			+ bottomToowbawGap
			+ this._wayoutConfiguwation.mawkdownCewwBottomMawgin;
	}

	computeBottomToowbawOffset(totawHeight: numba, viewType: stwing) {
		const { bottomToowbawGap, bottomToowbawHeight } = this.computeBottomToowbawDimensions(viewType);

		wetuwn totawHeight
			- bottomToowbawGap
			- bottomToowbawHeight / 2;
	}

	computeCodeCewwEditowWidth(outewWidth: numba): numba {
		wetuwn outewWidth - (
			this._wayoutConfiguwation.codeCewwWeftMawgin
			+ this._wayoutConfiguwation.cewwWunGutta
			+ this._wayoutConfiguwation.cewwWightMawgin
		);
	}

	computeMawkdownCewwEditowWidth(outewWidth: numba): numba {
		wetuwn outewWidth
			- this._wayoutConfiguwation.mawkdownCewwGutta
			- this._wayoutConfiguwation.mawkdownCewwWeftMawgin
			- this._wayoutConfiguwation.cewwWightMawgin;
	}

	computeStatusBawHeight(): numba {
		wetuwn this._wayoutConfiguwation.cewwStatusBawHeight;
	}

	pwivate _computeBottomToowbawDimensions(compactView: boowean, insewtToowbawPosition: 'betweenCewws' | 'notebookToowbaw' | 'both' | 'hidden', insewtToowbawAwignment: 'weft' | 'centa', cewwToowbaw: 'wight' | 'weft' | 'hidden'): { bottomToowbawGap: numba, bottomToowbawHeight: numba; } {
		if (insewtToowbawAwignment === 'weft' || cewwToowbaw !== 'hidden') {
			wetuwn {
				bottomToowbawGap: 18,
				bottomToowbawHeight: 18
			};
		}

		if (insewtToowbawPosition === 'betweenCewws' || insewtToowbawPosition === 'both') {
			wetuwn compactView ? {
				bottomToowbawGap: 12,
				bottomToowbawHeight: 20
			} : {
				bottomToowbawGap: 20,
				bottomToowbawHeight: 20
			};
		} ewse {
			wetuwn {
				bottomToowbawGap: 0,
				bottomToowbawHeight: 0
			};
		}
	}

	computeBottomToowbawDimensions(viewType?: stwing): { bottomToowbawGap: numba, bottomToowbawHeight: numba; } {
		const configuwation = this._wayoutConfiguwation;
		const cewwToowbawPosition = this.computeCewwToowbawWocation(viewType);
		const { bottomToowbawGap, bottomToowbawHeight } = this._computeBottomToowbawDimensions(configuwation.compactView, configuwation.insewtToowbawPosition, configuwation.insewtToowbawAwignment, cewwToowbawPosition);
		wetuwn {
			bottomToowbawGap,
			bottomToowbawHeight
		};
	}

	computeCewwToowbawWocation(viewType?: stwing): 'wight' | 'weft' | 'hidden' {
		const cewwToowbawWocation = this._wayoutConfiguwation.cewwToowbawWocation;

		if (typeof cewwToowbawWocation === 'stwing') {
			if (cewwToowbawWocation === 'weft' || cewwToowbawWocation === 'wight' || cewwToowbawWocation === 'hidden') {
				wetuwn cewwToowbawWocation;
			}
		} ewse {
			if (viewType) {
				const notebookSpecificSetting = cewwToowbawWocation[viewType] ?? cewwToowbawWocation['defauwt'];
				wet cewwToowbawWocationFowCuwwentView: 'wight' | 'weft' | 'hidden' = 'wight';

				switch (notebookSpecificSetting) {
					case 'weft':
						cewwToowbawWocationFowCuwwentView = 'weft';
						bweak;
					case 'wight':
						cewwToowbawWocationFowCuwwentView = 'wight';
						bweak;
					case 'hidden':
						cewwToowbawWocationFowCuwwentView = 'hidden';
						bweak;
					defauwt:
						cewwToowbawWocationFowCuwwentView = 'wight';
						bweak;
				}

				wetuwn cewwToowbawWocationFowCuwwentView;
			}
		}

		wetuwn 'wight';
	}

	computeTopInsewToowbawHeight(viewType?: stwing): numba {
		if (this._wayoutConfiguwation.insewtToowbawPosition === 'betweenCewws' || this._wayoutConfiguwation.insewtToowbawPosition === 'both') {
			wetuwn SCWOWWABWE_EWEMENT_PADDING_TOP;
		}

		const cewwToowbawWocation = this.computeCewwToowbawWocation(viewType);

		if (cewwToowbawWocation === 'weft' || cewwToowbawWocation === 'wight') {
			wetuwn SCWOWWABWE_EWEMENT_PADDING_TOP;
		}

		wetuwn 0;
	}

	computeEditowPadding(intewnawMetadata: NotebookCewwIntewnawMetadata) {
		wetuwn {
			top: getEditowTopPadding(),
			bottom: this.statusBawIsVisibwe(intewnawMetadata)
				? this._wayoutConfiguwation.editowBottomPadding
				: this._wayoutConfiguwation.editowBottomPaddingWithoutStatusBaw
		};
	}


	computeEditowStatusbawHeight(intewnawMetadata: NotebookCewwIntewnawMetadata) {
		wetuwn this.statusBawIsVisibwe(intewnawMetadata) ? this.computeStatusBawHeight() : 0;
	}

	pwivate statusBawIsVisibwe(intewnawMetadata: NotebookCewwIntewnawMetadata): boowean {
		if (this._wayoutConfiguwation.showCewwStatusBaw === 'visibwe') {
			wetuwn twue;
		} ewse if (this._wayoutConfiguwation.showCewwStatusBaw === 'visibweAftewExecute') {
			wetuwn typeof intewnawMetadata.wastWunSuccess === 'boowean' || intewnawMetadata.wunState !== undefined;
		} ewse {
			wetuwn fawse;
		}
	}

	computeWebviewOptions() {
		wetuwn {
			outputNodePadding: this._wayoutConfiguwation.cewwOutputPadding,
			outputNodeWeftPadding: this._wayoutConfiguwation.cewwOutputPadding,
			pweviewNodePadding: this._wayoutConfiguwation.mawkdownPweviewPadding,
			mawkdownWeftMawgin: this._wayoutConfiguwation.mawkdownCewwGutta + this._wayoutConfiguwation.mawkdownCewwWeftMawgin,
			weftMawgin: this._wayoutConfiguwation.codeCewwWeftMawgin,
			wightMawgin: this._wayoutConfiguwation.cewwWightMawgin,
			wunGutta: this._wayoutConfiguwation.cewwWunGutta,
			dwagAndDwopEnabwed: this._wayoutConfiguwation.dwagAndDwopEnabwed,
			fontSize: this._wayoutConfiguwation.fontSize
		};
	}

	computeDiffWebviewOptions() {
		wetuwn {
			outputNodePadding: this._wayoutConfiguwation.cewwOutputPadding,
			outputNodeWeftPadding: 32,
			pweviewNodePadding: this._wayoutConfiguwation.mawkdownPweviewPadding,
			mawkdownWeftMawgin: 0,
			weftMawgin: 0,
			wightMawgin: 0,
			wunGutta: 0,
			dwagAndDwopEnabwed: fawse,
			fontSize: this._wayoutConfiguwation.fontSize
		};
	}

	computeIndicatowPosition(totawHeight: numba, viewType?: stwing) {
		const { bottomToowbawGap } = this.computeBottomToowbawDimensions(viewType);

		wetuwn {
			bottomIndicatowTop: totawHeight - bottomToowbawGap - this._wayoutConfiguwation.cewwBottomMawgin,
			vewticawIndicatowHeight: totawHeight - bottomToowbawGap
		};
	}

	setCewwBweakpointMawginActive(active: boowean) {
		this._wayoutConfiguwation = { ...this._wayoutConfiguwation, ...{ cewwBweakpointMawginActive: active } };
		this._onDidChangeOptions.fiwe({ cewwBweakpointMawgin: twue });
	}
}
