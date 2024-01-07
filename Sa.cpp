#include <bits/stdc++.h>
using namespace std;

int main()
{
int t;
cin>>t;
while(t--)
{
    int n;
    cin>>n;
    int *a = new int[n];
    for(int i=0;i<n;i++)
    {
        cin>>a[i];
    }
    int temp =a[0];
    vector<int> c;
    int d=1;
    for(int i=1;i<n;i++)
    {
        if(temp<a[i])
        {
            
                if(c.empty()==0)
                {
                    // cout<<"1\n";                    
                    auto it = c.end();
                    --it;
                    if(*(it)>=a[i])
                    ++d;
                }
            c.push_back(a[i]);
        }
        else
        {
            temp = a[i];
        }

    }
    if(c.size()==0)
    cout<<0<<"\n";
    else
    cout<<c.size()-d<<"\n";
    delete[] a;
}

return 0;
}
