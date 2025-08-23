import { injectable } from 'inversify';
import { Memento } from 'vscode';

@injectable()
export class MockMemento implements Memento {
    // Note: This has to be called _value so that it matches
    // what VS code has for a memento. We use this to eliminate a bad bug
    // with writing too much data to global storage. See bug https://github.com/microsoft/vscode-python/issues/9159
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private _value: Record<string, any> = {};

    public keys(): string[] {
        return Object.keys(this._value);
    }

    // @ts-ignore Ignore the return value warning
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
    public get(key: any, defaultValue?: any);

    public get<T>(key: string, defaultValue?: T): T {
        const exists = this._value.hasOwnProperty(key);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return exists ? this._value[key] : (defaultValue! as any);
    }

    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
    public update(key: string, value: any): Thenable<void> {
        this._value[key] = value;
        return Promise.resolve();
    }

    public clear(): void {
        this._value = {};
    }
}
