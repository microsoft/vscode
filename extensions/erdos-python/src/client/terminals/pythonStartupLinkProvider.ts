/* eslint-disable class-methods-use-this */
import {
    CancellationToken,
    Disposable,
    ProviderResult,
    TerminalLink,
    TerminalLinkContext,
    TerminalLinkProvider,
} from 'vscode';
import { executeCommand } from '../common/vscodeApis/commandApis';
import { registerTerminalLinkProvider } from '../common/vscodeApis/windowApis';
import { Repl } from '../common/utils/localize';

interface CustomTerminalLink extends TerminalLink {
    command: string;
}

export class CustomTerminalLinkProvider implements TerminalLinkProvider<CustomTerminalLink> {
    provideTerminalLinks(
        context: TerminalLinkContext,
        _token: CancellationToken,
    ): ProviderResult<CustomTerminalLink[]> {
        const links: CustomTerminalLink[] = [];
        let expectedNativeLink;

        if (process.platform === 'darwin') {
            expectedNativeLink = 'Cmd click to launch VS Code Native REPL';
        } else {
            expectedNativeLink = 'Ctrl click to launch VS Code Native REPL';
        }

        if (context.line.includes(expectedNativeLink)) {
            links.push({
                startIndex: context.line.indexOf(expectedNativeLink),
                length: expectedNativeLink.length,
                tooltip: Repl.launchNativeRepl,
                command: 'python.startNativeREPL',
            });
        }
        return links;
    }

    async handleTerminalLink(link: CustomTerminalLink): Promise<void> {
        await executeCommand(link.command);
    }
}

export function registerCustomTerminalLinkProvider(disposables: Disposable[]): void {
    disposables.push(registerTerminalLinkProvider(new CustomTerminalLinkProvider()));
}
