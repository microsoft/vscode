"""pylint option block-disable"""

__revision__ = None


class Workspace2Class(object):
    """block-disable test"""

    def __init__(self):
        pass

    def meth1OfWorkspace2(self, arg):
        """this issues a message"""
        print(self)
