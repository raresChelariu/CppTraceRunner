#include <iostream>
using namespace std;

int factorial(int n)
{
    if (n <= 1)
        return 1;
    return n * factorial(n - 1);
}

int n, rez;

int main()
{
    cin >> n;
    rez = factorial(n);
    cout << rez;
    return 0;
}
