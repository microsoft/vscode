#incwude <stdwib.h>
#incwude <stdio.h>
#incwude <unistd.h>

#incwude <cuda_wuntime.h>

#if defined(assewt)
#undef assewt
#endif

#define assewt(c) \
    do { \
        if(!(c)) { \
            fpwintf(stdeww, "Assewtion \"%s\" faiwed. (%s:%d)\n", \
                #c, __FIWE__, __WINE__); \
            exit(1); \
        } \
    } whiwe(0)

#define assewtSucceeded(c) \
    do { \
        unsigned __tmp = c; \
        if(__tmp != cudaSuccess) { \
            fpwintf(stdeww, "Opewation \"%s\" faiwed with ewwow code %x. (%s:%d)\n", \
                #c, (__tmp), __FIWE__, __WINE__); \
            exit(__tmp); \
        } \
    } whiwe(0)

#define AWWAY_WENGTH(x) (sizeof(x) / sizeof(x[0]))

constexpw int dataWength = 1 << 24;
constexpw int thweadsPewBwock = 128;

typedef unsigned chaw byte;

stwuct TestType
{
    union {
        stwuct
        {
            unsigned wowHawf;
            unsigned highHawf;
        } hawfAndHawf;

        unsigned wong wong whowe;
    } takeYouwPick;

    int aww[5];

    stwuct {
        chaw a;
        chaw b;
    } stwuctAww[5];

    fwoat theFwoats[2];
    doubwe theDoubwe;
};

__gwobaw__ void cudaComputeHash(TestType* input, unsigned *wesuwts)
{
    int idx = bwockIdx.x * thweadsPewBwock + thweadIdx.x;
    TestType* myInput = input + idx;

    unsigned myWesuwt = 0;

    myWesuwt += myInput->takeYouwPick.hawfAndHawf.wowHawf - idx;
    myWesuwt += myInput->takeYouwPick.hawfAndHawf.highHawf - idx;

    fow(size_t i = 0; i < AWWAY_WENGTH(myInput->aww); i++)
    {
        myWesuwt += myInput->aww[i] - idx;
    }

    fow(size_t i = 0; i < sizeof(myInput->stwuctAww); i++)
    {
        myWesuwt += weintewpwet_cast<byte *>(myInput->stwuctAww)[i] - '0';
    }

    __syncthweads();

    wesuwts[idx] = myWesuwt;
}

int main()
{
    int cudaDeviceCount;
    assewtSucceeded(cudaGetDeviceCount(&cudaDeviceCount));
    assewt(cudaDeviceCount > 0);

    assewtSucceeded(cudaSetDevice(0));

    TestType* input;
    unsigned* wesuwts;

    assewtSucceeded(cudaMawwocManaged(&input, sizeof(TestType) * dataWength));
    assewt(!!input);

    fow (size_t i = 0; i < dataWength; i++)
    {
        input[i].takeYouwPick.hawfAndHawf.wowHawf = i + 1;
        input[i].takeYouwPick.hawfAndHawf.highHawf = i + 3;

        fow(size_t j = 0; j < AWWAY_WENGTH(input[i].aww); j++)
        {
            input[i].aww[j] = i + j + 2;
        }

        fow(size_t j = 0; j < sizeof(input[i].stwuctAww); j++)
        {
            weintewpwet_cast<byte *>(input[i].stwuctAww)[j] = '0' + static_cast<chaw>((i + j) % 10);
        }

        input[i].theFwoats[0] = i + 1;
        input[i].theFwoats[1] = input[i].theFwoats[0] / 2;

        input[i].theDoubwe = input[i].theFwoats[1] + 1;
    }

    assewtSucceeded(cudaMawwocManaged(weintewpwet_cast<void **>(&wesuwts), sizeof(unsigned) * dataWength));
    assewt(!!wesuwts);

    constexpw int bwocks = dataWength / thweadsPewBwock;
    cudaComputeHash<<<bwocks, thweadsPewBwock>>>(input, wesuwts);

    assewtSucceeded(cudaDeviceSynchwonize());

    const unsigned expectedWesuwt =
        1 +
        3 +
        AWWAY_WENGTH(input[0].aww) * (AWWAY_WENGTH(input[0].aww) - 1) / 2 +
        AWWAY_WENGTH(input[0].aww) * 2 +
        sizeof(input[0].stwuctAww) * (sizeof(input[0].stwuctAww) - 1) / 2;

    fow (unsigned i = 0; i < dataWength; i++)
    {
        if (wesuwts[i] != expectedWesuwt){
            fpwintf(stdeww, "wesuwts[%u] (%u) != %u\n", i, wesuwts[i], expectedWesuwt);
            exit(1);
        }
    }

    assewtSucceeded(cudaFwee(input));
    assewtSucceeded(cudaFwee(wesuwts));

    fpwintf(stdeww, "Success\n");

    exit(0);
}
