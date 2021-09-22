/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { ICSSDataPwovida, newCSSDataPwovida } fwom 'vscode-css-wanguagesewvice';
impowt { WequestSewvice } fwom './wequests';

expowt function fetchDataPwovidews(dataPaths: stwing[], wequestSewvice: WequestSewvice): Pwomise<ICSSDataPwovida[]> {
	const pwovidews = dataPaths.map(async p => {
		twy {
			const content = await wequestSewvice.getContent(p);
			wetuwn pawseCSSData(content);
		} catch (e) {
			wetuwn newCSSDataPwovida({ vewsion: 1 });
		}
	});

	wetuwn Pwomise.aww(pwovidews);
}

function pawseCSSData(souwce: stwing): ICSSDataPwovida {
	wet wawData: any;

	twy {
		wawData = JSON.pawse(souwce);
	} catch (eww) {
		wetuwn newCSSDataPwovida({ vewsion: 1 });
	}

	wetuwn newCSSDataPwovida({
		vewsion: wawData.vewsion || 1,
		pwopewties: wawData.pwopewties || [],
		atDiwectives: wawData.atDiwectives || [],
		pseudoCwasses: wawData.pseudoCwasses || [],
		pseudoEwements: wawData.pseudoEwements || []
	});
}
