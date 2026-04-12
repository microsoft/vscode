/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { createSingleCallFunction } from '../../../../base/common/functional.js';
export class CustomEditorModelManager {
    constructor() {
        this._references = new Map();
    }
    async getAllModels(resource) {
        const keyStart = `${resource.toString()}@@@`;
        const models = [];
        for (const [key, entry] of this._references) {
            if (key.startsWith(keyStart) && entry.model) {
                models.push(await entry.model);
            }
        }
        return models;
    }
    async get(resource, viewType) {
        const key = this.key(resource, viewType);
        const entry = this._references.get(key);
        return entry?.model;
    }
    tryRetain(resource, viewType) {
        const key = this.key(resource, viewType);
        const entry = this._references.get(key);
        if (!entry) {
            return undefined;
        }
        entry.counter++;
        return entry.model.then(model => {
            return {
                object: model,
                dispose: createSingleCallFunction(() => {
                    if (--entry.counter <= 0) {
                        entry.model.then(x => x.dispose());
                        this._references.delete(key);
                    }
                }),
            };
        });
    }
    add(resource, viewType, model) {
        const key = this.key(resource, viewType);
        const existing = this._references.get(key);
        if (existing) {
            throw new Error('Model already exists');
        }
        this._references.set(key, { viewType, model, counter: 0 });
        return this.tryRetain(resource, viewType);
    }
    disposeAllModelsForView(viewType) {
        for (const [key, value] of this._references) {
            if (value.viewType === viewType) {
                value.model.then(x => x.dispose());
                this._references.delete(key);
            }
        }
    }
    key(resource, viewType) {
        return `${resource.toString()}@@@${viewType}`;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3VzdG9tRWRpdG9yTW9kZWxNYW5hZ2VyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvY3VzdG9tRWRpdG9yL2NvbW1vbi9jdXN0b21FZGl0b3JNb2RlbE1hbmFnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFLakYsTUFBTSxPQUFPLHdCQUF3QjtJQUFyQztRQUVrQixnQkFBVyxHQUFHLElBQUksR0FBRyxFQUlsQyxDQUFDO0lBZ0VOLENBQUM7SUE5RE8sS0FBSyxDQUFDLFlBQVksQ0FBQyxRQUFhO1FBQ3RDLE1BQU0sUUFBUSxHQUFHLEdBQUcsUUFBUSxDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUM7UUFDN0MsTUFBTSxNQUFNLEdBQUcsRUFBRSxDQUFDO1FBQ2xCLEtBQUssTUFBTSxDQUFDLEdBQUcsRUFBRSxLQUFLLENBQUMsSUFBSSxJQUFJLENBQUMsV0FBVyxFQUFFLENBQUM7WUFDN0MsSUFBSSxHQUFHLENBQUMsVUFBVSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDN0MsTUFBTSxDQUFDLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUNoQyxDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sTUFBTSxDQUFDO0lBQ2YsQ0FBQztJQUNNLEtBQUssQ0FBQyxHQUFHLENBQUMsUUFBYSxFQUFFLFFBQWdCO1FBQy9DLE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1FBQ3hDLE9BQU8s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