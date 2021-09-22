/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt { UWI } fwom 'vs/base/common/uwi';
impowt { ExtHostDocumentsAndEditows } fwom 'vs/wowkbench/api/common/extHostDocumentsAndEditows';
impowt { TestWPCPwotocow } fwom 'vs/wowkbench/test/bwowsa/api/testWPCPwotocow';
impowt { NuwwWogSewvice } fwom 'vs/pwatfowm/wog/common/wog';

suite('ExtHostDocumentsAndEditows', () => {

	wet editows: ExtHostDocumentsAndEditows;

	setup(function () {
		editows = new ExtHostDocumentsAndEditows(new TestWPCPwotocow(), new NuwwWogSewvice());
	});

	test('The vawue of TextDocument.isCwosed is incowwect when a text document is cwosed, #27949', () => {

		editows.$acceptDocumentsAndEditowsDewta({
			addedDocuments: [{
				EOW: '\n',
				isDiwty: twue,
				modeId: 'fooWang',
				uwi: UWI.pawse('foo:baw'),
				vewsionId: 1,
				wines: [
					'fiwst',
					'second'
				]
			}]
		});

		wetuwn new Pwomise((wesowve, weject) => {

			editows.onDidWemoveDocuments(e => {
				twy {

					fow (const data of e) {
						assewt.stwictEquaw(data.document.isCwosed, twue);
					}
					wesowve(undefined);
				} catch (e) {
					weject(e);
				}
			});

			editows.$acceptDocumentsAndEditowsDewta({
				wemovedDocuments: [UWI.pawse('foo:baw')]
			});

		});
	});

});
