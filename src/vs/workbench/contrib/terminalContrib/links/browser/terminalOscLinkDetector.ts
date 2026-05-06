/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { IUriIdentityService } from '../../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { ITerminalLinkDetector, ITerminalLinkResolver, ITerminalSimpleLink, TerminalBuiltinLinkType } from './links.js';
import { getTerminalLinkType } from './terminalLocalLinkDetector.js';
import { ITerminalProcessManager } from '../../../terminal/common/terminal.js';
import type { IBufferLine, IBufferRange, Terminal } from '@xterm/xterm';
import { ITerminalBackend, ITerminalLogService } from '../../../../../platform/terminal/common/terminal.js';
import { IXtermCore } from '../../../terminal/browser/xterm-private.js';

interface XtermWithCore extends Terminal {
	_core: IXtermCore & {
		_bufferService?: {
			buffer: {
				lines: {
					get(index: number): XtermBufferLineLike | undefined;
				};
			};
		};
		_oscLinkService?: {
			getLinkData(linkId: number): { uri: string } | undefined;
		};
	};
}

interface XtermBufferCellLike {
	content?: number;
	fg?: number;
	bg?: number;
	combinedData?: string;
	extended?: {
		urlId?: number;
	};
	hasExtendedAttrs?: () => boolean;
}

interface XtermBufferLineLike {
	readonly length: number;
	getTrimmedLength?: () => number;
	hasContent?: (x: number) => boolean;
	loadCell?: (x: number, cell: XtermBufferCellLike) => XtermBufferCellLike;
	getCell?: (x: number) => XtermBufferCellLike | undefined;
}

export class TerminalOscLinkDetector implements ITerminalLinkDetector {
	static id = 'osc8';

	readonly maxLinkLength = 2048;

	constructor(
		readonly xterm: Terminal,
		private readonly _processManager: Pick<ITerminalProcessManager, 'initialCwd' | 'os' | 'remoteAuthority' | 'userHome'> & { backend?: Pick<ITerminalBackend, 'getWslPath'> },
		private readonly _linkResolver: ITerminalLinkResolver,
		@ITerminalLogService private readonly _logService: ITerminalLogService,
		@IUriIdentityService private readonly _uriIdentityService: IUriIdentityService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService
	) {
	}

	async detect(lines: IBufferLine[], startLine: number, _endLine: number): Promise<ITerminalSimpleLink[]> {
		const core = (this.xterm as XtermWithCore)._core;
		const oscLinkService = core?._oscLinkService;
		if (!oscLinkService) {
			this._logService.trace('terminalOscLinkDetector#detect oscLinkService missing');
			return [];
		}

		const links: ITerminalSimpleLink[] = [];

		for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
			const line = lines[lineIndex] as unknown as XtermBufferLineLike;
			const lineLength = line.getTrimmedLength?.() ?? line.length;
			if (lineLength === 0) {
				continue;
			}

			const workCell: XtermBufferCellLike = { content: 0, fg: 0, bg: 0 };
			const loadCell = line.loadCell?.bind(line);
			const getCell = line.getCell?.bind(line);

			let currentStart = -1;
			let currentLinkId = -1;
			let finishLink = false;

			for (let x = 0; x < lineLength; x++) {
				if (currentStart === -1 && line.hasContent && !line.hasContent(x)) {
					continue;
				}

				const cell = loadCell ? loadCell(x, workCell) : getCell?.(x);
				const urlId = cell?.extended?.urlId ?? 0;

				if (urlId) {
					if (currentStart === -1) {
						currentStart = x;
						currentLinkId = urlId;
						continue;
					} else {
						finishLink = urlId !== currentLinkId;
					}
				} else if (currentStart !== -1) {
					finishLink = true;
				}

				if (finishLink || (currentStart !== -1 && x === lineLength - 1)) {
					const uriText = oscLinkService.getLinkData(currentLinkId)?.uri;
					if (uriText) {
						const linkEndX = finishLink ? x - 1 : x;
						if (linkEndX < currentStart) {
							finishLink = false;
							if (urlId) {
								currentStart = x;
								currentLinkId = urlId;
							} else {
								currentStart = -1;
								currentLinkId = -1;
							}
							continue;
						}

						const bufferLine = this.xterm.buffer.active.getLine(startLine + lineIndex);
						const startX = currentStart;
						const endXExclusive = linkEndX + 1;
						const rangeText = bufferLine?.translateToString(false, startX, endXExclusive);
						const trimmedRangeText = rangeText?.trimEnd();
						if (!trimmedRangeText) {
							finishLink = false;
							if (urlId) {
								currentStart = x;
								currentLinkId = urlId;
							} else {
								currentStart = -1;
								currentLinkId = -1;
							}
							continue;
						}

						const bufferRange: IBufferRange = {
							start: {
								x: currentStart + 1,
								y: startLine + lineIndex + 1
							},
							end: {
								x: currentStart + trimmedRangeText.length,
								y: startLine + lineIndex + 1
							}
						};
						const link = await this._createLink(uriText, bufferRange, trimmedRangeText);
						if (link) {
							links.push(link);
						}
					}

					finishLink = false;
					if (urlId) {
						currentStart = x;
						currentLinkId = urlId;
					} else {
						currentStart = -1;
						currentLinkId = -1;
					}
				}
			}
		}

		return links;
	}

	private async _createLink(uriText: string, bufferRange: IBufferRange, linkText?: string): Promise<ITerminalSimpleLink | null> {
		let uri: URI;
		try {
			uri = URI.parse(uriText);
		} catch (error) {
			this._logService.trace('terminalOscLinkDetector#detect invalid uri', error);
			return null;
		}

		const text = linkText ?? uriText;

		if (uri.scheme && uri.scheme !== Schemas.file) {
			return {
				text,
				uri,
				bufferRange,
				type: TerminalBuiltinLinkType.Url
			};
		}

		const linkStat = await this._linkResolver.resolveLink(this._processManager, uriText, uri.scheme ? uri : undefined);
		if (!linkStat) {
			return null;
		}

		const type = getTerminalLinkType(linkStat.uri, linkStat.isDirectory, this._uriIdentityService, this._workspaceContextService);
		return {
			text,
			uri: linkStat.uri,
			bufferRange,
			type
		};
	}
}
