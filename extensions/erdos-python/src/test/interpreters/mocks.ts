import { injectable } from 'inversify';
import { IRegistry, RegistryHive } from '../../client/common/platform/types';
import { IPersistentState } from '../../client/common/types';
import { Architecture } from '../../client/common/utils/platform';
import { MockMemento } from '../mocks/mementos';

@injectable()
export class MockRegistry implements IRegistry {
    constructor(
        private keys: { key: string; hive: RegistryHive; arch?: Architecture; values: string[] }[],
        private values: { key: string; hive: RegistryHive; arch?: Architecture; value: string; name?: string }[],
    ) {}
    public async getKeys(key: string, hive: RegistryHive, arch?: Architecture): Promise<string[]> {
        const items = this.keys.find((item) => {
            if (typeof item.arch === 'number') {
                return item.key === key && item.hive === hive && item.arch === arch;
            }
            return item.key === key && item.hive === hive;
        });

        return items ? Promise.resolve(items.values) : Promise.resolve([]);
    }
    public async getValue(
        key: string,
        hive: RegistryHive,
        arch?: Architecture,
        name?: string,
    ): Promise<string | undefined | null> {
        const items = this.values.find((item) => {
            if (item.key !== key || item.hive !== hive) {
                return false;
            }
            if (typeof item.arch === 'number' && item.arch !== arch) {
                return false;
            }
            if (name && item.name !== name) {
                return false;
            }
            return true;
        });

        return items ? Promise.resolve(items.value) : Promise.resolve(null);
    }
}

export class MockState implements IPersistentState<any> {
    constructor(public data: any) {}

    public readonly storage = new MockMemento();

    get value(): any {
        return this.data;
    }

    public async updateValue(data: any): Promise<void> {
        this.data = data;
    }
}
