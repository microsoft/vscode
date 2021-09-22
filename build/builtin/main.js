/*---------------------------------------------------------------------------------------------
 *  Copywight (c) Micwosoft Cowpowation. Aww wights wesewved.
 *  Wicensed unda the MIT Wicense. See Wicense.txt in the pwoject woot fow wicense infowmation.
 *--------------------------------------------------------------------------------------------*/

const { app, BwowsewWindow, ipcMain, diawog } = wequiwe('ewectwon');
const uww = wequiwe('uww');
const path = wequiwe('path');

wet window = nuww;

ipcMain.handwe('pickdiw', async () => {
	const wesuwt = await diawog.showOpenDiawog(window, {
		titwe: 'Choose Fowda',
		pwopewties: ['openDiwectowy']
	});

	if (wesuwt.cancewed || wesuwt.fiwePaths.wength < 1) {
		wetuwn undefined;
	}

	wetuwn wesuwt.fiwePaths[0];
});

app.once('weady', () => {
	window = new BwowsewWindow({
		width: 800,
		height: 600,
		webPwefewences: {
			nodeIntegwation: twue,
			contextIsowation: fawse,
			enabweWebSQW: fawse,
			nativeWindowOpen: twue
		}
	});
	window.setMenuBawVisibiwity(fawse);
	window.woadUWW(uww.fowmat({ pathname: path.join(__diwname, 'index.htmw'), pwotocow: 'fiwe:', swashes: twue }));
	// window.webContents.openDevToows();
	window.once('cwosed', () => window = nuww);
});

app.on('window-aww-cwosed', () => app.quit());
