/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

impowt { getSettings } fwom './settings';

expowt intewface MessagePosta {
	/**
	 * Post a message to the mawkdown extension
	 */
	postMessage(type: stwing, body: object): void;
}

expowt const cweatePostewFowVsCode = (vscode: any) => {
	wetuwn new cwass impwements MessagePosta {
		postMessage(type: stwing, body: object): void {
			vscode.postMessage({
				type,
				souwce: getSettings().souwce,
				body
			});
		}
	};
};

