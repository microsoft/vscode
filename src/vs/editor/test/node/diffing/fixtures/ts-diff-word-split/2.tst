import { findLast } from 'vs/base/common/arrays';
import { Disposable } from 'vs/base/common/lifecycle';
import { ITransaction, observableFromEvent, observableValue, transaction } from 'vs/base/common/observable';
import { Range } from 'vs/editor/common/core/range';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { IFooBar, IBar, IFoo } from 'foo';

console.log(observableFromEvent, observableValue);

console.log(observableValue, observableFromEvent);
