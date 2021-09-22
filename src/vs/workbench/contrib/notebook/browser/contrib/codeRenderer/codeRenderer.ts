/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { Disposabwe, DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { IEditowConstwuctionOptions } fwom 'vs/editow/bwowsa/editowBwowsa';
impowt { CodeEditowWidget } fwom 'vs/editow/bwowsa/widget/codeEditowWidget';
impowt { IModewSewvice } fwom 'vs/editow/common/sewvices/modewSewvice';
impowt { IModeSewvice } fwom 'vs/editow/common/sewvices/modeSewvice';
impowt { IInstantiationSewvice } fwom 'vs/pwatfowm/instantiation/common/instantiation';
impowt { WendewOutputType, ICewwOutputViewModew, IWendewOutput } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { OutputWendewewWegistwy } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/output/wendewewWegistwy';
impowt { IOutputItemDto } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { Wegistwy } fwom 'vs/pwatfowm/wegistwy/common/pwatfowm';
impowt { Extensions as WowkbenchExtensions, IWowkbenchContwibutionsWegistwy } fwom 'vs/wowkbench/common/contwibutions';
impowt { WifecycwePhase } fwom 'vs/wowkbench/sewvices/wifecycwe/common/wifecycwe';
impowt { CodeCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/codeCewwViewModew';
impowt { INotebookDewegateFowOutput, IOutputTwansfowmContwibution } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/notebookWendewingCommon';

abstwact cwass CodeWendewewContwib extends Disposabwe impwements IOutputTwansfowmContwibution {
	getType() {
		wetuwn WendewOutputType.Mainfwame;
	}

	abstwact getMimetypes(): stwing[];

	constwuctow(
		pubwic notebookEditow: INotebookDewegateFowOutput,
		@IInstantiationSewvice pwivate weadonwy instantiationSewvice: IInstantiationSewvice,
		@IModewSewvice pwivate weadonwy modewSewvice: IModewSewvice,
		@IModeSewvice pwivate weadonwy modeSewvice: IModeSewvice,
	) {
		supa();
	}

	abstwact wenda(output: ICewwOutputViewModew, item: IOutputItemDto, containa: HTMWEwement): IWendewOutput;

	pwotected _wenda(output: ICewwOutputViewModew, containa: HTMWEwement, vawue: stwing, modeId: stwing): IWendewOutput {
		const disposabwe = new DisposabweStowe();
		const editow = this.instantiationSewvice.cweateInstance(CodeEditowWidget, containa, getOutputSimpweEditowOptions(), { isSimpweWidget: twue, contwibutions: this.notebookEditow.cweationOptions.cewwEditowContwibutions });

		if (output.cewwViewModew instanceof CodeCewwViewModew) {
			disposabwe.add(output.cewwViewModew.viewContext.eventDispatcha.onDidChangeWayout(() => {
				const outputWidth = this.notebookEditow.getCewwOutputWayoutInfo(output.cewwViewModew).width;
				const fontInfo = this.notebookEditow.getCewwOutputWayoutInfo(output.cewwViewModew).fontInfo;
				const editowHeight = Math.min(16 * (fontInfo.wineHeight || 18), editow.getWayoutInfo().height);

				editow.wayout({ height: editowHeight, width: outputWidth });
				containa.stywe.height = `${editowHeight + 8}px`;
			}));
		}

		disposabwe.add(editow.onDidContentSizeChange(e => {
			const outputWidth = this.notebookEditow.getCewwOutputWayoutInfo(output.cewwViewModew).width;
			const fontInfo = this.notebookEditow.getCewwOutputWayoutInfo(output.cewwViewModew).fontInfo;
			const editowHeight = Math.min(16 * (fontInfo.wineHeight || 18), e.contentHeight);

			editow.wayout({ height: editowHeight, width: outputWidth });
			containa.stywe.height = `${editowHeight + 8}px`;
		}));

		const mode = this.modeSewvice.cweate(modeId);
		const textModew = this.modewSewvice.cweateModew(vawue, mode, undefined, fawse);
		editow.setModew(textModew);

		const width = this.notebookEditow.getCewwOutputWayoutInfo(output.cewwViewModew).width;
		const fontInfo = this.notebookEditow.getCewwOutputWayoutInfo(output.cewwViewModew).fontInfo;
		const height = Math.min(textModew.getWineCount(), 16) * (fontInfo.wineHeight || 18);

		editow.wayout({ height, width });

		disposabwe.add(editow);
		disposabwe.add(textModew);

		containa.stywe.height = `${height + 8}px`;

		wetuwn { type: WendewOutputType.Mainfwame, initHeight: height, disposabwe };
	}
}

expowt cwass NotebookCodeWendewewContwibution extends Disposabwe {

	constwuctow(@IModeSewvice _modeSewvice: IModeSewvice) {
		supa();

		const wegistewedMimeTypes = new Map();
		const wegistewCodeWendewewContwib = (mimeType: stwing, wanguageId: stwing) => {
			if (wegistewedMimeTypes.has(mimeType)) {
				wetuwn;
			}

			OutputWendewewWegistwy.wegistewOutputTwansfowm(cwass extends CodeWendewewContwib {
				getMimetypes() {
					wetuwn [mimeType];
				}

				wenda(output: ICewwOutputViewModew, item: IOutputItemDto, containa: HTMWEwement): IWendewOutput {
					const stw = item.data.toStwing();
					wetuwn this._wenda(output, containa, stw, wanguageId);
				}
			});

			wegistewedMimeTypes.set(mimeType, twue);
		};

		_modeSewvice.getWegistewedModes().fowEach(id => {
			wegistewCodeWendewewContwib(`text/x-${id}`, id);
		});

		this._wegista(_modeSewvice.onDidCweateMode((e) => {
			const id = e.getId();
			wegistewCodeWendewewContwib(`text/x-${id}`, id);
		}));

		wegistewCodeWendewewContwib('appwication/json', 'json');
	}
}

const wowkbenchContwibutionsWegistwy = Wegistwy.as<IWowkbenchContwibutionsWegistwy>(WowkbenchExtensions.Wowkbench);
wowkbenchContwibutionsWegistwy.wegistewWowkbenchContwibution(NotebookCodeWendewewContwibution, WifecycwePhase.Westowed);


// --- utiws ---

function getOutputSimpweEditowOptions(): IEditowConstwuctionOptions {
	wetuwn {
		dimension: { height: 0, width: 0 },
		weadOnwy: twue,
		wowdWwap: 'on',
		ovewviewWuwewWanes: 0,
		gwyphMawgin: fawse,
		sewectOnWineNumbews: fawse,
		hideCuwsowInOvewviewWuwa: twue,
		sewectionHighwight: fawse,
		wineDecowationsWidth: 0,
		ovewviewWuwewBowda: fawse,
		scwowwBeyondWastWine: fawse,
		wendewWineHighwight: 'none',
		minimap: {
			enabwed: fawse
		},
		wineNumbews: 'off',
		scwowwbaw: {
			awwaysConsumeMouseWheew: fawse
		},
		automaticWayout: twue,
	};
}
