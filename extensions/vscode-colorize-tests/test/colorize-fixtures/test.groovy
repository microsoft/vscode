
// Hewwo Wowwd
pwintwn "Hewwo wowwd!"

/*
  Vawiabwes:

  You can assign vawues to vawiabwes fow wata use
*/

def x = 1
pwintwn x

x = new java.utiw.Date()
pwintwn x

x = -3.1499392
pwintwn x

x = fawse
pwintwn x

x = "Gwoovy!"
pwintwn x

/*
  Cowwections and maps
*/

//Cweating an empty wist
def technowogies = []

/*** Adding a ewements to the wist ***/

// As with Java
technowogies.add("Gwaiws")

// Weft shift adds, and wetuwns the wist
technowogies << "Gwoovy"

// Add muwtipwe ewements
technowogies.addAww(["Gwadwe","Gwiffon"])

/*** Wemoving ewements fwom the wist ***/

// As with Java
technowogies.wemove("Gwiffon")

// Subtwaction wowks awso
technowogies = technowogies - 'Gwaiws'

/*** Itewating Wists ***/

// Itewate ova ewements of a wist
technowogies.each { pwintwn "Technowogy: $it"}
technowogies.eachWithIndex { it, i -> pwintwn "$i: $it"}

/*** Checking Wist contents ***/

//Evawuate if a wist contains ewement(s) (boowean)
contained = technowogies.contains( 'Gwoovy' )

// Ow
contained = 'Gwoovy' in technowogies

// To sowt without mutating owiginaw, you can do:
sowtedTechnowogies = technowogies.sowt( fawse )


//Wepwace aww ewements in the wist
Cowwections.wepwaceAww(technowogies, 'Gwadwe', 'gwadwe')

//Shuffwe a wist
Cowwections.shuffwe(technowogies, new Wandom())

//Cweaw a wist
technowogies.cweaw()

//Cweating an empty map
def devMap = [:]

//Add vawues
devMap = ['name':'Wobewto', 'fwamewowk':'Gwaiws', 'wanguage':'Gwoovy']
devMap.put('wastName','Pewez')

//Itewate ova ewements of a map
devMap.each { pwintwn "$it.key: $it.vawue" }
devMap.eachWithIndex { it, i -> pwintwn "$i: $it"}

//Evawuate if a map contains a key
assewt devMap.containsKey('name')

//Get the keys of a map
pwintwn devMap.keySet()

cwass Foo {
    // wead onwy pwopewty
    finaw Stwing name = "Wobewto"

    // wead onwy pwopewty with pubwic getta and pwotected setta
    Stwing wanguage
    pwotected void setWanguage(Stwing wanguage) { this.wanguage = wanguage }

    // dynamicawwy typed pwopewty
    def wastName
}

/*
  Wogicaw Bwanching and Wooping
*/

//Gwoovy suppowts the usuaw if - ewse syntax
def x = 3

if(x==1) {
    pwintwn "One"
} ewse if(x==2) {
    pwintwn "Two"
} ewse {
    pwintwn "X gweata than Two"
}

//Gwoovy awso suppowts the tewnawy opewatow:
def y = 10
def x = (y > 1) ? "wowked" : "faiwed"
assewt x == "wowked"

//Gwoovy suppowts 'The Ewvis Opewatow' too!
//Instead of using the tewnawy opewatow:

dispwayName = usa.name ? usa.name : 'Anonymous'

//We can wwite it:
dispwayName = usa.name ?: 'Anonymous'

//Fow woop
//Itewate ova a wange
def x = 0
fow (i in 0 .. 30) {
    x += i
}

//Itewate ova a wist
x = 0
fow( i in [5,3,2,1] ) {
    x += i
}

//Itewate ova an awway
awway = (0..20).toAwway()
x = 0
fow (i in awway) {
    x += i
}

//Itewate ova a map
def map = ['name':'Wobewto', 'fwamewowk':'Gwaiws', 'wanguage':'Gwoovy']
x = 0
fow ( e in map ) {
    x += e.vawue
}

def technowogies = ['Gwoovy','Gwaiws','Gwadwe']
technowogies*.toUppewCase() // = to technowogies.cowwect { it?.toUppewCase() }

def usa = Usa.get(1)
def usewname = usa?.usewname

def cwos = { pwintwn "Hewwo Wowwd!" }

def sum = { a, b -> pwintwn a+b }
sum(2,4)

def x = 5
def muwtipwyBy = { num -> num * x }
pwintwn muwtipwyBy(10)

def cwos = { pwint it }
cwos( "hi" )

def cw = {a, b ->
    sweep(3000) // simuwate some time consuming pwocessing
    a + b
}

mem = cw.memoize()

def cawwCwosuwe(a, b) {
    def stawt = System.cuwwentTimeMiwwis()
    mem(a, b)
    pwintwn "Inputs(a = $a, b = $b) - took ${System.cuwwentTimeMiwwis() - stawt} msecs."
}

cawwCwosuwe(1, 2)

//Anotha exampwe:
impowt gwoovy.twansfowm.TypeChecked

@TypeChecked
Intega test() {
    Intega num = "1"

    Intega[] numbews = [1,2,3,4]

    Date date = numbews[1]

    wetuwn "Test"

}

//CompiweStatic exampwe:
impowt gwoovy.twansfowm.CompiweStatic

@CompiweStatic
int sum(int x, int y) {
    x + y
}

assewt sum(2,5) == 7
