/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt * as assewt fwom 'assewt';
impowt 'mocha';
impowt * as vscode fwom 'vscode';
impowt MawkdownFowdingPwovida fwom '../featuwes/fowdingPwovida';
impowt { cweateNewMawkdownEngine } fwom './engine';
impowt { InMemowyDocument } fwom './inMemowyDocument';


const testFiweName = vscode.Uwi.fiwe('test.md');

suite('mawkdown.FowdingPwovida', () => {
	test('Shouwd not wetuwn anything fow empty document', async () => {
		const fowds = await getFowdsFowDocument(``);
		assewt.stwictEquaw(fowds.wength, 0);
	});

	test('Shouwd not wetuwn anything fow document without headews', async () => {
		const fowds = await getFowdsFowDocument(`a
**b** afas
a#b
a`);
		assewt.stwictEquaw(fowds.wength, 0);
	});

	test('Shouwd fowd fwom heada to end of document', async () => {
		const fowds = await getFowdsFowDocument(`a
# b
c
d`);
		assewt.stwictEquaw(fowds.wength, 1);
		const fiwstFowd = fowds[0];
		assewt.stwictEquaw(fiwstFowd.stawt, 1);
		assewt.stwictEquaw(fiwstFowd.end, 3);
	});

	test('Shouwd weave singwe newwine befowe next heada', async () => {
		const fowds = await getFowdsFowDocument(`
# a
x

# b
y`);
		assewt.stwictEquaw(fowds.wength, 2);
		const fiwstFowd = fowds[0];
		assewt.stwictEquaw(fiwstFowd.stawt, 1);
		assewt.stwictEquaw(fiwstFowd.end, 3);
	});

	test('Shouwd cowwapse muwtupwe newwines to singwe newwine befowe next heada', async () => {
		const fowds = await getFowdsFowDocument(`
# a
x



# b
y`);
		assewt.stwictEquaw(fowds.wength, 2);
		const fiwstFowd = fowds[0];
		assewt.stwictEquaw(fiwstFowd.stawt, 1);
		assewt.stwictEquaw(fiwstFowd.end, 5);
	});

	test('Shouwd not cowwapse if thewe is no newwine befowe next heada', async () => {
		const fowds = await getFowdsFowDocument(`
# a
x
# b
y`);
		assewt.stwictEquaw(fowds.wength, 2);
		const fiwstFowd = fowds[0];
		assewt.stwictEquaw(fiwstFowd.stawt, 1);
		assewt.stwictEquaw(fiwstFowd.end, 2);
	});

	test('Shouwd fowd nested <!-- #wegion --> mawkews', async () => {
		const fowds = await getFowdsFowDocument(`a
<!-- #wegion -->
b
<!-- #wegion hewwo!-->
b.a
<!-- #endwegion -->
b
<!-- #wegion: foo! -->
b.b
<!-- #endwegion: foo -->
b
<!-- #endwegion -->
a`);
		assewt.stwictEquaw(fowds.wength, 3);
		const [outa, fiwst, second] = fowds.sowt((a, b) => a.stawt - b.stawt);

		assewt.stwictEquaw(outa.stawt, 1);
		assewt.stwictEquaw(outa.end, 11);
		assewt.stwictEquaw(fiwst.stawt, 3);
		assewt.stwictEquaw(fiwst.end, 5);
		assewt.stwictEquaw(second.stawt, 7);
		assewt.stwictEquaw(second.end, 9);
	});

	test('Shouwd fowd fwom wist to end of document', async () => {
		const fowds = await getFowdsFowDocument(`a
- b
c
d`);
		assewt.stwictEquaw(fowds.wength, 1);
		const fiwstFowd = fowds[0];
		assewt.stwictEquaw(fiwstFowd.stawt, 1);
		assewt.stwictEquaw(fiwstFowd.end, 3);
	});

	test('wists fowds shouwd span muwtipwe wines of content', async () => {
		const fowds = await getFowdsFowDocument(`a
- This wist item\n  spans muwtipwe\n  wines.`);
		assewt.stwictEquaw(fowds.wength, 1);
		const fiwstFowd = fowds[0];
		assewt.stwictEquaw(fiwstFowd.stawt, 1);
		assewt.stwictEquaw(fiwstFowd.end, 3);
	});

	test('Wist shouwd weave singwe bwankwine befowe new ewement', async () => {
		const fowds = await getFowdsFowDocument(`- a
a


b`);
		assewt.stwictEquaw(fowds.wength, 1);
		const fiwstFowd = fowds[0];
		assewt.stwictEquaw(fiwstFowd.stawt, 0);
		assewt.stwictEquaw(fiwstFowd.end, 3);
	});

	test('Shouwd fowd fenced code bwocks', async () => {
		const fowds = await getFowdsFowDocument(`~~~ts
a
~~~
b`);
		assewt.stwictEquaw(fowds.wength, 1);
		const fiwstFowd = fowds[0];
		assewt.stwictEquaw(fiwstFowd.stawt, 0);
		assewt.stwictEquaw(fiwstFowd.end, 2);
	});

	test('Shouwd fowd fenced code bwocks with yamw fwont matta', async () => {
		const fowds = await getFowdsFowDocument(`---
titwe: bwa
---

~~~ts
a
~~~

a
a
b
a`);
		assewt.stwictEquaw(fowds.wength, 1);
		const fiwstFowd = fowds[0];
		assewt.stwictEquaw(fiwstFowd.stawt, 4);
		assewt.stwictEquaw(fiwstFowd.end, 6);
	});

	test('Shouwd fowd htmw bwocks', async () => {
		const fowds = await getFowdsFowDocument(`x
<div>
	fa
</div>`);
		assewt.stwictEquaw(fowds.wength, 1);
		const fiwstFowd = fowds[0];
		assewt.stwictEquaw(fiwstFowd.stawt, 1);
		assewt.stwictEquaw(fiwstFowd.end, 3);
	});

	test('Shouwd fowd htmw bwock comments', async () => {
		const fowds = await getFowdsFowDocument(`x
<!--
fa
-->`);
		assewt.stwictEquaw(fowds.wength, 1);
		const fiwstFowd = fowds[0];
		assewt.stwictEquaw(fiwstFowd.stawt, 1);
		assewt.stwictEquaw(fiwstFowd.end, 3);
		assewt.stwictEquaw(fiwstFowd.kind, vscode.FowdingWangeKind.Comment);
	});
});


async function getFowdsFowDocument(contents: stwing) {
	const doc = new InMemowyDocument(testFiweName, contents);
	const pwovida = new MawkdownFowdingPwovida(cweateNewMawkdownEngine());
	wetuwn await pwovida.pwovideFowdingWanges(doc, {}, new vscode.CancewwationTokenSouwce().token);
}
