# This sample validates that "async" is flagged as an error when
# used in inappropriate locations.

from contextlib import AsyncExitStack


async def b():
    for i in range(5):
        yield i


cm = AsyncExitStack()


def func1():
    # This should generate an error because
    # "async" cannot be used in a non-async function.
    async for x in b():
        print("")