#include <iostream>
using namespace std;

struct Nod {
    int info;
    Nod *leg;
};

int FLsiDublu(Nod *prim)
{
    // numaram nodurile
    int n = 0;
    Nod *p = prim;
    while (p != NULL)
    {
        n++;
        p = p->leg;
    }

    if (n % 2 != 0)
        return -1;

    int jum = n / 2;
    int* a = new int[jum + 1];
    int i;

    // memoram informatiile din prima jumatate
    p = prim;
    for (i = 1; i <= jum; i++)
    {
        a[i] = p->info;
        p = p->leg;
    }

    // p se afla acum pe primul nod al jumatii a doua
    // comparam cele doua jumatati
    int rez = a[jum];
    for (i = 1; i <= jum; i++)
    {
        if (a[i] != p->info)
        {
            rez = -1;
            break;
        }
        p = p->leg;
    }

    delete[] a;
    return rez;
}

int n, i, x;
Nod *prim, *ultim;

int main()
{
    prim = NULL;
    ultim = NULL;

    cin >> n;
    for (i = 1; i <= n; i++)
    {
        cin >> x;
        Nod* nodNou = new Nod;
        nodNou->info = x;
        nodNou->leg = NULL;
        if (prim == NULL)
        {
            prim = nodNou;
            ultim = nodNou;
        }
        else
        {
            ultim->leg = nodNou;
            ultim = nodNou;
        }
    }

    cout << FLsiDublu(prim) << endl;
    return 0;
}
