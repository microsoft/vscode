"""pylint option block-disable"""

__revision__ = None

class Child2Class(object):
    """block-disable test"""

    def __init__(self):
        pass

    def meth1OfChild(self, arg):
        """this issues a message"""
        print (self)
