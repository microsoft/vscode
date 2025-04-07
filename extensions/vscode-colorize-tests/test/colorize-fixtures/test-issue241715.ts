type obj = { [key: string]: any };

function destruct({ start, end, message }: any): any { return start + end + message}
function destructArr([first, second]: any): any { return first + second}

interface WebviewMessageUpdateEverything extends WebviewMessageBase {}

type NegNum = -1 | -2 | -10;
const n: NegNum = -10;

export interface OptionalMethod {
    optMeth?(): any;
}

window.addEventListener('message', event => { return event });

export function dayOfTheWeek(date: dayjs.Dayjs): string {
	return date.format('ddd');
}

type N = never | any | unknown;

type Truthy<T> = T extends '' | 0 | false | null | undefined ? never : T;
export function guardedBoolean<T>(value: T): value is Truthy<T> {
	return Boolean(value);
}

type Truthy<T> = T extends '' | 0 | false | null | undefined ? never : T;

const enum EnumName {
    one = 1,
}

void 0;

function* makeIterator(start = 0, end = Infinity, step = 1) {
}

function makeDate(timestamp: number): Date;
function makeDate(m: number, d: number, y: number): Date;
function makeDate(mOrTimestamp: number, d?: number, y?: number): Date {

}

type StringNumberBooleans = [string, number, ...boolean[]];
type StringBooleansNumber = [string, ...boolean[], number];
type BooleansStringNumber = [...boolean[], string, number];
