/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { URI } from '../../../../base/common/uri.js';
import { isMacintosh, isLinux, isWindows } from '../../../../base/common/platform.js';
import { Schemas } from '../../../../base/common/network.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { ILogService } from '../../../../platform/log/common/log.js';

export class NativeClipboardService implements IClipboardService {

	private static readonly FILE_FORMAT = 'code/file-list'; // Clipboard format for files
	private static readonly MAC_FILE_FORMAT = 'NSFilenamesPboardType'; // macOS Finder clipboard format
	private static readonly LINUX_FILE_FORMAT = 'text/uri-list'; // freedesktop.org clipboard format for file managers
	private static readonly WINDOWS_FILE_FORMAT = 'FileNameW'; // Windows Explorer clipboard format (single file, UTF-16LE)

	declare readonly _serviceBrand: undefined;

	constructor(
		@INativeHostService private readonly nativeHostService: INativeHostService,
		@ILogService private readonly logService: ILogService
	) { }

	async triggerPaste(targetWindowId: number): Promise<void> {
		this.logService.trace('NativeClipboardService#triggerPaste called');
		return this.nativeHostService.triggerPaste({ targetWindowId });
	}

	async readImage(): Promise<Uint8Array> {
		return this.nativeHostService.readImage();
	}

	async writeText(text: string, type?: 'selection' | 'clipboard'): Promise<void> {
		this.logService.trace('NativeClipboardService#writeText called with type:', type, ' with text.length:', text.length);
		return this.nativeHostService.writeClipboardText(text, type);
	}

	async readText(type?: 'selection' | 'clipboard'): Promise<string> {
		this.logService.trace('NativeClipboardService#readText called with type:', type);
		return this.nativeHostService.readClipboardText(type);
	}

	async readFindText(): Promise<string> {
		if (isMacintosh) {
			return this.nativeHostService.readClipboardFindText();
		}

		return '';
	}

	async writeFindText(text: string): Promise<void> {
		if (isMacintosh) {
			return this.nativeHostService.writeClipboardFindText(text);
		}
	}

	async writeResources(resources: URI[]): Promise<void> {
		if (!resources.length) {
			return;
		}

		const allLocal = resources.every(r => r.scheme === Schemas.file);

		// When all resources are local files, write in the platform's native
		// file clipboard format so that native file managers can paste them.
		// Electron's clipboard API only supports one buffer format per call,
		// so we pick the most useful one.
		if (allLocal) {
			if (isMacintosh) {
				const plist = this.filesToPlist(resources.map(r => r.fsPath));
				return this.nativeHostService.writeClipboardBuffer(
					NativeClipboardService.MAC_FILE_FORMAT,
					VSBuffer.fromString(plist)
				);
			}
			if (isLinux) {
				const uriList = resources.map(r => r.toString()).join('\r\n');
				return this.nativeHostService.writeClipboardBuffer(
					NativeClipboardService.LINUX_FILE_FORMAT,
					VSBuffer.fromString(uriList)
				);
			}
			if (isWindows && resources.length === 1) {
				// FileNameW supports a single null-terminated UTF-16LE file path.
				// For multiple files CF_HDROP would be needed, which requires
				// a predefined format ID that Electron cannot write.
				return this.nativeHostService.writeClipboardBuffer(
					NativeClipboardService.WINDOWS_FILE_FORMAT,
					this.filePathToUtf16LE(resources[0].fsPath)
				);
			}
		}

		// Default (Windows, or mixed local/remote): write VS Code custom format
		return this.nativeHostService.writeClipboardBuffer(
			NativeClipboardService.FILE_FORMAT,
			VSBuffer.fromString(resources.map(r => r.toString()).join('\n'))
		);
	}

	async readResources(): Promise<URI[]> {
		// Try VS Code's custom format first
		const codeBuffer = await this.nativeHostService.readClipboardBuffer(NativeClipboardService.FILE_FORMAT);
		const codeResources = this.bufferToResources(codeBuffer);
		if (codeResources.length > 0) {
			return codeResources;
		}

		// Fall back to reading platform-native file clipboard formats
		if (isMacintosh) {
			const macBuffer = await this.nativeHostService.readClipboardBuffer(NativeClipboardService.MAC_FILE_FORMAT);
			return this.plistToFiles(macBuffer);
		}

		if (isLinux) {
			const linuxBuffer = await this.nativeHostService.readClipboardBuffer(NativeClipboardService.LINUX_FILE_FORMAT);
			return this.uriListToFiles(linuxBuffer);
		}

		if (isWindows) {
			const winBuffer = await this.nativeHostService.readClipboardBuffer(NativeClipboardService.WINDOWS_FILE_FORMAT);
			return this.fileNameWToFile(winBuffer);
		}

		return [];
	}

	async hasResources(): Promise<boolean> {
		if (await this.nativeHostService.hasClipboard(NativeClipboardService.FILE_FORMAT)) {
			return true;
		}

		if (isMacintosh) {
			return this.nativeHostService.hasClipboard(NativeClipboardService.MAC_FILE_FORMAT);
		}

		if (isLinux) {
			return this.nativeHostService.hasClipboard(NativeClipboardService.LINUX_FILE_FORMAT);
		}

		if (isWindows) {
			return this.nativeHostService.hasClipboard(NativeClipboardService.WINDOWS_FILE_FORMAT);
		}

		return false;
	}

	private bufferToResources(buffer: VSBuffer): URI[] {
		if (!buffer) {
			return [];
		}

		const bufferValue = buffer.toString();
		if (!bufferValue) {
			return [];
		}

		try {
			return bufferValue.split('\n').map(f => URI.parse(f));
		} catch (error) {
			return []; // do not trust clipboard data
		}
	}

	private filesToPlist(paths: string[]): string {
		return '<?xml version="1.0" encoding="UTF-8"?>\n'
			+ '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
			+ '<plist version="1.0">\n<array>\n'
			+ paths.map(p => `<string>${p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</string>`).join('\n')
			+ '\n</array>\n</plist>';
	}

	private plistToFiles(buffer: VSBuffer): URI[] {
		if (!buffer) {
			return [];
		}

		const content = buffer.toString();
		if (!content) {
			return [];
		}

		try {
			// Extract <string>...</string> values from the plist
			const paths: URI[] = [];
			const regex = /<string>([^<]+)<\/string>/g;
			let match: RegExpExecArray | null;
			while ((match = regex.exec(content)) !== null) {
				const path = match[1]
					.replace(/&lt;/g, '<')
					.replace(/&gt;/g, '>')
					.replace(/&amp;/g, '&');
				paths.push(URI.file(path));
			}
			return paths;
		} catch (error) {
			return []; // do not trust clipboard data
		}
	}

	private uriListToFiles(buffer: VSBuffer): URI[] {
		if (!buffer) {
			return [];
		}

		const content = buffer.toString();
		if (!content) {
			return [];
		}

		try {
			// text/uri-list: lines starting with # are comments, entries separated by \r\n.
			// Only include file:// URIs — non-file URIs are not meaningful for
			// file paste flows and could cause confusing errors.
			return content.split(/\r?\n/)
				.filter(line => line.length > 0 && !line.startsWith('#'))
				.map(line => URI.parse(line))
				.filter(uri => uri.scheme === Schemas.file);
		} catch (error) {
			return []; // do not trust clipboard data
		}
	}

	private filePathToUtf16LE(path: string): VSBuffer {
		// FileNameW expects a null-terminated UTF-16LE encoded string.
		// Uint16Array naturally uses the platform's char encoding (UTF-16).
		const encoded = new Uint16Array(path.length + 1);
		for (let i = 0; i < path.length; i++) {
			encoded[i] = path.charCodeAt(i);
		}
		// Last element is already 0 (null terminator)
		return VSBuffer.wrap(new Uint8Array(encoded.buffer));
	}

	private fileNameWToFile(buffer: VSBuffer): URI[] {
		if (!buffer || buffer.byteLength < 4) {
			return [];
		}

		try {
			// Read null-terminated UTF-16LE string
			const u16 = new Uint16Array(buffer.buffer.buffer, buffer.buffer.byteOffset, Math.floor(buffer.byteLength / 2));
			const nullIdx = u16.indexOf(0);
			const path = String.fromCharCode(...u16.subarray(0, nullIdx === -1 ? u16.length : nullIdx));
			if (path.length > 0) {
				return [URI.file(path)];
			}
		} catch (error) {
			// do not trust clipboard data
		}

		return [];
	}
}

registerSingleton(IClipboardService, NativeClipboardService, InstantiationType.Delayed);
