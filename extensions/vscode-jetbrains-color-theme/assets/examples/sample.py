# Single-line comment
"""Multi-line
   string/comment"""

def factorial(n: int) -> int:
    if n <= 1:
        return 1
    else:
        return n * factorial(n-1)

class MyClass(SuperClass):
    class_var = 10

    def __init__(self):
        self._protected = True
        self.__private = False

@decorator
async def fetch_data():
    async with session.get(url) as response:
        data = await response.json()

f_string = f"Value: {x}"
list_comp = [x**2 for x in range(10)]
lambda_fn = lambda x: x * 2
