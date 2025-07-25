// Single-line comment
/* Multi-line
   comment */
/** JSDoc comment */
`Template ${expression}`;
const obj = {
  method() { return this; },
  [computedKey]: 123,
  ...spread
};

class Animal extends Creature {
  #privateField = 'secret';
  static staticProp = 42;

  constructor(name) {
    super();
    this.name = name ?? 'Unknown';
  }
}

const arrowFn = (a = 0, ...rest) => ({ a, rest });
const regex = /(?<group>pattern)/gimsuy;
const [a,,b] = [1,2,3];
const { x: renamed } = { x: 10 };

try {
  fetch?.('url').catch(() => {});
} catch { /* empty */ }

async function* generator() {
  yield await Promise.resolve(42);
}
