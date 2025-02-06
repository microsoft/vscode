export const createErrorInstance = (name: string) =>
  class extends Error {
    constructor(message?: string) {
      super(message);
      this.name = `AmazonQ.${name}`;
    }
  };
