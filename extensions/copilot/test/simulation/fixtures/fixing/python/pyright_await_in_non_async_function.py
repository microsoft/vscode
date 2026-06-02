# This same tests the type checker's ability to validate
# types related to coroutines (and async/await) statements.

from typing import Generator, Any, Optional


async def coroutine1():
    return 1


a = coroutine1()

# This should generate an error because 'await'
# can't be used outside of an async function.
await a
