# This folder contains classes exposed by VS Code required in running the unit tests.

-   These classes are only used when running unit tests that are not hosted by VS Code.
-   So even if these classes were buggy, it doesn't matter, running the tests under VS Code host will ensure the right classes are available.
-   The purpose of these classes are to avoid having to use VS Code as the hosting environment for the tests, making it faster to run the tests and not have to rely on VS Code host to run the tests.
-   Everything in here must either be within a namespace prefixed with `vscMock` or exported types must be prefixed with `vscMock`.
    This is to prevent developers from accidentally importing them into their Code. Even if they did, the extension would fail to load and tests would fail.
