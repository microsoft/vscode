// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { Container, injectable, interfaces } from 'inversify';

import { Abstract, ClassType, IServiceManager, Newable } from './types';

type identifier<T> = string | symbol | Newable<T> | Abstract<T>;

@injectable()
export class ServiceManager implements IServiceManager {
    constructor(private container: Container) {}

    public add<T>(
        serviceIdentifier: identifier<T>,

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor: new (...args: any[]) => T,
        name?: string | number | symbol | undefined,
        bindings?: symbol[],
    ): void {
        if (name) {
            this.container.bind<T>(serviceIdentifier).to(constructor).whenTargetNamed(name);
        } else {
            this.container.bind<T>(serviceIdentifier).to(constructor);
        }

        if (bindings) {
            bindings.forEach((binding) => {
                this.addBinding(serviceIdentifier, binding);
            });
        }
    }

    public addFactory<T>(
        factoryIdentifier: interfaces.ServiceIdentifier<interfaces.Factory<T>>,
        factoryMethod: interfaces.FactoryCreator<T>,
    ): void {
        this.container.bind<interfaces.Factory<T>>(factoryIdentifier).toFactory<T>(factoryMethod);
    }

    public addBinding<T1, T2>(from: identifier<T1>, to: identifier<T2>): void {
        this.container.bind(to).toService(from);
    }

    public addSingleton<T>(
        serviceIdentifier: identifier<T>,

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        constructor: new (...args: any[]) => T,
        name?: string | number | symbol | undefined,
        bindings?: symbol[],
    ): void {
        if (name) {
            this.container.bind<T>(serviceIdentifier).to(constructor).inSingletonScope().whenTargetNamed(name);
        } else {
            this.container.bind<T>(serviceIdentifier).to(constructor).inSingletonScope();
        }

        if (bindings) {
            bindings.forEach((binding) => {
                this.addBinding(serviceIdentifier, binding);
            });
        }
    }

    public addSingletonInstance<T>(
        serviceIdentifier: identifier<T>,
        instance: T,
        name?: string | number | symbol | undefined,
    ): void {
        if (name) {
            this.container.bind<T>(serviceIdentifier).toConstantValue(instance).whenTargetNamed(name);
        } else {
            this.container.bind<T>(serviceIdentifier).toConstantValue(instance);
        }
    }

    public get<T>(serviceIdentifier: identifier<T>, name?: string | number | symbol | undefined): T {
        return name ? this.container.getNamed<T>(serviceIdentifier, name) : this.container.get<T>(serviceIdentifier);
    }

    public tryGet<T>(serviceIdentifier: identifier<T>, name?: string | number | symbol | undefined): T | undefined {
        try {
            return name
                ? this.container.getNamed<T>(serviceIdentifier, name)
                : this.container.get<T>(serviceIdentifier);
        } catch {
            // This might happen after the container has been destroyed
        }

        return undefined;
    }

    public getAll<T>(serviceIdentifier: identifier<T>, name?: string | number | symbol | undefined): T[] {
        return name
            ? this.container.getAllNamed<T>(serviceIdentifier, name)
            : this.container.getAll<T>(serviceIdentifier);
    }

    public rebind<T>(
        serviceIdentifier: interfaces.ServiceIdentifier<T>,
        constructor: ClassType<T>,
        name?: string | number | symbol,
    ): void {
        if (name) {
            this.container.rebind<T>(serviceIdentifier).to(constructor).whenTargetNamed(name);
        } else {
            this.container.rebind<T>(serviceIdentifier).to(constructor);
        }
    }

    public rebindSingleton<T>(
        serviceIdentifier: interfaces.ServiceIdentifier<T>,
        constructor: ClassType<T>,
        name?: string | number | symbol,
    ): void {
        if (name) {
            this.container.rebind<T>(serviceIdentifier).to(constructor).inSingletonScope().whenTargetNamed(name);
        } else {
            this.container.rebind<T>(serviceIdentifier).to(constructor).inSingletonScope();
        }
    }

    public rebindInstance<T>(
        serviceIdentifier: interfaces.ServiceIdentifier<T>,
        instance: T,
        name?: string | number | symbol,
    ): void {
        if (name) {
            this.container.rebind<T>(serviceIdentifier).toConstantValue(instance).whenTargetNamed(name);
        } else {
            this.container.rebind<T>(serviceIdentifier).toConstantValue(instance);
        }
    }

    public dispose(): void {
        this.container.unbindAll();
        this.container.unload();
    }
}
