-- Type classes and monads
module Main where

data Tree a = Leaf | Node a (Tree a) (Tree a)

factorial :: Integer -> Integer
factorial 0 = 1
factorial n = n * factorial (n - 1)

instance Functor Tree where
  fmap _ Leaf = Leaf
  fmap f (Node x l r) = Node (f x) (fmap f l) (fmap f r)

main :: IO ()
main = do
  putStrLn "Enter a number:"
  input <- getLine
  let num = read input :: Int
  print $ factorial num
