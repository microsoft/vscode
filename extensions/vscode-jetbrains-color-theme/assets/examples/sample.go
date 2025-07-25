// Single-line comment
/* Multi-line
   comment */
   package main

   import (
	   "fmt"
	   "math"
   )

   type Shape interface {
	   Area() float64
   }

   type Circle struct {
	   radius float64
   }

   func (c *Circle) Area() float64 {
	   return math.Pi * c.radius * c.radius
   }

   func main() {
	   ch := make(chan int)
	   go func() {
		   ch <- 42
	   }()

	   defer fmt.Println("Done")

	   if num := <-ch; num > 0 {
		   fmt.Printf("Value: %v", num)
	   }
   }
