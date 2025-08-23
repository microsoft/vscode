import { injectable } from 'inversify';
import { Hover, languages, TextDocument, Position } from 'vscode';
import { IExtensionSingleActivationService } from './types';

const PYPI_PROJECT_URL = 'https://pypi.org/project';

export function generatePyPiLink(name: string): string | null {
    // Regex to allow to find every possible pypi package (base regex from https://peps.python.org/pep-0508/#names)
    const projectName = name.match(/^([A-Z0-9]|[A-Z0-9][A-Z0-9._-]*)($|=| |;|\[)/i);
    return projectName ? `${PYPI_PROJECT_URL}/${projectName[1]}/` : null;
}

@injectable()
export class RequirementsTxtLinkActivator implements IExtensionSingleActivationService {
    public readonly supportedWorkspaceTypes = { untrustedWorkspace: true, virtualWorkspace: true };

    // eslint-disable-next-line class-methods-use-this
    public async activate(): Promise<void> {
        languages.registerHoverProvider([{ pattern: '**/*requirement*.txt' }, { pattern: '**/requirements/*.txt' }], {
            provideHover(document: TextDocument, position: Position) {
                const link = generatePyPiLink(document.lineAt(position.line).text);
                return link ? new Hover(link) : null;
            },
        });
    }
}
