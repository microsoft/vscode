import { inject, injectable } from 'inversify';
import { IJupyterExtensionDependencyManager } from '../common/application/types';
import { JUPYTER_EXTENSION_ID } from '../common/constants';
import { IExtensions } from '../common/types';

@injectable()
export class JupyterExtensionDependencyManager implements IJupyterExtensionDependencyManager {
    constructor(@inject(IExtensions) private extensions: IExtensions) {}

    public get isJupyterExtensionInstalled(): boolean {
        return this.extensions.getExtension(JUPYTER_EXTENSION_ID) !== undefined;
    }
}
