# %%
import os.path
dir_path = os.path.dirname(os.path.realpath(__file__))

with open(os.path.join(dir_path, 'ds.log'), 'a') as fp:
    fp.write('Hello World')

