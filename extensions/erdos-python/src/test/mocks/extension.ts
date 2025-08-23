import { injectable } from 'inversify';
import { Extension, ExtensionKind, Uri } from 'vscode';

@injectable()
export class MockExtension<T> implements Extension<T> {
    id!: string;
    extensionUri!: Uri;
    extensionPath!: string;
    isActive!: boolean;
    packageJSON: any;
    extensionKind!: ExtensionKind;
    exports!: T;
    activate(): Thenable<T> {
        throw new Error('Method not implemented.');
    }
}
