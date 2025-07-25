;; Recursion and macros
(defun factorial (n)
  (if (<= n 1)
      1
      (* n (factorial (- n 1))))

(defmacro when (condition &rest body)
  `(if ,condition (progn ,@body)))

(let ((x 10) (y 20))
  (print (+ x y)))

(setq names '("Alice" "Bob" "Charlie"))
(mapcar (lambda (name) (concatenate 'string "Hello " name)) names)
