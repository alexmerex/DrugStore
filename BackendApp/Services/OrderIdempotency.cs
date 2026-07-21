using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace BackendApp.Services;

public static class OrderIdempotency
{
    public readonly record struct Item(int ProductID, int Quantity, decimal? ExpectedUnitPrice);

    public static string CreateFingerprint(IEnumerable<Item> items)
    {
        var canonicalItems = string.Join(
            "|",
            items
                .OrderBy(item => item.ProductID)
                .Select(item => $"{item.ProductID.ToString(CultureInfo.InvariantCulture)}:"
                    + $"{item.Quantity.ToString(CultureInfo.InvariantCulture)}:"
                    + (item.ExpectedUnitPrice.HasValue
                        ? item.ExpectedUnitPrice.Value.ToString("G29", CultureInfo.InvariantCulture)
                        : "-")));
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonicalItems)));
    }
}
