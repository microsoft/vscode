/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {registerMarshallingContribution, IMarshallingContribution} from 'vs/base/common/marshalling';
import * as types from './pluginHostTypes';
import {IRange, IPosition} from 'vs/editor/common/editorCommon';
import {IReference} from 'vs/editor/common/modes';

abstract class OneWayMarshalling<T> implements IMarshallingContribution {

	canDeserialize() {
		return false;
	}

	deserialize() {
		throw Error();
	}

	abstract canSerialize(obj: any): boolean;

	abstract serialize(obj: T, serialize: (obj: any) => any): any;
}

class RangeMarshalling extends OneWayMarshalling<types.Range> {

	canSerialize(obj: any): boolean {
		return obj instanceof types.Range;
	}

	serialize(obj: types.Range, serialize: (obj: any) => any): any {
		return <IRange>{
			startLineNumber: 1 + obj.start.line,
			startColumn: 1 + obj.start.character,
			endLineNumber: 1 + obj.end.line,
			endColumn: 1 + obj.end.character
		};
	}
}

class PositionMarshalling extends OneWayMarshalling<types.Position> {

	canSerialize(obj: any): boolean {
		return obj instanceof types.Position;
	}

	serialize(obj: types.Position, serialize: (obj: any) => any): any {
		return <IPosition>{
			lineNumber: 1 + obj.line,
			column: 1 + obj.character
		};
	}
}

class LocationMarshalling extends OneWayMarshalling<types.Location> {

	canSerialize(obj: any): boolean {
		return obj instanceof types.Location;
	}

	serialize(obj: types.Location, serialize: (obj: any) => any): any {
		return <IReference>{
			resource: serialize(obj.uri),
			range: serialize(obj.range)
		};
	}
}

registerMarshallingContribution(new RangeMarshalling());
registerMarshallingContribution(new PositionMarshalling());
registerMarshallingContribution(new LocationMarshalling());