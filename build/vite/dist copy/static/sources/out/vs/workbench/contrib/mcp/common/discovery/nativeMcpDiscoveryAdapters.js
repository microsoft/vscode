/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { URI } from '../../../../../base/common/uri.js';
import { McpServerLaunch } from '../mcpTypes.js';
export async function claudeConfigToServerDefinition(idPrefix, contents, cwd) {
    let parsed;
    try {
        parsed = JSON.parse(contents.toString());
    }
    catch {
        return;
    }
    return Promise.all(Object.entries(parsed.mcpServers).map(async ([name, server]) => {
        const launch = server.url ? {
            type: 2 /* McpServerTransportType.HTTP */,
            uri: URI.parse(server.url),
            headers: [],
        } : {
            type: 1 /* McpServerTransportType.Stdio */,
            args: server.args || [],
            command: server.command,
            env: server.env || {},
            envFile: undefined,
            cwd: cwd?.fsPath,
            sandbox: undefined
        };
        return {
            id: `${idPrefix}.${name}`,
            label: name,
            launch,
            cacheNonce: await McpServerLaunch.hash(launch),
        };
    }));
}
export class ClaudeDesktopMpcDiscoveryAdapter {
    constructor(remoteAuthority) {
        this.remoteAuthority = remoteAuthority;
        this.order = 400 /* McpCollectionSortOrder.Filesystem */;
        this.discoverySource = "claude-desktop" /* DiscoverySource.ClaudeDesktop */;
        this.id = `claude-desktop.${this.remoteAuthority}`;
    }
    getFilePath({ platform, winAppData, xdgHome, homedir }) {
        if (platform === 3 /* Platform.Windows */) {
            const appData = winAppData || URI.joinPath(homedir, 'AppData', 'Roaming');
            return URI.joinPath(appData, 'Claude', 'claude_desktop_config.json');
        }
        else if (platform === 1 /* Platform.Mac */) {
            return URI.joinPath(homedir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
        }
        else {
            const configDir = xdgHome || URI.joinPath(homedir, '.config');
            return URI.joinPath(configDir, 'Claude', 'claude_desktop_config.json');
        }
    }
    adaptFile(contents, { homedir }) {
        return claudeConfigToServerDefinition(this.id, contents, homedir);
    }
}
export class WindsurfDesktopMpcDiscoveryAdapter extends ClaudeDesktopMpcDiscoveryAdapter {
    constructor(remoteAuthority) {
        super(remoteAuthority);
        this.discoverySource = "windsurf" /* DiscoverySource.Windsurf */;
        this.id = `windsurf.${this.remoteAuthority}`;
    }
    getFilePath({ homedir }) {
        return URI.joinPath(homedir, '.codeium', 'windsurf', 'mcp_config.json');
    }
}
export class CursorDesktopMpcDiscoveryAdapter extends ClaudeDesktopMpcDiscoveryAdapter {
    constructor(remoteAuthority) {
        super(remoteAuthority);
        this.discoverySource = "cursor-global" /* DiscoverySource.CursorGlobal */;
        this.id = `cursor.${this.remoteAuthority}`;
    }
    getFilePath({ homedir }) {
        return URI.joinPath(homedir, '.cursor', 'mcp.json');
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmF0aXZlTWNwRGlzY292ZXJ5QWRhcHRlcnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tY3AvY29tbW9uL2Rpc2NvdmVyeS9uYXRpdmVNY3BEaXNjb3ZlcnlBZGFwdGVycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUtoRyxPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sbUNBQW1DLENBQUM7QUFHeEQsT0FBTyxFQUErQyxlQUFlLEVBQTBCLE1BQU0sZ0JBQWdCLENBQUM7QUFZdEgsTUFBTSxDQUFDLEtBQUssVUFBVSw4QkFBOEIsQ0FBQyxRQUFnQixFQUFFLFFBQWtCLEVBQUUsR0FBUztJQUNuRyxJQUFJLE1BT0gsQ0FBQztJQUVGLElBQUksQ0FBQztRQUNKLE1BQU0sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO0lBQzFDLENBQUM7SUFBQyxNQUFNLENBQUM7UUFDUixPQUFPO0lBQ1IsQ0FBQztJQUVELE9BQU8sT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxHQUFHLENBQUMsS0FBSyxFQUFFLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxFQUF5QyxFQUFFO1FBQ3hILE1BQU0sTUFBTSxHQUFvQixNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztZQUM1QyxJQUFJLHFDQUE2QjtZQUNqQyxHQUFHLEVBQUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDO1lBQzFCLE9BQU8sRUFBRSxFQUFFO1NBQ1gsQ0FBQyxDQUFDLENBQUM7WUFDSCxJQUFJLHNDQUE4QjtZQUNsQyxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksSUFBSSxFQUFFO1lBQ3ZCLE9BQU8sRUFB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