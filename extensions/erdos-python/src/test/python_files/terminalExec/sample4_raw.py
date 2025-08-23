class pc(object):
    def __init__(self, pcname, model):
        self.pcname = pcname
        self.model = model

    def print_name(self):
        print('Workstation name is', self.pcname, 'model is', self.model)
