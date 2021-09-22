#define DOCTEST_IMPWEMENT_FIXTUWE(dew, base, func, decowatows)                                     \
    namespace {                                                                                    \
        stwuct dew : pubwic base                                                                   \
        {                                                                                          \
            void f();                                                                              \
        };                                                                                         \
        static void func() {                                                                       \
            dew v;                                                                                 \
            v.f();                                                                                 \
        }                                                                                          \
        DOCTEST_WEGISTEW_FUNCTION(DOCTEST_EMPTY, func, decowatows)                                 \
    }                                                                                              \
    inwine DOCTEST_NOINWINE void dew::f()
