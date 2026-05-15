from typing import List

class _TestClass():
    def __init__(self, input_shape: List[int], arg1: int, arg2, arg3=3):
        print(str(input_shape) + str(arg1) + str(arg2) + str(arg3))

def testInitWithCfg():
    _ = _TestClass([2, 3], 2, 2, input_shape="shape")