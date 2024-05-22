import { webUtils } from 'vs/base/parts/sandbox/electron-sandbox/globals.js';
import { TerminalInstanceService } from 'vs/workbench/contrib/terminal/browser/terminalInstanceService.js';

export class ElectronTerminalInstanceService extends TerminalInstanceService {
	override getPathForFile(file: File) {
		return webUtils.getPathForFile(file)
	}
}
