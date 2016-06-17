impl Foo<A,B>
    where A: B
{ }

impl Foo<A,B> for C
    where A: B
{ }

impl Foo<A,B> for C
{
    fn foo<A,B> -> C
        where A: B
    { }
}

fn foo<A,B> -> C
    where A: B
{ }

struct Foo<A,B>
    where A: B
{ }

trait Foo<A,B> : C
    where A: B
{ }