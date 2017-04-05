from banana import *

class Monkey:
	# Bananas the monkey can eat.
	capacity = 10
	def eat(self, N):
		'''Make the monkey eat N bananas!'''
		capacity = capacity - N*banana.size

	def feeding_frenzy(self):
		eat(9.25)
		return "Yum yum"

	def some_func(a:
					lambda x=None:
					{key: val
						for key, val in
							(x if x is not None else [])
					}=42):
		pass

if 1900 < year < 2100 and 1 <= month <= 12 \
   and 1 <= day <= 31 and 0 <= hour < 24 \
   and 0 <= minute < 60 and 0 <= second < 60:   # Looks like a valid date
        return 1

def firstn(g, n):
	for i in range(n):
		yield g.next()

reduce(lambda x,y: x+y, [47,11,42,13])
woerter = {"house" : "Haus", "cat":"Katze", "black":"schwarz"}

mydictionary = {
    'foo': 23, #comment
    'bar': "hello" #sqadsad
}

def steuern(einkommen):
    """Berechnung der zu zahlenden Steuern fuer ein zu versteuerndes Einkommen von x"""
    if einkommen <= 8004:
        steuer = 0
    elif einkommen <= 13469:
        y = (einkommen -8004.0)/10000.0
        steuer = (912.17 * y + 1400)*y
    else:
        steuer = einkommen * 0.44 - 15694
    return steuer

def beliebig(x, y, *mehr):
    print "x=", x, ", x=", y
    print "mehr: ", mehr

class Memoize:
    def __init__(self, fn):
        self.fn = fn
        self.memo = {}
    def __call__(self, *args):
        if args not in self.memo:
                self.memo[args] = self.fn(*args)
        return self.memo[args]

res = re.search(r"([0-9-]*)\s*([A-Za-z]+),\s+(.*)", i)

while True:
    try:
        n = raw_input("Number: ")
        n = int(n)
        break
    except ValueError:
        print("Not a number")

async with EXPR as VAR:
    BLOCK

# Comments in dictionary items should be colorized accordingly
my_dictionary = {
    'foo':23, # this should be colorized as comment
    'bar':"foobar" #this should be colorized as comment
}

# test raw strings
text = r"""
interval ``[1,2)`` leads to
"""
highlight_error = True

# highlight doctests
r'''Module docstring

    Some text followed by code sample:
    >>> for a in foo(2, b=1,
    ...                 c=3):
    ...   print(a)
    0
    1
'''
