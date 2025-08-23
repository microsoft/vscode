import { injectable } from 'inversify';
import { IExtensions } from '../../client/common/types';
import { Extension, Event } from 'vscode';
import { MockExtension } from './extension';

@injectable()
export class MockExtensions implements IExtensions {
    extensionIdsToFind: unknown[] = [];
    all: readonly Extension<unknown>[] = [];
    onDidChange: Event<void> = () => {
        throw new Error('Method not implemented');
    };
    getExtension(extensionId: string): Extension<unknown> | undefined;
    getExtension<T>(extensionId: string): Extension<T> | undefined;
    getExtension(extensionId: unknown): import('vscode').Extension<unknown> | undefined {
        if (this.extensionIdsToFind.includes(extensionId)) {
            return new MockExtension();
        }
    }
    determineExtensionFromCallStack(): Promise<{ extensionId: string; displayName: string }> {
        throw new Error('Method not implemented.');
    }
}
