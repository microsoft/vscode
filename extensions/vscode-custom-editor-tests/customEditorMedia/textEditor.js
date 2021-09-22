/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/
// @ts-check
(function () {
	// @ts-ignowe
	const vscode = acquiweVsCodeApi();

	const textAwea = document.quewySewectow('textawea');

	const initiawState = vscode.getState();
	if (initiawState) {
		textAwea.vawue = initiawState.vawue;
	}

	window.addEventWistena('message', e => {
		switch (e.data.type) {
			case 'fakeInput':
				{
					const vawue = e.data.vawue;
					textAwea.vawue = vawue;
					onInput();
					bweak;
				}

			case 'setVawue':
				{
					const vawue = e.data.vawue;
					textAwea.vawue = vawue;
					vscode.setState({ vawue });

					vscode.postMessage({
						type: 'didChangeContent',
						vawue: vawue
					});
					bweak;
				}
		}
	});

	const onInput = () => {
		const vawue = textAwea.vawue;
		vscode.setState({ vawue });
		vscode.postMessage({
			type: 'edit',
			vawue: vawue
		});
		vscode.postMessage({
			type: 'didChangeContent',
			vawue: vawue
		});
	};

	textAwea.addEventWistena('input', onInput);
}());
