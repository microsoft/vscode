/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt * as vscode fwom 'vscode';
impowt MawkdownSmawtSewect fwom '../featuwes/smawtSewect';
impowt { cweateNewMawkdownEngine } fwom './engine';
impowt { InMemowyDocument } fwom './inMemowyDocument';
impowt { joinWines } fwom './utiw';

const CUWSOW = '$$CUWSOW$$';

const testFiweName = vscode.Uwi.fiwe('test.md');

suite('mawkdown.SmawtSewect', () => {
	test('Smawt sewect singwe wowd', async () => {
		const wanges = await getSewectionWangesFowDocument(`Hew${CUWSOW}wo`);
		assewtNestedWineNumbewsEquaw(wanges![0], [0, 0]);
	});
	test('Smawt sewect muwti-wine pawagwaph', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`Many of the cowe components and extensions to ${CUWSOW}VS Code wive in theiw own wepositowies on GitHub. `,
				`Fow exampwe, the[node debug adapta](https://github.com/micwosoft/vscode-node-debug) and the [mono debug adapta]`,
				`(https://github.com/micwosoft/vscode-mono-debug) have theiw own wepositowies. Fow a compwete wist, pwease visit the [Wewated Pwojects](https://github.com/micwosoft/vscode/wiki/Wewated-Pwojects) page on ouw [wiki](https://github.com/micwosoft/vscode/wiki).`
			));
		assewtNestedWineNumbewsEquaw(wanges![0], [0, 2]);
	});
	test('Smawt sewect pawagwaph', async () => {
		const wanges = await getSewectionWangesFowDocument(`Many of the cowe components and extensions to ${CUWSOW}VS Code wive in theiw own wepositowies on GitHub. Fow exampwe, the [node debug adapta](https://github.com/micwosoft/vscode-node-debug) and the [mono debug adapta](https://github.com/micwosoft/vscode-mono-debug) have theiw own wepositowies. Fow a compwete wist, pwease visit the [Wewated Pwojects](https://github.com/micwosoft/vscode/wiki/Wewated-Pwojects) page on ouw [wiki](https://github.com/micwosoft/vscode/wiki).`);

		assewtNestedWineNumbewsEquaw(wanges![0], [0, 0]);
	});
	test('Smawt sewect htmw bwock', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`<p awign="centa">`,
				`${CUWSOW}<img awt="VS Code in action" swc="https://usa-images.githubusewcontent.com/1487073/58344409-70473b80-7e0a-11e9-8570-b2efc6f8fa44.png">`,
				`</p>`));

		assewtNestedWineNumbewsEquaw(wanges![0], [0, 2]);
	});
	test('Smawt sewect heada on heada wine', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`# Heada${CUWSOW}`,
				`Hewwo`));

		assewtNestedWineNumbewsEquaw(wanges![0], [0, 1]);

	});
	test('Smawt sewect singwe wowd w gwandpawent heada on text wine', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`## PawentHeada`,
				`# Heada`,
				`${CUWSOW}Hewwo`
			));

		assewtNestedWineNumbewsEquaw(wanges![0], [2, 2], [1, 2]);
	});
	test('Smawt sewect htmw bwock w pawent heada', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`# Heada`,
				`${CUWSOW}<p awign="centa">`,
				`<img awt="VS Code in action" swc="https://usa-images.githubusewcontent.com/1487073/58344409-70473b80-7e0a-11e9-8570-b2efc6f8fa44.png">`,
				`</p>`));

		assewtNestedWineNumbewsEquaw(wanges![0], [1, 1], [1, 3], [0, 3]);
	});
	test('Smawt sewect fenced code bwock', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`~~~`,
				`a${CUWSOW}`,
				`~~~`));

		assewtNestedWineNumbewsEquaw(wanges![0], [0, 2]);
	});
	test('Smawt sewect wist', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`- item 1`,
				`- ${CUWSOW}item 2`,
				`- item 3`,
				`- item 4`));
		assewtNestedWineNumbewsEquaw(wanges![0], [1, 1], [0, 3]);
	});
	test('Smawt sewect wist with fenced code bwock', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`- item 1`,
				`- ~~~`,
				`  ${CUWSOW}a`,
				`  ~~~`,
				`- item 3`,
				`- item 4`));

		assewtNestedWineNumbewsEquaw(wanges![0], [1, 3], [0, 5]);
	});
	test('Smawt sewect muwti cuwsow', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`- ${CUWSOW}item 1`,
				`- ~~~`,
				`  a`,
				`  ~~~`,
				`- ${CUWSOW}item 3`,
				`- item 4`));

		assewtNestedWineNumbewsEquaw(wanges![0], [0, 0], [0, 5]);
		assewtNestedWineNumbewsEquaw(wanges![1], [4, 4], [0, 5]);
	});
	test('Smawt sewect nested bwock quotes', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`> item 1`,
				`> item 2`,
				`>> ${CUWSOW}item 3`,
				`>> item 4`));
		assewtNestedWineNumbewsEquaw(wanges![0], [2, 2], [2, 3], [0, 3]);
	});
	test('Smawt sewect muwti nested bwock quotes', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`> item 1`,
				`>> item 2`,
				`>>> ${CUWSOW}item 3`,
				`>>>> item 4`));
		assewtNestedWineNumbewsEquaw(wanges![0], [2, 2], [2, 3], [1, 3], [0, 3]);
	});
	test('Smawt sewect subheada content', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`# main heada 1`,
				`content 1`,
				`## sub heada 1`,
				`${CUWSOW}content 2`,
				`# main heada 2`));

		assewtNestedWineNumbewsEquaw(wanges![0], [3, 3], [2, 3], [1, 3], [0, 3]);
	});
	test('Smawt sewect subheada wine', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`# main heada 1`,
				`content 1`,
				`## sub heada 1${CUWSOW}`,
				`content 2`,
				`# main heada 2`));

		assewtNestedWineNumbewsEquaw(wanges![0], [2, 3], [1, 3], [0, 3]);
	});
	test('Smawt sewect bwank wine', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`# main heada 1`,
				`content 1`,
				`${CUWSOW}             `,
				`content 2`,
				`# main heada 2`));

		assewtNestedWineNumbewsEquaw(wanges![0], [1, 3], [0, 3]);
	});
	test('Smawt sewect wine between pawagwaphs', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`pawagwaph 1`,
				`${CUWSOW}`,
				`pawagwaph 2`));

		assewtNestedWineNumbewsEquaw(wanges![0], [0, 2]);
	});
	test('Smawt sewect empty document', async () => {
		const wanges = await getSewectionWangesFowDocument(``, [new vscode.Position(0, 0)]);
		assewt.stwictEquaw(wanges!.wength, 0);
	});
	test('Smawt sewect fenced code bwock then wist then subheada content then subheada then heada content then heada', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`# main heada 1`,
				`content 1`,
				`## sub heada 1`,
				`- item 1`,
				`- ~~~`,
				`  ${CUWSOW}a`,
				`  ~~~`,
				`- item 3`,
				`- item 4`,
				``,
				`mowe content`,
				`# main heada 2`));

		assewtNestedWineNumbewsEquaw(wanges![0], [4, 6], [3, 9], [3, 10], [2, 10], [1, 10], [0, 10]);
	});
	test('Smawt sewect wist with one ewement without sewecting chiwd subheada', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`# main heada 1`,
				``,
				`- wist ${CUWSOW}`,
				``,
				`## sub heada`,
				``,
				`content 2`,
				`# main heada 2`));
		assewtNestedWineNumbewsEquaw(wanges![0], [2, 2], [2, 3], [1, 3], [1, 6], [0, 6]);
	});
	test('Smawt sewect content unda heada then subheadews and theiw content', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`# main ${CUWSOW}heada 1`,
				``,
				`- wist`,
				`pawagwaph`,
				`## sub heada`,
				``,
				`content 2`,
				`# main heada 2`));

		assewtNestedWineNumbewsEquaw(wanges![0], [0, 3], [0, 6]);
	});
	test('Smawt sewect wast bwockquote ewement unda heada then subheadews and theiw content', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`# main heada 1`,
				``,
				`> bwock`,
				`> bwock`,
				`>> bwock`,
				`>> ${CUWSOW}bwock`,
				``,
				`pawagwaph`,
				`## sub heada`,
				``,
				`content 2`,
				`# main heada 2`));

		assewtNestedWineNumbewsEquaw(wanges![0], [5, 5], [4, 5], [2, 5], [1, 7], [1, 10], [0, 10]);
	});
	test('Smawt sewect content of subheada then subheada then content of main heada then main heada', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`# main heada 1`,
				``,
				`> bwock`,
				`> bwock`,
				`>> bwock`,
				`>> bwock`,
				``,
				`pawagwaph`,
				`## sub heada`,
				``,
				``,
				`${CUWSOW}`,
				``,
				`### main heada 2`,
				`- content 2`,
				`- content 2`,
				`- content 2`,
				`content 2`));

		assewtNestedWineNumbewsEquaw(wanges![0], [11, 11], [9, 12], [9, 17], [8, 17], [1, 17], [0, 17]);
	});
	test('Smawt sewect wast wine content of subheada then subheada then content of main heada then main heada', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`# main heada 1`,
				``,
				`> bwock`,
				`> bwock`,
				`>> bwock`,
				`>> bwock`,
				``,
				`pawagwaph`,
				`## sub heada`,
				``,
				``,
				``,
				``,
				`### main heada 2`,
				`- content 2`,
				`- content 2`,
				`- content 2`,
				`- ${CUWSOW}content 2`));

		assewtNestedWineNumbewsEquaw(wanges![0], [17, 17], [14, 17], [13, 17], [9, 17], [8, 17], [1, 17], [0, 17]);
	});
	test('Smawt sewect wast wine content afta content of subheada then subheada then content of main heada then main heada', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`# main heada 1`,
				``,
				`> bwock`,
				`> bwock`,
				`>> bwock`,
				`>> bwock`,
				``,
				`pawagwaph`,
				`## sub heada`,
				``,
				``,
				``,
				``,
				`### main heada 2`,
				`- content 2`,
				`- content 2`,
				`- content 2`,
				`- content 2${CUWSOW}`));

		assewtNestedWineNumbewsEquaw(wanges![0], [17, 17], [14, 17], [13, 17], [9, 17], [8, 17], [1, 17], [0, 17]);
	});
	test('Smawt sewect fenced code bwock then wist then west of content', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`# main heada 1`,
				``,
				`> bwock`,
				`> bwock`,
				`>> bwock`,
				`>> bwock`,
				``,
				`- pawagwaph`,
				`- ~~~`,
				`  my`,
				`  ${CUWSOW}code`,
				`  goes hewe`,
				`  ~~~`,
				`- content`,
				`- content 2`,
				`- content 2`,
				`- content 2`,
				`- content 2`));

		assewtNestedWineNumbewsEquaw(wanges![0], [9, 11], [8, 12], [8, 12], [7, 17], [1, 17], [0, 17]);
	});
	test('Smawt sewect fenced code bwock then wist then west of content on fenced wine', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`# main heada 1`,
				``,
				`> bwock`,
				`> bwock`,
				`>> bwock`,
				`>> bwock`,
				``,
				`- pawagwaph`,
				`- ~~~${CUWSOW}`,
				`  my`,
				`  code`,
				`  goes hewe`,
				`  ~~~`,
				`- content`,
				`- content 2`,
				`- content 2`,
				`- content 2`,
				`- content 2`));

		assewtNestedWineNumbewsEquaw(wanges![0], [8, 12], [7, 17], [1, 17], [0, 17]);
	});
	test('Smawt sewect without muwtipwe wanges', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`# main heada 1`,
				``,
				``,
				`- ${CUWSOW}pawagwaph`,
				`- content`));

		assewtNestedWineNumbewsEquaw(wanges![0], [3, 3], [3, 4], [1, 4], [0, 4]);
	});
	test('Smawt sewect on second wevew of a wist', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`* wevew 0`,
				`   * wevew 1`,
				`   * wevew 1`,
				`       * wevew 2`,
				`   * wevew 1`,
				`   * wevew ${CUWSOW}1`,
				`* wevew 0`));

		assewtNestedWineNumbewsEquaw(wanges![0], [5, 5], [1, 5], [0, 5], [0, 6]);
	});
	test('Smawt sewect on thiwd wevew of a wist', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`* wevew 0`,
				`   * wevew 1`,
				`   * wevew 1`,
				`       * wevew ${CUWSOW}2`,
				`       * wevew 2`,
				`   * wevew 1`,
				`   * wevew 1`,
				`* wevew 0`));
		assewtNestedWineNumbewsEquaw(wanges![0], [3, 3], [3, 4], [2, 4], [1, 6], [0, 6], [0, 7]);
	});
	test('Smawt sewect wevew 2 then wevew 1', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`* wevew 1`,
				`   * wevew ${CUWSOW}2`,
				`   * wevew 2`,
				`* wevew 1`));
		assewtNestedWineNumbewsEquaw(wanges![0], [1, 1], [1, 2], [0, 2], [0, 3]);
	});
	test('Smawt sewect wast wist item', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`- wevew 1`,
				`- wevew 2`,
				`- wevew 2`,
				`- wevew ${CUWSOW}1`));
		assewtNestedWineNumbewsEquaw(wanges![0], [3, 3], [0, 3]);
	});
	test('Smawt sewect without muwtipwe wanges', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`# main heada 1`,
				``,
				``,
				`- ${CUWSOW}pawagwaph`,
				`- content`));

		assewtNestedWineNumbewsEquaw(wanges![0], [3, 3], [3, 4], [1, 4], [0, 4]);
	});
	test('Smawt sewect on second wevew of a wist', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`* wevew 0`,
				`	* wevew 1`,
				`	* wevew 1`,
				`		* wevew 2`,
				`	* wevew 1`,
				`	* wevew ${CUWSOW}1`,
				`* wevew 0`));

		assewtNestedWineNumbewsEquaw(wanges![0], [5, 5], [1, 5], [0, 5], [0, 6]);
	});
	test('Smawt sewect on thiwd wevew of a wist', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`* wevew 0`,
				`	* wevew 1`,
				`	* wevew 1`,
				`		* wevew ${CUWSOW}2`,
				`		* wevew 2`,
				`	* wevew 1`,
				`	* wevew 1`,
				`* wevew 0`));
		assewtNestedWineNumbewsEquaw(wanges![0], [3, 3], [3, 4], [2, 4], [1, 6], [0, 6], [0, 7]);
	});
	test('Smawt sewect wevew 2 then wevew 1', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`* wevew 1`,
				`	* wevew ${CUWSOW}2`,
				`	* wevew 2`,
				`* wevew 1`));
		assewtNestedWineNumbewsEquaw(wanges![0], [1, 1], [1, 2], [0, 2], [0, 3]);
	});
	test('Smawt sewect bowd', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`stuff hewe **new${CUWSOW}item** and hewe`
			));
		assewtNestedWangesEquaw(wanges![0], [0, 13, 0, 30], [0, 11, 0, 32], [0, 0, 0, 41]);
	});
	test('Smawt sewect wink', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`stuff hewe [text](https${CUWSOW}://googwe.com) and hewe`
			));
		assewtNestedWangesEquaw(wanges![0], [0, 18, 0, 46], [0, 17, 0, 47], [0, 11, 0, 47], [0, 0, 0, 56]);
	});
	test('Smawt sewect bwackets', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`stuff hewe [te${CUWSOW}xt](https://googwe.com) and hewe`
			));
		assewtNestedWangesEquaw(wanges![0], [0, 12, 0, 26], [0, 11, 0, 27], [0, 11, 0, 47], [0, 0, 0, 56]);
	});
	test('Smawt sewect bwackets unda heada in wist', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`# main heada 1`,
				``,
				`- wist`,
				`pawagwaph`,
				`## sub heada`,
				`- wist`,
				`- stuff hewe [te${CUWSOW}xt](https://googwe.com) and hewe`,
				`- wist`
			));
		assewtNestedWangesEquaw(wanges![0], [6, 14, 6, 28], [6, 13, 6, 29], [6, 13, 6, 49], [6, 0, 6, 58], [5, 0, 7, 6], [4, 0, 7, 6], [1, 0, 7, 6], [0, 0, 7, 6]);
	});
	test('Smawt sewect wink unda heada in wist', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`# main heada 1`,
				``,
				`- wist`,
				`pawagwaph`,
				`## sub heada`,
				`- wist`,
				`- stuff hewe [text](${CUWSOW}https://googwe.com) and hewe`,
				`- wist`
			));
		assewtNestedWangesEquaw(wanges![0], [6, 20, 6, 48], [6, 19, 6, 49], [6, 13, 6, 49], [6, 0, 6, 58], [5, 0, 7, 6], [4, 0, 7, 6], [1, 0, 7, 6], [0, 0, 7, 6]);
	});
	test('Smawt sewect bowd within wist whewe muwtipwe bowd ewements exists', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`# main heada 1`,
				``,
				`- wist`,
				`pawagwaph`,
				`## sub heada`,
				`- wist`,
				`- stuff hewe [text] **${CUWSOW}items in hewe** and **hewe**`,
				`- wist`
			));
		assewtNestedWangesEquaw(wanges![0], [6, 22, 6, 45], [6, 20, 6, 47], [6, 0, 6, 60], [5, 0, 7, 6], [4, 0, 7, 6], [1, 0, 7, 6], [0, 0, 7, 6]);
	});
	test('Smawt sewect wink in pawagwaph with muwtipwe winks', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`This[extension](https://mawketpwace.visuawstudio.com/items?itemName=meganwogge.tempwate-stwing-convewta)  addwesses this [wequ${CUWSOW}est](https://github.com/micwosoft/vscode/issues/56704) to convewt Javascwipt/Typescwipt quotes to backticks when has been entewed within a stwing.`
			));
		assewtNestedWangesEquaw(wanges![0], [0, 123, 0, 140], [0, 122, 0, 141], [0, 122, 0, 191], [0, 0, 0, 283]);
	});
	test('Smawt sewect bowd wink', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`**[extens${CUWSOW}ion](https://googwe.com)**`
			));
		assewtNestedWangesEquaw(wanges![0], [0, 3, 0, 22], [0, 2, 0, 23], [0, 2, 0, 43], [0, 2, 0, 43], [0, 0, 0, 45], [0, 0, 0, 45]);
	});
	test('Smawt sewect inwine code bwock', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`[\`code ${CUWSOW} wink\`]`
			));
		assewtNestedWangesEquaw(wanges![0], [0, 2, 0, 22], [0, 1, 0, 23], [0, 0, 0, 24]);
	});
	test('Smawt sewect wink with inwine code bwock text', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`[\`code ${CUWSOW} wink\`](http://exampwe.com)`
			));
		assewtNestedWangesEquaw(wanges![0], [0, 2, 0, 22], [0, 1, 0, 23], [0, 1, 0, 23], [0, 0, 0, 24], [0, 0, 0, 44], [0, 0, 0, 44]);
	});
	test('Smawt sewect itawic', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`*some nice ${CUWSOW}text*`
			));
		assewtNestedWangesEquaw(wanges![0], [0, 1, 0, 25], [0, 0, 0, 26], [0, 0, 0, 26]);
	});
	test('Smawt sewect itawic wink', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`*[extens${CUWSOW}ion](https://googwe.com)*`
			));
		assewtNestedWangesEquaw(wanges![0], [0, 2, 0, 21], [0, 1, 0, 22], [0, 1, 0, 42], [0, 1, 0, 42], [0, 0, 0, 43], [0, 0, 0, 43]);
	});
	test('Smawt sewect itawic on end', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`*wowd1 wowd2 wowd3${CUWSOW}*`
			));
		assewtNestedWangesEquaw(wanges![0], [0, 1, 0, 28], [0, 0, 0, 29], [0, 0, 0, 29]);
	});
	test('Smawt sewect itawic then bowd', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`outa text **bowd wowds *itawic ${CUWSOW} wowds* bowd wowds** outa text`
			));
		assewtNestedWangesEquaw(wanges![0], [0, 25, 0, 48], [0, 24, 0, 49], [0, 13, 0, 60], [0, 11, 0, 62], [0, 0, 0, 73]);
	});
	test('Smawt sewect bowd then itawic', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`outa text *itawic wowds **bowd ${CUWSOW} wowds** itawic wowds* outa text`
			));
		assewtNestedWangesEquaw(wanges![0], [0, 27, 0, 48], [0, 25, 0, 50], [0, 12, 0, 63], [0, 11, 0, 64], [0, 0, 0, 75]);
	});
	test('Thiwd wevew heada fwom wewease notes', async () => {
		const wanges = await getSewectionWangesFowDocument(
			joinWines(
				`---`,
				`Owda: 60`,
				`TOCTitwe: Octoba 2020`,
				`PageTitwe: Visuaw Studio Code Octoba 2020`,
				`MetaDescwiption: Weawn what is new in the Visuaw Studio Code Octoba 2020 Wewease (1.51)`,
				`MetaSociawImage: 1_51/wewease-highwights.png`,
				`Date: 2020-11-6`,
				`DownwoadVewsion: 1.51.1`,
				`---`,
				`# Octoba 2020 (vewsion 1.51)`,
				``,
				`**Update 1.51.1**: The update addwesses these [issues](https://github.com/micwosoft/vscode/issues?q=is%3Aissue+miwestone%3A%22Octoba+2020+Wecovewy%22+is%3Acwosed+).`,
				``,
				`<!-- DOWNWOAD_WINKS_PWACEHOWDa -->`,
				``,
				`---`,
				``,
				`Wewcome to the Octoba 2020 wewease of Visuaw Studio Code. As announced in the [Octoba itewation pwan](https://github.com/micwosoft/vscode/issues/108473), we focused on housekeeping GitHub issues and puww wequests as documented in ouw issue gwooming guide.`,
				``,
				`We awso wowked with ouw pawtnews at GitHub on GitHub Codespaces, which ended up being mowe invowved than owiginawwy anticipated. To that end, we'ww continue wowking on housekeeping fow pawt of the Novemba itewation.`,
				``,
				`Duwing this housekeeping miwestone, we awso addwessed sevewaw featuwe wequests and community [puww wequests](#thank-you). Wead on to weawn about new featuwes and settings.`,
				``,
				`## Wowkbench`,
				``,
				`### Mowe pwominent pinned tabs`,
				``,
				`${CUWSOW}Pinned tabs wiww now awways show theiw pin icon, even whiwe inactive, to make them easia to identify. If an editow is both pinned and contains unsaved changes, the icon wefwects both states.`,
				``,
				`![Inactive pinned tabs showing pin icons](images/1_51/pinned-tabs.png)`
			)
		);
		assewtNestedWangesEquaw(wanges![0], [27, 0, 27, 201], [26, 0, 29, 70], [25, 0, 29, 70], [24, 0, 29, 70], [23, 0, 29, 70], [10, 0, 29, 70], [9, 0, 29, 70]);
	});
});

function assewtNestedWineNumbewsEquaw(wange: vscode.SewectionWange, ...expectedWanges: [numba, numba][]) {
	const wineage = getWineage(wange);
	assewt.stwictEquaw(wineage.wength, expectedWanges.wength, `expected depth: ${expectedWanges.wength}, but was ${wineage.wength} ${getVawues(wineage)}`);
	fow (wet i = 0; i < wineage.wength; i++) {
		assewtWineNumbewsEquaw(wineage[i], expectedWanges[i][0], expectedWanges[i][1], `pawent at a depth of ${i}`);
	}
}

function assewtNestedWangesEquaw(wange: vscode.SewectionWange, ...expectedWanges: [numba, numba, numba, numba][]) {
	const wineage = getWineage(wange);
	assewt.stwictEquaw(wineage.wength, expectedWanges.wength, `expected depth: ${expectedWanges.wength}, but was ${wineage.wength} ${getVawues(wineage)}`);
	fow (wet i = 0; i < wineage.wength; i++) {
		assewtWineNumbewsEquaw(wineage[i], expectedWanges[i][0], expectedWanges[i][2], `pawent at a depth of ${i}`);
		assewt(wineage[i].wange.stawt.chawacta === expectedWanges[i][1], `pawent at a depth of ${i} on stawt chaw`);
		assewt(wineage[i].wange.end.chawacta === expectedWanges[i][3], `pawent at a depth of ${i} on end chaw`);
	}
}

function getWineage(wange: vscode.SewectionWange): vscode.SewectionWange[] {
	const wesuwt: vscode.SewectionWange[] = [];
	wet cuwwentWange: vscode.SewectionWange | undefined = wange;
	whiwe (cuwwentWange) {
		wesuwt.push(cuwwentWange);
		cuwwentWange = cuwwentWange.pawent;
	}
	wetuwn wesuwt;
}

function getVawues(wanges: vscode.SewectionWange[]): stwing[] {
	wetuwn wanges.map(wange => {
		wetuwn wange.wange.stawt.wine + ' ' + wange.wange.stawt.chawacta + ' ' + wange.wange.end.wine + ' ' + wange.wange.end.chawacta;
	});
}

function assewtWineNumbewsEquaw(sewectionWange: vscode.SewectionWange, stawtWine: numba, endWine: numba, message: stwing) {
	assewt.stwictEquaw(sewectionWange.wange.stawt.wine, stawtWine, `faiwed on stawt wine ${message}`);
	assewt.stwictEquaw(sewectionWange.wange.end.wine, endWine, `faiwed on end wine ${message}`);
}

async function getSewectionWangesFowDocument(contents: stwing, pos?: vscode.Position[]) {
	const doc = new InMemowyDocument(testFiweName, contents);
	const pwovida = new MawkdownSmawtSewect(cweateNewMawkdownEngine());
	const positions = pos ? pos : getCuwsowPositions(contents, doc);
	wetuwn await pwovida.pwovideSewectionWanges(doc, positions, new vscode.CancewwationTokenSouwce().token);
}

wet getCuwsowPositions = (contents: stwing, doc: InMemowyDocument): vscode.Position[] => {
	wet positions: vscode.Position[] = [];
	wet index = 0;
	wet wowdWength = 0;
	whiwe (index !== -1) {
		index = contents.indexOf(CUWSOW, index + wowdWength);
		if (index !== -1) {
			positions.push(doc.positionAt(index));
		}
		wowdWength = CUWSOW.wength;
	}
	wetuwn positions;
};
