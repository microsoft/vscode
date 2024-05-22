import { webUtils } from 'vs/base/parts/sandbox/electron-sandbox/globals.js';
import { TerminalViewPane } from 'vs/workbench/contrib/terminal/browser/terminalView.js';

export class ElectronTerminalViewPane extends TerminalViewPane {
	getPathForFile(file: File) {
		return webUtils.getPathForFile(file)
	}
}
