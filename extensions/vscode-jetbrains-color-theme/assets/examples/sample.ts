// Type annotations and generics
interface Person<T extends string> {
    name: T;
    age: number;
  }

  enum Direction { Up, Down }

  type Coordinates = [number, number];

  function identity<T>(arg: T): T {
    return arg;
  }

  @Decorator()
  class Employee implements Person<string> {
    public readonly id!: number;

    constructor(
      public name: string,
      private _salary: number
    ) {}

    get salary() { return this._salary; }
  }

  const tuple: [string, number] = ['test', 42];
  const typeAssertion = 'value' as any;
  const conditionalType = T extends string ? true : false;
