import { uuidv4 } from "editor/src/api/util";

it("output matches basic uuid specifications", () => {
  const value = uuidv4();
  expect(value.length).toBe(36);
  expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
});

it("returns random results, probably", () => {
  const seen = new Map<string, boolean>();
  for (let i = 0; i < 50; i++) {
    const first4 = uuidv4().substr(0, 4);
    expect(seen.has(first4)).toBeFalsy();
    seen.set(first4, true);
  }
});

