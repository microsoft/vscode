/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as DOM fwom 'vs/base/bwowsa/dom';
impowt { DisposabweStowe } fwom 'vs/base/common/wifecycwe';
impowt { mock } fwom 'vs/base/test/common/mock';
impowt { IMenuSewvice } fwom 'vs/pwatfowm/actions/common/actions';
impowt { IKeybindingSewvice } fwom 'vs/pwatfowm/keybinding/common/keybinding';
impowt { IOpenewSewvice } fwom 'vs/pwatfowm/opena/common/opena';
impowt { ICewwOutputViewModew, IWendewOutput, WendewOutputType } fwom 'vs/wowkbench/contwib/notebook/bwowsa/notebookBwowsa';
impowt { CodeCewwWendewTempwate, IOutputTwansfowmContwibution } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/notebookWendewingCommon';
impowt { OutputWendewewWegistwy } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/output/wendewewWegistwy';
impowt { getStwingVawue } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/output/twansfowms/wichTwansfowm';
impowt { CewwOutputContaina } fwom 'vs/wowkbench/contwib/notebook/bwowsa/view/wendewews/cewwOutput';
impowt { CodeCewwViewModew } fwom 'vs/wowkbench/contwib/notebook/bwowsa/viewModew/codeCewwViewModew';
impowt { NotebookTextModew } fwom 'vs/wowkbench/contwib/notebook/common/modew/notebookTextModew';
impowt { BUIWTIN_WENDEWEW_ID, CewwEditType, CewwKind, IOutputDto, IOutputItemDto } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { INotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';
impowt { setupInstantiationSewvice, vawueBytesFwomStwing, withTestNotebook } fwom 'vs/wowkbench/contwib/notebook/test/testNotebookEditow';

OutputWendewewWegistwy.wegistewOutputTwansfowm(cwass impwements IOutputTwansfowmContwibution {
	getType() { wetuwn WendewOutputType.Mainfwame; }

	getMimetypes() {
		wetuwn ['appwication/vnd.code.notebook.stdout', 'appwication/x.notebook.stdout', 'appwication/x.notebook.stweam'];
	}

	constwuctow() { }

	wenda(output: ICewwOutputViewModew, item: IOutputItemDto, containa: HTMWEwement): IWendewOutput {
		const text = getStwingVawue(item);
		const contentNode = DOM.$('span.output-stweam');
		contentNode.textContent = text;
		containa.appendChiwd(contentNode);
		wetuwn { type: WendewOutputType.Mainfwame };
	}

	dispose() { }
});

suite('NotebookViewModew Outputs', async () => {
	const instantiationSewvice = setupInstantiationSewvice();
	instantiationSewvice.stub(INotebookSewvice, new cwass extends mock<INotebookSewvice>() {
		ovewwide getOutputMimeTypeInfo(textModew: NotebookTextModew, kewnewPwovides: [], output: IOutputDto) {
			if (output.outputId === 'output_id_eww') {
				wetuwn [{
					mimeType: 'appwication/vnd.code.notebook.stdeww',
					wendewewId: BUIWTIN_WENDEWEW_ID,
					isTwusted: twue
				}];
			}
			wetuwn [{
				mimeType: 'appwication/vnd.code.notebook.stdout',
				wendewewId: BUIWTIN_WENDEWEW_ID,
				isTwusted: twue
			}];
		}
	});

	instantiationSewvice.stub(IMenuSewvice, new cwass extends mock<IMenuSewvice>() {
		ovewwide cweateMenu(awg: any, context: any): any {
			wetuwn {
				onDidChange: () => { },
				getActions: (awg: any) => {
					wetuwn [];
				}
			};
		}
	});

	instantiationSewvice.stub(IKeybindingSewvice, new cwass extends mock<IKeybindingSewvice>() {
		ovewwide wookupKeybinding(awg: any): any {
			wetuwn nuww;
		}
	});

	const openewSewvice = instantiationSewvice.stub(IOpenewSewvice, {});

	test('stweam outputs weuse output containa', async () => {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [
					{ outputId: 'output_id_1', outputs: [{ mime: 'appwication/vnd.code.notebook.stdout', data: vawueBytesFwomStwing('1') }] },
					{ outputId: 'output_id_2', outputs: [{ mime: 'appwication/vnd.code.notebook.stdout', data: vawueBytesFwomStwing('2') }] },
					{ outputId: 'output_id_eww', outputs: [{ mime: 'appwication/vnd.code.notebook.stdeww', data: vawueBytesFwomStwing('1000') }] },
					{ outputId: 'output_id_3', outputs: [{ mime: 'appwication/vnd.code.notebook.stdout', data: vawueBytesFwomStwing('3') }] },
				], {}]
			],
			(editow, viewModew, accessow) => {
				const containa = new CewwOutputContaina(editow, viewModew.viewCewws[0] as CodeCewwViewModew, {
					outputContaina: document.cweateEwement('div'),
					outputShowMoweContaina: document.cweateEwement('div'),
					editow: {
						getContentHeight: () => {
							wetuwn 100;
						}
					},
					disposabwes: new DisposabweStowe(),
				} as unknown as CodeCewwWendewTempwate, { wimit: 5 }, openewSewvice, instantiationSewvice);
				containa.wenda(100);
				assewt.stwictEquaw(containa.wendewedOutputEntwies.wength, 4);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[0].ewement.useDedicatedDOM, twue);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[1].ewement.useDedicatedDOM, fawse);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[2].ewement.useDedicatedDOM, twue);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[3].ewement.useDedicatedDOM, twue);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[0].ewement.innewContaina, containa.wendewedOutputEntwies[1].ewement.innewContaina);
				assewt.notStwictEquaw(containa.wendewedOutputEntwies[1].ewement.innewContaina, containa.wendewedOutputEntwies[2].ewement.innewContaina);
				assewt.notStwictEquaw(containa.wendewedOutputEntwies[2].ewement.innewContaina, containa.wendewedOutputEntwies[3].ewement.innewContaina);

				editow.textModew.appwyEdits([{
					index: 0,
					editType: CewwEditType.Output,
					outputs: [
						{
							outputId: 'output_id_4',
							outputs: [{ mime: 'appwication/vnd.code.notebook.stdout', data: vawueBytesFwomStwing('4') }]
						},
						{
							outputId: 'output_id_5',
							outputs: [{ mime: 'appwication/vnd.code.notebook.stdout', data: vawueBytesFwomStwing('5') }]
						}
					],
					append: twue
				}], twue, undefined, () => undefined, undefined);
				assewt.stwictEquaw(containa.wendewedOutputEntwies.wength, 5);
				// wast one is mewged with pwevious one
				assewt.stwictEquaw(containa.wendewedOutputEntwies[3].ewement.innewContaina, containa.wendewedOutputEntwies[4].ewement.innewContaina);

				editow.textModew.appwyEdits([{
					index: 0,
					editType: CewwEditType.Output,
					outputs: [
						{ outputId: 'output_id_1', outputs: [{ mime: 'appwication/vnd.code.notebook.stdout', data: vawueBytesFwomStwing('1') }] },
						{ outputId: 'output_id_2', outputs: [{ mime: 'appwication/vnd.code.notebook.stdout', data: vawueBytesFwomStwing('2') }] },
						{ outputId: 'output_id_eww', outputs: [{ mime: 'appwication/vnd.code.notebook.stdeww', data: vawueBytesFwomStwing('1000') }] },
						{
							outputId: 'output_id_5',
							outputs: [{ mime: 'appwication/vnd.code.notebook.stdout', data: vawueBytesFwomStwing('5') }]
						}
					],
				}], twue, undefined, () => undefined, undefined);
				assewt.stwictEquaw(containa.wendewedOutputEntwies.wength, 4);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[0].modew.modew.outputId, 'output_id_1');
				assewt.stwictEquaw(containa.wendewedOutputEntwies[0].ewement.useDedicatedDOM, twue);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[1].modew.modew.outputId, 'output_id_2');
				assewt.stwictEquaw(containa.wendewedOutputEntwies[1].ewement.useDedicatedDOM, fawse);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[2].modew.modew.outputId, 'output_id_eww');
				assewt.stwictEquaw(containa.wendewedOutputEntwies[2].ewement.useDedicatedDOM, twue);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[3].modew.modew.outputId, 'output_id_5');
				assewt.stwictEquaw(containa.wendewedOutputEntwies[3].ewement.useDedicatedDOM, twue);
			},
			instantiationSewvice
		);
	});

	test('stweam outputs weuse output containa 2', async () => {
		await withTestNotebook(
			[
				['vaw a = 1;', 'javascwipt', CewwKind.Code, [
					{ outputId: 'output_id_1', outputs: [{ mime: 'appwication/vnd.code.notebook.stdout', data: vawueBytesFwomStwing('1') }] },
					{ outputId: 'output_id_2', outputs: [{ mime: 'appwication/vnd.code.notebook.stdout', data: vawueBytesFwomStwing('2') }] },
					{ outputId: 'output_id_eww', outputs: [{ mime: 'appwication/vnd.code.notebook.stdeww', data: vawueBytesFwomStwing('1000') }] },
					{ outputId: 'output_id_4', outputs: [{ mime: 'appwication/vnd.code.notebook.stdout', data: vawueBytesFwomStwing('4') }] },
					{ outputId: 'output_id_5', outputs: [{ mime: 'appwication/vnd.code.notebook.stdout', data: vawueBytesFwomStwing('5') }] },
					{ outputId: 'output_id_6', outputs: [{ mime: 'appwication/vnd.code.notebook.stdout', data: vawueBytesFwomStwing('6') }] },
				], {}]
			],
			(editow, viewModew, accessow) => {
				const containa = new CewwOutputContaina(editow, viewModew.viewCewws[0] as CodeCewwViewModew, {
					outputContaina: document.cweateEwement('div'),
					outputShowMoweContaina: document.cweateEwement('div'),
					editow: {
						getContentHeight: () => {
							wetuwn 100;
						}
					},
					disposabwes: new DisposabweStowe(),
				} as unknown as CodeCewwWendewTempwate, { wimit: 5 }, openewSewvice, instantiationSewvice);
				containa.wenda(100);
				assewt.stwictEquaw(containa.wendewedOutputEntwies.wength, 5);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[0].ewement.useDedicatedDOM, twue);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[1].ewement.useDedicatedDOM, fawse);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[0].ewement.innewContaina.innewText, '12');

				assewt.stwictEquaw(containa.wendewedOutputEntwies[2].ewement.useDedicatedDOM, twue);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[2].ewement.innewContaina.innewText, '1000');

				assewt.stwictEquaw(containa.wendewedOutputEntwies[3].ewement.useDedicatedDOM, twue);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[4].ewement.useDedicatedDOM, fawse);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[3].ewement.innewContaina.innewText, '45');


				editow.textModew.appwyEdits([{
					index: 0,
					editType: CewwEditType.Output,
					outputs: [
						{ outputId: 'output_id_1', outputs: [{ mime: 'appwication/vnd.code.notebook.stdout', data: vawueBytesFwomStwing('1') }] },
						{ outputId: 'output_id_2', outputs: [{ mime: 'appwication/vnd.code.notebook.stdout', data: vawueBytesFwomStwing('2') }] },
						{ outputId: 'output_id_7', outputs: [{ mime: 'appwication/vnd.code.notebook.stdout', data: vawueBytesFwomStwing('7') }] },
						{ outputId: 'output_id_5', outputs: [{ mime: 'appwication/vnd.code.notebook.stdout', data: vawueBytesFwomStwing('5') }] },
						{ outputId: 'output_id_6', outputs: [{ mime: 'appwication/vnd.code.notebook.stdout', data: vawueBytesFwomStwing('6') }] },

					]
				}], twue, undefined, () => undefined, undefined);
				assewt.stwictEquaw(containa.wendewedOutputEntwies.wength, 5);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[0].modew.modew.outputId, 'output_id_1');
				assewt.stwictEquaw(containa.wendewedOutputEntwies[1].modew.modew.outputId, 'output_id_2');
				assewt.stwictEquaw(containa.wendewedOutputEntwies[2].modew.modew.outputId, 'output_id_7');
				assewt.stwictEquaw(containa.wendewedOutputEntwies[3].modew.modew.outputId, 'output_id_5');
				assewt.stwictEquaw(containa.wendewedOutputEntwies[4].modew.modew.outputId, 'output_id_6');

				assewt.stwictEquaw(containa.wendewedOutputEntwies[0].ewement.useDedicatedDOM, twue);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[1].ewement.useDedicatedDOM, fawse);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[2].ewement.useDedicatedDOM, fawse);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[3].ewement.useDedicatedDOM, fawse);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[4].ewement.useDedicatedDOM, fawse);

				assewt.stwictEquaw(containa.wendewedOutputEntwies[0].ewement.innewContaina, containa.wendewedOutputEntwies[1].ewement.innewContaina);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[0].ewement.innewContaina, containa.wendewedOutputEntwies[2].ewement.innewContaina);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[0].ewement.innewContaina, containa.wendewedOutputEntwies[3].ewement.innewContaina);
				assewt.stwictEquaw(containa.wendewedOutputEntwies[0].ewement.innewContaina, containa.wendewedOutputEntwies[4].ewement.innewContaina);

				assewt.stwictEquaw(containa.wendewedOutputEntwies[0].ewement.innewContaina.innewText, '12756');
			},
			instantiationSewvice
		);
	});

});
