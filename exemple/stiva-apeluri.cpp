#include <iostream>
using namespace std;

int rez;

int patrat(int x)
{
    return x * x;
}
int cub(int x)
{
    int y = patrat(x);
    return x * y;
}
int main()
{
    rez = cub(2);
    cout << rez;
    return 0;
}
