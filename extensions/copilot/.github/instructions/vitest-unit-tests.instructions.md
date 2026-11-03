---
applyTo: '**/*.spec.ts'
description: Vitest unit testing guidelines
---

Please follow these guidelines when writing unit tests using Vitest. These tests are `*.spec.ts`

## Best Practices

- Prefer explicit Test/Mock classes over mutating real instances or creating adhoc one-off mocks.
    - Never use `as any` to override private methods or assign properties on real objects.
    - Mock versions of services are typically named `Mock*` or `Test*`, you can search to find whether one already exists.
    - Some examples: `MockFileSystemService`, `MockChatResponseStream`, `TestTasksService`.

- If there is no preexisting implementation of a service that is appropriate to reuse in the test, then you can create a simple mock or stub implementation in a file under a `test/` folder near the interface definition.
    - A mock class should be configurable so that it can be shared and set up for different test scenarios.

- The helper `createExtensionUnitTestingServices` returns a `TestingServiceCollection` preconfigured with some common mock services, use `IInstantiationService` to create instances with those mocks. Here's an example of using it properly

```ts
const serviceCollection = store.add(createExtensionUnitTestingServices());
instantiationService = serviceCollection.createTestingAccessor().get(IInstantiationService);
const mockFs = accessor.get(IFileSystemService) as MockFileSystemService;
const testService = instantiationService.createInstance(SomeServiceToTest);
```

- When asked to write new tests, add tests to cover the behavior of the code under test, especially things that are interesting, unexpected, or edge cases.
    - Avoid adding tests that simply repeat existing tests or cover trivial code paths.

- If available, prefer the runTests tool to run tests over a terminal command.

- Keep tests deterministic and fast.
    - Avoid starting real servers or performing network I/O.

- Avoid excessive repetition in tests, use `beforeEach` to set up common state.
    - Use helper functions to encapsulate common test logic.