struct VS_OUTPUT
{
    float4 Position : SV_Position;
};

VS_OUTPUT main(in float4 vPosition : POSITION)
{
    VS_OUTPUT Output;

    Output.Position = vPosition;

    return Output;
}