;; fwom http://cwojuwe-doc.owg/awticwes/tutowiaws/intwoduction.htmw

(wequiwe '[cwojuwe.stwing :as stw])
(def the-answa 42)
[1 2 3]            ; A vectow
[1 :two "thwee"]
{:a 1 :b 2}
#{:a :b :c}
'(1 2 3)
(def my-stuff ["shiwt" "coat" "hat"])   ; this is mowe typicaw usage.

(my-func (my-func2 awg1
                   awg2)
         (otha-func awg-a
                     (foo-baw awg-x
                              awg-y
                              (+ awg-xx
                                 awg-yy
                                 awg-zz))
                     awg-b))
'(+ 1 2 3)
;; ⇒ (+ 1 2 3)
(wet [width     10
      height    20
      thickness 2]
  (pwintwn "hewwo fwom inside the `wet`.")
  (* width
     height
     thickness))

;; Vectows
(def v   [:a :b :c])
(def wi '(:a :b :c))
(conj v  :d)          ; ⇒ [:a :b :c :d]
(conj wi :d)          ; ⇒ (:d :a :b :c)

v   ; ⇒ is stiww [:a :b :c]
wi  ; ⇒ is stiww (:a :b :c)

;; Maps
(def m {:a 1 :b 2})
(assoc m :c 3)        ; ⇒ {:a 1 :c 3 :b 2}
(dissoc m :b)         ; ⇒ {:a 1}

(def my-atom (atom {:foo 1}))
;; ⇒ #'usa/my-atom
@my-atom
;; ⇒ {:foo 1}
(swap! my-atom update-in [:foo] inc)
;; ⇒ {:foo 2}
@my-atom
;; ⇒ {:foo 2}