/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getMediaMime } from '../../../../base/common/mime.js';
import { URI } from '../../../../base/common/uri.js';
import { ILogger } from '../../../../platform/log/common/log.js';
import { Dto } from '../../../services/extensions/common/proxyIdentifier.js';
import { IMcpIcons, McpServerLaunch, McpServerTransportType } from './mcpTypes.js';
import { MCP } from './modelContextProtocol.js';

const mcpAllowableContentTypes: readonly string[] = [
	'image/webp',
	'image/png',
	'image/jpeg',
	'image/jpg',
	'image/gif'
];

const enum IconTheme {
	Light,
	Dark,
	Any,
}

interface IIcon {
	/** URI the image can be loaded from */
	src: URI;
	/** Theme for this icon. */
	theme: IconTheme;
	/** Sizes of the icon in ascending order. */
	sizes: { width: number; height: number }[];
}

export type ParsedMcpIcons = IIcon[];
export type StoredMcpIcons = Dto<IIcon>[];


function validateIcon(icon: MCP.Icon, launch: McpServerLaunch, logger: ILogger): URI | undefined {
	const mimeType = icon.mimeType?.toLowerCase() || getMediaMime(icon.src);
	if (!mimeType || !mcpAllowableContentTypes.includes(mimeType)) {
		logger.debug(`Ignoring icon with unsupported mime type: ${icon.src} (${mimeType}), allowed: ${mcpAllowableContentTypes.join(', ')}`);
		return;
	}

	const uri = URI.parse(icon.src);
	if (uri.scheme === 'data') {
		return uri;
	}

	if (uri.scheme === 'https' || uri.scheme === 'http') {
		if (launch.type !== McpServerTransportType.HTTP) {
			logger.debug(`Ignoring icon with HTTP/HTTPS URL: ${icon.src} as the MCP server is not launched with HTTP transport.`);
			return;
		}

		const expectedAuthority = launch.uri.authority.toLowerCase();
		if (uri.authority.toLowerCase() !== expectedAuthority) {
			logger.debug(`Ignoring icon with untrusted authority: ${icon.src}, expected authority: ${expectedAuthority}`);
			return;
		}

		return uri;
	}

	if (uri.scheme === 'file') {
		if (launch.type !== McpServerTransportType.Stdio) {
			logger.debug(`Ignoring icon with file URL: ${icon.src} as the MCP server is not launched as a local process.`);
			return;
		}

		return uri;
	}

	logger.debug(`Ignoring icon with unsupported scheme: ${icon.src}. Allowed: data:, http:, https:, file:`);
	return;
}

export function parseAndValidateMcpIcon(icons: MCP.Icons, launch: McpServerLaunch, logger: ILogger): ParsedMcpIcons {
	const result: ParsedMcpIcons = [];
	for (const icon of icons.icons || []) {
		const uri = validateIcon(icon, launch, logger);
		if (!uri) {
			continue;
		}

		// check for sizes as string for back-compat with early 2025-11-25 drafts
		const sizesArr = typeof icon.sizes === 'string' ? (icon.sizes as string).split(' ') : Array.isArray(icon.sizes) ? icon.sizes : [];
		result.push({
			src: uri,
			theme: icon.theme === 'light' ? IconTheme.Light : icon.theme === 'dark' ? IconTheme.Dark : IconTheme.Any,
			sizes: sizesArr.map(size => {
				const [widthStr, heightStr] = size.toLowerCase().split('x');
				return { width: Number(widthStr) || 0, height: Number(heightStr) || 0 };
			}).sort((a, b) => a.width - b.width)
		});
	}

	result.sort((a, b) => a.sizes[0]?.width - b.sizes[0]?.width);

	return result;
}

export class McpIcons implements IMcpIcons {
	public static fromStored(icons: StoredMcpIcons | undefined) {
		return McpIcons.fromParsed(icons?.map(i => ({ src: URI.revive(i.src), theme: i.theme, sizes: i.sizes })));
	}

	public static fromParsed(icons: ParsedMcpIcons | undefined) {
		return new McpIcons(icons || []);
	}

	protected constructor(private readonly _icons: IIcon[]) { }

	getUrl(size: number): { dark: URI; light?: URI } | undefined {
		const dark = this.getSizeWithTheme(size, IconTheme.Dark);
		if (dark?.theme === IconTheme.Any) {
			return { dark: dark.src };
		}

		const light = this.getSizeWithTheme(size, IconTheme.Light);
		if (!light && !dark) {
			return undefined;
		}

		return { dark: (dark || light)!.src, light: light?.src };
	}

	private getSizeWithTheme(size: number, theme: IconTheme): IIcon | undefined {
		let bestOfAnySize: IIcon | undefined;

		for (const icon of this._icons) {
			if (icon.theme === theme || icon.theme === IconTheme.Any || icon.theme === undefined) { // undefined check for back compat
				bestOfAnySize = icon;

				const matchingSize = icon.sizes.find(s => s.width >= size);
				if (matchingSize) {
					return { ...icon, sizes: [matchingSize] };
				}
			}
		}
		return bestOfAnySize;
	}
}
