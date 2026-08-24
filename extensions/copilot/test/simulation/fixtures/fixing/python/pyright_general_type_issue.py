from abc import ABC
from dataclasses import dataclass
from typing import Generic, TypeVar

T = TypeVar('T')

@dataclass
class Msg(Generic[T]):
    data: T

class Foo:
    foo: bool

class Bar:
    bar: float

class BaseHandler(Generic[T], ABC):
    def handle(self, msg: Msg[T]):
        pass

FooBar = Foo | Bar

class FooBarHandler(BaseHandler[FooBar]):
    def handle(self, msg: Msg[FooBar]):
        pass

foobar_handler = FooBarHandler()

msg = Msg(data=Foo())
foobar_handler.handle(msg)