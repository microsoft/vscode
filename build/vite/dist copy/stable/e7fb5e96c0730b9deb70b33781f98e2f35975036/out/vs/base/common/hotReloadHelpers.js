/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isHotReloadEnabled, registerHotReloadHandler } from './hotReload.js';
import { constObservable, observableSignalFromEvent, observableValue } from './observable.js';
export function readHotReloadableExport(value, reader) {
    observeHotReloadableExports([value], reader);
    return value;
}
export function observeHotReloadableExports(values, reader) {
    if (isHotReloadEnabled()) {
        const o = observableSignalFromEvent('reload', event => registerHotReloadHandler(({ oldExports }) => {
            if (![...Object.values(oldExports)].some(v => values.includes(v))) {
                return undefined;
            }
            return (_newExports) => {
                event(undefined);
                return true;
            };
        }));
        o.read(reader);
    }
}
const classes = new Map();
export function createHotClass(clazz) {
    if (!isHotReloadEnabled()) {
        return constObservable(clazz);
    }
    // eslint-disable-next-line local/code-no-any-casts
    const id = clazz.name;
    let existing = classes.get(id);
    if (!existing) {
        existing = observableValue(id, clazz);
        classes.set(id, existing);
    }
    else {
        setTimeout(() => {
            existing.set(clazz, undefined);
        }, 0);
    }
    return existing;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaG90UmVsb2FkSGVscGVycy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2Jhc2UvY29tbW9uL2hvdFJlbG9hZEhlbHBlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLGtCQUFrQixFQUFFLHdCQUF3QixFQUFFLE1BQU0sZ0JBQWdCLENBQUM7QUFDOUUsT0FBTyxFQUFFLGVBQWUsRUFBNkMseUJBQXlCLEVBQUUsZUFBZSxFQUFFLE1BQU0saUJBQWlCLENBQUM7QUFFekksTUFBTSxVQUFVLHVCQUF1QixDQUFJLEtBQVEsRUFBRSxNQUEyQjtJQUMvRSwyQkFBMkIsQ0FBQyxDQUFDLEtBQUssQ0FBQyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0lBQzdDLE9BQU8sS0FBSyxDQUFDO0FBQ2QsQ0FBQztBQUVELE1BQU0sVUFBVSwyQkFBMkIsQ0FBQyxNQUFhLEVBQUUsTUFBMkI7SUFDckYsSUFBSSxrQkFBa0IsRUFBRSxFQUFFLENBQUM7UUFDMUIsTUFBTSxDQUFDLEdBQUcseUJBQXlCLENBQ2xDLFFBQVEsRUFDUixLQUFLLENBQUMsRUFBRSxDQUFDLHdCQUF3QixDQUFDLENBQUMsRUFBRSxVQUFVLEVBQUUsRUFBRSxFQUFFO1lBQ3BELElBQUksQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO2dCQUNuRSxPQUFPLFNBQVMsQ0FBQztZQUNsQixDQUFDO1lBQ0QsT0FBTyxDQUFDLFdBQVcsRUFBRSxFQUFFO2dCQUN0QixLQUFLLENBQUMsU0FBUyxDQUFDLENBQUM7Z0JBQ2pCLE9BQU8sSUFBSSxDQUFDO1lBQ2IsQ0FBQyxDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQ0YsQ0FBQztRQUNGLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDaEIsQ0FBQztBQUNGLENBQUM7QUFFRCxNQUFNLE9BQU8sR0FBRyxJQUFJLEdBQUcsRUFBd0MsQ0FBQztBQUVoRSxNQUFNLFVBQVUsY0FBYyxDQUFJLEtBQVE7SUFDekMsSUFBSSxDQUFDLGtCQUFrQixFQUFFLEVBQUUsQ0FBQztRQUMzQixPQUFPLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUMvQixDQUFDO0lBRUQsbURBQW1EO0lBQ25ELE1BQU0sRUFBRSxHQUFJLEtBQWEsQ0FBQyxJQUFJLENBQUM7SUFFL0IsSUFBSSxRQUFRLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsQ0FBQztJQUMvQixJQUFJLENBQUMsUUFBUSxFQUFFLENBQUM7UUFDZixRQUFRLEdBQUcsZUFBZSxDQUFDLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN0QyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsRUFBRSxRQUFRLENBQUMsQ0FBQztJQUMzQixDQUFDO1NBQU0sQ0FBQztRQUNQLFVBQVUsQ0FBQyxHQUFHLEVBQUU7WUFDZixRQUFTLENBQUMsR0FBRyxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsQ0FBQztRQUNqQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7SUFDUCxDQUFDO0lBQ0QsT0FBTyxRQUEwQixDQUFDO0FBQ25DLENBQUMifQ==