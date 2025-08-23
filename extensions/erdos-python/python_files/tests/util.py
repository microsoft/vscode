# Copyright (c) Microsoft Corporation. All rights reserved.
# Licensed under the MIT License.


class Stub:
    def __init__(self):
        self.calls = []

    def add_call(self, name, args=None, kwargs=None):
        self.calls.append((name, args, kwargs))


class StubProxy:
    def __init__(self, stub=None, name=None):
        self.name = name
        self.stub = stub if stub is not None else Stub()

    @property
    def calls(self):
        return self.stub.calls

    def add_call(self, funcname, *args, **kwargs):
        callname = funcname
        if self.name:
            callname = f"{self.name}.{funcname}"
        return self.stub.add_call(callname, *args, **kwargs)
