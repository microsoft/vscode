import random
import typing

optional_str: typing.Optional[str] = None

if random.random() > 0.5:
    optional_str = "This is your chance"

def check_optional_str() -> bool:
    return optional_str is not None

if check_optional_str():
    print(optional_str.upper())
