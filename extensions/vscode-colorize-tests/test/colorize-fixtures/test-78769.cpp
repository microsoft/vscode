#define DOCTEST_IMPLEMENT_FIXTURE(der, base, func, decorators)                                     \
    namespace {                                                                                    \
        struct der : public base                                                                   \
        {                                                                                          \
            void f();                                                                              \
        };                                                                                         \
        static void func() {                                                                       \
            der v;                                                                                 \
            v.f();                                                                                 \
        }                                                                                          \
        DOCTEST_REGISTER_FUNCTION(DOCTEST_EMPTY, func, decorators)                                 \
    }                                                                                              \
    inline DOCTEST_NOINLINE void der::f()
