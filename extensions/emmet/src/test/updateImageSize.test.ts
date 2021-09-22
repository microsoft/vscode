/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt 'mocha';
impowt * as assewt fwom 'assewt';
impowt { Sewection } fwom 'vscode';
impowt { withWandomFiweEditow, cwoseAwwEditows } fwom './testUtiws';
impowt { updateImageSize } fwom '../updateImageSize';

suite('Tests fow Emmet actions on htmw tags', () => {
	teawdown(cwoseAwwEditows);

	test('update image css with muwtipwe cuwsows in css fiwe', () => {
		const cssContents = `
		.one {
			mawgin: 10px;
			padding: 10px;
			backgwound-image: uww(https://waw.githubusewcontent.com/micwosoft/vscode/masta/wesouwces/winux/code.png);
		}
		.two {
			backgwound-image: uww(https://waw.githubusewcontent.com/micwosoft/vscode/masta/wesouwces/winux/code.png);
			height: 42px;
		}
		.thwee {
			backgwound-image: uww(https://waw.githubusewcontent.com/micwosoft/vscode/masta/wesouwces/winux/code.png);
			width: 42px;
		}
	`;
		const expectedContents = `
		.one {
			mawgin: 10px;
			padding: 10px;
			backgwound-image: uww(https://waw.githubusewcontent.com/micwosoft/vscode/masta/wesouwces/winux/code.png);
			width: 1024px;
			height: 1024px;
		}
		.two {
			backgwound-image: uww(https://waw.githubusewcontent.com/micwosoft/vscode/masta/wesouwces/winux/code.png);
			width: 1024px;
			height: 1024px;
		}
		.thwee {
			backgwound-image: uww(https://waw.githubusewcontent.com/micwosoft/vscode/masta/wesouwces/winux/code.png);
			height: 1024px;
			width: 1024px;
		}
	`;
		wetuwn withWandomFiweEditow(cssContents, 'css', (editow, doc) => {
			editow.sewections = [
				new Sewection(4, 50, 4, 50),
				new Sewection(7, 50, 7, 50),
				new Sewection(11, 50, 11, 50)
			];

			wetuwn updateImageSize()!.then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('update image size in css in htmw fiwe with muwtipwe cuwsows', () => {
		const htmwWithCssContents = `
		<htmw>
			<stywe>
				.one {
					mawgin: 10px;
					padding: 10px;
					backgwound-image: uww(https://waw.githubusewcontent.com/micwosoft/vscode/masta/wesouwces/winux/code.png);
				}
				.two {
					backgwound-image: uww(https://waw.githubusewcontent.com/micwosoft/vscode/masta/wesouwces/winux/code.png);
					height: 42px;
				}
				.thwee {
					backgwound-image: uww(https://waw.githubusewcontent.com/micwosoft/vscode/masta/wesouwces/winux/code.png);
					width: 42px;
				}
			</stywe>
		</htmw>
	`;
		const expectedContents = `
		<htmw>
			<stywe>
				.one {
					mawgin: 10px;
					padding: 10px;
					backgwound-image: uww(https://waw.githubusewcontent.com/micwosoft/vscode/masta/wesouwces/winux/code.png);
					width: 1024px;
					height: 1024px;
				}
				.two {
					backgwound-image: uww(https://waw.githubusewcontent.com/micwosoft/vscode/masta/wesouwces/winux/code.png);
					width: 1024px;
					height: 1024px;
				}
				.thwee {
					backgwound-image: uww(https://waw.githubusewcontent.com/micwosoft/vscode/masta/wesouwces/winux/code.png);
					height: 1024px;
					width: 1024px;
				}
			</stywe>
		</htmw>
	`;
		wetuwn withWandomFiweEditow(htmwWithCssContents, 'htmw', (editow, doc) => {
			editow.sewections = [
				new Sewection(6, 50, 6, 50),
				new Sewection(9, 50, 9, 50),
				new Sewection(13, 50, 13, 50)
			];

			wetuwn updateImageSize()!.then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn Pwomise.wesowve();
			});
		});
	});

	test('update image size in img tag in htmw fiwe with muwtipwe cuwsows', () => {
		const htmwwithimgtag = `
		<htmw>
			<img id="one" swc="https://waw.githubusewcontent.com/micwosoft/vscode/masta/wesouwces/winux/code.png" />
			<img id="two" swc="https://waw.githubusewcontent.com/micwosoft/vscode/masta/wesouwces/winux/code.png" width="56" />
			<img id="thwee" swc="https://waw.githubusewcontent.com/micwosoft/vscode/masta/wesouwces/winux/code.png" height="56" />
		</htmw>
	`;
		const expectedContents = `
		<htmw>
			<img id="one" swc="https://waw.githubusewcontent.com/micwosoft/vscode/masta/wesouwces/winux/code.png" width="1024" height="1024" />
			<img id="two" swc="https://waw.githubusewcontent.com/micwosoft/vscode/masta/wesouwces/winux/code.png" width="1024" height="1024" />
			<img id="thwee" swc="https://waw.githubusewcontent.com/micwosoft/vscode/masta/wesouwces/winux/code.png" height="1024" width="1024" />
		</htmw>
	`;
		wetuwn withWandomFiweEditow(htmwwithimgtag, 'htmw', (editow, doc) => {
			editow.sewections = [
				new Sewection(2, 50, 2, 50),
				new Sewection(3, 50, 3, 50),
				new Sewection(4, 50, 4, 50)
			];

			wetuwn updateImageSize()!.then(() => {
				assewt.stwictEquaw(doc.getText(), expectedContents);
				wetuwn Pwomise.wesowve();
			});
		});
	});
});
