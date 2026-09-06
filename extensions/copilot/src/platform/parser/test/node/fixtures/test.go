package main

import (
    "errors"
    "fmt"
)

const (
    ConstExample = "const before vars"
)

var (
    BoolExample bool
    IntExample  int
)

type StructExample struct {
    Name string
}

type InterfaceExample interface {
    MethodExample() error
}

func (s StructExample) MethodExample() error {
    if s.Name == "" {
        return errors.New("Name cannot be empty")
    }
    fmt.Println(s.Name)
    return nil
}

func main() {
    BoolExample = true
    IntExample = 10

    arrayExample := [3]int{1, 2, 3}
    sliceExample := arrayExample[:2]

    mapExample := map[string]int{
        "one": 1,
        "two": 2,
    }

    structExample := StructExample{
        Name: "Example",
    }

    var i InterfaceExample = structExample
    if err := i.MethodExample(); err != nil {
        fmt.Println(err)
    }

    for i, v := range sliceExample {
        fmt.Println(i, v)
    }

    if BoolExample {
        fmt.Println("BoolExample is true")
    } else {
        fmt.Println("BoolExample is false")
    }

    switch IntExample {
    case 0:
        fmt.Println("Zero")
    case 10:
        fmt.Println("Ten")
    default:
        fmt.Println("Default")
    }

    for key, value := range mapExample {
        fmt.Println(key, value)
    }
}

// Create a channel of integers.
ch := make(chan int)

// Start a goroutine that sends values to the channel.
go func() {
    for i := 0; i < 5; i++ {
        ch <- i
    }
    close(ch)
}()
