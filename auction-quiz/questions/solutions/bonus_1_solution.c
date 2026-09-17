/*
 * Reference solution for bonus_1 ("Debug the Program").
 * Not shown to participants — for the admin to compile/run and compare
 * against a team's fixed version when grading how many bugs they caught.
 *
 * Fixes applied (see adminNotes on bonus_1 in round2-problem-bank.json
 * for the full numbered list of the planted bugs this addresses):
 *   - int main() instead of void main()
 *   - scanf("%d", &n) — added the missing &
 *   - int arr[n]; — added the missing semicolon
 *   - loop bound i < n instead of i <= n (was reading/writing out of bounds)
 *   - sum = sum + arr[i] instead of sum + arr (was adding the array's address)
 *   - sum instead of Sum (undeclared/case-mismatched variable)
 *   - reverse loop starts at i = n - 1 instead of i = n (was out of bounds)
 *   - added the missing semicolons after both printf calls in the loops
 *   - added braces around the if/else bodies
 *   - removed the stray semicolon after else, which had made the
 *     "Sum is non-positive" branch run unconditionally
 */
#include <stdio.h>

int main() {
    int n, i, sum = 0;
    printf("Enter number of elements: ");
    scanf("%d", &n);
    int arr[n];

    printf("Enter %d elements:\n", n);
    for (i = 0; i < n; i++) {
        scanf("%d", &arr[i]);
        sum = sum + arr[i];
    }

    printf("Total Sum = %d\n", sum);

    printf("Reversed Array:\n");
    for (i = n - 1; i >= 0; i--) {
        printf("%d ", arr[i]);
    }

    if (sum > 0) {
        printf("\nSum is positive");
    } else {
        printf("\nSum is non-positive");
    }

    return 0;
}
