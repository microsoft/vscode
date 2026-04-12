/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { getMediaMime } from '../../../../base/common/mime.js';
import { URI } from '../../../../base/common/uri.js';
const mcpAllowableContentTypes = [
    'image/webp',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/gif'
];
var IconTheme;
(function (IconTheme) {
    IconTheme[IconTheme["Light"] = 0] = "Light";
    IconTheme[IconTheme["Dark"] = 1] = "Dark";
    IconTheme[IconTheme["Any"] = 2] = "Any";
})(IconTheme || (IconTheme = {}));
function validateIcon(icon, launch, logger) {
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
        if (launch.type !== 2 /* McpServerTransportType.HTTP */) {
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
        if (launch.type !== 1 /* McpServerTransportType.Stdio */) {
            logger.debug(`Ignoring icon with file URL: ${icon.src} as the MCP server is not launched as a local process.`);
            return;
        }
        return uri;
    }
    logger.debug(`Ignoring icon with unsupported scheme: ${icon.src}. Allowed: data:, http:, https:, file:`);
    return;
}
export function parseAndValidateMcpIcon(icons, launch, logger) {
    const result = [];
    for (const icon of icons.icons || []) {
        const uri = validateIcon(icon, launch, logger);
        if (!uri) {
            continue;
        }
        // check for sizes as string for back-compat with early 2025-11-25 drafts
        const sizesArr = typeof icon.sizes === 'string' ? icon.sizes.split(' ') : Array.isArray(icon.sizes) ? icon.sizes : [];
        result.push({
            src: uri,
            theme: icon.theme === 'light' ? 0 /* IconTheme.Light */ : icon.theme === 'dark' ? 1 /* IconTheme.Dark */ : 2 /* IconTheme.Any */,
            sizes: sizesArr.map(size => {
                const [widthStr, heightStr] = size.toLowerCase().split('x');
                return { width: Number(widthStr) || 0, height: Number(heightStr) || 0 };
            }).sort((a, b) => a.width - b.width)
        });
    }
    result.sort((a, b) => a.sizes[0]?.width - b.sizes[0]?.width);
    return result;
}
export class McpIcons {
    static fromStored(icons) {
        return McpIcons.fromParsed(icons?.map(i => ({ src: URI.revive(i.src), theme: i.theme, sizes: i.sizes })));
    }
    static fromParsed(icons) {
        return new McpIcons(icons || []);
    }
    constructor(_icons) {
        this._icons = _icons;
    }
    getUrl(size) {
        const dark = this.getSizeWithTheme(size, 1 /* IconTheme.Dark */);
        if (dark?.theme === 2 /* IconTheme.Any */) {
            return { dark: dark.src };
        }
        const light = this.getSizeWithTheme(size, 0 /* IconTheme.Light */);
        if (!light && !dark) {
            return undefined;
        }
        return { dark: (dark || light).src, light: light?.src };
    }
    getSizeWithTheme(size, theme) {
        let bestOfAnySize;
        for (const icon of this._icons) {
            if (icon.theme === theme || icon.theme === 2 /* IconTheme.Any */ || icon.theme === undefined) { // undefined check for back compat
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwSWNvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tY3AvY29tbW9uL21jcEljb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUMvRCxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sZ0NBQWdDLENBQUM7QUFNckQsTUFBTSx3QkFBd0IsR0FBc0I7SUFDbkQsWUFBWTtJQUNaLFdBQVc7SUFDWCxZQUFZO0lBQ1osV0FBVztJQUNYLFdBQVc7Q0FDWCxDQUFDO0FBRUYsSUFBVyxTQUlWO0FBSkQsV0FBVyxTQUFTO0lBQ25CLDJDQUFLLENBQUE7SUFDTCx5Q0FBSSxDQUFBO0lBQ0osdUNBQUcsQ0FBQTtBQUNKLENBQUMsRUFKVSxTQUFTLEtBQVQsU0FBUyxRQUluQjtBQWVELFNBQVMsWUFBWSxDQUFDLElBQWMsRUFBRSxNQUF1QixFQUFFLE1BQWU7SUFDN0UsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLFFBQVEsRUFBRSxXQUFXLEVBQUUsSUFBSSxZQUFZLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3hFLElBQUksQ0FBQyxRQUFRLElBQUksQ0FBQyx3QkFBd0IsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztRQUMvRCxNQUFNLENBQUMsS0FBSyxDQUFDLDZDQUE2QyxJQUFJLENBQUMsR0FBRyxLQUFLLFFBQVEsZUFBZSx3QkFBd0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBQ3JJLE9BQU87SUFDUixDQUFDO0lBRUQsTUFBTSxHQUFHLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDaEMsSUFBSSxHQUFHLENBQUMsTUFB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