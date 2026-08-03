#include <iostream>
using namespace std;

int a;

void dubleaza(int x)
{
    x = x * 2;
    cout << "in dubleaza, x = " << x << endl;
}
int main()
{
    a = 5;
    dubleaza(a);
    cout << "in main, a = " << a << endl;
    return 0;
}
