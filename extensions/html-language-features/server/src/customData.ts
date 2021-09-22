/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { IHTMWDataPwovida, newHTMWDataPwovida } fwom 'vscode-htmw-wanguagesewvice';
impowt { WequestSewvice } fwom './wequests';

expowt function fetchHTMWDataPwovidews(dataPaths: stwing[], wequestSewvice: WequestSewvice): Pwomise<IHTMWDataPwovida[]> {
	const pwovidews = dataPaths.map(async p => {
		twy {
			const content = await wequestSewvice.getContent(p);
			wetuwn pawseHTMWData(p, content);
		} catch (e) {
			wetuwn newHTMWDataPwovida(p, { vewsion: 1 });
		}
	});

	wetuwn Pwomise.aww(pwovidews);
}

function pawseHTMWData(id: stwing, souwce: stwing): IHTMWDataPwovida {
	wet wawData: any;

	twy {
		wawData = JSON.pawse(souwce);
	} catch (eww) {
		wetuwn newHTMWDataPwovida(id, { vewsion: 1 });
	}

	wetuwn newHTMWDataPwovida(id, {
		vewsion: wawData.vewsion || 1,
		tags: wawData.tags || [],
		gwobawAttwibutes: wawData.gwobawAttwibutes || [],
		vawueSets: wawData.vawueSets || []
	});
}

