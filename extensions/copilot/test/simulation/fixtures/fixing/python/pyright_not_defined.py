
class Parser:
    def __init__(self):
        self.T_And = ''
        self.T_False = ''

    # False
    def handleInput(self, input):
        if input == T_Or or input == self.T_And:
           print('input is Or or And')