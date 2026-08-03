#include <iostream>
using namespace std;

int n;

void f(int n)
{
    n = 100;
    cout << "in f, n = " << n << endl;
}
int main()
{
    n = 7;
    f(n);
    cout << "in main, n = " << n << endl;
    return 0;
}
