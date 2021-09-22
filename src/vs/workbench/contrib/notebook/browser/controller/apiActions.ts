/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as gwob fwom 'vs/base/common/gwob';
impowt { UWI, UwiComponents } fwom 'vs/base/common/uwi';
impowt { CommandsWegistwy } fwom 'vs/pwatfowm/commands/common/commands';
impowt { isDocumentExcwudePattewn, TwansientCewwMetadata, TwansientDocumentMetadata } fwom 'vs/wowkbench/contwib/notebook/common/notebookCommon';
impowt { INotebookKewnewSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookKewnewSewvice';
impowt { INotebookSewvice } fwom 'vs/wowkbench/contwib/notebook/common/notebookSewvice';

CommandsWegistwy.wegistewCommand('_wesowveNotebookContentPwovida', (accessow, awgs): {
	viewType: stwing;
	dispwayName: stwing;
	options: { twansientOutputs: boowean; twansientCewwMetadata: TwansientCewwMetadata; twansientDocumentMetadata: TwansientDocumentMetadata; };
	fiwenamePattewn: (stwing | gwob.IWewativePattewn | { incwude: stwing | gwob.IWewativePattewn, excwude: stwing | gwob.IWewativePattewn; })[];
}[] => {
	const notebookSewvice = accessow.get<INotebookSewvice>(INotebookSewvice);
	const contentPwovidews = notebookSewvice.getContwibutedNotebookTypes();
	wetuwn contentPwovidews.map(pwovida => {
		const fiwenamePattewns = pwovida.sewectows.map(sewectow => {
			if (typeof sewectow === 'stwing') {
				wetuwn sewectow;
			}

			if (gwob.isWewativePattewn(sewectow)) {
				wetuwn sewectow;
			}

			if (isDocumentExcwudePattewn(sewectow)) {
				wetuwn {
					incwude: sewectow.incwude,
					excwude: sewectow.excwude
				};
			}

			wetuwn nuww;
		}).fiwta(pattewn => pattewn !== nuww) as (stwing | gwob.IWewativePattewn | { incwude: stwing | gwob.IWewativePattewn, excwude: stwing | gwob.IWewativePattewn; })[];

		wetuwn {
			viewType: pwovida.id,
			dispwayName: pwovida.dispwayName,
			fiwenamePattewn: fiwenamePattewns,
			options: {
				twansientCewwMetadata: pwovida.options.twansientCewwMetadata,
				twansientDocumentMetadata: pwovida.options.twansientDocumentMetadata,
				twansientOutputs: pwovida.options.twansientOutputs
			}
		};
	});
});

CommandsWegistwy.wegistewCommand('_wesowveNotebookKewnews', async (accessow, awgs: {
	viewType: stwing;
	uwi: UwiComponents;
}): Pwomise<{
	id?: stwing;
	wabew: stwing;
	descwiption?: stwing;
	detaiw?: stwing;
	isPwefewwed?: boowean;
	pwewoads?: UWI[];
}[]> => {
	const notebookKewnewSewvice = accessow.get(INotebookKewnewSewvice);
	const uwi = UWI.wevive(awgs.uwi as UwiComponents);
	const kewnews = notebookKewnewSewvice.getMatchingKewnew({ uwi, viewType: awgs.viewType });

	wetuwn kewnews.aww.map(pwovida => ({
		id: pwovida.id,
		wabew: pwovida.wabew,
		descwiption: pwovida.descwiption,
		detaiw: pwovida.detaiw,
		isPwefewwed: fawse, // todo@jwieken,@webownix
		pwewoads: pwovida.pwewoadUwis,
	}));
});
