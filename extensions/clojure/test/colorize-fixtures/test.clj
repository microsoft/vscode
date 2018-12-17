;; from http://clojure-doc.org/articles/tutorials/introduction.html

(require '[clojure.string :as str])
(def the-answer 42)
[1 2 3]            ; A vector
[1 :two "three"]
{:a 1 :b 2}
#{:a :b :c}
'(1 2 3)
(def my-stuff ["shirt" "coat" "hat"])   ; this is more typical usage.

(my-func (my-func2 arg1
                   arg2)
         (other-func arg-a
                     (foo-bar arg-x
                              arg-y
                              (+ arg-xx
                                 arg-yy
                                 arg-zz))
                     arg-b))
'(+ 1 2 3)
;; ⇒ (+ 1 2 3)
(let [width     10
      height    20
      thickness 2]
  (println "hello from inside the `let`.")
  (* width
     height
     thickness))

;; Vectors
(def v   [:a :b :c])
(def li '(:a :b :c))
(conj v  :d)          ; ⇒ [:a :b :c :d]
(conj li :d)          ; ⇒ (:d :a :b :c)

v   ; ⇒ is still [:a :b :c]
li  ; ⇒ is still (:a :b :c)

;; Maps
(def m {:a 1 :b 2})
(assoc m :c 3)        ; ⇒ {:a 1 :c 3 :b 2}
(dissoc m :b)         ; ⇒ {:a 1}

(def my-atom (atom {:foo 1}))
;; ⇒ #'user/my-atom
@my-atom
;; ⇒ {:foo 1}
(swap! my-atom update-in [:foo] inc)
;; ⇒ {:foo 2}
@my-atom
;; ⇒ {:foo 2}