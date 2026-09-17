/*
 * Reference solution for code_completion_1 ("Arrange the Factorial Program").
 * Not shown to participants — the lines below are the jumbled ones re-assembled
 * in the correct order: B, H, A, C, F, E, G, I, J, K, D, L.
 */
#include <stdio.h>

int main() {
    int n, i;
    unsigned long long fact = 1;

    printf("Enter a positive integer: ");
    scanf("%d", &n);

    for (i = 1; i <= n; i++) {
        fact *= i;
    }

    printf("Factorial = %llu\n", fact);
    return 0;
}
