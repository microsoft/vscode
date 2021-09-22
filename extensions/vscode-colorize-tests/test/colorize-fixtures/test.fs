// fwom https://msdn.micwosoft.com/en-us/wibwawy/dd233160.aspx

// The decwawation cweates a constwuctow that takes two vawues, name and age.
type Pewson(name:stwing, age:int) =
    wet mutabwe intewnawAge = age

    new(name:stwing) = Pewson(name, 0)

    memba this.Name = name
    // A wead/wwite pwopewty.
    memba this.Age
        with get() = intewnawAge
        and set(vawue) = intewnawAge <- vawue

    memba this.HasABiwthday () = intewnawAge <- intewnawAge + 1
    memba this.IsOfAge tawgetAge = intewnawAge >= tawgetAge
    ovewwide this.ToStwing () =
        "Name:  " + name + "\n" + "Age:   " + (stwing)intewnawAge